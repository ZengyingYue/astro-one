/**
 * Propagation dispatch for the tools: SGP4, numerical, or two-body evaluation of a parsed
 * source in GCRF, plus continuous trajectories for event searches (numerical arcs are sampled
 * once and interpolated with cubic Hermite polynomials on position and velocity).
 * @module @astro-one/tool-astrodynamics/trajectory
 */

import {
  add, propagateKepler, propagateNumerical, propagateSgp4, propagateTwoBody, scale, temeToGcrf,
} from '@astro-one/astrodynamics'
import type { ForceModel, IntegratorSettings, StateVector, TimedState, UtcMs } from '@astro-one/astrodynamics'
import type { ParsedSource } from './inputs.ts'

/** Propagation method named by the model. */
export type Method = 'sgp4' | 'numerical' | 'two-body'

/** Everything a propagation needs besides the source. */
export interface PropagationContext {
  readonly method: Method
  readonly forces: ForceModel
  readonly integrator: IntegratorSettings
}

function sgp4Gcrf(source: Extract<ParsedSource, { kind: 'sgp4' }>, times: readonly UtcMs[]): TimedState[] {
  return propagateSgp4(source.elements, times).map(s => ({ t: s.t, ...temeToGcrf(s, s.t) }))
}

/**
 * Initial GCRF state of a source; SGP4 element sets are evaluated at their epoch.
 * @param source - parsed source.
 * @returns GCRF state at the source epoch.
 */
export function initialState(source: ParsedSource): TimedState {
  return source.kind === 'state' ? source.state : sgp4Gcrf(source, [source.elements.epoch])[0] as TimedState
}

/**
 * Propagate a source to output instants.
 * @param source - parsed source.
 * @param times - output instants.
 * @param context - method, forces, and integrator settings.
 * @returns GCRF states in request order.
 */
export function propagateSource(source: ParsedSource, times: readonly UtcMs[], context: PropagationContext): TimedState[] {
  if (context.method === 'sgp4') {
    if (source.kind !== 'sgp4') throw new Error('method=sgp4 needs a tle or omm source')
    return sgp4Gcrf(source, times)
  }
  const initial = initialState(source)
  return context.method === 'two-body'
    ? propagateTwoBody(initial, times)
    : propagateNumerical(initial, times, context.forces, context.integrator)
}

/**
 * Continuous GCRF trajectory over a window.
 * @param source - parsed source.
 * @param context - method, forces, and integrator settings.
 * @param start - window start.
 * @param end - window end.
 * @param stepMs - sampling step for numerical arcs.
 * @param maxSamples - sample budget for numerical arcs.
 * @returns state function valid on [start, end].
 */
export function trajectory(
  source: ParsedSource, context: PropagationContext, start: UtcMs, end: UtcMs, stepMs: number, maxSamples: number,
): (t: UtcMs) => StateVector {
  if (context.method === 'sgp4') {
    if (source.kind !== 'sgp4') throw new Error('method=sgp4 needs a tle or omm source')
    return t => sgp4Gcrf(source, [t])[0] as TimedState
  }
  const initial = initialState(source)
  if (context.method === 'two-body') return t => propagateKepler(initial, (t - initial.t) / 1000)
  const count = Math.ceil((end - start) / stepMs) + 3
  if (count > maxSamples) throw new Error(`numerical propagation over this window needs ${String(count)} samples; at most ${String(maxSamples)} are allowed (increase step_s or shorten the window)`)
  const grid = Array.from({ length: count }, (_, i) => start - stepMs + i * stepMs)
  const states = propagateNumerical(initial, grid, context.forces, context.integrator)
  return t => hermite(states, grid[0] as number, stepMs, t)
}

/**
 * Cubic Hermite interpolation on a uniform grid of states.
 * @param states - samples.
 * @param t0 - first sample time.
 * @param stepMs - grid spacing.
 * @param t - evaluation time inside the grid.
 * @returns interpolated state.
 */
export function hermite(states: readonly StateVector[], t0: UtcMs, stepMs: number, t: UtcMs): StateVector {
  const k = Math.min(states.length - 2, Math.max(0, Math.floor((t - t0) / stepMs)))
  const a = states[k] as StateVector
  const b = states[k + 1] as StateVector
  const h = stepMs / 1000
  const s = (t - (t0 + k * stepMs)) / stepMs
  const s2 = s * s
  const s3 = s2 * s
  const r = add(
    add(scale(a.r, 2 * s3 - 3 * s2 + 1), scale(a.v, h * (s3 - 2 * s2 + s))),
    add(scale(b.r, -2 * s3 + 3 * s2), scale(b.v, h * (s3 - s2))),
  )
  const v = scale(add(
    add(scale(a.r, 6 * s2 - 6 * s), scale(a.v, h * (3 * s2 - 4 * s + 1))),
    add(scale(b.r, -6 * s2 + 6 * s), scale(b.v, h * (3 * s2 - 2 * s))),
  ), 1 / h)
  return { r, v }
}
