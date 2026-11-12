/**
 * Lambert's problem by Izzo's algorithm (Celest. Mech. Dyn. Astr. 121, 2015): Householder
 * iterations on the Lancaster–Blanchard variable give every zero- and multi-revolution
 * solution, including the corrected initial guess from poliastro issue 1362.
 * @module @astro-one/astrodynamics/lambert
 */

import { MU_EARTH } from './constants.ts'
import { add, cross, norm, scale, sub, unit } from './linalg.ts'
import type { Vec3 } from './types.ts'

/** One Lambert arc. */
export interface LambertSolution {
  /** Complete revolutions before arrival. */
  readonly revolutions: number
  /** `low` or `high` energy branch for multi-revolution arcs; `single` for zero revolutions. */
  readonly branch: 'single' | 'low' | 'high'
  /** Departure velocity, km/s. */
  readonly v1: Vec3
  /** Arrival velocity, km/s. */
  readonly v2: Vec3
}

/** Options for {@link solveLambert}. */
export interface LambertOptions {
  /** Gravitational parameter, km³/s². */
  readonly mu?: number
  /** Travel in the direction of positive angular momentum about +z. */
  readonly prograde?: boolean
  /** Largest revolution count to return. */
  readonly maxRevolutions?: number
}

/**
 * Solve Lambert's problem.
 * @param r1 - departure position, km.
 * @param r2 - arrival position, km.
 * @param tof - time of flight, s (positive).
 * @param options - gravitational parameter, direction, and revolution limit.
 * @returns every feasible arc up to the revolution limit.
 * @throws When the geometry is degenerate or the time of flight is not positive.
 */
export function solveLambert(r1: Vec3, r2: Vec3, tof: number, options: LambertOptions = {}): LambertSolution[] {
  const mu = options.mu ?? MU_EARTH
  const prograde = options.prograde ?? true
  const maxRev = options.maxRevolutions ?? 0
  if (!(tof > 0)) throw new Error('time of flight must be positive')
  const c = sub(r2, r1)
  const cn = norm(c)
  const r1n = norm(r1)
  const r2n = norm(r2)
  const s = (r1n + r2n + cn) / 2
  const ir1 = unit(r1)
  const ir2 = unit(r2)
  const hRaw = cross(ir1, ir2)
  if (norm(hRaw) < 1e-12) throw new Error('departure and arrival positions are collinear; the transfer plane is undefined')
  let ih = unit(hRaw)
  let ll = Math.sqrt(Math.max(0, 1 - Math.min(1, cn / s)))
  if (ih[2] < 0) {
    ll = -ll
    ih = scale(ih, -1)
  }
  let it1 = cross(ih, ir1)
  let it2 = cross(ih, ir2)
  if (!prograde) {
    ll = -ll
    it1 = scale(it1, -1)
    it2 = scale(it2, -1)
  }
  const T = Math.sqrt((2 * mu) / (s * s * s)) * tof
  const gamma = Math.sqrt((mu * s) / 2)
  const rho = (r1n - r2n) / cn
  const sigma = Math.sqrt(1 - rho * rho)
  const out: LambertSolution[] = []
  const xs = findXY(ll, T, maxRev)
  for (const { x, m, branch } of xs) {
    const y = computeY(x, ll)
    const vr1 = (gamma * ((ll * y - x) - rho * (ll * y + x))) / r1n
    const vr2 = (-gamma * ((ll * y - x) + rho * (ll * y + x))) / r2n
    const vt1 = (gamma * sigma * (y + ll * x)) / r1n
    const vt2 = (gamma * sigma * (y + ll * x)) / r2n
    out.push({
      revolutions: m,
      branch,
      v1: add(scale(ir1, vr1), scale(it1, vt1)),
      v2: add(scale(ir2, vr2), scale(it2, vt2)),
    })
  }
  return out
}

function computeY(x: number, ll: number): number {
  return Math.sqrt(1 - ll * ll * (1 - x * x))
}

function computePsi(x: number, y: number, ll: number): number {
  if (x >= -1 && x < 1) return Math.acos(Math.max(-1, Math.min(1, x * y + ll * (1 - x * x))))
  return Math.asinh((y - x * ll) * Math.sqrt(x * x - 1))
}

/** Gauss hypergeometric 2F1(3, 1; 5/2; x) by its power series (|x| < 1). */
function hyp2f1b(x: number): number {
  let res = 1
  let term = 1
  for (let i = 0; i < 1000; i++) {
    term = (term * (3 + i) * (1 + i)) / (2.5 + i) * x / (i + 1)
    const next = res + term
    if (next === res) return next
    res = next
  }
  /* v8 ignore next -- the near-parabolic window keeps the series argument below 0.5, so it converges long before the bound. */
  return res
}

function tofEquationY(x: number, y: number, t0: number, ll: number, m: number): number {
  let t: number
  if (m === 0 && x > Math.sqrt(0.6) && x < Math.sqrt(1.4)) {
    const eta = y - ll * x
    const s1 = (1 - ll - x * eta) * 0.5
    const q = (4 / 3) * hyp2f1b(s1)
    t = (eta * eta * eta * q + 4 * ll * eta) * 0.5
  } else {
    const psi = computePsi(x, y, ll)
    t = ((psi + m * Math.PI) / Math.sqrt(Math.abs(1 - x * x)) - x + ll * y) / (1 - x * x)
  }
  return t - t0
}

function tofDerivatives(x: number, y: number, t: number, ll: number): [number, number, number] {
  const d1 = (3 * t * x - 2 + (2 * ll ** 3 * x) / y) / (1 - x * x)
  const d2 = (3 * t + 5 * x * d1 + (2 * (1 - ll * ll) * ll ** 3) / y ** 3) / (1 - x * x)
  const d3 = (7 * x * d2 + 8 * d1 - (6 * (1 - ll * ll) * ll ** 5 * x) / y ** 5) / (1 - x * x)
  return [d1, d2, d3]
}

function minimumTof(ll: number, m: number): number {
  let x = 0.1
  for (let i = 0; i < 50; i++) {
    const y = computeY(x, ll)
    const t = tofEquationY(x, y, 0, ll, m)
    const [d1, d2, d3] = tofDerivatives(x, y, t, ll)
    const next = x - (2 * d1 * d2) / (2 * d2 * d2 - d1 * d3)
    const done = Math.abs(next - x) < 1e-13
    x = next
    if (done) break
  }
  return tofEquationY(x, computeY(x, ll), 0, ll, m)
}

function initialGuess(T: number, ll: number, m: number, lowPath: boolean): number {
  if (m === 0) {
    const t0 = Math.acos(ll) + ll * Math.sqrt(1 - ll * ll)
    const t1 = (2 * (1 - ll ** 3)) / 3
    if (T >= t0) return (t0 / T) ** (2 / 3) - 1
    if (T < t1) return (5 / 2) * (t1 / T) * (t1 - T) / (1 - ll ** 5) + 1
    return Math.exp((Math.log(2) * Math.log(T / t0)) / Math.log(t1 / t0)) - 1
  }
  const kl = ((m * Math.PI + Math.PI) / (8 * T)) ** (2 / 3)
  const kr = ((8 * T) / (m * Math.PI)) ** (2 / 3)
  const xl = (kl - 1) / (kl + 1)
  const xr = (kr - 1) / (kr + 1)
  return lowPath ? Math.max(xl, xr) : Math.min(xl, xr)
}

function householder(x0: number, T: number, ll: number, m: number): number {
  let x = x0
  for (let i = 0; i < 100; i++) {
    const y = computeY(x, ll)
    const f = tofEquationY(x, y, T, ll, m)
    const [d1, d2, d3] = tofDerivatives(x, y, f + T, ll)
    const next = x - f * ((d1 * d1 - (f * d2) / 2) / (d1 * (d1 * d1 - f * d2) + (d3 * f * f) / 6))
    if (Math.abs(next - x) < 1e-12) return next
    x = next
  }
  throw new Error('Lambert solver did not converge')
}

function findXY(ll: number, T: number, maxRev: number): { x: number; m: number; branch: LambertSolution['branch'] }[] {
  const results: { x: number; m: number; branch: LambertSolution['branch'] }[] = [
    { x: householder(initialGuess(T, ll, 0, true), T, ll, 0), m: 0, branch: 'single' },
  ]
  let mMax = Math.min(maxRev, Math.floor(T / Math.PI))
  const t00 = Math.acos(ll) + ll * Math.sqrt(1 - ll * ll)
  if (mMax > 0 && T < t00 + mMax * Math.PI && T < minimumTof(ll, mMax)) mMax -= 1
  for (let m = 1; m <= mMax; m++) {
    results.push({ x: householder(initialGuess(T, ll, m, true), T, ll, m), m, branch: 'low' })
    results.push({ x: householder(initialGuess(T, ll, m, false), T, ll, m), m, branch: 'high' })
  }
  return results
}
