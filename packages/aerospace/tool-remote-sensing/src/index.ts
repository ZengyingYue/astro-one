/**
 * Remote-sensing tool plugin: registers `rs_spectral_index` and `rs_change_detect` on
 * `ctx.tools`, plus `rs_detect_objects` when a detector model is configured. Rasters are read
 * through `ctx.fs` relative to the calling session's workspace. Named exports preserve loader
 * injection metadata.
 * @module @astro-one/tool-remote-sensing
 */

import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import type { Context } from '@astro-one/cordis'
import type {} from '@astro-one/fs'
import z from '@astro-one/schemastery'
import { defineTool } from '@astro-one/tools'
import type { ToolDefinition, ToolRunContext } from '@astro-one/tools'
import { histogram, INDEX_BANDS, indexValue, otsu, regions, statistics } from './analysis.ts'
import type { BandRole, IndexName } from './analysis.ts'
import { corners, detectObjects } from './detect.ts'
import type { Detector } from './detect.ts'
import { onnxDetector } from './onnx.ts'
import { decodeRaster, pixelArea, pixelToMap } from './raster.ts'
import type { Georeference, Raster } from './raster.ts'

export const name = 'tool-remote-sensing'
export const inject = ['tools', 'fs']

/** Optional oriented-object detector. */
export interface DetectorConfig {
  /** Absolute path of a YOLO OBB model exported to ONNX (for example YOLO11-OBB trained on DOTA). */
  modelPath: string
  /** Square model input size, pixels. */
  inputSize: number
  /** Class names in model order. */
  classNames: string[]
}

/** Deployment bounds and the optional detector. */
export interface Config {
  /** Largest raster file read, bytes. */
  maxFileBytes: number
  /** Largest raster size, pixels. */
  maxPixels: number
  /** Largest number of regions or detections reported per call. */
  maxResults: number
  /** Detector model; `rs_detect_objects` is registered only when present. */
  detector?: DetectorConfig | undefined
}

/** Schemastery configuration. */
export const Config: z<Config> = z.object({
  maxFileBytes: z.natural().min(1).required(),
  maxPixels: z.natural().min(1).required(),
  maxResults: z.natural().min(1).required(),
  detector: z.union([z.object({
    modelPath: z.string().required(),
    inputSize: z.natural().min(32).required(),
    classNames: z.array(z.string()).required(),
  }), z.const(undefined)]),
})

const ROLES: readonly BandRole[] = ['blue', 'green', 'red', 'rededge', 'nir', 'swir1', 'swir2']
const INDICES = Object.keys(INDEX_BANDS) as IndexName[]

const BAND_MAP = {
  type: 'object',
  additionalProperties: false,
  description: 'One-based band number of each spectral role in the file, for example {"red": 4, "nir": 8}.',
  properties: Object.fromEntries(ROLES.map(r => [r, { type: 'integer' }])) as Record<BandRole, { type: 'integer' }>,
} as const

const BAND_PATHS = {
  type: 'object',
  additionalProperties: false,
  description: 'Per-role file paths for products delivered one band per file (Landsat, Sentinel-2 as GeoTIFF); a role listed here reads band 1 of that file unless bands names another.',
  properties: Object.fromEntries(ROLES.map(r => [r, { type: 'string' }])) as Record<BandRole, { type: 'string' }>,
} as const

async function readFile(ctx: Context, exec: ToolRunContext, path: string, config: Config): Promise<Raster> {
  const cwd = exec.agent?.session.header.cwd
  const target = await ctx.fs.resolve(path, { ...cwd !== undefined ? { cwd } : {}, signal: exec.signal })
  const info = await ctx.fs.stat(target, exec.signal)
  if (info?.type !== 'file') throw new Error(`cannot read "${target.displayPath}": not a regular file`)
  return decodeRaster(await ctx.fs.readBytes(target, exec.signal, config.maxFileBytes), config.maxPixels)
}

interface Reflectance {
  readonly width: number
  readonly height: number
  readonly geo: Georeference | null
  readonly layers: Partial<Record<BandRole, Float32Array>>
  /** 1 where any input band holds the no-data value. */
  readonly invalid: Uint8Array
}

async function loadRoles(
  ctx: Context, exec: ToolRunContext, config: Config, roles: readonly BandRole[],
  args: {
    path?: string
    bands?: Partial<Record<BandRole, number>>
    band_paths?: Partial<Record<BandRole, string>>
    scale?: number
    offset?: number
  },
): Promise<Reflectance> {
  const cache = new Map<string, Promise<Raster>>()
  const layers: Partial<Record<BandRole, Float32Array>> = {}
  let shape: { width: number; height: number; geo: Georeference | null } | undefined
  let invalid: Uint8Array | undefined
  const scale = args.scale ?? 1
  const offset = args.offset ?? 0
  for (const role of roles) {
    const path = args.band_paths?.[role] ?? args.path
    if (path === undefined) throw new Error(`no file for band role ${role}: give path or band_paths.${role}`)
    const bandNumber = args.bands?.[role] ?? (args.band_paths?.[role] !== undefined ? 1 : undefined)
    if (bandNumber === undefined) throw new Error(`bands.${role} is required (one-based band number)`)
    if (!cache.has(path)) cache.set(path, readFile(ctx, exec, path, config))
    const raster = await (cache.get(path) as Promise<Raster>)
    const band = raster.bands[bandNumber - 1]
    if (band === undefined) throw new Error(`bands.${role} = ${String(bandNumber)} but ${path} has ${String(raster.bands.length)} band(s)`)
    if (shape === undefined) {
      shape = { width: raster.width, height: raster.height, geo: raster.geo }
      invalid = new Uint8Array(raster.width * raster.height)
    } else if (shape.width !== raster.width || shape.height !== raster.height) {
      throw new Error(`band ${role} is ${String(raster.width)}x${String(raster.height)} but earlier bands are ${String(shape.width)}x${String(shape.height)}; resample to a common grid first`)
    }
    const out = new Float32Array(band.length)
    for (let i = 0; i < band.length; i++) {
      const v = band[i] as number
      if (raster.noData !== null && v === raster.noData) (invalid as Uint8Array)[i] = 1
      out[i] = v * scale + offset
    }
    layers[role] = out
  }
  const s = shape as { width: number; height: number; geo: Georeference | null }
  return { ...s, layers, invalid: invalid as Uint8Array }
}

function computeIndex(index: IndexName, r: Reflectance): Float32Array {
  const out = new Float32Array(r.width * r.height)
  const roles = INDEX_BANDS[index]
  for (let i = 0; i < out.length; i++) {
    if (r.invalid[i] === 1) {
      out[i] = Number.NaN
      continue
    }
    const v: Partial<Record<BandRole, number>> = {}
    for (const role of roles) v[role] = (r.layers[role] as Float32Array)[i] as number
    out[i] = indexValue(index, v)
  }
  return out
}

const round = (x: number, d = 6): number => Math.round(x * 10 ** d) / 10 ** d + 0

function georeference(geo: Georeference | null, width: number, height: number) {
  if (geo === null) return null
  const [x0, y0] = pixelToMap(geo, 0, 0)
  const [x1, y1] = pixelToMap(geo, width, height)
  return {
    epsg: geo.epsg,
    units: geo.geographic ? 'degree' : 'map-unit',
    pixel_size: [round(geo.pixelSize[0], 9), round(geo.pixelSize[1], 9)],
    bbox: [round(Math.min(x0, x1)), round(Math.min(y0, y1)), round(Math.max(x0, x1)), round(Math.max(y0, y1))],
  }
}

/** Model-facing text of a JSON tool value. */
const renderJson = (_args: unknown, value: unknown): { type: 'text'; text: string }[] => [{ type: 'text', text: JSON.stringify(value) }]

const GEO_OUTPUT = { type: 'json', description: 'Georeference {epsg, units, pixel_size, bbox} or null.' } as const
const SOURCE_PARAMS = {
  path: { type: 'string', description: 'Raster file (GeoTIFF/COG, PNG, JPEG).' },
  bands: BAND_MAP,
  band_paths: BAND_PATHS,
  scale: { type: 'number', description: 'Reflectance = DN × scale + offset (for example 0.0001 for Sentinel-2 L2A, 2.75e-5 for Landsat C2 L2).' },
  offset: { type: 'number', description: 'Reflectance offset (for example -0.1 for Sentinel-2 L2A baseline 04.00+, -0.2 for Landsat C2 L2).' },
} as const

/**
 * Build the `rs_spectral_index` tool.
 * @param ctx - context carrying the filesystem.
 * @param config - deployment bounds.
 * @returns the tool definition.
 */
export function spectralIndexTool(ctx: Context, config: Config): ToolDefinition {
  return defineTool({
    name: 'rs_spectral_index',
    description: 'Compute a spectral index over a multispectral image and summarize it: ndvi (vegetation), ndwi (open water, '
      + 'McFeeters), mndwi (water, Xu), ndbi (built-up), nbr (burn), ndre (red-edge chlorophyll), ndsi (snow), evi and savi '
      + '(soil-adjusted vegetation). Map each needed band role to a one-based band number in bands (and, for one-band-per-file '
      + 'products, a file in band_paths). Returns count, mean, std, min, max, percentiles, a histogram over [-1, 1], optional '
      + 'area fractions between class_breaks, and the georeference. No-data pixels are excluded.',
    parameters: {
      index: { type: 'string', enum: INDICES, required: true },
      ...SOURCE_PARAMS,
      class_breaks: { type: 'array', items: { type: 'number' }, description: 'Ascending thresholds; fractions are reported for each interval between consecutive breaks plus the open ends.' },
      histogram_bins: { type: 'integer', description: 'Histogram bins over [-1, 1] (default 20).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          index: { type: 'string', required: true },
          width: { type: 'integer', required: true },
          height: { type: 'integer', required: true },
          valid_pixels: { type: 'integer', required: true },
          invalid_pixels: { type: 'integer', required: true },
          statistics: { type: 'json', required: true },
          histogram: { type: 'json', required: true },
          class_fractions: { type: 'array', items: { type: 'json' }, required: true },
          georeference: { ...GEO_OUTPUT, required: true },
        },
      },
      render: renderJson,
    },
    presentCall: args => ({ card: 'generic', title: `Spectral index (${args.index})`, kind: 'read' }),
    async execute(args, exec) {
      const bins = args.histogram_bins ?? 20
      if (!(bins >= 1 && bins <= 1000)) throw new Error('histogram_bins must be between 1 and 1000')
      const breaks = args.class_breaks ?? []
      if (breaks.some((b, i) => i > 0 && b <= (breaks[i - 1] as number))) throw new Error('class_breaks must be strictly ascending')
      const r = await loadRoles(ctx, exec, config, INDEX_BANDS[args.index], args)
      const values = computeIndex(args.index, r)
      const stats = statistics(values)
      const valid = stats?.count ?? 0
      const edges = [-Infinity, ...breaks, Infinity]
      const fractions = breaks.length === 0 ? [] : edges.slice(0, -1).map((lo, i) => {
        const hi = edges[i + 1] as number
        let n = 0
        for (const v of values) if (Number.isFinite(v) && v >= lo && v < hi) n++
        return { from: Number.isFinite(lo) ? lo : null, to: Number.isFinite(hi) ? hi : null, fraction: valid === 0 ? 0 : round(n / valid) }
      })
      const h = histogram(values, -1, 1, bins)
      return {
        index: args.index,
        width: r.width,
        height: r.height,
        valid_pixels: valid,
        invalid_pixels: r.width * r.height - valid,
        statistics: stats === undefined ? null : {
          mean: round(stats.mean), std: round(stats.std), min: round(stats.min), max: round(stats.max),
          ...Object.fromEntries(Object.entries(stats.percentiles).map(([k, v]) => [k, round(v)])),
        },
        histogram: { edges: h.edges.map(e => round(e)), counts: h.counts },
        class_fractions: fractions,
        georeference: georeference(r.geo, r.width, r.height),
      }
    },
  })
}

/**
 * Build the `rs_change_detect` tool.
 * @param ctx - context carrying the filesystem.
 * @param config - deployment bounds.
 * @returns the tool definition.
 */
export function changeTool(ctx: Context, config: Config): ToolDefinition {
  return defineTool({
    name: 'rs_change_detect',
    description: 'Detect change between two co-registered images of the same grid. method=cva (change vector analysis) uses '
      + 'the Euclidean magnitude of reflectance differences over the roles in bands; method=index uses the absolute difference '
      + 'of a spectral index (for example nbr for burn severity, ndvi for vegetation loss) and reports the signed mean change. '
      + 'The change threshold is Otsu\'s automatic threshold unless threshold is given. Returns the changed fraction and area, '
      + 'and the largest connected changed regions (8-connected, at least min_region_pixels) with pixel and map bounding boxes.',
    parameters: {
      before_path: { type: 'string', required: true },
      after_path: { type: 'string', required: true },
      method: { type: 'string', enum: ['cva', 'index'], required: true },
      index: { type: 'string', enum: INDICES },
      bands: { ...BAND_MAP, required: true },
      scale: SOURCE_PARAMS.scale,
      offset: SOURCE_PARAMS.offset,
      threshold: { type: 'number' },
      min_region_pixels: { type: 'integer', description: 'Smallest reported region (default 10).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          method: { type: 'string', required: true },
          threshold: { type: 'number', required: true },
          threshold_source: { type: 'string', required: true },
          changed_pixels: { type: 'integer', required: true },
          changed_fraction: { type: 'number', required: true },
          changed_area: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
          mean_signed_change: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
          regions: { type: 'array', items: { type: 'json' }, required: true },
          regions_truncated: { type: 'boolean', required: true },
          georeference: { ...GEO_OUTPUT, required: true },
        },
      },
      render: renderJson,
    },
    presentCall: args => ({ card: 'generic', title: `Change detection (${args.method})`, kind: 'read' }),
    async execute(args, exec) {
      const roles = args.method === 'index'
        ? (args.index === undefined ? (() => { throw new Error('method=index needs index') })() : INDEX_BANDS[args.index])
        : ROLES.filter(role => args.bands[role] !== undefined)
      if (roles.length === 0) throw new Error('bands must name at least one role for method=cva')
      const common = {
        bands: args.bands,
        ...args.scale !== undefined ? { scale: args.scale } : {},
        ...args.offset !== undefined ? { offset: args.offset } : {},
      }
      const before = await loadRoles(ctx, exec, config, roles, { path: args.before_path, ...common })
      const after = await loadRoles(ctx, exec, config, roles, { path: args.after_path, ...common })
      if (before.width !== after.width || before.height !== after.height) {
        throw new Error(`the images differ in size (${String(before.width)}x${String(before.height)} vs ${String(after.width)}x${String(after.height)}); co-register them first`)
      }
      const n = before.width * before.height
      const magnitude = new Float32Array(n)
      let signedSum = 0
      let signedCount = 0
      if (args.method === 'index') {
        const a = computeIndex(args.index as IndexName, before)
        const b = computeIndex(args.index as IndexName, after)
        for (let i = 0; i < n; i++) {
          const d = (b[i] as number) - (a[i] as number)
          magnitude[i] = Math.abs(d)
          if (Number.isFinite(d)) {
            signedSum += d
            signedCount++
          }
        }
      } else {
        for (let i = 0; i < n; i++) {
          if (before.invalid[i] === 1 || after.invalid[i] === 1) {
            magnitude[i] = Number.NaN
            continue
          }
          let sq = 0
          const layer = (r: Reflectance, role: BandRole): number => (r.layers[role] as Float32Array)[i] as number
          for (const role of roles) sq += (layer(after, role) - layer(before, role)) ** 2
          magnitude[i] = Math.sqrt(sq)
        }
      }
      const threshold = args.threshold ?? otsu(magnitude)
      const mask = new Uint8Array(n)
      let changed = 0
      for (let i = 0; i < n; i++) {
        if ((magnitude[i] as number) > threshold) {
          mask[i] = 1
          changed++
        }
      }
      const minPixels = args.min_region_pixels ?? 10
      const found = regions(mask, before.width, before.height, magnitude).filter(r => r.pixels >= minPixels)
      const geo = before.geo
      const report = found.slice(0, config.maxResults).map(r => ({
        pixels: r.pixels,
        area: geo === null ? null : round(r.pixels * pixelArea(geo)),
        bbox_px: [...r.bbox],
        centroid_px: [round(r.centroid[0], 2), round(r.centroid[1], 2)],
        centroid_map: geo === null ? null : pixelToMap(geo, r.centroid[0] + 0.5, r.centroid[1] + 0.5).map(v => round(v)),
        mean_magnitude: round(r.meanValue),
      }))
      return {
        method: args.method,
        threshold: round(threshold),
        threshold_source: args.threshold === undefined ? 'otsu' : 'given',
        changed_pixels: changed,
        changed_fraction: round(changed / n),
        changed_area: geo === null ? null : round(changed * pixelArea(geo)),
        mean_signed_change: args.method === 'index' && signedCount > 0 ? round(signedSum / signedCount) : null,
        regions: report,
        regions_truncated: found.length > report.length,
        georeference: georeference(geo, before.width, before.height),
      }
    },
  })
}

/**
 * Build the `rs_detect_objects` tool.
 * @param ctx - context carrying the filesystem.
 * @param config - deployment bounds.
 * @param detector - loaded detector.
 * @returns the tool definition.
 */
export function detectTool(ctx: Context, config: Config, detector: Detector): ToolDefinition {
  return defineTool({
    name: 'rs_detect_objects',
    description: 'Detect objects with oriented (rotated) bounding boxes in a satellite or aerial image using the configured '
      + `model (classes: ${detector.classNames.join(', ')}). Large images are processed in overlapping tiles (tile_size, `
      + `default ${String(detector.inputSize)} px; overlap default 0.2) and merged with rotated non-maximum suppression. `
      + 'Returns per-class counts and each detection with score, center, size, angle, corner polygon in pixels, and map '
      + 'coordinates when the image is georeferenced. rgb_bands picks the one-based bands used as red, green, blue (default 1,2,3).',
    parameters: {
      path: { type: 'string', required: true },
      confidence: { type: 'number', description: 'Minimum class score (default 0.25).' },
      iou: { type: 'number', description: 'Suppression IoU (default 0.45).' },
      tile_size: { type: 'integer' },
      overlap: { type: 'number' },
      rgb_bands: { type: 'array', items: { type: 'integer' } },
      classes: { type: 'array', items: { type: 'string' }, description: 'Keep only these class names.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tiles: { type: 'integer', required: true },
          counts: { type: 'json', required: true },
          detections: { type: 'array', items: { type: 'json' }, required: true },
          detections_truncated: { type: 'boolean', required: true },
        },
      },
      render: renderJson,
    },
    presentCall: args => ({ card: 'generic', title: 'Object detection', kind: 'read', locations: [{ path: args.path }] }),
    async execute(args, exec) {
      const unknown = (args.classes ?? []).filter(c => !detector.classNames.includes(c))
      if (unknown.length > 0) throw new Error(`unknown classes: ${unknown.join(', ')}; the model knows ${detector.classNames.join(', ')}`)
      const overlap = args.overlap ?? 0.2
      if (!(overlap >= 0 && overlap <= 0.9)) throw new Error('overlap must lie in [0, 0.9]')
      const rgb = args.rgb_bands ?? [1, 2, 3]
      if (rgb.length !== 3) throw new Error('rgb_bands must list three band numbers')
      const raster = await readFile(ctx, exec, args.path, config)
      const { boxes, tiles } = await detectObjects(raster, detector, {
        confidence: args.confidence ?? 0.25,
        iouThreshold: args.iou ?? 0.45,
        tileSize: args.tile_size ?? detector.inputSize,
        overlap,
        rgbBands: [rgb[0] as number, rgb[1] as number, rgb[2] as number],
        maxDetections: config.maxResults * 10,
        ...args.classes === undefined ? {} : { classIds: new Set(args.classes.map(c => detector.classNames.indexOf(c))) },
      }, exec.signal)
      const keep = boxes
      const counts: Record<string, number> = {}
      for (const b of keep) {
        const cls = detector.classNames[b.classId] as string
        counts[cls] = (counts[cls] ?? 0) + 1
      }
      const geo = raster.geo
      const detections = keep.slice(0, config.maxResults).map((b) => {
        const poly = corners(b)
        return {
          class: detector.classNames[b.classId] as string,
          score: round(b.score, 4),
          center_px: [round(b.cx, 2), round(b.cy, 2)],
          size_px: [round(b.w, 2), round(b.h, 2)],
          angle_deg: round((b.angle * 180) / Math.PI, 3),
          polygon_px: poly.map(([x, y]) => [round(x, 2), round(y, 2)]),
          polygon_map: geo === null ? null : poly.map(([x, y]) => pixelToMap(geo, x, y).map(v => round(v))),
        }
      })
      return { tiles, counts, detections, detections_truncated: keep.length > detections.length }
    },
  })
}

/**
 * Register the remote-sensing tools.
 * @param ctx - context carrying the tool registry and the filesystem.
 * @param config - deployment bounds and optional detector.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(spectralIndexTool(ctx, config))
  ctx.tools.register(changeTool(ctx, config))
  const d = config.detector
  if (d === undefined) return
  if (!isAbsolute(d.modelPath) || !existsSync(d.modelPath)) throw new Error(`tool-remote-sensing: detector.modelPath ${d.modelPath} must be an existing absolute path`)
  if (d.classNames.length === 0) throw new Error('tool-remote-sensing: detector.classNames must not be empty')
  const detector = onnxDetector(d.modelPath, d.inputSize, d.classNames)
  ctx.effect(() => () => detector.release(), 'tool-remote-sensing.detector')
  ctx.tools.register(detectTool(ctx, config, detector))
}
