import { describe, expect, it } from 'vitest'
import { C_LIGHT, DEG } from '../src/constants.ts'
import { siteGcrf } from '../src/frames.ts'
import { gaussAnglesOnly, gibbs, herrickGibbs, rangePolynomialRoots } from '../src/iod.ts'
import type { AnglesObservation } from '../src/iod.ts'
import { elementsToState, propagateKepler } from '../src/kepler.ts'
import { add, norm, scale, sub, unit } from '../src/linalg.ts'
import { observationSize, observedValues, predictObservation, residuals } from '../src/measurements.ts'
import type { Observation } from '../src/measurements.ts'
import { batchLeastSquares, unscentedKalmanFilter } from '../src/od.ts'
import type { Propagator } from '../src/od.ts'
import { propagateTwoBody } from '../src/propagate.ts'
import type { Geodetic, StateVector, TimedState, Vec3 } from '../src/types.ts'

const EPOCH = Date.UTC(2024, 2, 1, 6)
const TRUTH: TimedState = {
  t: EPOCH,
  ...elementsToState({ p: 6900, e: 0.001, i: 51.6 * DEG, raan: 40 * DEG, argp: 10 * DEG, nu: 20 * DEG }),
}
const SITES: Geodetic[] = [
  { lat: 40 * DEG, lon: -105 * DEG, h: 1.6 },
  { lat: -30 * DEG, lon: 20 * DEG, h: 0.5 },
  { lat: 60 * DEG, lon: 150 * DEG, h: 0.1 },
]

function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(next: () => number): number {
  return Math.sqrt(-2 * Math.log(next() + 1e-12)) * Math.cos(2 * Math.PI * next())
}

const twoBody: Propagator = (initial, times) => propagateTwoBody(initial, times)

function simulate(noise: boolean): Observation[] {
  const next = rng(7)
  const obs: Observation[] = []
  for (let k = 0; k < 40; k++) {
    const t = EPOCH + k * 90e3
    const state = propagateTwoBody(TRUTH, [t])[0] as TimedState
    const site = SITES[k % 3] as Geodetic
    const kinds = ['range', 'azel', 'radec', 'range-rate', 'position'] as const
    const kind = kinds[k % kinds.length] as (typeof kinds)[number]
    const sigma = { range: 0.01, azel: 1e-4, radec: 5e-5, 'range-rate': 1e-5, position: 0.05 }[kind]
    const base = { t, sigma } as const
    const draft: Observation = kind === 'position'
      ? { kind, ...base, value: [0, 0, 0] }
      : kind === 'range' || kind === 'range-rate'
        ? { kind, ...base, site, value: 0 }
        : { kind, ...base, site, value: [0, 0] }
    const perfect = predictObservation(draft, state).map(v => v + (noise ? sigma * gaussian(next) : 0))
    obs.push(kind === 'position'
      ? { kind, ...base, value: [perfect[0] as number, perfect[1] as number, perfect[2] as number] }
      : kind === 'range' || kind === 'range-rate'
        ? { kind, ...base, site, value: perfect[0] as number }
        : { kind, ...base, site, value: [perfect[0] as number, perfect[1] as number] })
  }
  return obs
}

const BATCH = { maxIterations: 15, tolerance: 1e-10, editSigma: 5, perturbation: { position: 1e-3, velocity: 1e-6 } }
const OFFSET: TimedState = { t: EPOCH, r: add(TRUTH.r, [2, -1, 0.5]), v: add(TRUTH.v, [0.002, 0.001, -0.001]) }

describe('three-position initial orbit determination', () => {
  it('solves Curtis Example 5.1 with Gibbs', () => {
    const out = gibbs([-294.32, 4265.1, 5986.7], [-1365.5, 3637.6, 6346.8], [-2940.3, 2473.7, 6555.8])
    expect(norm(sub(out.v2, [-6.2174, -4.0122, 1.599]))).toBeLessThan(2e-4)
    expect(out.coplanarity).toBeLessThan(0.01)
    expect(out.separations[0]).toBeGreaterThan(0)
    expect(() => gibbs([1, 0, 0], [2, 0, 0], [3, 0, 0])).toThrow('non-collinear')
  })

  it('recovers velocity from closely spaced positions with Herrick–Gibbs', () => {
    const [a, b, c] = [-60, 0, 60].map(dt => propagateKepler(TRUTH, dt).r) as [Vec3, Vec3, Vec3]
    const out = herrickGibbs(a, b, c, [-60, 0, 60])
    expect(norm(sub(out.v2, TRUTH.v))).toBeLessThan(1e-5)
    expect(() => herrickGibbs(a, b, c, [0, 0, 60])).toThrow('strictly increasing')
  })
})

describe('Gauss angles-only method', () => {
  const site = SITES[0] as Geodetic
  type Triple = [AnglesObservation, AnglesObservation, AnglesObservation]
  function anglesObs(times: readonly [number, number, number], truth: StateVector = TRUTH): Triple {
    const one = (dt: number): AnglesObservation => {
      const t = EPOCH + dt * 1000
      const s = siteGcrf(site, t).r
      // Emission time precedes reception by the light time.
      let rho = 0
      let sat: Vec3 = truth.r
      for (let i = 0; i < 3; i++) {
        sat = propagateKepler(truth, dt - rho / C_LIGHT).r
        rho = norm(sub(sat, s))
      }
      return { t: dt, los: unit(sub(sat, s)), site: s }
    }
    return [one(times[0]), one(times[1]), one(times[2])]
  }

  it('recovers the orbit from three lines of sight', () => {
    const [best] = gaussAnglesOnly(anglesObs([-300, 0, 300]))
    expect(best!.converged).toBe(true)
    const truthAtEmission = propagateKepler(TRUTH, -best!.ranges[1] / C_LIGHT)
    expect(norm(sub(best!.state.r, truthAtEmission.r))).toBeLessThan(0.05)
    expect(norm(sub(best!.state.v, truthAtEmission.v))).toBeLessThan(5e-5)
    expect(best!.polynomialRoot).toBeGreaterThan(6378)
  })

  it('stops refining a hyperbolic trial orbit and reports the limit', () => {
    const escape: StateVector = { r: TRUTH.r, v: scale(TRUTH.v, 1.6) }
    const solutions = gaussAnglesOnly(anglesObs([-120, 0, 120], escape), { maxIterations: 3 })
    expect(solutions.length).toBeGreaterThan(0)
    const capped = gaussAnglesOnly(anglesObs([-300, 0, 300]), { maxIterations: 1, tolerance: 0 })
    expect(capped[0]!.converged).toBe(false)
    expect(capped[0]!.iterations).toBe(1)
  })

  it('rejects unordered, coplanar, and rootless geometry', () => {
    const obs = anglesObs([-300, 0, 300])
    expect(() => gaussAnglesOnly([obs[1], obs[0], obs[2]])).toThrow('increasing time order')
    const flat: AnglesObservation = { ...obs[2], los: obs[0].los }
    expect(() => gaussAnglesOnly([obs[0], obs[1], flat])).toThrow('coplanar')
    const origin: Vec3 = [0, 0, 0]
    const geocentric = (o: AnglesObservation): AnglesObservation => ({ ...o, site: origin })
    expect(() => gaussAnglesOnly([geocentric(obs[0]), geocentric(obs[1]), geocentric(obs[2])])).toThrow('no positive real root')
    const reversed = (o: AnglesObservation): AnglesObservation => ({ ...o, los: scale(o.los, -1) })
    expect(() => gaussAnglesOnly([reversed(obs[0]), reversed(obs[1]), reversed(obs[2])])).toThrow('positive slant ranges')
  })

  it('finds every positive root of the range polynomial', () => {
    expect(rangePolynomialRoots(0, 0, -1e16)).toEqual([100])
    expect(rangePolynomialRoots(0, 0, 1)).toEqual([])
    const [root] = rangePolynomialRoots(-5e7, 0, -1e20)
    expect(root! ** 8 - 5e7 * root! ** 6 - 1e20).toBeCloseTo(0, -18)
  })
})

describe('measurement models', () => {
  it('describes sizes, values, and wrapped residuals', () => {
    const site = SITES[0] as Geodetic
    expect(observationSize({ kind: 'position', t: 0, value: [1, 2, 3], sigma: 1 })).toBe(3)
    expect(observationSize({ kind: 'range-rate', t: 0, site, value: 1, sigma: 1 })).toBe(1)
    expect(observationSize({ kind: 'radec', t: 0, site, value: [1, 2], sigma: 1 })).toBe(2)
    expect(observedValues({ kind: 'range', t: 0, site, value: 5, sigma: 1 })).toEqual([5])
    const wrapped = residuals({ kind: 'azel', t: 0, site, value: [0.01, 0.2], sigma: 1 }, [2 * Math.PI - 0.01, 0.1])
    expect(wrapped[0]).toBeCloseTo(0.02, 12)
    expect(wrapped[1]).toBeCloseTo(0.1, 12)
    expect(residuals({ kind: 'range', t: 0, site, value: 10, sigma: 1 }, [7])).toEqual([3])
  })
})

describe('batch least squares', () => {
  it('converges to the truth from a perturbed guess with mixed tracking data', () => {
    const obs = simulate(true)
    const out = batchLeastSquares(OFFSET, obs, twoBody, BATCH)
    expect(out.converged).toBe(true)
    expect(norm(sub(out.state.r, TRUTH.r))).toBeLessThan(0.05)
    expect(norm(sub(out.state.v, TRUTH.v))).toBeLessThan(5e-5)
    expect(out.rms).toBeGreaterThan(0.3)
    expect(out.rms).toBeLessThan(2)
    expect(out.covariance[0]![0]).toBeGreaterThan(0)
    expect(out.residuals).toHaveLength(obs.length)
  })

  it('edits a gross outlier', () => {
    const obs = simulate(true)
    const bad = obs[0] as Extract<Observation, { kind: 'range' }>
    obs[0] = { ...bad, value: bad.value + 5 }
    const out = batchLeastSquares(OFFSET, obs, twoBody, BATCH)
    expect(out.residuals[0]!.rejected).toBe(true)
    expect(out.residuals.filter(r => r.rejected)).toHaveLength(1)
    const noEdit = batchLeastSquares(OFFSET, obs, twoBody, { ...BATCH, editSigma: Infinity })
    expect(noEdit.residuals.some(r => r.rejected)).toBe(false)
  })

  it('reports the iteration cap and a stalled solution', () => {
    const obs = simulate(true)
    const capped = batchLeastSquares(OFFSET, obs, twoBody, { ...BATCH, maxIterations: 1 })
    expect(capped.converged).toBe(false)
    expect(capped.iterations).toBe(1)
    let calls = 0
    const stalling: Propagator = (initial, times) => {
      calls++
      // Evaluations after the first partial-derivative sweep diverge, so no damped step is accepted.
      return calls > 13 ? times.map(t => ({ t, r: [1e6, 0, 0], v: [0, 0, 0] })) : twoBody(initial, times)
    }
    const stalled = batchLeastSquares(OFFSET, obs, stalling, BATCH)
    expect(stalled.converged).toBe(true)
    expect(stalled.iterations).toBe(1)
  })

  it('refuses under-determined problems', () => {
    const [first] = simulate(false)
    expect(() => batchLeastSquares(OFFSET, [first as Observation], twoBody, BATCH)).toThrow('at least 6 are required')
  })
})

describe('unscented Kalman filter', () => {
  it('tracks the truth through mixed tracking data', () => {
    const obs = simulate(true)
    const p0 = [0, 1, 2, 3, 4, 5].map(i => [0, 1, 2, 3, 4, 5].map(j => (i === j ? (i < 3 ? 4 : 1e-5) : 0)))
    const withRepeat = [{ ...obs[0] as Observation }, ...obs]
    const out = unscentedKalmanFilter(OFFSET, p0, withRepeat, twoBody, { processNoise: 1e-9, alpha: 1e-3, beta: 2, kappa: 0 })
    const last = obs.at(-1) as Observation
    const truth = propagateTwoBody(TRUTH, [last.t])[0] as TimedState
    expect(out.state.t).toBe(last.t)
    expect(norm(sub(out.state.r, truth.r))).toBeLessThan(0.1)
    expect(out.steps).toHaveLength(withRepeat.length)
    expect(Math.abs(out.steps.at(-1)!.normalized[0] as number)).toBeLessThan(5)
    expect(out.covariance[0]![0]).toBeLessThan(4)
  })
})
