/**
 * Tracking measurement models for orbit determination: GCRF position, slant range, range
 * rate, topocentric right ascension/declination, and azimuth/elevation from WGS-84 sites.
 * @module @astro-one/astrodynamics/measurements
 */

import { apply3, dot, norm, sub, wrapPi } from './linalg.ts'
import { enuMatrix, gcrfToItrf, geodeticToItrf, siteGcrf } from './frames.ts'
import type { Geodetic, StateVector, UtcMs } from './types.ts'

/** A tracking observation. Angles are radians, distances km, rates km/s. */
export type Observation =
  | { readonly kind: 'position'; readonly t: UtcMs; readonly value: readonly [number, number, number]; readonly sigma: number }
  | { readonly kind: 'range'; readonly t: UtcMs; readonly site: Geodetic; readonly value: number; readonly sigma: number }
  | { readonly kind: 'range-rate'; readonly t: UtcMs; readonly site: Geodetic; readonly value: number; readonly sigma: number }
  | { readonly kind: 'radec'; readonly t: UtcMs; readonly site: Geodetic; readonly value: readonly [number, number]; readonly sigma: number }
  | { readonly kind: 'azel'; readonly t: UtcMs; readonly site: Geodetic; readonly value: readonly [number, number]; readonly sigma: number }

/**
 * Number of scalar components in an observation.
 * @param obs - observation.
 * @returns component count.
 */
export function observationSize(obs: Observation): number {
  switch (obs.kind) {
    case 'position': return 3
    case 'range':
    case 'range-rate': return 1
    case 'radec':
    case 'azel': return 2
  }
}

/**
 * Observed components as a flat list.
 * @param obs - observation.
 * @returns observed values.
 */
export function observedValues(obs: Observation): number[] {
  return typeof obs.value === 'number' ? [obs.value] : [...obs.value]
}

/**
 * Predicted measurement for a GCRF satellite state at the observation time.
 * @param obs - observation whose kind and site define the model.
 * @param state - GCRF satellite state at `obs.t`.
 * @returns predicted components, matching {@link observedValues}.
 */
export function predictObservation(obs: Observation, state: StateVector): number[] {
  switch (obs.kind) {
    case 'position': return [...state.r]
    case 'range': {
      const site = siteGcrf(obs.site, obs.t)
      return [norm(sub(state.r, site.r))]
    }
    case 'range-rate': {
      const site = siteGcrf(obs.site, obs.t)
      const rho = sub(state.r, site.r)
      return [dot(rho, sub(state.v, site.v)) / norm(rho)]
    }
    case 'radec': {
      const rho = sub(state.r, siteGcrf(obs.site, obs.t).r)
      return [Math.atan2(rho[1], rho[0]), Math.asin(rho[2] / norm(rho))]
    }
    case 'azel': {
      const fixed = gcrfToItrf(state, obs.t)
      const enu = apply3(enuMatrix(obs.site.lat, obs.site.lon), sub(fixed.r, geodeticToItrf(obs.site)))
      return [Math.atan2(enu[0], enu[1]), Math.asin(enu[2] / norm(enu))]
    }
  }
}

/**
 * Observed-minus-computed residuals, wrapping angular components.
 * @param obs - observation.
 * @param predicted - predicted components.
 * @returns residuals in observation units.
 */
export function residuals(obs: Observation, predicted: readonly number[]): number[] {
  const observed = observedValues(obs)
  return observed.map((value, i) => {
    const diff = value - (predicted[i] as number)
    // Right ascension and azimuth wrap; declination and elevation do not.
    return (obs.kind === 'radec' || obs.kind === 'azel') && i === 0 ? wrapPi(diff) : diff
  })
}
