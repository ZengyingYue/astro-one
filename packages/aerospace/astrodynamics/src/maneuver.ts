/**
 * Impulsive transfer budgets between circular orbits: Hohmann, bi-elliptic, and simple
 * inclination change.
 * @module @astro-one/astrodynamics/maneuver
 */

import { MU_EARTH } from './constants.ts'

/** Two- or three-impulse coplanar transfer. */
export interface TransferBudget {
  /** Impulse magnitudes in execution order, km/s. */
  readonly impulses: number[]
  /** Sum of impulse magnitudes, km/s. */
  readonly totalDeltaV: number
  /** Transfer duration, s. */
  readonly timeOfFlight: number
}

/**
 * Hohmann transfer between coplanar circular orbits.
 * @param r1 - initial radius, km.
 * @param r2 - final radius, km.
 * @param mu - gravitational parameter, km³/s².
 * @returns impulse budget.
 */
export function hohmann(r1: number, r2: number, mu = MU_EARTH): TransferBudget {
  const at = (r1 + r2) / 2
  const dv1 = Math.abs(Math.sqrt(mu / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1))
  const dv2 = Math.abs(Math.sqrt(mu / r2) * (1 - Math.sqrt((2 * r1) / (r1 + r2))))
  return { impulses: [dv1, dv2], totalDeltaV: dv1 + dv2, timeOfFlight: Math.PI * Math.sqrt((at * at * at) / mu) }
}

/**
 * Bi-elliptic transfer through an intermediate apoapsis.
 * @param r1 - initial radius, km.
 * @param r2 - final radius, km.
 * @param rb - intermediate apoapsis radius, km (at least max(r1, r2)).
 * @param mu - gravitational parameter, km³/s².
 * @returns impulse budget.
 */
export function biElliptic(r1: number, r2: number, rb: number, mu = MU_EARTH): TransferBudget {
  if (rb < Math.max(r1, r2)) throw new Error('bi-elliptic apoapsis must not be below the initial or final radius')
  const a1 = (r1 + rb) / 2
  const a2 = (r2 + rb) / 2
  const dv1 = Math.sqrt((2 * mu) / r1 - mu / a1) - Math.sqrt(mu / r1)
  const dv2 = Math.abs(Math.sqrt((2 * mu) / rb - mu / a2) - Math.sqrt((2 * mu) / rb - mu / a1))
  const dv3 = Math.abs(Math.sqrt((2 * mu) / r2 - mu / a2) - Math.sqrt(mu / r2))
  const tof = Math.PI * (Math.sqrt((a1 * a1 * a1) / mu) + Math.sqrt((a2 * a2 * a2) / mu))
  return { impulses: [dv1, dv2, dv3], totalDeltaV: dv1 + dv2 + dv3, timeOfFlight: tof }
}

/**
 * Impulse for a pure inclination change at constant speed.
 * @param speed - orbital speed at the node, km/s.
 * @param deltaInclination - inclination change, rad.
 * @returns impulse magnitude, km/s.
 */
export function planeChange(speed: number, deltaInclination: number): number {
  return 2 * speed * Math.sin(Math.abs(deltaInclination) / 2)
}
