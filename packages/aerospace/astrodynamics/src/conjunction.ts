/**
 * Conjunction assessment: time-of-closest-approach search between two trajectories, the
 * encounter-plane (B-plane) geometry, and short-encounter collision probability by numerical
 * integration of the projected combined Gaussian over the hard-body disk (Foster 1992 / NASA
 * CARA 2D Pc), with Alfano's maximum probability for unknown covariance scale.
 * @module @astro-one/astrodynamics/conjunction
 */

import { apply3, cross, dot, mul3, norm, sub, transpose3, unit } from './linalg.ts'
import { rtnMatrix } from './frames.ts'
import type { Mat3, StateVector, UtcMs, Vec3 } from './types.ts'

/** State function of time for one object, inertial frame. */
export type Trajectory = (t: UtcMs) => StateVector

/** One local minimum of the separation. */
export interface CloseApproach {
  /** Time of closest approach. */
  readonly tca: UtcMs
  /** Miss distance, km. */
  readonly missDistance: number
  /** Relative speed, km/s. */
  readonly relativeSpeed: number
  /** Secondary-relative-to-primary position at TCA, km. */
  readonly relativePosition: Vec3
  /** Secondary-relative-to-primary velocity at TCA, km/s. */
  readonly relativeVelocity: Vec3
  /** Relative position in the primary's radial/transverse/normal frame, km. */
  readonly rtn: Vec3
}

/**
 * Find separation minima below a screening distance.
 * @param primary - first object's trajectory.
 * @param secondary - second object's trajectory.
 * @param start - window start.
 * @param end - window end.
 * @param stepMs - sampling step; must be short relative to the encounter duration.
 * @param screenKm - report minima closer than this distance.
 * @returns close approaches in time order.
 */
export function findCloseApproaches(
  primary: Trajectory, secondary: Trajectory, start: UtcMs, end: UtcMs, stepMs: number, screenKm: number,
): CloseApproach[] {
  // d/dt |Δr|² = 2 Δr·Δv changes sign from − to + at a minimum.
  const rate = (t: UtcMs): number => {
    const a = primary(t)
    const b = secondary(t)
    return dot(sub(b.r, a.r), sub(b.v, a.v))
  }
  const out: CloseApproach[] = []
  let t0 = start
  let f0 = rate(t0)
  while (t0 < end) {
    const t1 = Math.min(end, t0 + stepMs)
    const f1 = rate(t1)
    if (f0 < 0 && f1 >= 0) {
      let lo = t0
      let hi = t1
      for (let i = 0; i < 60 && hi - lo > 1e-3; i++) {
        const mid = (lo + hi) / 2
        if (rate(mid) < 0) lo = mid
        else hi = mid
      }
      const approach = describe(primary, secondary, (lo + hi) / 2)
      if (approach.missDistance <= screenKm) out.push(approach)
    }
    t0 = t1
    f0 = f1
  }
  return out
}

function describe(primary: Trajectory, secondary: Trajectory, tca: UtcMs): CloseApproach {
  const a = primary(tca)
  const b = secondary(tca)
  const dr = sub(b.r, a.r)
  const dv = sub(b.v, a.v)
  return {
    tca,
    missDistance: norm(dr),
    relativeSpeed: norm(dv),
    relativePosition: dr,
    relativeVelocity: dv,
    rtn: apply3(rtnMatrix(a), dr),
  }
}

/**
 * Rotate an RTN position covariance into the inertial frame.
 * @param state - object state defining the RTN axes.
 * @param rtnCovariance - 3×3 position covariance in RTN, km².
 * @returns 3×3 inertial covariance, km².
 */
export function rtnToInertialCovariance(state: StateVector, rtnCovariance: Mat3): Mat3 {
  const m = transpose3(rtnMatrix(state))
  return mul3(mul3(m, rtnCovariance), transpose3(m))
}

/** Encounter-plane probability result. */
export interface CollisionProbability {
  /** Probability of collision for the given covariance. */
  readonly pc: number
  /** Alfano maximum probability over covariance scale (small-radius form), or 1 when the disk covers the miss point. */
  readonly pcMax: number
  /** Projected combined covariance in the encounter plane (x along the miss vector), km². */
  readonly encounterCovariance: readonly [readonly [number, number], readonly [number, number]]
  /** Miss distance, km. */
  readonly missDistance: number
}

/**
 * Short-encounter (2D) collision probability.
 * @param relativePosition - secondary minus primary position at TCA, km.
 * @param relativeVelocity - secondary minus primary velocity at TCA, km/s.
 * @param combinedCovariance - sum of both objects' inertial position covariances, km².
 * @param hardBodyRadius - combined hard-body radius, km.
 * @returns probability and encounter-plane quantities.
 */
export function collisionProbability2D(
  relativePosition: Vec3, relativeVelocity: Vec3, combinedCovariance: Mat3, hardBodyRadius: number,
): CollisionProbability {
  const z = unit(relativeVelocity)
  const miss = sub(relativePosition, scaleV(z, dot(relativePosition, z)))
  const missDistance = norm(miss)
  const x = missDistance > 0 ? unit(miss) : unit(anyPerpendicular(z))
  const y = cross(z, x)
  const project = (a: Vec3, b: Vec3): number => dot(a, apply3(combinedCovariance, b))
  const cxx = project(x, x)
  const cxy = project(x, y)
  const cyy = project(y, y)
  const det = cxx * cyy - cxy * cxy
  if (!(det > 0)) throw new Error('projected covariance is not positive definite')
  const ixx = cyy / det
  const ixy = -cxy / det
  const iyy = cxx / det
  const norm2 = 1 / (2 * Math.PI * Math.sqrt(det))
  // Polar Gauss–Legendre (radius) × trapezoid (angle, spectrally accurate for periodic integrands).
  let pc = 0
  const nTheta = 128
  for (let a = 0; a < nTheta; a++) {
    const theta = (2 * Math.PI * a) / nTheta
    const c = Math.cos(theta)
    const s = Math.sin(theta)
    for (let k = 0; k < GL_NODES.length; k++) {
      const rho = (hardBodyRadius / 2) * ((GL_NODES[k] as number) + 1)
      const px = missDistance + rho * c
      const py = rho * s
      const q = ixx * px * px + 2 * ixy * px * py + iyy * py * py
      pc += (GL_WEIGHTS[k] as number) * (hardBodyRadius / 2) * rho * Math.exp(-q / 2)
    }
  }
  pc *= norm2 * ((2 * Math.PI) / nTheta)
  const pcMax = missDistance <= hardBodyRadius ? 1 : (hardBodyRadius * hardBodyRadius) / (Math.E * missDistance * missDistance)
  return { pc: Math.min(1, pc), pcMax: Math.min(1, pcMax), encounterCovariance: [[cxx, cxy], [cxy, cyy]], missDistance }
}

function scaleV(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k]
}

function anyPerpendicular(z: Vec3): Vec3 {
  return Math.abs(z[0]) < 0.9 ? cross(z, [1, 0, 0]) : cross(z, [0, 1, 0])
}

/** 32-point Gauss–Legendre nodes on [−1, 1], generated once by Newton iteration. */
const { nodes: GL_NODES, weights: GL_WEIGHTS } = gaussLegendre(32)

/**
 * Gauss–Legendre quadrature nodes and weights.
 * @param n - point count.
 * @returns nodes and weights on [−1, 1].
 */
export function gaussLegendre(n: number): { nodes: number[]; weights: number[] } {
  const nodes: number[] = []
  const weights: number[] = []
  for (let i = 1; i <= n; i++) {
    let x = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5))
    let dp = 0
    for (let iter = 0; iter < 100; iter++) {
      let p0 = 1
      let p1 = x
      for (let k = 2; k <= n; k++) {
        const pk = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k
        p0 = p1
        p1 = pk
      }
      dp = (n * (x * p1 - p0)) / (x * x - 1)
      const dx = p1 / dp
      x -= dx
      if (Math.abs(dx) < 1e-15) break
    }
    nodes.push(x)
    weights.push(2 / ((1 - x * x) * dp * dp))
  }
  return { nodes, weights }
}
