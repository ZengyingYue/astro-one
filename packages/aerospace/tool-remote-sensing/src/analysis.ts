/**
 * Pixel analytics for Earth observation: spectral indices, robust statistics and histograms,
 * change-vector magnitude, Otsu thresholding, and 8-connected region labelling.
 * @module @astro-one/tool-remote-sensing/analysis
 */

/** Band roles used by the spectral indices. */
export type BandRole = 'blue' | 'green' | 'red' | 'rededge' | 'nir' | 'swir1' | 'swir2'

/** Supported spectral indices. */
export type IndexName = 'ndvi' | 'ndwi' | 'mndwi' | 'ndbi' | 'nbr' | 'ndre' | 'ndsi' | 'evi' | 'savi'

/** Bands each index needs. */
export const INDEX_BANDS: Readonly<Record<IndexName, readonly BandRole[]>> = {
  ndvi: ['nir', 'red'],
  ndwi: ['green', 'nir'],
  mndwi: ['green', 'swir1'],
  ndbi: ['swir1', 'nir'],
  nbr: ['nir', 'swir2'],
  ndre: ['nir', 'rededge'],
  ndsi: ['green', 'swir1'],
  evi: ['nir', 'red', 'blue'],
  savi: ['nir', 'red'],
}

/**
 * Evaluate a spectral index for one pixel of surface reflectance.
 * @param index - index name.
 * @param v - reflectance by band role.
 * @returns index value, or NaN where the denominator vanishes.
 */
export function indexValue(index: IndexName, v: Readonly<Partial<Record<BandRole, number>>>): number {
  const nd = (a: number, b: number): number => (a + b === 0 ? Number.NaN : (a - b) / (a + b))
  const get = (role: BandRole): number => v[role] as number
  switch (index) {
    case 'ndvi': return nd(get('nir'), get('red'))
    case 'ndwi': return nd(get('green'), get('nir'))
    case 'mndwi':
    case 'ndsi': return nd(get('green'), get('swir1'))
    case 'ndbi': return nd(get('swir1'), get('nir'))
    case 'nbr': return nd(get('nir'), get('swir2'))
    case 'ndre': return nd(get('nir'), get('rededge'))
    case 'evi': {
      const d = get('nir') + 6 * get('red') - 7.5 * get('blue') + 1
      return d === 0 ? Number.NaN : (2.5 * (get('nir') - get('red'))) / d
    }
    case 'savi': {
      const d = get('nir') + get('red') + 0.5
      return d === 0 ? Number.NaN : (1.5 * (get('nir') - get('red'))) / d
    }
  }
}

/** Summary statistics of the finite values. */
export interface Statistics {
  readonly count: number
  readonly mean: number
  readonly std: number
  readonly min: number
  readonly max: number
  /** Percentiles 2, 25, 50, 75, 98 by linear interpolation. */
  readonly percentiles: Readonly<Record<'p02' | 'p25' | 'p50' | 'p75' | 'p98', number>>
}

/**
 * Statistics of finite values.
 * @param values - samples (NaN entries are skipped).
 * @returns statistics, or undefined when no value is finite.
 */
export function statistics(values: Float32Array): Statistics | undefined {
  const finite = values.filter(Number.isFinite).sort()
  const n = finite.length
  if (n === 0) return undefined
  let sum = 0
  for (const v of finite) sum += v
  const mean = sum / n
  let sq = 0
  for (const v of finite) sq += (v - mean) ** 2
  const q = (p: number): number => {
    const pos = (p / 100) * (n - 1)
    const lo = Math.floor(pos)
    const hi = Math.min(n - 1, lo + 1)
    return (finite[lo] as number) + (pos - lo) * ((finite[hi] as number) - (finite[lo] as number))
  }
  return {
    count: n, mean, std: Math.sqrt(sq / n), min: finite[0] as number, max: finite[n - 1] as number,
    percentiles: { p02: q(2), p25: q(25), p50: q(50), p75: q(75), p98: q(98) },
  }
}

/**
 * Histogram of finite values over a fixed range; values outside fall in the edge bins.
 * @param values - samples.
 * @param lo - lower edge.
 * @param hi - upper edge (greater than `lo`).
 * @param bins - bin count.
 * @returns bin edges (bins + 1) and counts.
 */
export function histogram(values: Float32Array, lo: number, hi: number, bins: number): { edges: number[]; counts: number[] } {
  const counts = new Array<number>(bins).fill(0)
  const width = (hi - lo) / bins
  for (const v of values) {
    if (!Number.isFinite(v)) continue
    const k = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / width)))
    counts[k] = (counts[k] as number) + 1
  }
  return { edges: Array.from({ length: bins + 1 }, (_, i) => lo + i * width), counts }
}

/**
 * Otsu's threshold maximizing between-class variance of a 256-bin histogram.
 * @param values - samples (non-finite skipped).
 * @returns threshold value.
 * @throws When fewer than two distinct finite values exist.
 */
export function otsu(values: Float32Array): number {
  const stats = statistics(values)
  if (stats === undefined || stats.max === stats.min) throw new Error('Otsu thresholding needs at least two distinct values')
  const bins = 256
  const { counts, edges } = histogram(values, stats.min, stats.max, bins)
  const total = stats.count
  let sumAll = 0
  counts.forEach((c, i) => { sumAll += c * i })
  let wB = 0
  let sumB = 0
  let best = 0
  let bestVar = -1
  for (let i = 0; i < bins; i++) {
    // The first bin holds the minimum, so the background weight is positive from the start.
    wB += counts[i] as number
    const wF = total - wB
    if (wF === 0) break
    sumB += i * (counts[i] as number)
    const mB = sumB / wB
    const mF = (sumAll - sumB) / wF
    const between = wB * wF * (mB - mF) ** 2
    if (between > bestVar) {
      bestVar = between
      best = i
    }
  }
  return edges[best + 1] as number
}

/** One connected region of a mask. */
export interface Region {
  readonly pixels: number
  /** Inclusive pixel bounds [minCol, minRow, maxCol, maxRow]. */
  readonly bbox: readonly [number, number, number, number]
  /** Mean column and row. */
  readonly centroid: readonly [number, number]
  /** Mean of the supplied value layer over the region. */
  readonly meanValue: number
}

/**
 * Label 8-connected regions of a boolean mask.
 * @param mask - row-major mask.
 * @param width - raster width.
 * @param height - raster height.
 * @param values - per-pixel value layer averaged per region.
 * @returns regions in descending size.
 */
export function regions(mask: Uint8Array, width: number, height: number, values: Float32Array): Region[] {
  const seen = new Uint8Array(mask.length)
  const out: Region[] = []
  const stack: number[] = []
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || seen[start] === 1) continue
    seen[start] = 1
    stack.push(start)
    let count = 0
    let sx = 0
    let sy = 0
    let sv = 0
    let minC = width
    let minR = height
    let maxC = -1
    let maxR = -1
    while (stack.length > 0) {
      const p = stack.pop() as number
      const c = p % width
      const r = (p - c) / width
      count++
      sx += c
      sy += r
      sv += values[p] as number
      minC = Math.min(minC, c)
      maxC = Math.max(maxC, c)
      minR = Math.min(minR, r)
      maxR = Math.max(maxR, r)
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr
          const nc = c + dc
          if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue
          const q = nr * width + nc
          if (mask[q] === 1 && seen[q] === 0) {
            seen[q] = 1
            stack.push(q)
          }
        }
      }
    }
    out.push({ pixels: count, bbox: [minC, minR, maxC, maxR], centroid: [sx / count, sy / count], meanValue: sv / count })
  }
  return out.sort((a, b) => b.pixels - a.pixels)
}
