import { describe, expect, it } from 'vitest'
import { histogram, INDEX_BANDS, indexValue, otsu, regions, statistics } from '../src/analysis.ts'
import type { IndexName } from '../src/analysis.ts'

describe('spectral indices', () => {
  it('evaluates every index and returns NaN on vanishing denominators', () => {
    const v = { blue: 0.05, green: 0.08, red: 0.06, rededge: 0.2, nir: 0.4, swir1: 0.2, swir2: 0.1 }
    expect(indexValue('ndvi', v)).toBeCloseTo((0.4 - 0.06) / 0.46, 12)
    expect(indexValue('ndwi', v)).toBeCloseTo((0.08 - 0.4) / 0.48, 12)
    expect(indexValue('mndwi', v)).toBeCloseTo((0.08 - 0.2) / 0.28, 12)
    expect(indexValue('ndsi', v)).toBe(indexValue('mndwi', v))
    expect(indexValue('ndbi', v)).toBeCloseTo((0.2 - 0.4) / 0.6, 12)
    expect(indexValue('nbr', v)).toBeCloseTo(0.3 / 0.5, 12)
    expect(indexValue('ndre', v)).toBeCloseTo(0.2 / 0.6, 12)
    expect(indexValue('evi', v)).toBeCloseTo((2.5 * 0.34) / (0.4 + 0.36 - 0.375 + 1), 12)
    expect(indexValue('savi', v)).toBeCloseTo((1.5 * 0.34) / 0.96, 12)
    const zero = { blue: 0, green: 0, red: 0, rededge: 0, nir: 0, swir1: 0, swir2: 0 }
    for (const index of Object.keys(INDEX_BANDS) as IndexName[]) {
      if (index === 'evi' || index === 'savi') continue
      expect(indexValue(index, zero)).toBeNaN()
    }
    expect(indexValue('evi', { nir: -1, red: 0, blue: 0 })).toBeNaN()
    expect(indexValue('savi', { nir: -0.25, red: -0.25 })).toBeNaN()
  })
})

describe('statistics', () => {
  it('summarizes finite values', () => {
    const s = statistics(Float32Array.from([1, 2, 3, 4, Number.NaN]))!
    expect(s.count).toBe(4)
    expect(s.mean).toBe(2.5)
    expect(s.percentiles.p50).toBe(2.5)
    expect(s.min).toBe(1)
    expect(s.max).toBe(4)
    expect(statistics(Float32Array.from([Number.NaN]))).toBeUndefined()
    const h = histogram(Float32Array.from([-5, 0, 0.5, 5, Number.NaN]), -1, 1, 4)
    expect(h.counts).toEqual([1, 0, 1, 2])
    expect(h.edges).toEqual([-1, -0.5, 0, 0.5, 1])
  })

  it('splits a bimodal distribution with Otsu', () => {
    const cluster = (base: number): number[] => Array.from({ length: 50 }, (_, i) => base + i * 0.001)
    const values = Float32Array.from([...cluster(0.1), ...cluster(0.8)])
    const t = otsu(values)
    expect(t).toBeGreaterThan(0.149)
    expect(t).toBeLessThan(0.8)
    expect(() => otsu(Float32Array.from([1, 1]))).toThrow('two distinct values')
    expect(() => otsu(Float32Array.from([Number.NaN]))).toThrow('two distinct values')
  })
})

describe('connected regions', () => {
  it('labels 8-connected regions largest first', () => {
    const w = 6
    const h = 4
    const mask = new Uint8Array(w * h)
    for (const [x, y] of [[0, 0], [1, 1], [2, 2], [5, 0], [5, 1], [4, 3], [5, 3]]) mask[(y as number) * w + (x as number)] = 1
    const values = Float32Array.from({ length: w * h }, (_, i) => i)
    const found = regions(mask, w, h, values)
    expect(found.map(r => r.pixels)).toEqual([3, 2, 2])
    expect(found[0]!.bbox).toEqual([0, 0, 2, 2])
    expect(found[0]!.centroid).toEqual([1, 1])
    expect(found[0]!.meanValue).toBeCloseTo((0 + 7 + 14) / 3, 12)
  })
})
