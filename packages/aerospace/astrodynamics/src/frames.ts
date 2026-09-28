/**
 * Reference frames: IAU-1976 precession and truncated IAU-1980 nutation between GCRF (J2000)
 * and the Earth-fixed ITRF, the SGP4 TEME frame, WGS-84 geodetic coordinates, the local
 * east-north-up frame, and ground-site look angles. Polar motion follows the optional IERS
 * pole coordinates; without them the Earth-fixed frame is the pseudo-Earth-fixed frame,
 * about 15 m from ITRF at the surface.
 * @module @astro-one/astrodynamics/frames
 */

import { ARCSEC, DEG, ECC2_EARTH, OMEGA_EARTH, R_EARTH } from './constants.ts'
import { add, apply3, cross, dot, mul3, norm, rot1, rot2, rot3, scale, sub, transpose3, wrap2pi } from './linalg.ts'
import { centuriesTT, gmst } from './time.ts'
import type { Geodetic, LookAngles, Mat3, StateVector, UtcMs, Vec3 } from './types.ts'

/**
 * Leading IAU-1980 nutation terms (Meeus Table 22.A): multipliers of D, M, M′, F, Ω, then
 * Δψ and Δε coefficients in 0.0001″ with their per-century rates. The retained terms keep
 * the truncation error below 0.02″.
 */
const NUTATION_TERMS: readonly (readonly [number, number, number, number, number, number, number, number, number])[] = [
  [0, 0, 0, 0, 1, -171996, -174.2, 92025, 8.9],
  [-2, 0, 0, 2, 2, -13187, -1.6, 5736, -3.1],
  [0, 0, 0, 2, 2, -2274, -0.2, 977, -0.5],
  [0, 0, 0, 0, 2, 2062, 0.2, -895, 0.5],
  [0, 1, 0, 0, 0, 1426, -3.4, 54, -0.1],
  [0, 0, 1, 0, 0, 712, 0.1, -7, 0],
  [-2, 1, 0, 2, 2, -517, 1.2, 224, -0.6],
  [0, 0, 0, 2, 1, -386, -0.4, 200, 0],
  [0, 0, 1, 2, 2, -301, 0, 129, -0.1],
  [-2, -1, 0, 2, 2, 217, -0.5, -95, 0.3],
  [-2, 0, 1, 0, 0, -158, 0, 0, 0],
  [-2, 0, 0, 2, 1, 129, 0.1, -70, 0],
  [0, 0, -1, 2, 2, 123, 0, -53, 0],
  [2, 0, 0, 0, 0, 63, 0, 0, 0],
  [0, 0, 1, 0, 1, 63, 0.1, -33, 0],
  [2, 0, -1, 2, 2, -59, 0, 26, 0],
  [0, 0, -1, 0, 1, -58, -0.1, 32, 0],
  [0, 0, 1, 2, 1, -51, 0, 27, 0],
]

/** Earth orientation parameters from IERS Bulletin A/B; omitted fields are zero. */
export interface EarthOrientationParameters {
  /** UT1−UTC, s. */
  readonly dut1?: number
  /** Polar-motion x coordinate, arcsec. */
  readonly xp?: number
  /** Polar-motion y coordinate, arcsec. */
  readonly yp?: number
}

/** Precession, nutation, and sidereal-time quantities at one instant. */
export interface EarthOrientation {
  /** GCRF → mean-of-date rotation (IAU-1976 precession). */
  readonly precession: Mat3
  /** Mean-of-date → true-of-date rotation. */
  readonly nutation: Mat3
  /** Nutation in longitude, rad. */
  readonly dpsi: number
  /** Mean obliquity of the ecliptic, rad. */
  readonly epsBar: number
  /** Greenwich mean sidereal time, rad. */
  readonly gmst: number
  /** Greenwich apparent sidereal time, rad. */
  readonly gast: number
  /** PEF → ITRF polar-motion rotation (identity when no pole coordinates are given). */
  readonly polarMotion: Mat3
}

/**
 * Earth orientation at a UTC instant.
 * @param t - UTC milliseconds.
 * @param eop - Earth orientation parameters.
 * @returns precession, nutation, sidereal angles, and polar motion.
 */
export function earthOrientation(t: UtcMs, eop: EarthOrientationParameters = {}): EarthOrientation {
  const T = centuriesTT(t)
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * ARCSEC
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * ARCSEC
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * ARCSEC
  const precession = mul3(rot3(-z), mul3(rot2(theta), rot3(-zeta)))

  const d = (297.85036 + 445267.11148 * T - 0.0019142 * T * T + T ** 3 / 189474) * DEG
  const m = (357.52772 + 35999.05034 * T - 0.0001603 * T * T - T ** 3 / 300000) * DEG
  const mp = (134.96298 + 477198.867398 * T + 0.0086972 * T * T + T ** 3 / 56250) * DEG
  const f = (93.27191 + 483202.017538 * T - 0.0036825 * T * T + T ** 3 / 327270) * DEG
  const om = (125.04452 - 1934.136261 * T + 0.0020708 * T * T + T ** 3 / 450000) * DEG
  let dpsi = 0
  let deps = 0
  for (const [cd, cm, cmp, cf, com, s0, s1, c0, c1] of NUTATION_TERMS) {
    const arg = cd * d + cm * m + cmp * mp + cf * f + com * om
    dpsi += (s0 + s1 * T) * Math.sin(arg)
    deps += (c0 + c1 * T) * Math.cos(arg)
  }
  dpsi *= 1e-4 * ARCSEC
  deps *= 1e-4 * ARCSEC
  const epsBar = (84381.448 - 46.815 * T - 0.00059 * T * T + 0.001813 * T ** 3) * ARCSEC
  const eps = epsBar + deps
  const nutation = mul3(rot1(-eps), mul3(rot3(-dpsi), rot1(epsBar)))
  const mean = gmst(t, eop.dut1 ?? 0)
  const eqeq = dpsi * Math.cos(epsBar) + (0.00264 * Math.sin(om) + 0.000063 * Math.sin(2 * om)) * ARCSEC
  // IAU-1976/FK5 polar motion: r_ITRF = ROT1(−yp)·ROT2(−xp)·r_PEF.
  const polarMotion = mul3(rot1(-(eop.yp ?? 0) * ARCSEC), rot2(-(eop.xp ?? 0) * ARCSEC))
  return { precession, nutation, dpsi, epsBar, gmst: mean, gast: wrap2pi(mean + eqeq), polarMotion }
}

/**
 * Rotation that maps GCRF vectors to the true-of-date frame, whose z axis is the celestial
 * intermediate pole used for zonal gravity.
 * @param orientation - Earth orientation at the instant.
 * @returns GCRF → TOD rotation.
 */
export function gcrfToTod(orientation: EarthOrientation): Mat3 {
  return mul3(orientation.nutation, orientation.precession)
}

const OMEGA_VEC: Vec3 = [0, 0, OMEGA_EARTH]

/**
 * Transform a GCRF state to the Earth-fixed frame.
 * @param state - GCRF position and velocity.
 * @param t - UTC milliseconds of the state.
 * @param eop - Earth orientation parameters.
 * @returns Earth-fixed state.
 */
export function gcrfToItrf(state: StateVector, t: UtcMs, eop: EarthOrientationParameters = {}): StateVector {
  const o = earthOrientation(t, eop)
  const m = mul3(rot3(o.gast), gcrfToTod(o))
  const r = apply3(m, state.r)
  return fromPef({ r, v: sub(apply3(m, state.v), cross(OMEGA_VEC, r)) }, o)
}

/**
 * Transform an Earth-fixed state to GCRF.
 * @param state - Earth-fixed position and velocity.
 * @param t - UTC milliseconds of the state.
 * @param eop - Earth orientation parameters.
 * @returns GCRF state.
 */
export function itrfToGcrf(state: StateVector, t: UtcMs, eop: EarthOrientationParameters = {}): StateVector {
  const o = earthOrientation(t, eop)
  const pef = toPef(state, o)
  const m = transpose3(mul3(rot3(o.gast), gcrfToTod(o)))
  return { r: apply3(m, pef.r), v: apply3(m, add(pef.v, cross(OMEGA_VEC, pef.r))) }
}

function fromPef(state: StateVector, o: EarthOrientation): StateVector {
  return { r: apply3(o.polarMotion, state.r), v: apply3(o.polarMotion, state.v) }
}

function toPef(state: StateVector, o: EarthOrientation): StateVector {
  const w = transpose3(o.polarMotion)
  return { r: apply3(w, state.r), v: apply3(w, state.v) }
}

/**
 * Transform an SGP4 TEME state to the Earth-fixed frame (Vallado 2006: rotation by GMST).
 * @param state - TEME position and velocity.
 * @param t - UTC milliseconds of the state.
 * @param eop - Earth orientation parameters.
 * @returns Earth-fixed state.
 */
export function temeToItrf(state: StateVector, t: UtcMs, eop: EarthOrientationParameters = {}): StateVector {
  const o = earthOrientation(t, eop)
  const m = rot3(o.gmst)
  const r = apply3(m, state.r)
  return fromPef({ r, v: sub(apply3(m, state.v), cross(OMEGA_VEC, r)) }, o)
}

/**
 * Transform an SGP4 TEME state to GCRF through the true-of-date frame.
 * @param state - TEME position and velocity.
 * @param t - UTC milliseconds of the state.
 * @returns GCRF state.
 */
export function temeToGcrf(state: StateVector, t: UtcMs): StateVector {
  const m = transpose3(gcrfToTeme3(earthOrientation(t)))
  return { r: apply3(m, state.r), v: apply3(m, state.v) }
}

/**
 * GCRF → TEME rotation: TOD rotated by the equation of the equinoxes (r_TEME = ROT3(Eq) r_TOD).
 * @param o - Earth orientation at the instant.
 * @returns GCRF → TEME rotation.
 */
function gcrfToTeme3(o: EarthOrientation): Mat3 {
  return mul3(rot3(o.gast - o.gmst), gcrfToTod(o))
}

/**
 * Transform a GCRF state to SGP4 TEME.
 * @param state - GCRF position and velocity.
 * @param t - UTC milliseconds of the state.
 * @returns TEME state.
 */
export function gcrfToTeme(state: StateVector, t: UtcMs): StateVector {
  const m = gcrfToTeme3(earthOrientation(t))
  return { r: apply3(m, state.r), v: apply3(m, state.v) }
}

/**
 * Earth-fixed position of a geodetic point.
 * @param g - geodetic coordinates.
 * @returns ITRF position, km.
 */
export function geodeticToItrf(g: Geodetic): Vec3 {
  const sinLat = Math.sin(g.lat)
  const n = R_EARTH / Math.sqrt(1 - ECC2_EARTH * sinLat * sinLat)
  const c = (n + g.h) * Math.cos(g.lat)
  return [c * Math.cos(g.lon), c * Math.sin(g.lon), (n * (1 - ECC2_EARTH) + g.h) * sinLat]
}

/**
 * Geodetic coordinates of an Earth-fixed position (Bowring iteration, stable at the poles).
 * @param r - ITRF position, km.
 * @returns geodetic coordinates.
 */
export function itrfToGeodetic(r: Vec3): Geodetic {
  const [x, y, z] = r
  const p = Math.hypot(x, y)
  const lon = Math.atan2(y, x)
  let lat = Math.atan2(z, p * (1 - ECC2_EARTH))
  let h = 0
  for (let i = 0; i < 20; i++) {
    const sinLat = Math.sin(lat)
    const n = R_EARTH / Math.sqrt(1 - ECC2_EARTH * sinLat * sinLat)
    h = Math.abs(lat) < Math.PI / 4 ? p / Math.cos(lat) - n : z / sinLat - n * (1 - ECC2_EARTH)
    const next = Math.atan2(z, p * (1 - ECC2_EARTH * n / (n + h)))
    const done = Math.abs(next - lat) < 1e-14
    lat = next
    if (done) break
  }
  return { lat, lon, h }
}

/**
 * Rotation from the Earth-fixed frame to local east-north-up axes.
 * @param lat - geodetic latitude, rad.
 * @param lon - east longitude, rad.
 * @returns ITRF → ENU rotation.
 */
export function enuMatrix(lat: number, lon: number): Mat3 {
  const sl = Math.sin(lat)
  const cl = Math.cos(lat)
  const so = Math.sin(lon)
  const co = Math.cos(lon)
  return [[-so, co, 0], [-sl * co, -sl * so, cl], [cl * co, cl * so, sl]]
}

/**
 * Look angles from a ground site to an Earth-fixed target.
 * @param site - observer geodetic coordinates.
 * @param target - target ITRF state.
 * @returns azimuth, elevation, range, and range rate.
 */
export function lookAngles(site: Geodetic, target: StateVector): LookAngles {
  const rho = sub(target.r, geodeticToItrf(site))
  const enu = apply3(enuMatrix(site.lat, site.lon), rho)
  const range = norm(rho)
  return {
    az: wrap2pi(Math.atan2(enu[0], enu[1])),
    el: Math.asin(enu[2] / range),
    range,
    rangeRate: dot(rho, target.v) / range,
  }
}

/**
 * GCRF position and velocity of a ground site.
 * @param site - geodetic coordinates.
 * @param t - UTC milliseconds.
 * @param eop - Earth orientation parameters.
 * @returns GCRF state of the co-rotating site.
 */
export function siteGcrf(site: Geodetic, t: UtcMs, eop: EarthOrientationParameters = {}): StateVector {
  return itrfToGcrf({ r: geodeticToItrf(site), v: [0, 0, 0] }, t, eop)
}

/**
 * Geodetic sub-point of a GCRF position.
 * @param r - GCRF position, km.
 * @param t - UTC milliseconds.
 * @returns geodetic coordinates.
 */
export function gcrfToGeodetic(r: Vec3, t: UtcMs): Geodetic {
  return itrfToGeodetic(gcrfToItrf({ r, v: [0, 0, 0] }, t).r)
}

/**
 * Radial, transverse, normal (RTN/RIC) basis of an orbit state.
 * @param state - position and velocity in an inertial frame.
 * @returns rotation whose rows are the R, T, and N unit vectors in that frame.
 */
export function rtnMatrix(state: StateVector): Mat3 {
  const r = scale(state.r, 1 / norm(state.r))
  const hv = cross(state.r, state.v)
  const n = scale(hv, 1 / norm(hv))
  return [r, cross(n, r), n]
}
