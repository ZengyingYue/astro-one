/**
 * Oriented-object detection on large satellite images: slicing-aided (SAHI-style) overlapping
 * tiles, letterboxed model input, decoding of Ultralytics YOLO OBB outputs
 * (`[1, 4 + classes + 1, anchors]`: cx, cy, w, h, class scores, angle in radians), exact
 * rotated-rectangle IoU by convex polygon clipping, and class-wise non-maximum suppression.
 * @module @astro-one/tool-remote-sensing/detect
 */

import type { Raster } from './raster.ts'

/** A model that maps one letterboxed RGB tile to raw OBB predictions. */
export interface Detector {
  /** Square model input size, pixels. */
  readonly inputSize: number
  /** Class names indexed by class id. */
  readonly classNames: readonly string[]
  /**
   * Run inference.
   * @param input - NCHW float32 tensor data, 1 × 3 × inputSize × inputSize, values in [0, 1].
   * @returns raw output data and its dimensions.
   */
  run(input: Float32Array): Promise<{ readonly data: Float32Array; readonly dims: readonly number[] }>
}

/** Rotated box in image pixels. */
export interface OrientedBox {
  readonly classId: number
  readonly score: number
  readonly cx: number
  readonly cy: number
  readonly w: number
  readonly h: number
  /** Rotation of the width axis from +x toward +y, rad. */
  readonly angle: number
}

/** Detection controls. */
export interface DetectOptions {
  readonly confidence: number
  readonly iouThreshold: number
  /** Tile edge in image pixels. */
  readonly tileSize: number
  /** Fractional tile overlap in [0, 0.9]. */
  readonly overlap: number
  /** One-based RGB band numbers. */
  readonly rgbBands: readonly [number, number, number]
  /** Largest number of detections kept after suppression. */
  readonly maxDetections: number
  /** Class ids to keep; all classes when omitted. */
  readonly classIds?: ReadonlySet<number>
}

/**
 * Tile origins covering an image with overlap; the last tile in each direction is flush with
 * the edge.
 * @param width - image width.
 * @param height - image height.
 * @param tile - tile edge.
 * @param overlap - fractional overlap.
 * @returns [x, y, w, h] tiles.
 */
export function tiles(width: number, height: number, tile: number, overlap: number): [number, number, number, number][] {
  const step = Math.max(1, Math.floor(tile * (1 - overlap)))
  const starts = (size: number): number[] => {
    if (size <= tile) return [0]
    const out: number[] = []
    for (let s = 0; s + tile < size; s += step) out.push(s)
    out.push(size - tile)
    return out
  }
  const tw = Math.min(tile, width)
  const th = Math.min(tile, height)
  return starts(height).flatMap(y => starts(width).map(x => [x, y, tw, th] as [number, number, number, number]))
}

/**
 * Normalization of raster values to [0, 1]: 8-bit data divides by 255; wider data is stretched
 * between its 2nd and 98th percentiles.
 * @param bands - the three RGB bands.
 * @returns per-band scaling function.
 */
export function normalizer(bands: readonly Float32Array[]): (band: number, v: number) => number {
  const ranges = bands.map((b) => {
    let max = 0
    for (const v of b) if (v > max) max = v
    if (max <= 255) return [0, 255] as const
    const sorted = Float32Array.from(b).sort()
    return [sorted[Math.floor(0.02 * (sorted.length - 1))] as number, sorted[Math.floor(0.98 * (sorted.length - 1))] as number] as const
  })
  return (band, v) => {
    const [lo, hi] = ranges[band] as readonly [number, number]
    return hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0
  }
}

/**
 * Letterbox one tile into a square NCHW tensor with gray padding.
 * @param rgb - three bands.
 * @param width - image width.
 * @param tile - [x, y, w, h].
 * @param size - model input size.
 * @param norm - value normalizer.
 * @returns tensor data and the tile-to-input scale.
 */
export function letterbox(
  rgb: readonly Float32Array[], width: number, tile: readonly [number, number, number, number], size: number,
  norm: (band: number, v: number) => number,
): { data: Float32Array; scale: number } {
  const [x0, y0, tw, th] = tile
  const scale = size / Math.max(tw, th)
  const data = new Float32Array(3 * size * size).fill(114 / 255)
  const nw = Math.round(tw * scale)
  const nh = Math.round(th * scale)
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(th - 1, Math.max(0, (y + 0.5) / scale - 0.5))
    const y1 = Math.floor(sy)
    const y2 = Math.min(th - 1, y1 + 1)
    const fy = sy - y1
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(tw - 1, Math.max(0, (x + 0.5) / scale - 0.5))
      const x1 = Math.floor(sx)
      const x2 = Math.min(tw - 1, x1 + 1)
      const fx = sx - x1
      for (let c = 0; c < 3; c++) {
        const band = rgb[c] as Float32Array
        const at = (xx: number, yy: number): number => norm(c, band[(y0 + yy) * width + x0 + xx] as number)
        const top = at(x1, y1) * (1 - fx) + at(x2, y1) * fx
        const bottom = at(x1, y2) * (1 - fx) + at(x2, y2) * fx
        data[c * size * size + y * size + x] = top * (1 - fy) + bottom * fy
      }
    }
  }
  return { data, scale }
}

/**
 * Decode YOLO OBB predictions above a confidence threshold.
 * @param output - raw output.
 * @param output.data - flattened tensor.
 * @param output.dims - tensor dimensions `[1, 4 + classes + 1, anchors]`.
 * @param classes - class count.
 * @param confidence - minimum class score.
 * @returns boxes in model-input pixels.
 */
export function decodeObb(
  output: { readonly data: Float32Array; readonly dims: readonly number[] }, classes: number, confidence: number,
): OrientedBox[] {
  const [, channels, anchors] = output.dims as [number, number, number]
  if (channels !== 4 + classes + 1) throw new Error(`model output has ${String(channels)} channels; expected ${String(4 + classes + 1)} for ${String(classes)} classes`)
  const v = (c: number, j: number): number => output.data[c * anchors + j] as number
  const out: OrientedBox[] = []
  for (let j = 0; j < anchors; j++) {
    let best = 0
    let score = -Infinity
    for (let k = 0; k < classes; k++) {
      const s = v(4 + k, j)
      if (s > score) {
        score = s
        best = k
      }
    }
    if (score < confidence) continue
    out.push({ classId: best, score, cx: v(0, j), cy: v(1, j), w: v(2, j), h: v(3, j), angle: v(4 + classes, j) })
  }
  return out
}

/**
 * Corners of a rotated box.
 * @param b - box.
 * @returns four [x, y] corners in counter-clockwise image order.
 */
export function corners(b: OrientedBox): [number, number][] {
  const c = Math.cos(b.angle)
  const s = Math.sin(b.angle)
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, w]) => {
    const dx = ((u as number) * b.w) / 2
    const dy = ((w as number) * b.h) / 2
    return [b.cx + dx * c - dy * s, b.cy + dx * s + dy * c] as [number, number]
  })
}

function area(poly: readonly (readonly [number, number])[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i] as readonly [number, number]
    const [x2, y2] = poly[(i + 1) % poly.length] as readonly [number, number]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

function clip(subject: [number, number][], a: [number, number], b: [number, number], sign: number): [number, number][] {
  const side = (p: [number, number]): number => sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))
  const out: [number, number][] = []
  for (let i = 0; i < subject.length; i++) {
    const p = subject[i] as [number, number]
    const q = subject[(i + 1) % subject.length] as [number, number]
    const sp = side(p)
    const sq = side(q)
    if (sp >= 0) out.push(p)
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq)
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])])
    }
  }
  return out
}

/**
 * Intersection over union of two rotated boxes (Sutherland–Hodgman clipping).
 * @param a - first box.
 * @param b - second box.
 * @returns IoU in [0, 1].
 */
export function rotatedIou(a: OrientedBox, b: OrientedBox): number {
  const pb = corners(b)
  // corners() lists vertices with a non-negative shoelace sum, so the interior lies on the
  // non-negative side of each clip edge.
  let inter: [number, number][] = corners(a)
  for (let i = 0; i < 4 && inter.length > 0; i++) inter = clip(inter, pb[i] as [number, number], pb[(i + 1) % 4] as [number, number], 1)
  const ai = inter.length > 2 ? area(inter) : 0
  const union = a.w * a.h + b.w * b.h - ai
  return union > 0 ? ai / union : 0
}

/**
 * Class-wise greedy non-maximum suppression.
 * @param boxes - candidates.
 * @param iouThreshold - suppression overlap.
 * @param limit - largest kept count.
 * @returns kept boxes by descending score.
 */
export function nms(boxes: readonly OrientedBox[], iouThreshold: number, limit: number): OrientedBox[] {
  const sorted = [...boxes].sort((x, y) => y.score - x.score)
  const kept: OrientedBox[] = []
  for (const b of sorted) {
    if (kept.length >= limit) break
    if (kept.some(k => k.classId === b.classId && rotatedIou(k, b) > iouThreshold)) continue
    kept.push(b)
  }
  return kept
}

/**
 * Detect oriented objects over a whole raster.
 * @param raster - decoded image.
 * @param detector - model.
 * @param options - thresholds, tiling, and band selection.
 * @param signal - cancellation between tiles.
 * @returns detections in image pixels and the tile count.
 */
export async function detectObjects(
  raster: Raster, detector: Detector, options: DetectOptions, signal: AbortSignal,
): Promise<{ boxes: OrientedBox[]; tiles: number }> {
  const rgb = options.rgbBands.map((b, i) => {
    const band = raster.bands[b - 1]
    if (band === undefined) throw new Error(`rgb_bands[${String(i)}] = ${String(b)} but the image has ${String(raster.bands.length)} band(s)`)
    return band
  })
  const norm = normalizer(rgb)
  const grid = tiles(raster.width, raster.height, options.tileSize, options.overlap)
  const all: OrientedBox[] = []
  for (const tile of grid) {
    signal.throwIfAborted()
    const { data, scale } = letterbox(rgb, raster.width, tile, detector.inputSize, norm)
    const output = await detector.run(data)
    for (const b of decodeObb(output, detector.classNames.length, options.confidence)) {
      if (options.classIds !== undefined && !options.classIds.has(b.classId)) continue
      all.push({ ...b, cx: tile[0] + b.cx / scale, cy: tile[1] + b.cy / scale, w: b.w / scale, h: b.h / scale })
    }
  }
  return { boxes: nms(all, options.iouThreshold, options.maxDetections), tiles: grid.length }
}
