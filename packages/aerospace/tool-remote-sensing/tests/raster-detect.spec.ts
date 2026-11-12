import { describe, expect, it } from 'vitest'
import { corners, decodeObb, detectObjects, letterbox, nms, normalizer, rotatedIou, tiles } from '../src/detect.ts'
import type { Detector, OrientedBox } from '../src/detect.ts'
import { decodeRaster, pixelArea, pixelToMap } from '../src/raster.ts'
import { geotiff, png } from './fixtures.ts'

const box = (over: Partial<OrientedBox> = {}): OrientedBox => ({ classId: 0, score: 0.9, cx: 10, cy: 10, w: 4, h: 2, angle: 0, ...over })

describe('raster decoding', () => {
  it('reads georeferenced GeoTIFF bands, no-data, and plain images', async () => {
    const tif = await decodeRaster(geotiff(4, 3, [(x, y) => x + 10 * y, () => 7], true, 255), 100)
    expect(tif.width).toBe(4)
    expect(tif.bands).toHaveLength(2)
    expect(tif.bands[0]![5]).toBe(11)
    expect(tif.noData).toBe(255)
    expect(tif.geo).toEqual({ origin: [500000, 4400000], pixelSize: [10, -10], epsg: 32650, geographic: false })
    expect(pixelToMap(tif.geo!, 1, 2)).toEqual([500010, 4399980])
    expect(pixelArea(tif.geo!)).toBe(100)
    const sharp = (await import('sharp')).default
    const tiffBytes = await sharp(Buffer.from([1, 2, 3, 4]), { raw: { width: 2, height: 2, channels: 1 } }).tiff().toBuffer()
    const plain = await decodeRaster(new Uint8Array(tiffBytes), 100)
    expect(plain.geo).toBeNull()
    const image = await decodeRaster(await png(3, 2, x => [x * 10, 0, 255]), 100)
    expect(image.bands).toHaveLength(3)
    expect(image.bands[0]![2]).toBe(20)
    await expect(decodeRaster(new Uint8Array([1, 2, 3, 4]), 100)).rejects.toThrow('unsupported raster format')
    await expect(decodeRaster(await png(20, 20, () => [0, 0, 0]), 100)).rejects.toThrow('at most 100')
    await expect(decodeRaster(geotiff(20, 20, [() => 0]), 100)).rejects.toThrow('at most 100')
  })

  it('recognizes geographic GeoTIFFs', async () => {
    const { writeArrayBuffer } = await import('geotiff')
    const wgs84 = {
      ModelPixelScale: [0.001, 0.001, 0],
      ModelTiepoint: [0, 0, 0, 116, 40, 0],
      GeographicTypeGeoKey: 4326,
      GTModelTypeGeoKey: 2,
    }
    const ab = writeArrayBuffer([1, 2, 3, 4], { width: 2, height: 2, ...wgs84 })
    const r = await decodeRaster(new Uint8Array(ab), 10)
    expect(r.geo?.geographic).toBe(true)
    expect(r.geo?.epsg).toBe(4326)
    const userDefined = {
      ModelPixelScale: [1, 1, 0],
      ModelTiepoint: [0, 0, 0, 0, 0, 0],
      GTModelTypeGeoKey: 1,
      ProjectedCSTypeGeoKey: 32767,
    }
    const unnamed = writeArrayBuffer([1, 2, 3, 4], { width: 2, height: 2, ...userDefined })
    expect((await decodeRaster(new Uint8Array(unnamed), 10)).geo?.epsg).toBeNull()
  })
})

describe('tiling and preprocessing', () => {
  it('covers images with overlapping edge-flush tiles', () => {
    expect(tiles(50, 40, 64, 0.2)).toEqual([[0, 0, 50, 40]])
    const grid = tiles(200, 100, 64, 0.25)
    expect(grid.every(([x, y, w, h]) => x + w <= 200 && y + h <= 100)).toBe(true)
    expect(grid.some(([x]) => x === 136)).toBe(true)
    expect(tiles(10, 10, 5, 1).length).toBeGreaterThan(1)
  })

  it('normalizes 8-bit and wider data and letterboxes tiles', () => {
    const eight = normalizer([Float32Array.from([0, 255])])
    expect(eight(0, 255)).toBe(1)
    const wide = normalizer([Float32Array.from({ length: 100 }, (_, i) => i * 100), Float32Array.from([300, 300])])
    expect(wide(0, 0)).toBe(0)
    expect(wide(0, 9900)).toBe(1)
    expect(wide(1, 300)).toBe(0)
    const band = Float32Array.from({ length: 16 }, (_, i) => i * 10)
    const rgbNorm = normalizer([band, band, band])
    const { data, scale } = letterbox([band, band, band], 4, [0, 0, 4, 2], 8, rgbNorm)
    expect(scale).toBe(2)
    expect(data).toHaveLength(3 * 64)
    expect(data[7 * 8]).toBeCloseTo(114 / 255, 6)
  })
})

describe('oriented boxes', () => {
  it('decodes YOLO OBB tensors', () => {
    const data = Float32Array.from([10, 20, 11, 21, 4, 5, 2, 3, 0.9, 0.1, 0.05, 0.2, 0.3, 0.4])
    const boxes = decodeObb({ data, dims: [1, 7, 2] }, 2, 0.25)
    expect(boxes).toHaveLength(1)
    expect(boxes[0]).toMatchObject({ classId: 0, cx: 10, cy: 11, w: 4, h: 2 })
    expect(boxes[0]!.score).toBeCloseTo(0.9, 6)
    expect(boxes[0]!.angle).toBeCloseTo(0.3, 6)
    expect(() => decodeObb({ data, dims: [1, 7, 2] }, 3, 0.25)).toThrow('expected 8')
  })

  it('computes rotated IoU and suppresses duplicates per class', () => {
    expect(rotatedIou(box(), box())).toBeCloseTo(1, 12)
    expect(rotatedIou(box(), box({ cx: 100 }))).toBe(0)
    expect(rotatedIou(box({ w: 2, h: 2 }), box({ w: 2, h: 2, cx: 11 }))).toBeCloseTo(1 / 3, 10)
    const square = box({ w: 2, h: 2 })
    expect(rotatedIou(square, box({ w: 2, h: 2, angle: Math.PI / 4 }))).toBeGreaterThan(0.7)
    expect(rotatedIou(box({ w: 0, h: 0 }), box({ w: 0, h: 0 }))).toBe(0)
    expect(corners(box({ angle: Math.PI / 2 }))[0]![0]).toBeCloseTo(11, 12)
    const kept = nms([box(), box({ score: 0.8, cx: 10.2 }), box({ classId: 1, score: 0.7 }), box({ score: 0.6, cx: 50 })], 0.5, 10)
    expect(kept.map(k => k.score)).toEqual([0.9, 0.7, 0.6])
    expect(nms([box(), box({ cx: 50 })], 0.5, 1)).toHaveLength(1)
  })

  it('runs tiled detection and maps boxes back to image pixels', async () => {
    const calls: number[] = []
    const detector: Detector = {
      inputSize: 32,
      classNames: ['plane'],
      run: (input) => {
        calls.push(input.length)
        return Promise.resolve({ data: Float32Array.from([16, 16, 8, 4, 0.9, 0.1]), dims: [1, 6, 1] })
      },
    }
    const band = new Float32Array(80 * 40).fill(100)
    const raster = { width: 80, height: 40, bands: [band, band, band], noData: null, geo: null }
    const opts = { confidence: 0.5, iouThreshold: 0.5, tileSize: 32, overlap: 0.25, maxDetections: 100 }
    const out = await detectObjects(raster, detector, { ...opts, rgbBands: [1, 2, 3] }, new AbortController().signal)
    expect(out.tiles).toBe(calls.length)
    expect(out.boxes.length).toBeGreaterThan(1)
    expect(out.boxes.every(b => b.w === 8)).toBe(true)
    await expect(detectObjects(raster, detector, { ...opts, rgbBands: [1, 2, 4] }, new AbortController().signal))
      .rejects.toThrow('rgb_bands[2] = 4')
    const aborted = new AbortController()
    aborted.abort()
    await expect(detectObjects(raster, detector, { ...opts, rgbBands: [1, 2, 3] }, aborted.signal)).rejects.toThrow()
  })
})
