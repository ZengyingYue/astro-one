/**
 * Light-curve period analysis: the generalized (floating-mean, weighted) Lomb–Scargle
 * periodogram of Zechmeister and Kürster (2009) with its analytic false-alarm probability, and
 * Stellingwerf (1978) phase dispersion minimization to compare a period with its double.
 * @module @astro-one/tool-space-awareness/lightcurve
 */

/** One photometric measurement. */
export interface Photometry {
  /** Time, s, on any common origin. */
  readonly t: number
  /** Magnitude. */
  readonly mag: number
  /** One-sigma magnitude uncertainty. */
  readonly sigma: number
}

/** Periodogram value at one frequency. */
export interface PeriodogramPoint {
  /** Frequency, Hz. */
  readonly frequency: number
  /** Normalized power in [0, 1]. */
  readonly power: number
  /** Semi-amplitude of the best-fit sinusoid, magnitudes. */
  readonly amplitude: number
}

/**
 * Generalized Lomb–Scargle power and sinusoid amplitude.
 * @param points - measurements, at least three.
 * @param frequency - trial frequency, Hz.
 * @returns the normalized power and fitted semi-amplitude.
 */
export function lombScargle(points: readonly Photometry[], frequency: number): PeriodogramPoint {
  const weights = points.map(p => 1 / (p.sigma * p.sigma))
  const total = weights.reduce((s, w) => s + w, 0)
  let y = 0, c = 0, s = 0, yy = 0, yc = 0, ys = 0, cc = 0, ss = 0, cs = 0
  points.forEach((p, k) => {
    const w = (weights[k] as number) / total
    const x = 2 * Math.PI * frequency * p.t
    const cos = Math.cos(x)
    const sin = Math.sin(x)
    y += w * p.mag
    c += w * cos
    s += w * sin
    yy += w * p.mag * p.mag
    yc += w * p.mag * cos
    ys += w * p.mag * sin
    cc += w * cos * cos
    ss += w * sin * sin
    cs += w * cos * sin
  })
  const YY = yy - y * y
  const YC = yc - y * c
  const YS = ys - y * s
  const CC = cc - c * c
  const SS = ss - s * s
  const CS = cs - c * s
  const d = CC * SS - CS * CS
  if (!(YY > 0) || !(d > 0)) return { frequency, power: 0, amplitude: 0 }
  const a = (YC * SS - YS * CS) / d
  const b = (YS * CC - YC * CS) / d
  return { frequency, power: Math.min(1, (SS * YC * YC + CC * YS * YS - 2 * CS * YC * YS) / (YY * d)), amplitude: Math.hypot(a, b) }
}

/**
 * False-alarm probability of a periodogram peak (Zechmeister and Kürster 2009, eqs. 24–25).
 * @param power - normalized peak power.
 * @param count - number of measurements.
 * @param independent - number of independent frequencies searched.
 * @returns the probability that noise alone gives a peak this high.
 */
export function falseAlarmProbability(power: number, count: number, independent: number): number {
  const single = (1 - power) ** ((count - 3) / 2)
  return Math.min(1, -Math.expm1(Math.max(1, independent) * Math.log1p(-Math.min(single, 1 - 1e-16))))
}

/**
 * Stellingwerf phase-dispersion statistic: pooled within-bin variance over total variance.
 * @param points - measurements.
 * @param period - trial period, s.
 * @param bins - phase bins.
 * @returns Θ; values well below 1 indicate a coherent light curve at this period.
 */
export function phaseDispersion(points: readonly Photometry[], period: number, bins: number): number {
  const mean = points.reduce((s, p) => s + p.mag, 0) / points.length
  const total = points.reduce((s, p) => s + (p.mag - mean) ** 2, 0) / (points.length - 1)
  const groups: number[][] = Array.from({ length: bins }, () => [])
  for (const p of points) {
    const phase = (((p.t / period) % 1) + 1) % 1
    ;(groups[Math.min(bins - 1, Math.floor(phase * bins))] as number[]).push(p.mag)
  }
  let pooled = 0
  let dof = 0
  for (const g of groups) {
    if (g.length < 2) continue
    const m = g.reduce((s, x) => s + x, 0) / g.length
    pooled += g.reduce((s, x) => s + (x - m) ** 2, 0)
    dof += g.length - 1
  }
  return dof === 0 || !(total > 0) ? 1 : pooled / dof / total
}

/**
 * Local maxima of a periodogram, strongest first.
 * @param periodogram - values on an ascending frequency grid.
 * @param count - largest number of peaks.
 * @returns the peaks.
 */
export function strongestPeaks(periodogram: readonly PeriodogramPoint[], count: number): PeriodogramPoint[] {
  const peaks = periodogram.filter((p, k) => p.power > 0
    && (k === 0 || p.power > (periodogram[k - 1] as PeriodogramPoint).power)
    && (k === periodogram.length - 1 || p.power >= (periodogram[k + 1] as PeriodogramPoint).power))
  return peaks.sort((a, b) => b.power - a.power).slice(0, count)
}

/**
 * Golden-section refinement of a periodogram peak within one grid step on each side.
 * @param points - measurements.
 * @param peak - grid peak.
 * @param step - grid frequency step, Hz.
 * @returns the refined peak, never weaker than the grid peak.
 */
export function refinePeak(points: readonly Photometry[], peak: PeriodogramPoint, step: number): PeriodogramPoint {
  const g = (Math.sqrt(5) - 1) / 2
  let a = peak.frequency - step
  let b = peak.frequency + step
  for (let i = 0; i < 40; i++) {
    const c = b - g * (b - a)
    const d = a + g * (b - a)
    if (lombScargle(points, c).power > lombScargle(points, d).power) b = d
    else a = c
  }
  const refined = lombScargle(points, (a + b) / 2)
  return refined.power > peak.power ? refined : peak
}
