/**
 * Two-body mechanics: state ↔ classical elements (Vallado Algorithms 9–10), Kepler's equation
 * for every conic, Stumpff functions, and universal-variable propagation solved with the
 * Laguerre–Conway iteration, which converges for elliptic, parabolic, and hyperbolic arcs.
 * @module @astro-one/astrodynamics/kepler
 */

import { MU_EARTH, TWO_PI } from './constants.ts'
import { add, apply3, cross, dot, mul3, norm, rot1, rot3, scale, sub, wrap2pi } from './linalg.ts'
import type { ClassicalElements, StateVector, Vec3 } from './types.ts'

/** Eccentricity and inclination below which the orbit is treated as circular or equatorial. */
const SMALL = 1e-11

/**
 * Stumpff function C(z).
 * @param z - universal-variable argument αχ².
 * @returns C(z).
 */
export function stumpffC(z: number): number {
  if (Math.abs(z) < 1e-3) return 1 / 2 - z / 24 + (z * z) / 720 - (z * z * z) / 40320
  if (z > 0) return (1 - Math.cos(Math.sqrt(z))) / z
  return (Math.cosh(Math.sqrt(-z)) - 1) / -z
}

/**
 * Stumpff function S(z).
 * @param z - universal-variable argument αχ².
 * @returns S(z).
 */
export function stumpffS(z: number): number {
  if (Math.abs(z) < 1e-3) return 1 / 6 - z / 120 + (z * z) / 5040 - (z * z * z) / 362880
  if (z > 0) {
    const s = Math.sqrt(z)
    return (s - Math.sin(s)) / (s * s * s)
  }
  const s = Math.sqrt(-z)
  return (Math.sinh(s) - s) / (s * s * s)
}

/**
 * Solve Kepler's equation for the eccentric, hyperbolic, or parabolic anomaly and return the
 * true anomaly.
 * @param m - mean anomaly (elliptic, rad), hyperbolic mean anomaly, or Barker's M = √(μ/p³)·Δt.
 * @param e - eccentricity.
 * @returns true anomaly, rad.
 */
export function trueFromMean(m: number, e: number): number {
  if (e < 1 - 1e-9) {
    const mm = wrap2pi(m)
    let big = e < 0.8 ? mm : Math.PI
    for (let i = 0; i < 50; i++) {
      const delta = (big - e * Math.sin(big) - mm) / (1 - e * Math.cos(big))
      big -= delta
      if (Math.abs(delta) < 1e-15) break
    }
    return wrap2pi(2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(big / 2), Math.sqrt(1 - e) * Math.cos(big / 2)))
  }
  if (e > 1 + 1e-9) {
    let f = Math.asinh(m / e)
    for (let i = 0; i < 100; i++) {
      const delta = (e * Math.sinh(f) - f - m) / (e * Math.cosh(f) - 1)
      f -= delta
      if (Math.abs(delta) < 1e-15 * Math.max(1, Math.abs(f))) break
    }
    return 2 * Math.atan(Math.sqrt((e + 1) / (e - 1)) * Math.tanh(f / 2))
  }
  // Barker's equation B + B³/3 = M, solved in closed form.
  const w = Math.cbrt(1.5 * m + Math.sqrt(1 + 2.25 * m * m))
  return 2 * Math.atan(w - 1 / w)
}

/**
 * Mean anomaly of a true anomaly on a conic of eccentricity `e`.
 * @param nu - true anomaly, rad.
 * @param e - eccentricity.
 * @returns elliptic mean anomaly in [0, 2π), hyperbolic mean anomaly, or Barker's M.
 */
export function meanFromTrue(nu: number, e: number): number {
  if (e < 1 - 1e-9) {
    const big = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2))
    return wrap2pi(big - e * Math.sin(big))
  }
  if (e > 1 + 1e-9) {
    const f = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2))
    return e * Math.sinh(f) - f
  }
  const b = Math.tan(nu / 2)
  return b + (b * b * b) / 3
}

/**
 * Classical elements of a two-body state.
 * @param state - inertial position (km) and velocity (km/s).
 * @param mu - gravitational parameter, km³/s².
 * @returns elements, with ω = 0 for circular and Ω = 0 for equatorial orbits.
 */
export function stateToElements(state: StateVector, mu = MU_EARTH): ClassicalElements {
  const { r, v } = state
  const rn = norm(r)
  const vn = norm(v)
  const h = cross(r, v)
  const hn = norm(h)
  if (hn === 0) throw new Error('rectilinear state (zero angular momentum) has no classical elements')
  const nodeVec: Vec3 = [-h[1], h[0], 0]
  const nn = norm(nodeVec)
  const eVec = scale(sub(scale(r, vn * vn - mu / rn), scale(v, dot(r, v))), 1 / mu)
  const e = norm(eVec)
  const p = (hn * hn) / mu
  const energy = (vn * vn) / 2 - mu / rn
  const a = Math.abs(e - 1) < 1e-9 ? Infinity : -mu / (2 * energy)
  const i = Math.acos(Math.max(-1, Math.min(1, h[2] / hn)))
  const equatorial = nn < SMALL * hn
  const circular = e < SMALL
  const raan = equatorial ? 0 : wrap2pi(Math.atan2(nodeVec[1], nodeVec[0]))
  // Reference direction inside the orbit plane: node line, or x axis for equatorial orbits.
  const ref: Vec3 = equatorial ? [1, 0, 0] : scale(nodeVec, 1 / nn)
  const hHat = scale(h, 1 / hn)
  const angleFromRef = (target: Vec3): number => {
    const signed = Math.atan2(dot(cross(ref, target), hHat), dot(ref, target))
    return wrap2pi(signed)
  }
  const argLat = angleFromRef(r)
  const argp = circular ? 0 : angleFromRef(eVec)
  const nu = circular ? argLat : wrap2pi(argLat - argp)
  const m = meanFromTrue(nu, e)
  const period = e < 1 ? TWO_PI * Math.sqrt(a * a * a / mu) : undefined
  return { p, a, e, i, raan, argp, nu, m, argLat, trueLon: wrap2pi(raan + argLat), period }
}

/** Element set accepted by {@link elementsToState}. */
export interface ElementInput {
  /** Semi-latus rectum, km. */
  readonly p: number
  /** Eccentricity. */
  readonly e: number
  /** Inclination, rad. */
  readonly i: number
  /** Right ascension of the ascending node, rad. */
  readonly raan: number
  /** Argument of periapsis, rad. */
  readonly argp: number
  /** True anomaly, rad. */
  readonly nu: number
}

/**
 * Two-body state of classical elements.
 * @param el - elements with the semi-latus rectum.
 * @param mu - gravitational parameter, km³/s².
 * @returns inertial position and velocity.
 */
export function elementsToState(el: ElementInput, mu = MU_EARTH): StateVector {
  const cnu = Math.cos(el.nu)
  const snu = Math.sin(el.nu)
  const denom = 1 + el.e * cnu
  if (denom <= 0) throw new Error('true anomaly lies outside the hyperbola asymptotes')
  const rp: Vec3 = [(el.p * cnu) / denom, (el.p * snu) / denom, 0]
  const k = Math.sqrt(mu / el.p)
  const vp: Vec3 = [-k * snu, k * (el.e + cnu), 0]
  const m = mul3(rot3(-el.raan), mul3(rot1(-el.i), rot3(-el.argp)))
  return { r: apply3(m, rp), v: apply3(m, vp) }
}

/**
 * Propagate a two-body state with universal variables.
 * @param state - initial inertial state.
 * @param dt - propagation interval, s (negative propagates backwards).
 * @param mu - gravitational parameter, km³/s².
 * @returns the state `dt` seconds later.
 * @throws When the universal Kepler equation does not converge.
 */
export function propagateKepler(state: StateVector, dt: number, mu = MU_EARTH): StateVector {
  if (dt === 0) return state
  const { r: r0, v: v0 } = state
  const r0n = norm(r0)
  const vr0 = dot(r0, v0) / r0n
  const alpha = 2 / r0n - dot(v0, v0) / mu
  const chi = solveUniversal(r0n, vr0, alpha, dt, mu)
  const z = alpha * chi * chi
  const c = stumpffC(z)
  const s = stumpffS(z)
  const sqmu = Math.sqrt(mu)
  const f = 1 - (chi * chi / r0n) * c
  const g = dt - (chi * chi * chi * s) / sqmu
  const r = add(scale(r0, f), scale(v0, g))
  const rn = norm(r)
  const fdot = (sqmu / (rn * r0n)) * (alpha * chi * chi * chi * s - chi)
  const gdot = 1 - (chi * chi / rn) * c
  return { r, v: add(scale(r0, fdot), scale(v0, gdot)) }
}

/**
 * Universal anomaly χ for an interval, by the Laguerre–Conway iteration.
 * @param r0 - initial radius, km.
 * @param vr0 - initial radial velocity, km/s.
 * @param alpha - reciprocal semi-major axis, 1/km.
 * @param dt - interval, s.
 * @param mu - gravitational parameter, km³/s².
 * @returns χ, √km.
 */
export function solveUniversal(r0: number, vr0: number, alpha: number, dt: number, mu = MU_EARTH): number {
  const sqmu = Math.sqrt(mu)
  let chi = alpha > 1e-12
    ? sqmu * dt * alpha
    : Math.sign(dt) * Math.sqrt(Math.max(r0, 1)) * Math.cbrt(Math.abs(sqmu * dt / Math.max(r0, 1)))
  const nLag = 5
  for (let i = 0; i < 200; i++) {
    const z = alpha * chi * chi
    const c = stumpffC(z)
    const s = stumpffS(z)
    const k = (r0 * vr0) / sqmu
    const f = k * chi * chi * c + (1 - alpha * r0) * chi * chi * chi * s + r0 * chi - sqmu * dt
    const fp = k * chi * (1 - z * s) + (1 - alpha * r0) * chi * chi * c + r0
    const fpp = k * (1 - z * c) + (1 - alpha * r0) * chi * (1 - z * s)
    const disc = Math.sqrt(Math.abs((nLag - 1) ** 2 * fp * fp - nLag * (nLag - 1) * f * fpp))
    const delta = (nLag * f) / (fp + Math.sign(fp) * disc)
    chi -= delta
    if (Math.abs(delta) < 1e-12 * Math.max(1, Math.abs(chi))) return chi
  }
  throw new Error('universal Kepler equation did not converge')
}
