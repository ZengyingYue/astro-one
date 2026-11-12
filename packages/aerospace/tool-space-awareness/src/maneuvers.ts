/**
 * Maneuver detection from an element-set history: per-interval changes of SGP4 mean semi-major
 * axis and orbit plane, robust z-scores against the history's own scatter, and impulsive Δv
 * estimates from the Gauss variational equations for near-circular orbits.
 * @module @astro-one/tool-space-awareness/maneuvers
 */

import { apply3, MU_EARTH, norm, propagateSgp4, rtnMatrix, sub } from '@astro-one/astrodynamics'
import type { TimedState, UtcMs, Vec3 } from '@astro-one/astrodynamics'
import type { CatalogObject } from './catalog.ts'

/** Change between two consecutive element sets. */
export interface IntervalChange {
  /** Epoch of the earlier set. */
  readonly from: UtcMs
  /** Epoch of the later set. */
  readonly to: UtcMs
  /** Mean semi-major axis change, km. */
  readonly deltaA: number
  /** Mean eccentricity change. */
  readonly deltaE: number
  /** Angle between the later orbit normal and the earlier normal advanced by its secular node rate, rad. */
  readonly planeChange: number
  /** Earlier set propagated to the later epoch minus the later set, in the later set's RTN frame, km. */
  readonly positionRtn: Vec3
  /** Mean semi-major axis of the later set, km. */
  readonly a: number
}

/**
 * Changes between consecutive element sets.
 * @param sets - element sets of one object in epoch order, epochs distinct.
 * @returns one change per consecutive pair.
 */
export function intervalChanges(sets: readonly CatalogObject[]): IntervalChange[] {
  return sets.slice(1).map((later, k) => {
    const earlier = sets[k] as CatalogObject
    const dt = (later.elements.epoch - earlier.elements.epoch) / 1000
    const predicted = propagateSgp4(earlier.elements, [later.elements.epoch])[0] as TimedState
    const actual = propagateSgp4(later.elements, [later.elements.epoch])[0] as TimedState
    const before = normal(earlier.mean.i, earlier.mean.raan + earlier.mean.raanRate * dt)
    const after = normal(later.mean.i, later.mean.raan)
    const cos = Math.min(1, Math.max(-1, before[0] * after[0] + before[1] * after[1] + before[2] * after[2]))
    return {
      from: earlier.elements.epoch,
      to: later.elements.epoch,
      deltaA: later.mean.a - earlier.mean.a,
      deltaE: later.mean.e - earlier.mean.e,
      planeChange: Math.acos(cos),
      positionRtn: apply3(rtnMatrix(actual), sub(predicted.r, actual.r)),
      a: later.mean.a,
    }
  })
}

function normal(i: number, raan: number): Vec3 {
  return [Math.sin(i) * Math.sin(raan), -Math.sin(i) * Math.cos(raan), Math.cos(i)]
}

/** Median and MAD-based standard deviation of a sample. */
export interface RobustSpread {
  /** Sample median. */
  readonly median: number
  /** 1.4826 × median absolute deviation (the normal-consistent sigma). */
  readonly sigma: number
}

/**
 * Median and MAD sigma.
 * @param values - non-empty sample.
 * @returns the robust centre and spread.
 */
export function robustSpread(values: readonly number[]): RobustSpread {
  const median = medianOf(values)
  return { median, sigma: 1.4826 * medianOf(values.map(v => Math.abs(v - median))) }
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid] as number : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

/** Smallest position-residual spread used for z-scores, km; SGP4 element sets carry metre-level noise at best. */
export const POSITION_NOISE_FLOOR_KM = 0.001

/** Detection thresholds. */
export interface DetectionOptions {
  /** Robust z-score above which a change is flagged. */
  readonly zThreshold: number
  /** Semi-major axis deviation flagged even in a noiseless history, km; floors the spread at minDeltaAKm / zThreshold. */
  readonly minDeltaAKm: number
  /** Plane-change deviation flagged even in a noiseless history, rad; floors the spread at minPlaneChange / zThreshold. */
  readonly minPlaneChange: number
}

/** One detected maneuver. */
export interface ManeuverEvent {
  /** Interval holding the maneuver. */
  readonly interval: IntervalChange
  /** Semi-major axis change after removing the history's typical decay rate, km. */
  readonly deltaAResidual: number
  /** Robust z-score of the semi-major axis residual. */
  readonly zA: number
  /** Robust z-score of the plane change. */
  readonly zPlane: number
  /** Robust z-score of the position residual magnitude. */
  readonly zPosition: number
  /** Tangential Δv that changes the mean semi-major axis by the residual, km/s. */
  readonly dvInPlane: number
  /** Normal Δv that rotates the orbit plane by the plane change, km/s. */
  readonly dvOutOfPlane: number
  /** Which components exceeded their thresholds. */
  readonly kind: 'in-plane' | 'out-of-plane' | 'combined'
}

/** Detection result. */
export interface DetectionResult {
  /** Per-interval changes in epoch order. */
  readonly intervals: IntervalChange[]
  /** Median semi-major axis rate of the history, km/day. */
  readonly decayRateKmPerDay: number
  /** Robust spread of the decay-corrected semi-major axis changes, km, before flooring. */
  readonly deltaASpread: RobustSpread
  /** Robust spread of the plane changes, rad, before flooring. */
  readonly planeSpread: RobustSpread
  /** Flagged intervals in epoch order. */
  readonly events: ManeuverEvent[]
}

/**
 * Flag intervals whose element changes stand out from the history.
 * @param sets - element sets of one object in epoch order, epochs distinct, at least five.
 * @param options - thresholds.
 * @returns per-interval changes, history statistics, and flagged maneuvers.
 */
export function detectManeuvers(sets: readonly CatalogObject[], options: DetectionOptions): DetectionResult {
  const intervals = intervalChanges(sets)
  const days = intervals.map(c => (c.to - c.from) / 86_400_000)
  const decayRate = medianOf(intervals.map((c, k) => c.deltaA / (days[k] as number)))
  const residualA = intervals.map((c, k) => c.deltaA - decayRate * (days[k] as number))
  const aSpread = robustSpread(residualA)
  const planeSpread = robustSpread(intervals.map(c => c.planeChange))
  const positionSpread = robustSpread(intervals.map(c => norm(c.positionRtn)))
  const z = (x: number, s: RobustSpread, floor: number): number => (x - s.median) / Math.max(s.sigma, floor)
  const events: ManeuverEvent[] = []
  intervals.forEach((interval, k) => {
    const deltaAResidual = residualA[k] as number
    const zA = z(deltaAResidual, aSpread, options.minDeltaAKm / options.zThreshold)
    const zPlane = z(interval.planeChange, planeSpread, options.minPlaneChange / options.zThreshold)
    const inPlane = Math.abs(zA) > options.zThreshold
    const outOfPlane = zPlane > options.zThreshold
    if (!inPlane && !outOfPlane) return
    const v = Math.sqrt(MU_EARTH / interval.a)
    events.push({
      interval,
      deltaAResidual,
      zA,
      zPlane,
      zPosition: z(norm(interval.positionRtn), positionSpread, POSITION_NOISE_FLOOR_KM),
      dvInPlane: inPlane ? (v * Math.abs(deltaAResidual)) / (2 * interval.a) : 0,
      dvOutOfPlane: outOfPlane ? 2 * v * Math.sin(interval.planeChange / 2) : 0,
      kind: inPlane && outOfPlane ? 'combined' : inPlane ? 'in-plane' : 'out-of-plane',
    })
  })
  return { intervals, decayRateKmPerDay: decayRate, deltaASpread: aSpread, planeSpread, events }
}
