/**
 * Observation-to-object correlation: normalized residuals of a tracklet against each catalog
 * element set, with an optional along-track timing bias that absorbs element-set age.
 * Angular residuals are scaled by the cosine of the second angle so they measure arc length.
 * @module @astro-one/tool-space-awareness/correlation
 */

import { observationSize, predictObservation, propagateSgp4, residuals, temeToGcrf } from '@astro-one/astrodynamics'
import type { Observation, Sgp4Elements, TimedState } from '@astro-one/astrodynamics'

/** Fit of one element set to a tracklet. */
export interface CorrelationFit {
  /** Sum of squared normalized residuals; Infinity when SGP4 fails inside the tracklet. */
  readonly chi2: number
  /** Residual component count. */
  readonly dof: number
  /** Timing bias applied to the element set, s. */
  readonly biasS: number
}

/**
 * Observed-minus-computed residuals of a tracklet against an element set shifted by a timing
 * bias; angular first components are scaled by the cosine of the second angle.
 * @param elements - element set.
 * @param observations - tracklet.
 * @param biasS - timing bias, s; the object is predicted at `t + biasS`.
 * @returns one residual row per observation, in observation units.
 * @throws When SGP4 fails at a biased observation time.
 */
export function residualRows(elements: Sgp4Elements, observations: readonly Observation[], biasS: number): number[][] {
  const states = propagateSgp4(elements, observations.map(o => o.t + biasS * 1000))
  return observations.map((obs, k) => {
    const res = residuals(obs, predictObservation(obs, temeToGcrf(states[k] as TimedState, obs.t)))
    if (obs.kind === 'radec' || obs.kind === 'azel') res[0] = (res[0] as number) * Math.cos(obs.value[1])
    return res
  })
}

/**
 * Chi-square of an element set against a tracklet with the set shifted by a timing bias.
 * @param elements - element set.
 * @param observations - tracklet.
 * @param biasS - timing bias, s.
 * @returns the fit.
 */
export function fitAt(elements: Sgp4Elements, observations: readonly Observation[], biasS: number): CorrelationFit {
  const dof = observations.reduce((n, o) => n + observationSize(o), 0)
  let rows: number[][]
  try {
    rows = residualRows(elements, observations, biasS)
  } catch (decayed) {
    // An element set that decays inside the tracklet cannot match it; the message adds nothing to the ranking.
    void decayed
    return { chi2: Infinity, dof, biasS }
  }
  const chi2 = rows.reduce((sum, row, k) => sum + row.reduce((s, x) => s + (x / (observations[k] as Observation).sigma) ** 2, 0), 0)
  return { chi2, dof, biasS }
}

/** Root-mean-square residual per measurement group; null for a group without observations. */
export interface ResidualRms {
  /** Arc-length angle residual, rad. */
  readonly angle: number | null
  /** Range residual, km. */
  readonly range: number | null
  /** Range-rate residual, km/s. */
  readonly rangeRate: number | null
}

/**
 * Residual RMS per measurement group.
 * @param elements - element set.
 * @param observations - tracklet.
 * @param biasS - timing bias, s; must be one at which the fit was finite.
 * @returns the RMS of each group present in the tracklet.
 */
export function residualRms(elements: Sgp4Elements, observations: readonly Observation[], biasS: number): ResidualRms {
  const groups = { angle: [] as number[], range: [] as number[], rangeRate: [] as number[] }
  residualRows(elements, observations, biasS).forEach((row, k) => {
    const kind = (observations[k] as Observation).kind
    const group = kind === 'range' ? groups.range : kind === 'range-rate' ? groups.rangeRate : groups.angle
    group.push(...row)
  })
  const rms = (xs: number[]): number | null => (xs.length === 0 ? null : Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length))
  return { angle: rms(groups.angle), range: rms(groups.range), rangeRate: rms(groups.rangeRate) }
}

/**
 * Best timing bias on a uniform scan of offsets inside ±maxBiasS.
 * @param elements - element set.
 * @param observations - tracklet.
 * @param maxBiasS - largest bias magnitude, s; 0 evaluates only the unbiased fit.
 * @returns the best scanned fit.
 */
export function scanFit(elements: Sgp4Elements, observations: readonly Observation[], maxBiasS: number): CorrelationFit {
  if (maxBiasS === 0) return fitAt(elements, observations, 0)
  let best = fitAt(elements, observations, -maxBiasS)
  for (let k = 1; k < BIAS_SCAN_POINTS; k++) {
    const fit = fitAt(elements, observations, -maxBiasS + k * scanStep(maxBiasS))
    if (fit.chi2 < best.chi2) best = fit
  }
  return best
}

/**
 * Golden-section refinement of a scanned timing bias within one scan step on each side.
 * @param elements - element set.
 * @param observations - tracklet.
 * @param scanned - best scanned fit.
 * @param maxBiasS - largest bias magnitude, s.
 * @returns the refined fit, or the scanned fit when refinement does not improve it.
 */
export function refineFit(
  elements: Sgp4Elements, observations: readonly Observation[], scanned: CorrelationFit, maxBiasS: number,
): CorrelationFit {
  const step = scanStep(maxBiasS)
  let a = Math.max(-maxBiasS, scanned.biasS - step)
  let b = Math.min(maxBiasS, scanned.biasS + step)
  const g = (Math.sqrt(5) - 1) / 2
  const cost = (x: number): number => fitAt(elements, observations, x).chi2
  for (let i = 0; i < GOLDEN_ITERATIONS; i++) {
    const c = b - g * (b - a)
    const d = a + g * (b - a)
    if (cost(c) < cost(d)) b = d
    else a = c
  }
  const refined = fitAt(elements, observations, (a + b) / 2)
  return refined.chi2 < scanned.chi2 ? refined : scanned
}

function scanStep(maxBiasS: number): number {
  return (2 * maxBiasS) / (BIAS_SCAN_POINTS - 1)
}

/** Golden-section iterations; 40 shrink the bracket by 0.618⁴⁰ ≈ 4·10⁻⁹. */
export const GOLDEN_ITERATIONS = 40

/** Scan offsets of the timing-bias search; odd, so zero bias is one of them. */
export const BIAS_SCAN_POINTS = 21

/** Fits one refinement evaluates. */
export const REFINEMENT_FITS = 2 * GOLDEN_ITERATIONS + 1
