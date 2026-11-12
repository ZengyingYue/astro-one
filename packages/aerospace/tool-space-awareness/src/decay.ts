/**
 * Orbital lifetime under atmospheric drag: orbit-averaged Gauss equations for semi-major axis and
 * eccentricity (King-Hele, Satellite Orbits in an Atmosphere, 1987) over the exponential
 * atmosphere of `@astro-one/astrodynamics`, with a co-rotating atmosphere, integrated by
 * fourth-order Runge–Kutta with steps that bound the perigee-height change.
 * @module @astro-one/tool-space-awareness/decay
 */

import { atmosphericDensity, MU_EARTH, OMEGA_EARTH, R_EARTH } from '@astro-one/astrodynamics'
import type { UtcMs } from '@astro-one/astrodynamics'

/** Points of the eccentric-anomaly quadrature; the trapezoid rule is spectrally accurate for periodic integrands. */
export const QUADRATURE_POINTS = 64

/**
 * Ballistic coefficient Cd·A/m from the SGP4 drag term (Vallado, Fundamentals of Astrodynamics,
 * eq. 9-46: BC = 1 / (12.741621 B*)).
 * @param bstar - B*, 1/Earth radii.
 * @returns Cd·A/m, m²/kg.
 */
export function ballisticFromBstar(bstar: number): number {
  return 12.741621 * bstar
}

/** Decaying orbit state. */
export interface DecayState {
  /** Semi-major axis, km. */
  readonly a: number
  /** Eccentricity. */
  readonly e: number
}

/** Fixed parameters of one decay run. */
export interface DecayParameters {
  /** Inclination, rad (sets the atmosphere co-rotation factor). */
  readonly inclination: number
  /** Cd·A/m, m²/kg. */
  readonly ballistic: number
  /** Multiplier on the model density. */
  readonly densityScale: number
}

/**
 * Orbit-averaged drag rates.
 * @param state - current orbit.
 * @param p - drag parameters.
 * @returns da/dt (km/s) and de/dt (1/s).
 */
export function decayRates(state: DecayState, p: DecayParameters): { da: number; de: number } {
  const { a, e } = state
  let da = 0
  let de = 0
  for (let k = 0; k < QUADRATURE_POINTS; k++) {
    const E = (2 * Math.PI * k) / QUADRATURE_POINTS
    const cosE = Math.cos(E)
    const r = a * (1 - e * cosE)
    const v = Math.sqrt(MU_EARTH * (2 / r - 1 / a))
    const cosNu = (cosE - e) / (1 - e * cosE)
    const corotation = (1 - ((r * OMEGA_EARTH) / v) * Math.cos(p.inclination)) ** 2
    // ½ Cd·A/m · ρ · v², with ρ in kg/m³ and v in km/s, is 1000 km/s² per unit; dM = (1 − e cos E) dE.
    const drag = -0.5 * p.ballistic * p.densityScale * atmosphericDensity(r - R_EARTH) * v * v * corotation * 1000
    const weight = (1 - e * cosE) / QUADRATURE_POINTS
    da += weight * ((2 * a * a * v) / MU_EARTH) * drag
    de += weight * ((2 * (e + cosNu)) / v) * drag
  }
  return { da, de }
}

/** Stopping and step settings. */
export interface DecaySettings {
  /** Perigee height at which the orbit counts as re-entered, km. */
  readonly reentryAltitudeKm: number
  /** Longest simulated span, s. */
  readonly maxSeconds: number
  /** Largest perigee-height change per step, km. */
  readonly maxPerigeeChangeKm: number
  /** Longest step, s. */
  readonly maxStepS: number
  /** Largest number of steps. */
  readonly maxSteps: number
}

/** One history sample. */
export interface DecaySample {
  /** Instant. */
  readonly t: UtcMs
  /** Orbit at the instant. */
  readonly state: DecayState
}

/** Decay run outcome. */
export interface DecayResult {
  /** Re-entry instant, or undefined when the orbit survives the simulated span. */
  readonly reentry?: UtcMs
  /** Samples at every step, starting with the initial orbit. */
  readonly history: DecaySample[]
}

function perigeeHeight(s: DecayState): number {
  return s.a * (1 - s.e) - R_EARTH
}

function advance(s: DecayState, rate: { da: number; de: number }, h: number): DecayState {
  return { a: s.a + rate.da * h, e: Math.max(0, s.e + rate.de * h) }
}

/**
 * Integrate the averaged decay until re-entry or the span ends.
 * @param epoch - initial instant.
 * @param initial - initial orbit.
 * @param p - drag parameters.
 * @param settings - stopping and step settings.
 * @returns the re-entry instant and the history.
 * @throws When the step budget runs out first.
 */
export function integrateDecay(epoch: UtcMs, initial: DecayState, p: DecayParameters, settings: DecaySettings): DecayResult {
  const history: DecaySample[] = [{ t: epoch, state: initial }]
  let state = initial
  let elapsed = 0
  for (let step = 0; step < settings.maxSteps; step++) {
    if (perigeeHeight(state) <= settings.reentryAltitudeKm) return { reentry: epoch + elapsed * 1000, history }
    if (elapsed >= settings.maxSeconds) return { history }
    const k1 = decayRates(state, p)
    const perigeeRate = Math.abs(k1.da * (1 - state.e) - state.a * k1.de)
    const limit = settings.maxPerigeeChangeKm / Math.max(perigeeRate, Number.MIN_VALUE)
    const h = Math.min(settings.maxStepS, settings.maxSeconds - elapsed, limit)
    const k2 = decayRates(advance(state, k1, h / 2), p)
    const k3 = decayRates(advance(state, k2, h / 2), p)
    const k4 = decayRates(advance(state, k3, h), p)
    state = advance(state, { da: (k1.da + 2 * k2.da + 2 * k3.da + k4.da) / 6, de: (k1.de + 2 * k2.de + 2 * k3.de + k4.de) / 6 }, h)
    elapsed += h
    history.push({ t: epoch + elapsed * 1000, state })
  }
  throw new Error(`the decay integration needs more than ${String(settings.maxSteps)} steps`)
}
