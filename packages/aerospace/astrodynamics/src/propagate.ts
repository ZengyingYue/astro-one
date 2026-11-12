/**
 * Orbit propagation drivers: special-perturbation numerical propagation of a GCRF state with
 * a {@link ForceModel}, and two-body propagation, both evaluated at arbitrary output instants
 * before or after the epoch.
 * @module @astro-one/astrodynamics/propagate
 */

import { buildAcceleration } from './forces.ts'
import type { ForceModel } from './forces.ts'
import { earthOrientation, gcrfToTod } from './frames.ts'
import { integrate } from './integrator.ts'
import type { IntegratorSettings } from './integrator.ts'
import { propagateKepler } from './kepler.ts'
import type { StateVector, TimedState, UtcMs, Vec3 } from './types.ts'

/**
 * Evaluate a propagator at output instants on either side of the epoch.
 * @param epoch - epoch of the initial state.
 * @param times - requested UTC instants, any order.
 * @param run - propagates to monotonic offsets (s) in one direction.
 * @returns states in the order of `times`.
 */
function bothDirections(epoch: UtcMs, times: readonly UtcMs[], run: (offsets: number[]) => StateVector[]): TimedState[] {
  const indexed = times.map((t, index) => ({ t, index, dt: (t - epoch) / 1000 }))
  const forward = indexed.filter(item => item.dt >= 0).sort((a, b) => a.dt - b.dt)
  const backward = indexed.filter(item => item.dt < 0).sort((a, b) => b.dt - a.dt)
  const out = new Array<TimedState>(times.length)
  for (const group of [forward, backward]) {
    if (group.length === 0) continue
    const states = run(group.map(item => item.dt))
    group.forEach((item, i) => {
      const state = states[i] as StateVector
      out[item.index] = { t: item.t, r: state.r, v: state.v }
    })
  }
  return out
}

/**
 * Three consecutive components of a flat state array.
 * @param y - flat state.
 * @param offset - index of the first component.
 * @returns the vector.
 */
export function vec3At(y: readonly number[], offset: number): Vec3 {
  return [y[offset] as number, y[offset + 1] as number, y[offset + 2] as number]
}

/**
 * Numerically propagate a GCRF state.
 * @param initial - GCRF state at its epoch.
 * @param times - output instants.
 * @param model - perturbations to include.
 * @param settings - integrator tolerances and budget.
 * @returns GCRF states at `times`, in request order.
 */
export function propagateNumerical(
  initial: TimedState, times: readonly UtcMs[], model: ForceModel, settings: IntegratorSettings,
): TimedState[] {
  // The pole moves ~0.01″/day, so one orientation at the span midpoint serves the whole arc.
  const mid = times.length === 0 ? initial.t : (Math.min(...times) + Math.max(...times)) / 2
  const toPole = gcrfToTod(earthOrientation(mid))
  const accel = buildAcceleration(model, toPole)
  const derivative = (t: number, y: readonly number[]): number[] => {
    const r = vec3At(y, 0)
    const v = vec3At(y, 3)
    const a = accel(initial.t + t * 1000, r, v)
    return [v[0], v[1], v[2], a[0], a[1], a[2]]
  }
  return bothDirections(initial.t, times, offsets => integrate(derivative, 0, [...initial.r, ...initial.v], offsets, settings)
    .map(y => ({ r: vec3At(y, 0), v: vec3At(y, 3) })))
}

/**
 * Two-body propagation to output instants.
 * @param initial - inertial state at its epoch.
 * @param times - output instants.
 * @param mu - gravitational parameter, km³/s².
 * @returns states at `times`, in request order.
 */
export function propagateTwoBody(initial: TimedState, times: readonly UtcMs[], mu?: number): TimedState[] {
  return bothDirections(initial.t, times, offsets => offsets.map(dt => propagateKepler(initial, dt, mu)))
}
