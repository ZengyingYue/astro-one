/**
 * One-against-catalog conjunction screening: the Hoots apogee/perigee filter, a uniform-grid
 * time filter that bounds the separation inside each step, and time-of-closest-approach
 * refinement on SGP4 trajectories. States stay in TEME; miss vectors and covariances are
 * rotation-invariant, so no frame conversion is needed.
 * @module @astro-one/tool-space-awareness/screening
 */

import { dot, findCloseApproaches, norm, propagateSgp4, sub } from '@astro-one/astrodynamics'
import type { CloseApproach, Sgp4Elements, Sgp4MeanElements, StateVector, TimedState, UtcMs } from '@astro-one/astrodynamics'
import type { CatalogObject } from './catalog.ts'

/** Screening window and thresholds. */
export interface ScreeningOptions {
  /** Window start. */
  readonly start: UtcMs
  /** Window end. */
  readonly end: UtcMs
  /** Grid step, ms. */
  readonly stepMs: number
  /** Report approaches closer than this, km. */
  readonly screenKm: number
  /** Margin added to the apogee/perigee filter for SGP4 short-period motion, km. */
  readonly padKm: number
}

/** One close approach with the states that define its RTN frame. */
export interface CatalogApproach {
  /** Secondary object. */
  readonly object: CatalogObject
  /** Approach geometry. */
  readonly approach: CloseApproach
  /** Primary TEME state at TCA. */
  readonly primary: StateVector
  /** Secondary TEME state at TCA. */
  readonly secondary: StateVector
}

/** A secondary that SGP4 could not propagate over the window. */
export interface PropagationFailure {
  /** Secondary object. */
  readonly object: CatalogObject
  /** SGP4 failure message. */
  readonly reason: string
}

/** Screening outcome. */
export interface ScreeningResult {
  /** Secondaries that passed the apogee/perigee filter. */
  readonly candidates: number
  /** Secondaries SGP4 could not propagate. */
  readonly failures: PropagationFailure[]
  /** Close approaches in time order per secondary, secondaries in catalog order. */
  readonly approaches: CatalogApproach[]
}

/**
 * Hoots, Crawford, and Roehrich apogee/perigee filter: two orbits whose radial bands are
 * separated by more than the threshold cannot approach within it.
 * @param a - first object's mean elements.
 * @param b - second object's mean elements.
 * @param thresholdKm - screening distance plus pad, km.
 * @returns whether the pair needs a time search.
 */
export function radialBandsOverlap(a: Sgp4MeanElements, b: Sgp4MeanElements, thresholdKm: number): boolean {
  const perigee = Math.max(a.a * (1 - a.e), b.a * (1 - b.e))
  const apogee = Math.min(a.a * (1 + a.e), b.a * (1 + b.e))
  return perigee - apogee <= thresholdKm
}

/**
 * Number of instants {@link sampleTimes} returns, so a budget check can run before the grid exists.
 * @param start - window start.
 * @param end - window end.
 * @param stepMs - step.
 * @returns the sample count.
 */
export function sampleCount(start: UtcMs, end: UtcMs, stepMs: number): number {
  return Math.ceil((end - start) / stepMs) + 1
}

/**
 * Uniform sample instants covering a window, end included.
 * @param start - window start.
 * @param end - window end.
 * @param stepMs - step.
 * @returns instants.
 */
export function sampleTimes(start: UtcMs, end: UtcMs, stepMs: number): UtcMs[] {
  return Array.from({ length: sampleCount(start, end, stepMs) }, (_, k) => Math.min(end, start + k * stepMs))
}

/**
 * Secondaries that pass the apogee/perigee filter.
 * @param primary - primary element set.
 * @param objects - catalog objects.
 * @param options - screening thresholds.
 * @returns the candidates, excluding objects with the primary's catalog number.
 */
export function screeningCandidates(primary: CatalogObject, objects: readonly CatalogObject[], options: ScreeningOptions): CatalogObject[] {
  const threshold = options.screenKm + options.padKm
  return objects.filter(o => o.catalogNumber !== primary.catalogNumber && radialBandsOverlap(primary.mean, o.mean, threshold))
}

/**
 * Screen one primary against candidate secondaries.
 * @param primary - primary element set.
 * @param candidates - secondaries that passed {@link screeningCandidates}.
 * @param options - window and thresholds.
 * @returns approaches and propagation failures.
 * @throws When the primary cannot be propagated over the window.
 */
export function screenCatalog(primary: Sgp4Elements, candidates: readonly CatalogObject[], options: ScreeningOptions): ScreeningResult {
  const times = sampleTimes(options.start, options.end, options.stepMs)
  const primaryStates = propagateSgp4(primary, times)
  const primaryAt = (t: UtcMs): StateVector => propagateSgp4(primary, [t])[0] as TimedState
  const result: ScreeningResult = { candidates: candidates.length, failures: [], approaches: [] }
  for (const object of candidates) {
    let states: TimedState[]
    try {
      states = propagateSgp4(object.elements, times)
    } catch (error) {
      result.failures.push({ object, reason: (error as Error).message })
      continue
    }
    const secondaryAt = (t: UtcMs): StateVector => propagateSgp4(object.elements, [t])[0] as TimedState
    const relative = times.map((_, k) => {
      const p = primaryStates[k] as TimedState
      const s = states[k] as TimedState
      return { r: sub(s.r, p.r), v: sub(s.v, p.v) }
    })
    for (let k = 0; k + 1 < times.length; k++) {
      const a = relative[k] as StateVector
      const b = relative[k + 1] as StateVector
      if (!(dot(a.r, a.v) < 0 && dot(b.r, b.v) >= 0)) continue
      // Linear relative motion bounds the separation inside the step; 10% covers curvature.
      const travel = 1.1 * Math.max(norm(a.v), norm(b.v)) * (((times[k + 1] as number) - (times[k] as number)) / 1000)
      if (Math.max(norm(a.r), norm(b.r)) - travel > options.screenKm) continue
      const [from, to] = [times[k] as number, times[k + 1] as number]
      const found = findCloseApproaches(primaryAt, secondaryAt, from, to, options.stepMs, options.screenKm)
      for (const approach of found) {
        result.approaches.push({ object, approach, primary: primaryAt(approach.tca), secondary: secondaryAt(approach.tca) })
      }
    }
  }
  return result
}
