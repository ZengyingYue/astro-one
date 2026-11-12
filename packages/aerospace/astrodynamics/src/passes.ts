/**
 * Ground-station visibility: rise/set and culmination search over an Earth-fixed trajectory,
 * with satellite illumination and site darkness at culmination for optical tracking.
 * @module @astro-one/astrodynamics/passes
 */

import { sunPosition, sunlitFraction } from './ephemeris.ts'
import { gcrfToItrf, geodeticToItrf, lookAngles, enuMatrix } from './frames.ts'
import { apply3, norm, sub } from './linalg.ts'
import type { Geodetic, LookAngles, StateVector, UtcMs } from './types.ts'

/** GCRF state as a function of time. */
export type InertialTrajectory = (t: UtcMs) => StateVector

/** One visibility pass. */
export interface Pass {
  /** Rise above the elevation mask, or the window start when already visible. */
  readonly rise: UtcMs
  /** Set below the mask, or the window end when still visible. */
  readonly set: UtcMs
  /** Culmination time. */
  readonly culmination: UtcMs
  /** Look angles at rise, culmination, and set. */
  readonly riseAngles: LookAngles
  /** Look angles at culmination. */
  readonly culminationAngles: LookAngles
  /** Look angles at set. */
  readonly setAngles: LookAngles
  /** Whether the pass was already in progress at the window start. */
  readonly truncatedStart: boolean
  /** Whether the pass continues past the window end. */
  readonly truncatedEnd: boolean
  /** Sunlit fraction of the satellite at culmination (0 umbra … 1 full sun). */
  readonly sunlit: number
  /** Sun elevation at the site at culmination, rad. */
  readonly siteSunElevation: number
}

/**
 * Search visibility passes over a window.
 * @param trajectory - GCRF satellite trajectory.
 * @param site - ground station.
 * @param start - window start.
 * @param end - window end.
 * @param minElevation - elevation mask, rad.
 * @param stepMs - coarse sampling step; must be shorter than the shortest pass of interest.
 * @returns passes in time order.
 */
export function findPasses(
  trajectory: InertialTrajectory, site: Geodetic, start: UtcMs, end: UtcMs, minElevation: number, stepMs: number,
): Pass[] {
  const angles = (t: UtcMs): LookAngles => lookAngles(site, gcrfToItrf(trajectory(t), t))
  const above = (t: UtcMs): number => angles(t).el - minElevation
  const refine = (lo: UtcMs, hi: UtcMs, rising: boolean): UtcMs => {
    let a = lo
    let b = hi
    for (let i = 0; i < 60 && b - a > 1; i++) {
      const mid = (a + b) / 2
      if ((above(mid) >= 0) === rising) b = mid
      else a = mid
    }
    return (a + b) / 2
  }
  const passes: Pass[] = []
  let t = start
  let visible = above(t) >= 0
  let riseTime: UtcMs | undefined = visible ? start : undefined
  while (t < end) {
    const next = Math.min(end, t + stepMs)
    const nowVisible = above(next) >= 0
    if (!visible && nowVisible) riseTime = refine(t, next, true)
    if (visible && !nowVisible) passes.push(build(riseTime as UtcMs, refine(t, next, false), riseTime === start, false))
    visible = nowVisible
    t = next
  }
  if (visible) passes.push(build(riseTime as UtcMs, end, riseTime === start, true))
  return passes

  function build(rise: UtcMs, set: UtcMs, truncatedStart: boolean, truncatedEnd: boolean): Pass {
    // Golden-section search for maximum elevation between rise and set.
    const g = (Math.sqrt(5) - 1) / 2
    let a = rise
    let b = set
    let c = b - g * (b - a)
    let d = a + g * (b - a)
    for (let i = 0; i < 80 && b - a > 1; i++) {
      if (angles(c).el > angles(d).el) b = d
      else a = c
      c = b - g * (b - a)
      d = a + g * (b - a)
    }
    const culmination = (a + b) / 2
    const state = trajectory(culmination)
    const rSun = sunPosition(culmination)
    const sunFixed = gcrfToItrf({ r: rSun, v: [0, 0, 0] }, culmination).r
    const toSun = apply3(enuMatrix(site.lat, site.lon), sub(sunFixed, geodeticToItrf(site)))
    return {
      rise,
      set,
      culmination,
      riseAngles: angles(rise),
      culminationAngles: angles(culmination),
      setAngles: angles(set),
      truncatedStart,
      truncatedEnd,
      sunlit: sunlitFraction(state.r, rSun),
      siteSunElevation: Math.asin(toSun[2] / norm(toSun)),
    }
  }
}
