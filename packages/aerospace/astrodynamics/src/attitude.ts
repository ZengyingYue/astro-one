/**
 * Static attitude determination from vector observations (Wahba's problem): TRIAD, Davenport's
 * q-method (the exact optimum), and Shuster's QUEST with sequential rotations near 180°, plus
 * the QUEST attitude-error covariance and quaternion/DCM/Euler conversions. Quaternions are
 * scalar-last [q1, q2, q3, q4] with A(q) mapping reference-frame vectors into the body frame.
 * @module @astro-one/astrodynamics/attitude
 */

import { cholInverse, cross, dot, mul3, norm, sub, symmetricEigen, unit } from './linalg.ts'
import type { Mat3, Matrix, Vec3 } from './types.ts'

/** One vector observation. */
export interface VectorObservation {
  /** Measured unit vector in the body frame. */
  readonly body: Vec3
  /** Known unit vector in the reference frame. */
  readonly reference: Vec3
  /** Measurement standard deviation, rad. */
  readonly sigma: number
}

/** Scalar-last attitude quaternion. */
export type Quaternion = readonly [number, number, number, number]

/** Attitude estimate. */
export interface AttitudeSolution {
  /** Reference → body quaternion, scalar last, q4 ≥ 0. */
  readonly quaternion: Quaternion
  /** Reference → body direction-cosine matrix. */
  readonly dcm: Mat3
  /** Wahba loss at the estimate (weights 1/σ² normalized to sum 1). */
  readonly loss: number
  /** One-sigma attitude errors about body x, y, z, rad (TRIAD reports the QUEST bound too). */
  readonly sigma: Vec3
}

function normalizedWeights(obs: readonly VectorObservation[]): number[] {
  const raw = obs.map(o => 1 / (o.sigma * o.sigma))
  const total = raw.reduce((a, b) => a + b, 0)
  return raw.map(w => w / total)
}

/**
 * Attitude matrix of a quaternion.
 * @param q - scalar-last quaternion.
 * @returns reference → body DCM.
 */
export function quaternionToDcm(q: Quaternion): Mat3 {
  const [x, y, z, w] = q
  return [
    [w * w + x * x - y * y - z * z, 2 * (x * y + z * w), 2 * (x * z - y * w)],
    [2 * (x * y - z * w), w * w - x * x + y * y - z * z, 2 * (y * z + x * w)],
    [2 * (x * z + y * w), 2 * (y * z - x * w), w * w - x * x - y * y + z * z],
  ]
}

/**
 * Quaternion of an attitude matrix (Shepperd's method).
 * @param a - reference → body DCM.
 * @returns scalar-last quaternion with q4 ≥ 0.
 */
export function dcmToQuaternion(a: Mat3): Quaternion {
  const tr = a[0][0] + a[1][1] + a[2][2]
  const candidates = [tr, a[0][0], a[1][1], a[2][2]]
  const k = candidates.indexOf(Math.max(...candidates))
  let q: [number, number, number, number]
  if (k === 0) {
    const w = Math.sqrt(1 + tr) / 2
    q = [(a[1][2] - a[2][1]) / (4 * w), (a[2][0] - a[0][2]) / (4 * w), (a[0][1] - a[1][0]) / (4 * w), w]
  } else if (k === 1) {
    const x = Math.sqrt(1 + 2 * a[0][0] - tr) / 2
    q = [x, (a[0][1] + a[1][0]) / (4 * x), (a[0][2] + a[2][0]) / (4 * x), (a[1][2] - a[2][1]) / (4 * x)]
  } else if (k === 2) {
    const y = Math.sqrt(1 + 2 * a[1][1] - tr) / 2
    q = [(a[0][1] + a[1][0]) / (4 * y), y, (a[1][2] + a[2][1]) / (4 * y), (a[2][0] - a[0][2]) / (4 * y)]
  } else {
    const z = Math.sqrt(1 + 2 * a[2][2] - tr) / 2
    q = [(a[0][2] + a[2][0]) / (4 * z), (a[1][2] + a[2][1]) / (4 * z), z, (a[0][1] - a[1][0]) / (4 * z)]
  }
  return canonical(q)
}

function canonical(q: readonly [number, number, number, number]): Quaternion {
  const n = Math.hypot(...q)
  const sign = q[3] < 0 ? -1 : 1
  return [(sign * q[0]) / n, (sign * q[1]) / n, (sign * q[2]) / n, (sign * q[3]) / n]
}

/**
 * Aerospace 3-2-1 (yaw, pitch, roll) Euler angles of an attitude matrix.
 * @param a - reference → body DCM.
 * @returns yaw, pitch, roll, rad.
 */
export function dcmToEuler321(a: Mat3): Vec3 {
  return [Math.atan2(a[0][1], a[0][0]), -Math.asin(Math.max(-1, Math.min(1, a[0][2]))), Math.atan2(a[1][2], a[2][2])]
}

function lossAt(dcm: Mat3, obs: readonly VectorObservation[], weights: readonly number[]): number {
  return obs.reduce((sum, o, i) => {
    const predicted: Vec3 = [dot(dcm[0], o.reference), dot(dcm[1], o.reference), dot(dcm[2], o.reference)]
    const d = sub(unit(o.body), predicted)
    return sum + ((weights[i] as number) * dot(d, d)) / 2
  }, 0)
}

/**
 * QUEST attitude-error covariance P = (Σ σᵢ⁻² (I − bᵢbᵢᵀ))⁻¹ about body axes.
 * @param obs - vector observations.
 * @returns one-sigma small-angle errors, rad.
 */
export function attitudeSigma(obs: readonly VectorObservation[]): Vec3 {
  const f: Matrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (const o of obs) {
    const b = unit(o.body)
    const w = 1 / (o.sigma * o.sigma)
    for (let i = 0; i < 3; i++) {
      const row = f[i] as number[]
      for (let j = 0; j < 3; j++) row[j] = (row[j] as number) + w * ((i === j ? 1 : 0) - (b[i] as number) * (b[j] as number))
    }
  }
  const p = cholInverse(f)
  const d = (i: number): number => Math.sqrt((p[i] as number[])[i] as number)
  return [d(0), d(1), d(2)]
}

function solution(q: Quaternion, obs: readonly VectorObservation[], weights: readonly number[]): AttitudeSolution {
  const dcm = quaternionToDcm(q)
  return { quaternion: q, dcm, loss: lossAt(dcm, obs, weights), sigma: attitudeSigma(obs) }
}

/**
 * TRIAD using the first observation as the exact anchor.
 * @param obs - at least two non-parallel observations; the first two are used.
 * @returns attitude estimate.
 */
export function triad(obs: readonly VectorObservation[]): AttitudeSolution {
  if (obs.length < 2) throw new Error('TRIAD needs two vector observations')
  const [o1, o2] = obs as [VectorObservation, VectorObservation]
  const frame = (a: Vec3, b: Vec3): [Vec3, Vec3, Vec3] => {
    const t1 = unit(a)
    const c = cross(a, b)
    if (norm(c) < 1e-12) throw new Error('TRIAD vectors are parallel')
    const t2 = unit(c)
    return [t1, t2, cross(t1, t2)]
  }
  const [b1, b2, b3] = frame(o1.body, o2.body)
  const [r1, r2, r3] = frame(o1.reference, o2.reference)
  // A = Σ bᵢ rᵢᵀ over the two orthonormal triads.
  const row = (i: 0 | 1 | 2): Vec3 => [
    b1[i] * r1[0] + b2[i] * r2[0] + b3[i] * r3[0],
    b1[i] * r1[1] + b2[i] * r2[1] + b3[i] * r3[1],
    b1[i] * r1[2] + b2[i] * r2[2] + b3[i] * r3[2],
  ]
  const dcm: Mat3 = [row(0), row(1), row(2)]
  return solution(dcmToQuaternion(dcm), obs, normalizedWeights(obs))
}

function profile(obs: readonly VectorObservation[], weights: readonly number[]): { b: number[][]; sigma: number; z: Vec3 } {
  const b = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  let z: Vec3 = [0, 0, 0]
  obs.forEach((o, k) => {
    const bb = unit(o.body)
    const rr = unit(o.reference)
    const w = weights[k] as number
    for (let i = 0; i < 3; i++) {
      const row = b[i] as number[]
      for (let j = 0; j < 3; j++) row[j] = (row[j] as number) + w * (bb[i] as number) * (rr[j] as number)
    }
    const c = cross(bb, rr)
    z = [z[0] + w * c[0], z[1] + w * c[1], z[2] + w * c[2]]
  })
  const sigma = ((b[0] as number[])[0] as number) + ((b[1] as number[])[1] as number) + ((b[2] as number[])[2] as number)
  return { b, sigma, z }
}

/**
 * Davenport's q-method: the eigenvector of the largest eigenvalue of K.
 * @param obs - two or more observations.
 * @returns optimal attitude estimate.
 */
export function qMethod(obs: readonly VectorObservation[]): AttitudeSolution {
  if (obs.length < 2) throw new Error('attitude determination needs at least two vector observations')
  const weights = normalizedWeights(obs)
  const { b, sigma, z } = profile(obs, weights)
  const s = (i: number, j: number): number => ((b[i] as number[])[j] as number) + ((b[j] as number[])[i] as number)
  const k: Matrix = [
    [s(0, 0) - sigma, s(0, 1), s(0, 2), z[0]],
    [s(1, 0), s(1, 1) - sigma, s(1, 2), z[1]],
    [s(2, 0), s(2, 1), s(2, 2) - sigma, z[2]],
    [z[0], z[1], z[2], sigma],
  ]
  const { vectors } = symmetricEigen(k)
  const first = (i: number): number => (vectors[i] as number[])[0] as number
  const q: [number, number, number, number] = [first(0), first(1), first(2), first(3)]
  return solution(canonical(q), obs, weights)
}

/**
 * Shuster's QUEST algorithm with the method of sequential rotations.
 * @param obs - two or more observations.
 * @returns attitude estimate (equal to the q-method optimum to rounding).
 */
export function quest(obs: readonly VectorObservation[]): AttitudeSolution {
  if (obs.length < 2) throw new Error('attitude determination needs at least two vector observations')
  const weights = normalizedWeights(obs)
  // Try the unrotated reference frame, then 180° rotations about x, y, z when near singular.
  const flips: ((v: Vec3) => Vec3)[] = [v => v, v => [v[0], -v[1], -v[2]], v => [-v[0], v[1], -v[2]], v => [-v[0], -v[1], v[2]]]
  for (let f = 0; f < flips.length; f++) {
    const flip = flips[f] as (v: Vec3) => Vec3
    const rotated = obs.map(o => ({ ...o, reference: flip(o.reference) }))
    const { b, sigma, z } = profile(rotated, weights)
    const sM = [0, 1, 2].map(i => [0, 1, 2].map(j => ((b[i] as number[])[j] as number) + ((b[j] as number[])[i] as number)))
    const lambda = questLambda(sM, sigma, z)
    const m = sM.map((row, i) => row.map((v, j) => (i === j ? lambda + sigma : 0) - v))
    const det = det3(m)
    if (Math.abs(det) < 1e-6) continue
    const p = solve3(m, z)
    const qr = canonical([p[0], p[1], p[2], 1])
    // Undo the frame flip: b = A′·F·r, so A = A′·F.
    const q = f === 0 ? qr : dcmToQuaternion(mul3(quaternionToDcm(qr), FLIPS[f - 1] as Mat3))
    return solution(q, obs, weights)
  }
  /* v8 ignore next -- four sequential rotations cannot all be singular for a unit attitude. */
  throw new Error('QUEST failed to find a non-singular frame')
}

/** 180° frame rotations about x, y, z matching the sequential-rotation flips. */
const FLIPS: readonly Mat3[] = [
  [[1, 0, 0], [0, -1, 0], [0, 0, -1]],
  [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
  [[-1, 0, 0], [0, -1, 0], [0, 0, 1]],
]

function questLambda(s: number[][], sigma: number, z: Vec3): number {
  const kappa = adjTrace(s)
  const delta = det3(s)
  const zz = dot(z, z)
  const sz = matVec3(s, z)
  const s2z = matVec3(s, sz)
  const a = sigma * sigma - kappa
  const bq = sigma * sigma + zz
  const c = delta + dot(z, sz)
  const d = dot(z, s2z)
  // Newton from λ₀ = Σw = 1; noise-free data make λmax a double root, so convergence may be
  // only linear and the loop is bounded rather than tolerance-terminated.
  let lambda = 1
  for (let i = 0; i < 60; i++) {
    const f = (lambda * lambda - a) * (lambda * lambda - bq) - c * lambda + c * sigma - d
    const fp = 2 * lambda * (2 * lambda * lambda - a - bq) - c
    lambda -= f / fp
  }
  return lambda
}

function matVec3(m: number[][], v: Vec3): Vec3 {
  return [dot(row3(m, 0), v), dot(row3(m, 1), v), dot(row3(m, 2), v)]
}

function row3(m: number[][], i: number): Vec3 {
  const r = m[i] as number[]
  return [r[0] as number, r[1] as number, r[2] as number]
}

function det3(m: number[][]): number {
  const [a, b, c] = [row3(m, 0), row3(m, 1), row3(m, 2)]
  return dot(a, cross(b, c))
}

function adjTrace(m: number[][]): number {
  const e = (i: number, j: number): number => (m[i] as number[])[j] as number
  return e(1, 1) * e(2, 2) - e(1, 2) * e(2, 1) + e(0, 0) * e(2, 2) - e(0, 2) * e(2, 0) + e(0, 0) * e(1, 1) - e(0, 1) * e(1, 0)
}

function solve3(m: number[][], v: Vec3): Vec3 {
  const [a, b, c] = [row3(m, 0), row3(m, 1), row3(m, 2)]
  const d = dot(a, cross(b, c))
  const cols: [Vec3, Vec3, Vec3] = [[a[0], b[0], c[0]], [a[1], b[1], c[1]], [a[2], b[2], c[2]]]
  const x = dot(v, cross(cols[1], cols[2])) / d
  const y = dot(cols[0], cross(v, cols[2])) / d
  const zc = dot(cols[0], cross(cols[1], v)) / d
  return [x, y, zc]
}
