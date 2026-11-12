/**
 * SGP4 element-set fitting by differential correction (Vallado and Crawford, *SGP4 Orbit
 * Determination*, AIAA 2008-6770): Levenberg–Marquardt on equinoctial mean elements, which stay
 * regular for circular and equatorial orbits, against TEME positions, with finite-difference
 * partial derivatives through SGP4 itself.
 * @module @astro-one/tool-space-awareness/tle-fit
 */

import {
  cholSolve, DEG, MU_EARTH, norm, ommFromRecord, parseOmm, propagateSgp4, stateToElements, sub, TWO_PI,
} from '@astro-one/astrodynamics'
import type { Matrix, Sgp4Elements, StateVector, UtcMs, Vec3 } from '@astro-one/astrodynamics'

/** Equinoctial mean elements plus the drag term. */
export interface EquinoctialSet {
  /** Kozai mean motion, rev/day. */
  readonly n: number
  /** e·cos(ω + Ω). */
  readonly af: number
  /** e·sin(ω + Ω). */
  readonly ag: number
  /** tan(i/2)·sin Ω. */
  readonly chi: number
  /** tan(i/2)·cos Ω. */
  readonly psi: number
  /** Mean longitude M + ω + Ω, rad. */
  readonly lambda: number
  /** B*, 1/Earth radii. */
  readonly bstar: number
}

/** Classical TLE angles and values, degrees. */
export interface ClassicalSet {
  /** Kozai mean motion, rev/day. */
  readonly meanMotion: number
  /** Eccentricity. */
  readonly eccentricity: number
  /** Inclination, deg. */
  readonly inclinationDeg: number
  /** Right ascension of the ascending node, deg. */
  readonly raanDeg: number
  /** Argument of perigee, deg. */
  readonly argpDeg: number
  /** Mean anomaly, deg. */
  readonly meanAnomalyDeg: number
  /** B*, 1/Earth radii. */
  readonly bstar: number
}

function degrees(rad: number): number {
  return ((((rad / DEG) % 360) + 360) % 360)
}

/**
 * Classical angles of an equinoctial set.
 * @param q - equinoctial set.
 * @returns TLE-style elements.
 */
export function classicalOf(q: EquinoctialSet): ClassicalSet {
  const lonPerigee = Math.atan2(q.ag, q.af)
  const raan = Math.atan2(q.chi, q.psi)
  return {
    meanMotion: q.n,
    eccentricity: Math.hypot(q.af, q.ag),
    inclinationDeg: (2 * Math.atan(Math.hypot(q.chi, q.psi))) / DEG,
    raanDeg: degrees(raan),
    argpDeg: degrees(lonPerigee - raan),
    meanAnomalyDeg: degrees(q.lambda - lonPerigee),
    bstar: q.bstar,
  }
}

/**
 * Equinoctial initial guess from an osculating TEME state, treated as mean elements.
 * @param state - TEME state at the fit epoch.
 * @param bstar - initial drag term.
 * @returns the equinoctial set.
 */
export function equinoctialFromState(state: StateVector, bstar: number): EquinoctialSet {
  const el = stateToElements(state)
  if (!(el.e < 1)) throw new Error('the epoch state is not on an elliptic orbit')
  const lonPerigee = el.raan + el.argp
  const t = Math.tan(el.i / 2)
  return {
    n: (Math.sqrt(MU_EARTH / el.a ** 3) * 86400) / TWO_PI,
    af: el.e * Math.cos(lonPerigee),
    ag: el.e * Math.sin(lonPerigee),
    chi: t * Math.sin(el.raan),
    psi: t * Math.cos(el.raan),
    lambda: lonPerigee + el.m,
    bstar,
  }
}

/** Identification fields of a fitted set. */
export interface FitIdentity {
  /** Object name. */
  readonly name: string
  /** Catalog number. */
  readonly catalogNumber: number
  /** International designator in OMM form, for example 1998-067A. */
  readonly objectId: string
  /** Fit epoch. */
  readonly epoch: UtcMs
}

/**
 * CCSDS OMM keywords of an equinoctial set.
 * @param q - equinoctial set.
 * @param id - identification fields.
 * @returns the OMM record.
 */
export function ommRecord(q: EquinoctialSet, id: FitIdentity): Record<string, string | number> {
  const c = classicalOf(q)
  return {
    OBJECT_NAME: id.name,
    OBJECT_ID: id.objectId,
    EPOCH: new Date(id.epoch).toISOString().replace('Z', ''),
    MEAN_MOTION: c.meanMotion,
    ECCENTRICITY: c.eccentricity,
    INCLINATION: c.inclinationDeg,
    RA_OF_ASC_NODE: c.raanDeg,
    ARG_OF_PERICENTER: c.argpDeg,
    MEAN_ANOMALY: c.meanAnomalyDeg,
    NORAD_CAT_ID: id.catalogNumber,
    BSTAR: c.bstar,
    MEAN_MOTION_DOT: 0,
    MEAN_MOTION_DDOT: 0,
  }
}

/** One fitted position. */
export interface PositionSample {
  /** Instant. */
  readonly t: UtcMs
  /** TEME position, km. */
  readonly r: Vec3
}

/**
 * Position residual vector of an element set.
 * @param elements - element set.
 * @param samples - target positions.
 * @returns concatenated x, y, z residuals, km.
 * @throws When SGP4 fails at a sample time.
 */
export function positionResiduals(elements: Sgp4Elements, samples: readonly PositionSample[]): number[] {
  return propagateSgp4(elements, samples.map(s => s.t)).flatMap((state, k) => [...sub(state.r, (samples[k] as PositionSample).r)])
}

/** Fit controls. */
export interface FitOptions {
  /** Whether B* is estimated; otherwise it stays at its initial value. */
  readonly fitBstar: boolean
  /** Largest number of Levenberg–Marquardt iterations. */
  readonly maxIterations: number
}

/** Fit outcome. */
export interface FitResult {
  /** Fitted equinoctial set. */
  readonly set: EquinoctialSet
  /** RMS position residual of the fitted set, km. */
  readonly rms: number
  /** Iterations used. */
  readonly iterations: number
  /** Whether the relative cost change fell below 1e-10 before the iteration limit. */
  readonly converged: boolean
}

const KEYS = ['n', 'af', 'ag', 'chi', 'psi', 'lambda', 'bstar'] as const
/** Finite-difference steps per parameter, chosen near the square root of double precision in each parameter's scale. */
const STEPS: Readonly<Record<typeof KEYS[number], number>> = {
  n: 1e-8, af: 1e-7, ag: 1e-7, chi: 1e-7, psi: 1e-7, lambda: 1e-7, bstar: 1e-7,
}

/**
 * Fit an element set to TEME positions.
 * @param initial - initial equinoctial set.
 * @param samples - target positions.
 * @param build - turns an equinoctial set into SGP4 elements.
 * @param options - fit controls.
 * @returns the fitted set and its residual statistics.
 */
export function fitElementSet(
  initial: EquinoctialSet, samples: readonly PositionSample[], build: (q: EquinoctialSet) => Sgp4Elements, options: FitOptions,
): FitResult {
  const keys = options.fitBstar ? KEYS : KEYS.slice(0, 6)
  const cost = (q: EquinoctialSet): { r: number[]; c: number } => {
    try {
      const r = positionResiduals(build(q), samples)
      return { r, c: r.reduce((s, x) => s + x * x, 0) }
    } catch (invalid) {
      // A trial set that SGP4 rejects or that decays is a rejected Levenberg–Marquardt step.
      void invalid
      return { r: [], c: Infinity }
    }
  }
  let q = initial
  let current = cost(q)
  if (!Number.isFinite(current.c)) throw new Error('SGP4 rejects the initial element set; check the ephemeris')
  let lambda = 1e-3
  let iterations = 0
  let converged = false
  while (iterations < options.maxIterations && !converged) {
    iterations += 1
    const jacobian = keys.map(key => positionResiduals(build({ ...q, [key]: q[key] + STEPS[key] }), samples)
      .map((x, i) => (x - (current.r[i] as number)) / STEPS[key]))
    const normal: Matrix = keys.map((_, a) => keys.map((__, b) => dotRows(jacobian[a] as number[], jacobian[b] as number[])))
    const gradient = keys.map((_, a) => -dotRows(jacobian[a] as number[], current.r))
    let accepted = false
    for (let attempt = 0; attempt < 12 && !accepted; attempt++) {
      const damped = normal.map((row, a) => row.map((x, b) => (a === b ? x * (1 + lambda) + 1e-30 : x)))
      const delta = cholSolve(damped, gradient)
      const trial: EquinoctialSet = { ...q, ...Object.fromEntries(keys.map((key, a) => [key, q[key] + (delta[a] as number)])) }
      const next = cost(trial)
      if (next.c < current.c) {
        converged = (current.c - next.c) <= 1e-10 * current.c
        q = trial
        current = next
        lambda = Math.max(lambda / 10, 1e-12)
        accepted = true
      } else {
        lambda *= 10
      }
    }
    // No damped step lowers the cost: the fit sits at a minimum.
    if (!accepted) converged = true
  }
  return { set: q, rms: Math.sqrt(current.c / current.r.length), iterations, converged }
}

function dotRows(a: readonly number[], b: readonly number[]): number {
  return a.reduce((s, x, i) => s + x * (b[i] as number), 0)
}

/**
 * Position RMS and maximum of an element set against samples.
 * @param elements - element set.
 * @param samples - target positions.
 * @returns RMS and largest position error, km.
 */
export function positionErrors(elements: Sgp4Elements, samples: readonly PositionSample[]): { rms: number; max: number } {
  const errors = propagateSgp4(elements, samples.map(s => s.t)).map((state, k) => norm(sub(state.r, (samples[k] as PositionSample).r)))
  return { rms: Math.sqrt(errors.reduce((s, x) => s + x * x, 0) / errors.length), max: Math.max(...errors) }
}

/**
 * SGP4 elements of an equinoctial set through its OMM keywords.
 * @param id - identification fields.
 * @returns the builder.
 */
export function ommBuilder(id: FitIdentity): (q: EquinoctialSet) => Sgp4Elements {
  return q => parseOmm(ommFromRecord(ommRecord(q, id)))
}
