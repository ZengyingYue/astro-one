/**
 * Single-point positioning: iterative weighted least squares on single-frequency code with
 * per-constellation receiver clocks, Klobuchar and Saastamoinen corrections, Earth-rotation
 * (Sagnac) correction, elevation weighting, χ² residual validation with RAIM fault detection
 * and exclusion, and dilution of precision.
 * @module @astro-one/tool-gnss/spp
 */

import { cholInverse, enuMatrix, itrfToGeodetic } from '@astro-one/astrodynamics'
import type { Geodetic, Matrix, Vec3 } from '@astro-one/astrodynamics'
import { C, ionoScale, klobuchar, saastamoinen, satelliteState, selectEphemeris } from './broadcast.ts'
import type { BroadcastEphemeris, GnssSystem, NavigationData, ObservationEpoch, SatelliteObservation } from './rinex.ts'

/** Code observation preferences per constellation (RINEX 3 codes; BeiDou B1I is C2I from 3.02, C1I in 3.01). */
export const CODE_PRIORITY: Record<GnssSystem, readonly string[]> = { G: ['C1C', 'C1W', 'C1X'], E: ['C1C', 'C1X'], C: ['C2I', 'C1I'] }

/** Phase observation matching {@link CODE_PRIORITY}. */
export const PHASE_PRIORITY: Record<GnssSystem, readonly string[]> = { G: ['L1C', 'L1W', 'L1X'], E: ['L1C', 'L1X'], C: ['L2I', 'L1I'] }

/** Positioning controls. */
export interface SppOptions {
  /** Constellations to use. */
  readonly systems: readonly GnssSystem[]
  /** Elevation mask, rad. */
  readonly elevationMask: number
  /** Zenith code standard deviation a in σ² = a² + a²/sin²(el), m. */
  readonly codeSigma: number
  /** Apply fault detection and exclusion when the χ² test fails. */
  readonly raim: boolean
}

/** Dilution of precision. */
export interface Dop {
  readonly gdop: number
  readonly pdop: number
  readonly hdop: number
  readonly vdop: number
}

/** One epoch solution. */
export interface SppSolution {
  /** Receiver time, GPS seconds. */
  readonly time: number
  /** ECEF position, m. */
  readonly position: Vec3
  /** Receiver clock bias per constellation, m. */
  readonly clocks: Partial<Record<GnssSystem, number>>
  /** Satellites used. */
  readonly used: string[]
  /** Satellites excluded by RAIM. */
  readonly excluded: string[]
  /** Post-fit code residuals of used satellites, m. */
  readonly residuals: Record<string, number>
  /** Dilution of precision. */
  readonly dop: Dop
  /** Whether the χ² residual test passed (true when there is no redundancy to test). */
  readonly valid: boolean
}

/** Satellite geometry for one receiver position. */
export interface SatelliteGeometry {
  readonly sat: string
  readonly system: GnssSystem
  /** ECEF position rotated to the reception epoch, m. */
  readonly position: Vec3
  /** Clock offset, s. */
  readonly clock: number
  /** Unit line of sight receiver → satellite. */
  readonly los: Vec3
  /** Geometric range, m. */
  readonly range: number
  readonly azimuth: number
  readonly elevation: number
}

/**
 * First available observation among a code priority list.
 * @param obs - satellite observations.
 * @param priority - codes in preference order.
 * @returns the value, or undefined.
 */
export function pick(obs: SatelliteObservation, priority: readonly string[]): { code: string; value: number } | undefined {
  for (const code of priority) {
    const value = obs.values[code]
    if (value !== undefined && value !== 0) return { code, value }
  }
  return undefined
}

/**
 * Satellite geometry for a receiver position and reception time.
 * @param eph - ephemeris.
 * @param receptionTime - receiver time, GPS seconds.
 * @param pseudorange - code pseudorange, m.
 * @param receiver - receiver ECEF, m.
 * @returns geometry after light-time and Sagnac correction.
 */
export function geometry(eph: BroadcastEphemeris, receptionTime: number, pseudorange: number, receiver: Vec3): SatelliteGeometry {
  let t = receptionTime - pseudorange / C
  const first = satelliteState(eph, t)
  t -= first.clock
  const state = satelliteState(eph, t)
  const raw = state.position
  const approx = Math.hypot(raw[0] - receiver[0], raw[1] - receiver[1], raw[2] - receiver[2])
  const w = 7.2921151467e-5 * (approx / C)
  const pos: Vec3 = [Math.cos(w) * raw[0] + Math.sin(w) * raw[1], -Math.sin(w) * raw[0] + Math.cos(w) * raw[1], raw[2]]
  const d: Vec3 = [pos[0] - receiver[0], pos[1] - receiver[1], pos[2] - receiver[2]]
  const range = Math.hypot(...d)
  const los: Vec3 = [d[0] / range, d[1] / range, d[2] / range]
  let azimuth = 0
  let elevation = Math.PI / 2
  if (Math.hypot(...receiver) > 1e6) {
    const g = itrfToGeodetic([receiver[0] / 1000, receiver[1] / 1000, receiver[2] / 1000])
    const m = enuMatrix(g.lat, g.lon)
    const e = m[0][0] * los[0] + m[0][1] * los[1] + m[0][2] * los[2]
    const n = m[1][0] * los[0] + m[1][1] * los[1] + m[1][2] * los[2]
    const u = m[2][0] * los[0] + m[2][1] * los[1] + m[2][2] * los[2]
    azimuth = Math.atan2(e, n)
    if (azimuth < 0) azimuth += 2 * Math.PI
    elevation = Math.asin(u)
  }
  return { sat: eph.sat, system: eph.system, position: pos, clock: state.clock, los, range, azimuth, elevation }
}

/**
 * χ² quantile at probability 0.999 (exact for 1–2 degrees of freedom, Wilson–Hilferty above).
 * @param dof - degrees of freedom (≥ 1).
 * @returns threshold.
 */
export function chi2Threshold(dof: number): number {
  if (dof === 1) return 10.8276
  if (dof === 2) return 13.8155
  const z = 3.0902
  return dof * (1 - 2 / (9 * dof) + z * Math.sqrt(2 / (9 * dof))) ** 3
}

interface Candidate {
  readonly sat: string
  readonly system: GnssSystem
  readonly eph: BroadcastEphemeris
  readonly pseudorange: number
}

/**
 * Candidate satellites of an epoch with usable code and ephemeris.
 * @param epoch - observation epoch.
 * @param nav - navigation data.
 * @param systems - constellations to use.
 * @returns candidates.
 */
export function candidates(epoch: ObservationEpoch, nav: NavigationData, systems: readonly GnssSystem[]): Candidate[] {
  const out: Candidate[] = []
  for (const [sat, obs] of epoch.satellites) {
    const system = sat[0] as GnssSystem
    if (!systems.includes(system)) continue
    const code = pick(obs, CODE_PRIORITY[system])
    const eph = selectEphemeris(nav.ephemerides.filter(e => e.sat === sat), epoch.time)
    if (code === undefined || eph === undefined) continue
    out.push({ sat, system, eph, pseudorange: code.value })
  }
  return out
}

function solveOnce(
  time: number, sats: readonly Candidate[], nav: NavigationData, options: SppOptions, start: Vec3,
): SppSolution | undefined {
  let x: Vec3 = start
  const systems = [...new Set(sats.map(s => s.system))]
  let clocks = systems.map(() => 0)
  // The elevation mask applies once the position is within a kilometre, so a coarse early
  // iterate cannot discard satellites that are above the mask at the true position.
  let masking = false
  for (let iter = 0; iter < 12; iter++) {
    const located = Math.hypot(...x) > 1e6
    const g = located ? itrfToGeodetic([x[0] / 1000, x[1] / 1000, x[2] / 1000]) : undefined
    const rows: number[][] = []
    const v: number[] = []
    const w: number[] = []
    const used: string[] = []
    for (const s of sats) {
      const geo = geometry(s.eph, time, s.pseudorange, x)
      if (masking && geo.elevation < options.elevationMask) continue
      const sysIndex = systems.indexOf(s.system)
      const iono = g && nav.klobuchar ? klobuchar(nav.klobuchar, g.lat, g.lon, geo.azimuth, geo.elevation, time) * ionoScale(s.system) : 0
      const tropo = g ? saastamoinen(g.h * 1000, g.lat, geo.elevation) : 0
      const predicted = geo.range + (clocks[sysIndex] as number) - C * geo.clock + iono + tropo
      rows.push([-geo.los[0], -geo.los[1], -geo.los[2], ...systems.map((_, k) => (k === sysIndex ? 1 : 0))])
      v.push(s.pseudorange - predicted)
      const sinEl = Math.max(Math.sin(geo.elevation), 0.1)
      const a2 = options.codeSigma ** 2
      w.push(1 / (a2 + a2 / (sinEl * sinEl) + (0.5 * iono) ** 2))
      used.push(s.sat)
    }
    const n = 3 + systems.length
    if (rows.length < n) return undefined
    const weighted = (i: number, other: (k: number, r: readonly number[]) => number): number =>
      rows.reduce((sum, r, k) => sum + (r[i] as number) * (w[k] as number) * other(k, r), 0)
    const normal: Matrix = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => weighted(i, (_k, r) => r[j] as number)))
    const rhs = Array.from({ length: n }, (_, i) => weighted(i, k => v[k] as number))
    const inv = cholInverse(normal)
    const dx = inv.map(row => row.reduce((sum, value, j) => sum + value * (rhs[j] as number), 0))
    x = [x[0] + (dx[0] as number), x[1] + (dx[1] as number), x[2] + (dx[2] as number)]
    clocks = clocks.map((c, k) => c + (dx[3 + k] as number))
    const step = Math.hypot(dx[0] as number, dx[1] as number, dx[2] as number)
    if (step < 1e-4 && masking) {
      // Post-fit residuals at the converged solution (the last correction is below 0.1 mm).
      const post = v.map((value, k) => value - (rows[k] as number[]).reduce((sum, h, j) => sum + h * (dx[j] as number), 0))
      const chi2 = post.reduce((sum, r, k) => sum + (w[k] as number) * r * r, 0)
      const dof = rows.length - n
      return {
        time,
        position: x,
        clocks: Object.fromEntries(systems.map((s, k) => [s, clocks[k] as number])),
        used,
        excluded: [],
        residuals: Object.fromEntries(used.map((s, k) => [s, post[k] as number])),
        dop: dilution(rows, x),
        valid: dof === 0 || chi2 <= chi2Threshold(dof),
      }
    }
    if (step < 1000) masking = true
  }
  return undefined
}

/**
 * Dilution of precision of a geometry.
 * @param rows - design rows [−line of sight, one clock column per constellation].
 * @param position - receiver ECEF, m.
 * @returns GDOP, PDOP, HDOP, VDOP.
 */
export function dilution(rows: readonly number[][], position: Vec3): Dop {
  const g: Geodetic = itrfToGeodetic([position[0] / 1000, position[1] / 1000, position[2] / 1000])
  const m = enuMatrix(g.lat, g.lon)
  const local = rows.map((r) => {
    const los: Vec3 = [-(r[0] as number), -(r[1] as number), -(r[2] as number)]
    return [0, 1, 2].map(i => -(m[i as 0][0] * los[0] + m[i as 0][1] * los[1] + m[i as 0][2] * los[2])).concat(r.slice(3))
  })
  const n = (local[0] as number[]).length
  const entry = (i: number, j: number): number => local.reduce((sum, r) => sum + (r[i] as number) * (r[j] as number), 0)
  const q = cholInverse(Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => entry(i, j))))
  const d = (i: number): number => (q[i] as number[])[i] as number
  const trace = Array.from({ length: n }, (_, i) => d(i)).reduce((a, b) => a + b, 0)
  return { gdop: Math.sqrt(trace), pdop: Math.sqrt(d(0) + d(1) + d(2)), hdop: Math.sqrt(d(0) + d(1)), vdop: Math.sqrt(d(2)) }
}

/**
 * Solve one epoch.
 * @param epoch - observation epoch.
 * @param nav - navigation data.
 * @param options - positioning controls.
 * @param start - initial receiver position, m (the origin works; the solver converges from it).
 * @returns the solution, or undefined when too few satellites remain or the solution diverges.
 */
export function solveEpoch(
  epoch: ObservationEpoch, nav: NavigationData, options: SppOptions, start: Vec3 = [0, 0, 0],
): SppSolution | undefined {
  const sats = candidates(epoch, nav, options.systems)
  const first = solveOnce(epoch.time, sats, nav, options, start)
  if (first === undefined || first.valid || !options.raim) return first
  let best: SppSolution | undefined
  let bestScore = Infinity
  for (const drop of first.used) {
    const trial = solveOnce(epoch.time, sats.filter(s => s.sat !== drop), nav, options, first.position)
    // Dropping one satellite keeps rows ≥ unknowns, so only a divergent trial is undefined.
    /* v8 ignore start -- a trial seeded at the converged position does not diverge. */
    if (trial === undefined) continue
    /* v8 ignore stop */
    if (!trial.valid) continue
    const score = Object.values(trial.residuals).reduce((sum, r) => sum + r * r, 0)
    if (score < bestScore) {
      bestScore = score
      best = { ...trial, excluded: [drop] }
    }
  }
  return best ?? first
}
