/**
 * Initial orbit determination: Gibbs and Herrick–Gibbs from three position vectors (Vallado
 * Algorithms 54–55), and Gauss's angles-only method with the eighth-degree range polynomial
 * followed by universal-variable iterative refinement and light-time correction (Curtis
 * Algorithms 5.5–5.6).
 * @module @astro-one/astrodynamics/iod
 */

import { C_LIGHT, MU_EARTH } from './constants.ts'
import { add, cross, dot, norm, scale, sub, unit } from './linalg.ts'
import { solveUniversal, stumpffC, stumpffS } from './kepler.ts'
import type { StateVector, Vec3 } from './types.ts'

/** Result of a three-position method. */
export interface ThreePositionResult {
  /** Velocity at the middle position, km/s. */
  readonly v2: Vec3
  /** Angle between r1 and the plane of r2, r3, rad (0 for coplanar vectors). */
  readonly coplanarity: number
  /** Angular separations r1–r2 and r2–r3, rad. */
  readonly separations: readonly [number, number]
}

function geometry(r1: Vec3, r2: Vec3, r3: Vec3): { coplanarity: number; separations: [number, number] } {
  const n23 = cross(r2, r3)
  const coplanarity = Math.PI / 2 - Math.acos(Math.max(-1, Math.min(1, dot(unit(n23), unit(r1)))))
  const angle = (a: Vec3, b: Vec3): number => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (norm(a) * norm(b)))))
  return { coplanarity: Math.abs(coplanarity), separations: [angle(r1, r2), angle(r2, r3)] }
}

/**
 * Gibbs method; accurate when the vectors are separated by more than a few degrees.
 * @param r1 - first position, km.
 * @param r2 - middle position, km.
 * @param r3 - last position, km.
 * @param mu - gravitational parameter, km³/s².
 * @returns velocity at r2 with geometry diagnostics.
 */
export function gibbs(r1: Vec3, r2: Vec3, r3: Vec3, mu = MU_EARTH): ThreePositionResult {
  const [n1, n2, n3] = [norm(r1), norm(r2), norm(r3)]
  const n = add(add(scale(cross(r2, r3), n1), scale(cross(r3, r1), n2)), scale(cross(r1, r2), n3))
  const d = add(add(cross(r1, r2), cross(r2, r3)), cross(r3, r1))
  const s = add(add(scale(r1, n2 - n3), scale(r2, n3 - n1)), scale(r3, n1 - n2))
  const nn = norm(n)
  const dn = norm(d)
  if (nn === 0 || dn === 0) throw new Error('Gibbs method needs three non-collinear positions')
  const k = Math.sqrt(mu / (nn * dn))
  const v2 = scale(add(scale(cross(d, r2), 1 / n2), s), k)
  return { v2, ...geometry(r1, r2, r3) }
}

/**
 * Herrick–Gibbs method for closely spaced observations (Taylor-series velocity).
 * @param r1 - first position, km.
 * @param r2 - middle position, km.
 * @param r3 - last position, km.
 * @param times - observation times, s, strictly increasing.
 * @param mu - gravitational parameter, km³/s².
 * @returns velocity at r2 with geometry diagnostics.
 */
export function herrickGibbs(r1: Vec3, r2: Vec3, r3: Vec3, times: readonly [number, number, number], mu = MU_EARTH): ThreePositionResult {
  const [t1, t2, t3] = times
  const dt31 = t3 - t1
  const dt32 = t3 - t2
  const dt21 = t2 - t1
  if (!(dt21 > 0 && dt32 > 0)) throw new Error('Herrick–Gibbs needs strictly increasing observation times')
  const [n1, n2, n3] = [norm(r1), norm(r2), norm(r3)]
  const term1 = scale(r1, -dt32 * (1 / (dt21 * dt31) + mu / (12 * n1 ** 3)))
  const term2 = scale(r2, (dt32 - dt21) * (1 / (dt21 * dt32) + mu / (12 * n2 ** 3)))
  const term3 = scale(r3, dt21 * (1 / (dt32 * dt31) + mu / (12 * n3 ** 3)))
  return { v2: add(add(term1, term2), term3), ...geometry(r1, r2, r3) }
}

/** One angles-only observation. */
export interface AnglesObservation {
  /** Observation time, s (any common origin). */
  readonly t: number
  /** Unit line of sight from the site, inertial frame. */
  readonly los: Vec3
  /** Site position in the same inertial frame, km. */
  readonly site: Vec3
}

/** Gauss solution for one root of the range polynomial. */
export interface GaussSolution {
  /** State at the middle observation, inertial frame. */
  readonly state: StateVector
  /** Slant ranges to the three observations, km. */
  readonly ranges: readonly [number, number, number]
  /** Positive real root of the eighth-degree polynomial, km. */
  readonly polynomialRoot: number
  /** Refinement iterations performed. */
  readonly iterations: number
  /** Whether the universal-variable refinement met its tolerance. */
  readonly converged: boolean
}

/**
 * Positive real roots of x⁸ + a·x⁶ + b·x³ + c.
 * @param a - x⁶ coefficient.
 * @param b - x³ coefficient.
 * @param c - constant term.
 * @returns roots in increasing order.
 */
export function rangePolynomialRoots(a: number, b: number, c: number): number[] {
  const f = (x: number): number => x ** 8 + a * x ** 6 + b * x ** 3 + c
  const roots: number[] = []
  // Bracket on a logarithmic grid from 100 km to 10⁷ km, then bisect.
  let prevX = 100
  let prevF = f(prevX)
  for (let i = 1; i <= 2000; i++) {
    const x = 100 * 10 ** (5 * i / 2000)
    const fx = f(x)
    if (prevF === 0) roots.push(prevX)
    else if (prevF * fx < 0) {
      let lo = prevX
      let hi = x
      for (let k = 0; k < 200; k++) {
        const mid = (lo + hi) / 2
        if (f(lo) * f(mid) <= 0) hi = mid
        else lo = mid
      }
      roots.push((lo + hi) / 2)
    }
    prevX = x
    prevF = fx
  }
  return roots
}

/**
 * Gauss angles-only initial orbit determination.
 * @param obs - exactly three observations in time order.
 * @param options - refinement controls.
 * @param options.mu - gravitational parameter, km³/s².
 * @param options.maxIterations - refinement iteration cap.
 * @param options.tolerance - relative range change that ends refinement.
 * @returns one solution per positive polynomial root with positive ranges, converged refinements first.
 * @throws When the lines of sight are coplanar or no positive root exists.
 */
export function gaussAnglesOnly(
  obs: readonly [AnglesObservation, AnglesObservation, AnglesObservation],
  options: { mu?: number; maxIterations?: number; tolerance?: number } = {},
): GaussSolution[] {
  const mu = options.mu ?? MU_EARTH
  const maxIterations = options.maxIterations ?? 100
  const tolerance = options.tolerance ?? 1e-9
  const [o1, o2, o3] = obs
  const tau1 = o1.t - o2.t
  const tau3 = o3.t - o2.t
  const tau = tau3 - tau1
  if (!(tau1 < 0 && tau3 > 0)) throw new Error('angles-only observations must be in strictly increasing time order')
  const p1 = cross(o2.los, o3.los)
  const p2 = cross(o1.los, o3.los)
  const p3 = cross(o1.los, o2.los)
  const d0 = dot(o1.los, p1)
  if (Math.abs(d0) < 1e-12) throw new Error('lines of sight are coplanar; Gauss method is singular')
  const sites = [o1.site, o2.site, o3.site]
  const ps = [p1, p2, p3]
  const dm = sites.map(r => ps.map(p => dot(r, p)))
  const D = (i: number, j: number): number => (dm[i - 1] as number[])[j - 1] as number
  const aCoef = (1 / d0) * (-D(1, 2) * (tau3 / tau) + D(2, 2) + D(3, 2) * (tau1 / tau))
  const bCoef = (1 / (6 * d0)) * (D(1, 2) * (tau3 * tau3 - tau * tau) * (tau3 / tau) + D(3, 2) * (tau * tau - tau1 * tau1) * (tau1 / tau))
  const e = dot(o2.site, o2.los)
  const r2s = dot(o2.site, o2.site)
  const polyA = -(aCoef * aCoef + 2 * aCoef * e + r2s)
  const polyB = -2 * mu * bCoef * (aCoef + e)
  const polyC = -(mu * mu) * bCoef * bCoef
  const roots = rangePolynomialRoots(polyA, polyB, polyC)
  if (roots.length === 0) throw new Error('the Gauss range polynomial has no positive real root')

  const solutions: GaussSolution[] = []
  for (const root of roots) {
    const r3c = root ** 3
    let rho1 = (1 / d0) * ((6 * (D(3, 1) * (tau1 / tau3) + D(2, 1) * (tau / tau3)) * r3c
      + mu * D(3, 1) * (tau * tau - tau1 * tau1) * (tau1 / tau3))
      / (6 * r3c + mu * (tau * tau - tau3 * tau3)) - D(1, 1))
    let rho2 = aCoef + (mu * bCoef) / r3c
    let rho3 = (1 / d0) * ((6 * (D(1, 3) * (tau3 / tau1) - D(2, 3) * (tau / tau1)) * r3c
      + mu * D(1, 3) * (tau * tau - tau3 * tau3) * (tau3 / tau1))
      / (6 * r3c + mu * (tau * tau - tau1 * tau1)) - D(3, 3))
    if (!(rho1 > 0 && rho2 > 0 && rho3 > 0)) continue
    let f1 = 1 - (mu * tau1 * tau1) / (2 * r3c)
    let f3 = 1 - (mu * tau3 * tau3) / (2 * r3c)
    let g1 = tau1 - (mu * tau1 ** 3) / (6 * r3c)
    let g3 = tau3 - (mu * tau3 ** 3) / (6 * r3c)
    let r1 = add(o1.site, scale(o1.los, rho1))
    let r2 = add(o2.site, scale(o2.los, rho2))
    let r3 = add(o3.site, scale(o3.los, rho3))
    let v2 = scale(sub(scale(r3, f1), scale(r1, f3)), 1 / (f1 * g3 - f3 * g1))
    let iterations = 0
    let converged = false
    for (; iterations < maxIterations; iterations++) {
      const r2n = norm(r2)
      const alpha = 2 / r2n - dot(v2, v2) / mu
      if (!(alpha > 0)) break
      const vr2 = dot(v2, r2) / r2n
      // Light-time correction: each observation saw the satellite ρ/c earlier.
      const t1c = tau1 - (rho1 - rho2) / C_LIGHT
      const t3c = tau3 - (rho3 - rho2) / C_LIGHT
      const chi1 = solveUniversal(r2n, vr2, alpha, t1c, mu)
      const chi3 = solveUniversal(r2n, vr2, alpha, t3c, mu)
      const ff1 = 1 - (chi1 * chi1 / r2n) * stumpffC(alpha * chi1 * chi1)
      const gg1 = t1c - (chi1 ** 3 * stumpffS(alpha * chi1 * chi1)) / Math.sqrt(mu)
      const ff3 = 1 - (chi3 * chi3 / r2n) * stumpffC(alpha * chi3 * chi3)
      const gg3 = t3c - (chi3 ** 3 * stumpffS(alpha * chi3 * chi3)) / Math.sqrt(mu)
      f1 = (f1 + ff1) / 2
      f3 = (f3 + ff3) / 2
      g1 = (g1 + gg1) / 2
      g3 = (g3 + gg3) / 2
      const den = f1 * g3 - f3 * g1
      const c1 = g3 / den
      const c3 = -g1 / den
      const n1 = (1 / d0) * (-D(1, 1) + D(2, 1) / c1 - (D(3, 1) * c3) / c1)
      const n2 = (1 / d0) * (-c1 * D(1, 2) + D(2, 2) - c3 * D(3, 2))
      const n3 = (1 / d0) * ((-D(1, 3) * c1) / c3 + D(2, 3) / c3 - D(3, 3))
      const change = Math.max(Math.abs(n1 - rho1) / n1, Math.abs(n2 - rho2) / n2, Math.abs(n3 - rho3) / n3)
      rho1 = n1
      rho2 = n2
      rho3 = n3
      r1 = add(o1.site, scale(o1.los, rho1))
      r2 = add(o2.site, scale(o2.los, rho2))
      r3 = add(o3.site, scale(o3.los, rho3))
      v2 = scale(sub(scale(r3, f1), scale(r1, f3)), 1 / den)
      if (change < tolerance) {
        converged = true
        iterations++
        break
      }
    }
    solutions.push({ state: { r: r2, v: v2 }, ranges: [rho1, rho2, rho3], polynomialRoot: root, iterations, converged })
  }
  if (solutions.length === 0) throw new Error('no Gauss root yields positive slant ranges')
  return [...solutions.filter(s => s.converged), ...solutions.filter(s => !s.converged)]
}
