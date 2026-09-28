import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@astro-one/cordis'
import LocalFileSystem from '@astro-one/fs-local'
import { ToolCallId } from '@astro-one/llm'
import SystemPrompt from '@astro-one/system-prompt'
import ToolRuntime from '@astro-one/tools'
import type { JsonValue } from '@astro-one/util-values'
import type { Agent } from '@astro-one/agent'
import { unsupportedInbox } from '@astro-one/agent-loop-testkit'
import { Session, SESSION_FORMAT_VERSION, SessionId } from '@astro-one/session'
import * as Plugin from '../src/index.ts'
import { constantModel, geotiff, png } from './fixtures.ts'

const BASE: Plugin.Config = { maxFileBytes: 10_000_000, maxPixels: 1_000_000, maxResults: 3 }

function config(over: { maxResults?: number; detector?: Plugin.DetectorConfig }): Plugin.Config {
  return {
    maxFileBytes: BASE.maxFileBytes,
    maxPixels: BASE.maxPixels,
    maxResults: over.maxResults ?? BASE.maxResults,
    detector: over.detector,
  }
}
let dir: string | undefined

afterEach(async () => {
  if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  dir = undefined
})

// Scene: 40x30, vegetation (high NIR) on the left half, water (NIR < green) on the right.
const red = (x: number): number => (x < 20 ? 30 : 20)
const nir = (x: number): number => (x < 20 ? 200 : 10)
const green = (x: number): number => (x < 20 ? 40 : 60)

async function setup(config: Plugin.Config = BASE): Promise<{ ctx: Context; fiber: Awaited<ReturnType<Context['plugin']>> }> {
  dir = await mkdtemp(join(tmpdir(), 'astro-one-rs-'))
  await writeFile(join(dir, 'scene.tif'), geotiff(40, 30, [() => 20, x => green(x), x => red(x), x => nir(x)], true, 0))
  await writeFile(join(dir, 'nir.tif'), geotiff(40, 30, [x => nir(x)]))
  await writeFile(join(dir, 'small.tif'), geotiff(10, 10, [() => 5, () => 5, () => 5, () => 5]))
  // After: a burned 8x6 block in the vegetation half loses NIR.
  await writeFile(join(dir, 'after.tif'), geotiff(40, 30, [() => 20, x => green(x), x => red(x), (x, y) => (x >= 4 && x < 12 && y >= 5 && y < 11 ? 40 : nir(x))], true, 0))
  await writeFile(join(dir, 'hole.tif'), geotiff(8, 8, [() => 10, (x, y) => (x === 0 && y === 0 ? 0 : 50 + x)], true, 0))
  await writeFile(join(dir, 'a.png'), await png(12, 12, (x, y) => [40, x < 6 && y < 6 ? 200 : 60, 20]))
  await writeFile(join(dir, 'b.png'), await png(12, 12, (x, y) => [40, x < 6 && y < 6 ? 30 : 60, 20]))
  const { writeArrayBuffer } = await import('geotiff')
  const wgs84 = {
    ModelPixelScale: [0.001, 0.001, 0],
    ModelTiepoint: [0, 0, 0, 116, 40, 0],
    GeographicTypeGeoKey: 4326,
    GTModelTypeGeoKey: 2,
  }
  await writeFile(join(dir, 'geo.tif'), new Uint8Array(writeArrayBuffer([10, 90, 10, 90, 10, 90, 10, 90], { width: 2, height: 2, SamplesPerPixel: 2, ...wgs84 })))
  await writeFile(join(dir, 'photo.png'), await png(96, 64, () => [120, 120, 120]))
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  const fiber = await ctx.plugin(Plugin, config)
  return { ctx, fiber }
}

type Result = { isError: boolean; value: Record<string, JsonValue>; text: string }
let n = 0
async function call(ctx: Context, name: string, args: Record<string, JsonValue>): Promise<Result> {
  const r = await ctx.tools.execute({ signal: new AbortController().signal, callId: ToolCallId(`rs${String(++n)}`), name, arguments: args })
  const text = r.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
  return { isError: r.isError, value: (r.isError ? {} : r.value) as Record<string, JsonValue>, text }
}

describe('rs_spectral_index', () => {
  it('summarizes NDVI with class fractions and georeference', async () => {
    const { ctx } = await setup()
    const out = await call(ctx, 'rs_spectral_index', { index: 'ndvi', path: 'scene.tif', bands: { red: 3, nir: 4 }, class_breaks: [0, 0.3], histogram_bins: 10 })
    expect(out.isError).toBe(false)
    expect(out.value.valid_pixels).toBe(1200)
    const fractions = out.value.class_fractions as { from: number | null; fraction: number }[]
    expect(fractions.map(f => f.fraction)).toEqual([0.5, 0, 0.5])
    expect(fractions[0]!.from).toBeNull()
    expect((out.value.georeference as { epsg: number }).epsg).toBe(32650)
    expect((out.value.statistics as { max: number }).max).toBeCloseTo(170 / 230, 5)
    const water = await call(ctx, 'rs_spectral_index', { index: 'ndwi', path: 'scene.tif', bands: { green: 2 }, band_paths: { nir: 'nir.tif' }, scale: 0.01, offset: 0 })
    expect((water.value.statistics as { max: number }).max).toBeGreaterThan(0.5)
    expect(water.value.class_fractions).toEqual([])
  })

  it('reports invalid inputs', async () => {
    const { ctx } = await setup()
    const cases: [Record<string, JsonValue>, string][] = [
      [{ index: 'ndvi', bands: { red: 3, nir: 4 } }, 'no file for band role'],
      [{ index: 'ndvi', path: 'scene.tif', bands: { red: 3 } }, 'bands.nir is required'],
      [{ index: 'ndvi', path: 'scene.tif', bands: { red: 3, nir: 9 } }, 'has 4 band(s)'],
      [{ index: 'ndvi', path: 'scene.tif', bands: { red: 3 }, band_paths: { nir: 'small.tif' } }, 'resample to a common grid'],
      [{ index: 'ndvi', path: 'scene.tif', bands: { red: 3, nir: 4 }, histogram_bins: 0 }, 'histogram_bins'],
      [{ index: 'ndvi', path: 'scene.tif', bands: { red: 3, nir: 4 }, class_breaks: [0.5, 0.1] }, 'strictly ascending'],
      [{ index: 'ndvi', path: '.', bands: { red: 3, nir: 4 } }, 'not a regular file'],
    ]
    for (const [args, message] of cases) {
      const out = await call(ctx, 'rs_spectral_index', args)
      expect(out.isError).toBe(true)
      expect(out.text).toContain(message)
    }
    const blank = await call(ctx, 'rs_spectral_index', { index: 'ndvi', path: 'small.tif', bands: { red: 1, nir: 2 }, offset: -5, class_breaks: [0] })
    expect(blank.value.statistics).toBeNull()
    expect((blank.value.class_fractions as { fraction: number }[])[0]!.fraction).toBe(0)
  })
})

describe('ungeoreferenced and geographic rasters', () => {
  it('omits map quantities for plain images and labels degrees for geographic grids', async () => {
    const { ctx } = await setup()
    const change = await call(ctx, 'rs_change_detect', { before_path: 'a.png', after_path: 'b.png', method: 'cva', bands: { green: 2 }, min_region_pixels: 1 })
    expect(change.value.changed_area).toBeNull()
    expect((change.value.regions as { area: null; centroid_map: null }[])[0]).toMatchObject({ area: null, centroid_map: null })
    expect(change.value.georeference).toBeNull()
    const geographic = await call(ctx, 'rs_spectral_index', { index: 'ndvi', path: 'geo.tif', bands: { red: 1, nir: 2 } })
    expect((geographic.value.georeference as { units: string }).units).toBe('degree')
  })

  it('resolves paths against the calling session workspace', async () => {
    const { ctx } = await setup()
    const id = SessionId('rs-agent')
    const session = Session.create(id, [], { version: SESSION_FORMAT_VERSION, id, createdAt: 0, cwd: dir as string, isSeeded: false })
    const agent: Agent = {
      ctx: new Context(), id, options: {}, session, inbox: unsupportedInbox(), status: 'idle',
      followup: () => {}, steer: () => {}, inject: () => {}, send: () => {}, cancel() {},
      runMaintenance: task => task(new AbortController().signal),
      whenIdle: () => Promise.resolve(),
    }
    const r = await ctx.tools.execute({
      signal: new AbortController().signal, callId: ToolCallId('rs-agent'), name: 'rs_spectral_index',
      arguments: { index: 'ndvi', path: 'scene.tif', bands: { red: 3, nir: 4 } }, agent,
    })
    expect(r.isError).toBe(false)
  })
})

describe('rs_change_detect', () => {
  it('finds the burned block by CVA and by NBR-style index difference', async () => {
    const { ctx } = await setup()
    const cva = await call(ctx, 'rs_change_detect', { before_path: 'scene.tif', after_path: 'after.tif', method: 'cva', bands: { red: 3, nir: 4 } })
    expect(cva.isError).toBe(false)
    expect(cva.value.changed_pixels).toBe(48)
    expect(cva.value.threshold_source).toBe('otsu')
    expect(cva.value.changed_area).toBe(4800)
    const region = (cva.value.regions as { bbox_px: number[]; centroid_map: number[] }[])[0]!
    expect(region.bbox_px).toEqual([4, 5, 11, 10])
    expect(region.centroid_map).toEqual([500080, 4399920])
    const idx = await call(ctx, 'rs_change_detect', { before_path: 'scene.tif', after_path: 'after.tif', method: 'index', index: 'ndvi', bands: { red: 3, nir: 4 }, threshold: 0.1, min_region_pixels: 1, scale: 1, offset: 0 })
    expect(idx.value.threshold_source).toBe('given')
    expect(idx.value.mean_signed_change as number).toBeLessThan(0)
    expect(idx.value.regions_truncated).toBe(false)
    const holes = await call(ctx, 'rs_change_detect', { before_path: 'hole.tif', after_path: 'hole.tif', method: 'cva', bands: { red: 1, nir: 2 }, threshold: 0.5 })
    expect(holes.value.changed_pixels).toBe(0)
    const holeDelta = await call(ctx, 'rs_change_detect', { before_path: 'hole.tif', after_path: 'hole.tif', method: 'index', index: 'ndvi', bands: { red: 1, nir: 2 }, threshold: 0.1 })
    expect(holeDelta.value.mean_signed_change).toBe(0)
    const holeIndex = await call(ctx, 'rs_spectral_index', { index: 'ndvi', path: 'hole.tif', bands: { red: 1, nir: 2 } })
    expect(holeIndex.value.valid_pixels).toBe(63)
  })

  it('reports invalid inputs', async () => {
    const { ctx } = await setup()
    const cases: [Record<string, JsonValue>, string][] = [
      [{ before_path: 'scene.tif', after_path: 'after.tif', method: 'index', bands: { red: 3, nir: 4 } }, 'needs index'],
      [{ before_path: 'scene.tif', after_path: 'after.tif', method: 'cva', bands: {} }, 'at least one role'],
      [{ before_path: 'scene.tif', after_path: 'small.tif', method: 'cva', bands: { red: 3 } }, 'co-register'],
      [{ before_path: 'scene.tif', after_path: 'scene.tif', method: 'cva', bands: { red: 3 } }, 'two distinct values'],
    ]
    for (const [args, message] of cases) {
      const out = await call(ctx, 'rs_change_detect', args)
      expect(out.isError).toBe(true)
      expect(out.text).toContain(message)
    }
  })
})

describe('rs_detect_objects', () => {
  async function withModel(): Promise<{ ctx: Context; fiber: Awaited<ReturnType<Context['plugin']>> }> {
    const modelDir = await mkdtemp(join(tmpdir(), 'astro-one-rs-model-'))
    const modelPath = join(modelDir, 'obb.onnx')
    // Two anchors: a confident plane and a weak ship, in 32-px input coordinates.
    await writeFile(modelPath, constantModel(32, [[16, 5], [16, 5], [8, 4], [4, 4], [0.9, 0.1], [0.05, 0.3], [0.2, 0]]))
    return setup(config({ maxResults: 1, detector: { modelPath, inputSize: 32, classNames: ['plane', 'ship'] } }))
  }

  it('detects, counts, filters, and georeferences objects through ONNX Runtime', async () => {
    const { ctx, fiber } = await withModel()
    const out = await call(ctx, 'rs_detect_objects', { path: 'scene.tif', rgb_bands: [3, 2, 1], confidence: 0.5, iou: 0.3, tile_size: 20, overlap: 0 })
    expect(out.isError).toBe(false)
    expect(out.value.tiles).toBe(4)
    expect((out.value.counts as Record<string, number>).plane).toBe(4)
    expect(out.value.detections_truncated).toBe(true)
    const det = (out.value.detections as { polygon_map: number[][]; class: string }[])[0]!
    expect(det.class).toBe('plane')
    expect(det.polygon_map).toHaveLength(4)
    const photo = await call(ctx, 'rs_detect_objects', { path: 'photo.png', classes: ['ship'] })
    // Twelve overlapping tiles each report one ship; the call keeps maxResults × 10 detections.
    expect(photo.value.counts).toEqual({ ship: 10 })
    expect((photo.value.detections as { polygon_map: null }[])[0]!.polygon_map).toBeNull()
    for (const [args, message] of [
      [{ path: 'photo.png', classes: ['tank'] }, 'unknown classes'],
      [{ path: 'photo.png', overlap: 0.95 }, 'overlap'],
      [{ path: 'photo.png', rgb_bands: [1, 2] }, 'three band numbers'],
    ] as [Record<string, JsonValue>, string][]) {
      const bad = await call(ctx, 'rs_detect_objects', args)
      expect(bad.text).toContain(message)
    }
    await fiber.dispose()
    expect(ctx.tools.schemas().map(s => s.name)).not.toContain('rs_detect_objects')
  })

  it('rejects misconfigured detectors at load and titles calls', async () => {
    await expect(setup(config({ detector: { modelPath: 'relative.onnx', inputSize: 32, classNames: ['a'] } }))).rejects.toThrow('existing absolute path')
    const modelDir = await mkdtemp(join(tmpdir(), 'astro-one-rs-model-'))
    const modelPath = join(modelDir, 'obb.onnx')
    await writeFile(modelPath, constantModel(32, [[1], [1], [1], [1], [1], [0]]))
    await expect(setup(config({ detector: { modelPath, inputSize: 32, classNames: [] } }))).rejects.toThrow('classNames must not be empty')
    // A configured detector that never ran releases nothing on disposal.
    const idle = await setup(config({ detector: { modelPath, inputSize: 32, classNames: ['plane'] } }))
    await idle.fiber.dispose()
    const { ctx, fiber } = await setup()
    expect(ctx.tools.schemas().map(s => s.name)).not.toContain('rs_detect_objects')
    type Presentable = { presentCall?: (args: unknown) => unknown }
    const title = (def: Presentable, args: Record<string, JsonValue>): string => (def.presentCall?.(args) as { title: string }).title
    expect(title(Plugin.spectralIndexTool(ctx, BASE), { index: 'ndvi' })).toBe('Spectral index (ndvi)')
    expect(title(Plugin.changeTool(ctx, BASE), { before_path: 'a', after_path: 'b', method: 'cva', bands: {} })).toBe('Change detection (cva)')
    const detector = { inputSize: 32, classNames: ['a'], run: () => Promise.resolve({ data: new Float32Array(), dims: [1, 6, 0] }) }
    expect(title(Plugin.detectTool(ctx, BASE, detector), { path: 'x' })).toBe('Object detection')
    await fiber.dispose()
  })
})
