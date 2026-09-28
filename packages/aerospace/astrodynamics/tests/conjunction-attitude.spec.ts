import { describe, expect, it } from 'vitest'
import { DEG } from '../src/constants.ts'
import {
  attitudeSigma, dcmToEuler321, dcmToQuaternion, qMethod, quaternionToDcm, quest, triad,
} from '../src/attitude.ts'
import type { VectorObservation } from '../src/attitude.ts'
import { collisionProbability2D, findCloseApproaches, gaussLegendre, rtnToInertialCovariance } from '../src/conjunction.ts'
import { temeToGcrf } from '../src/frames.ts'
import { propagateKepler } from '../src/kepler.ts'
import { apply3, mul3, norm, rot1, rot2, rot3, sub, transpose3, unit } from '../src/linalg.ts'
import { findPasses } from '../src/passes.ts'
import { parseOmm, propagateSgp4 } from '../src/sgp4.ts'
import type { Mat3, StateVector, Vec3 } from '../src/types.ts'

describe('conjunction screening', () => {
  const tca = Date.UTC(2025, 5, 1, 12)
  const primaryAtTca: StateVector = { r: [7000, 0, 0], v: [0, 7.546, 0] }
  const secondaryAtTca: StateVector = {
    r: [7000, 0.05, 0.2],
    v: apply3(rot2(0), [0, 7.546 * Math.cos(10 * DEG), 7.546 * Math.sin(10 * DEG)]),
  }
  const primary = (t: number): StateVector => propagateKepler(primaryAtTca, (t - tca) / 1000)
  const secondary = (t: number): StateVector => propagateKepler(secondaryAtTca, (t - tca) / 1000)

  it('finds the time of closest approach and its geometry', () => {
    const found = findCloseApproaches(primary, secondary, tca - 1800e3, tca + 1800e3, 30e3, 5)
    const best = found.reduce((a, b) => (a.missDistance < b.missDistance ? a : b))
    // Linear relative motion puts the true minimum at −(Δr·Δv)/|Δv|² from the constructed epoch.
    const dr = sub(secondaryAtTca.r, primaryAtTca.r)
    const dv = sub(secondaryAtTca.v, primaryAtTca.v)
    const expectedTca = tca - (1000 * (dr[0] * dv[0] + dr[1] * dv[1] + dr[2] * dv[2])) / (norm(dv) ** 2)
    expect(Math.abs(best.tca - expectedTca)).toBeLessThan(5)
    expect(best.missDistance).toBeLessThan(0.21)
    expect(best.relativeSpeed).toBeCloseTo(2 * 7.546 * Math.sin(5 * DEG), 2)
    expect(best.rtn[2]).toBeCloseTo(best.relativePosition[2], 6)
    expect(findCloseApproaches(primary, secondary, tca - 1800e3, tca + 1800e3, 30e3, 0.01)).toHaveLength(0)
  })

  it('integrates the 2D collision probability', () => {
    const sigma = 0.1
    const iso: Mat3 = [[sigma ** 2, 0, 0], [0, sigma ** 2, 0], [0, 0, sigma ** 2]]
    const centered = collisionProbability2D([0, 0, 0], [0, 0, 1], iso, 0.01)
    expect(centered.pc).toBeCloseTo(1 - Math.exp(-(0.01 ** 2) / (2 * sigma ** 2)), 10)
    expect(centered.pcMax).toBe(1)
    const tilted = collisionProbability2D([0, 0, 0], [0.95, 0.1, 0.1], iso, 0.01)
    expect(tilted.pc).toBeCloseTo(centered.pc, 10)
    // Anisotropic, offset case against a brute-force grid in the encounter plane.
    const cov: Mat3 = [[0.04, 0.01, 0], [0.01, 0.09, 0], [0, 0, 0.5]]
    const offset = collisionProbability2D([0.3, 0.1, 0], [0, 0, 7], cov, 0.05)
    const [[cxx, cxy], [, cyy]] = offset.encounterCovariance
    const det = cxx * cyy - cxy * cxy
    let brute = 0
    const n = 400
    const h = (2 * 0.05) / n
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const dx = -0.05 + (i + 0.5) * h
        const dy = -0.05 + (j + 0.5) * h
        if (dx * dx + dy * dy > 0.05 ** 2) continue
        const x = offset.missDistance + dx
        const q = (cyy * x * x - 2 * cxy * x * dy + cxx * dy * dy) / det
        brute += Math.exp(-q / 2) * h * h
      }
    }
    brute /= 2 * Math.PI * Math.sqrt(det)
    expect(offset.pc / brute).toBeCloseTo(1, 2)
    expect(offset.pcMax).toBeCloseTo(0.05 ** 2 / (Math.E * offset.missDistance ** 2), 12)
    expect(() => collisionProbability2D([1, 0, 0], [0, 0, 1], [[0, 0, 0], [0, 0, 0], [0, 0, 0]], 0.01)).toThrow('positive definite')
  })

  it('rotates RTN covariance into the inertial frame', () => {
    const state: StateVector = { r: [0, 7000, 0], v: [-7.5, 0, 0] }
    const c = rtnToInertialCovariance(state, [[1, 0, 0], [0, 4, 0], [0, 0, 9]])
    expect(c[1][1]).toBeCloseTo(1, 12)
    expect(c[0][0]).toBeCloseTo(4, 12)
    expect(c[2][2]).toBeCloseTo(9, 12)
  })

  it('generates Gauss–Legendre rules', () => {
    const { nodes, weights } = gaussLegendre(5)
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(2, 14)
    expect(nodes.reduce((s, x, i) => s + (weights[i] as number) * x ** 8, 0)).toBeCloseTo(2 / 9, 13)
  })
})

describe('ground-station passes', () => {
  const iss = parseOmm({
    OBJECT_NAME: 'ISS', OBJECT_ID: '1998-067A', EPOCH: '2025-03-01T00:00:00.000000', MEAN_MOTION: 15.49,
    ECCENTRICITY: 0.0006, INCLINATION: 51.64, RA_OF_ASC_NODE: 120, ARG_OF_PERICENTER: 80, MEAN_ANOMALY: 280,
    EPHEMERIS_TYPE: 0, CLASSIFICATION_TYPE: 'U', NORAD_CAT_ID: 25544, ELEMENT_SET_NO: 999, REV_AT_EPOCH: 1,
    BSTAR: 0.0002, MEAN_MOTION_DOT: 0.0001, MEAN_MOTION_DDOT: 0,
  })
  const trajectory = (t: number): StateVector => temeToGcrf(propagateSgp4(iss, [t])[0] as StateVector, t)
  const site = { lat: 39.9 * DEG, lon: 116.4 * DEG, h: 0.05 }

  it('finds rise, culmination, and set above the mask', () => {
    const start = iss.epoch
    const passes = findPasses(trajectory, site, start, start + 86400e3, 10 * DEG, 60e3)
    expect(passes.length).toBeGreaterThan(2)
    for (const p of passes.filter(q => !q.truncatedStart && !q.truncatedEnd)) {
      expect(p.rise).toBeLessThan(p.culmination)
      expect(p.culmination).toBeLessThan(p.set)
      expect(p.riseAngles.el / DEG).toBeCloseTo(10, 1)
      expect(p.setAngles.el / DEG).toBeCloseTo(10, 1)
      expect(p.culminationAngles.el).toBeGreaterThanOrEqual(p.riseAngles.el)
      expect(p.sunlit).toBeGreaterThanOrEqual(0)
      expect(Math.abs(p.siteSunElevation)).toBeLessThanOrEqual(Math.PI / 2)
    }
    const first = passes.find(q => !q.truncatedStart) ?? passes[0]!
    const inside = findPasses(trajectory, site, first.culmination, first.culmination + 60e3, 10 * DEG, 60e3)
    expect(inside).toHaveLength(1)
    expect(inside[0]!.truncatedStart).toBe(true)
    expect(inside[0]!.truncatedEnd).toBe(true)
  })
})

describe('attitude determination', () => {
  const truth = mul3(rot1(45 * DEG), mul3(rot2(-20 * DEG), rot3(30 * DEG)))
  const refs: Vec3[] = [unit([1, 0.2, 0.1]), unit([-0.3, 1, 0.4]), unit([0.2, -0.5, 1])]
  const sigmas = [1e-4, 5e-4, 1e-3]
  const obs = (a: Mat3): VectorObservation[] => refs.map((r, i) => ({ reference: r, body: apply3(a, r), sigma: sigmas[i] as number }))

  function angleBetween(a: Mat3, b: Mat3): number {
    const d = mul3(a, transpose3(b))
    return Math.acos(Math.max(-1, Math.min(1, (d[0][0] + d[1][1] + d[2][2] - 1) / 2)))
  }

  it('recovers the attitude with TRIAD, the q-method, and QUEST', () => {
    for (const solve of [triad, qMethod, quest]) {
      const s = solve(obs(truth))
      expect(angleBetween(s.dcm, truth)).toBeLessThan(1e-7)
      expect(s.loss).toBeLessThan(1e-12)
      expect(s.quaternion[3]).toBeGreaterThanOrEqual(0)
    }
    const [yaw, pitch, roll] = dcmToEuler321(truth)
    expect(yaw / DEG).toBeCloseTo(30, 10)
    expect(pitch / DEG).toBeCloseTo(-20, 10)
    expect(roll / DEG).toBeCloseTo(45, 10)
  })

  it('uses sequential rotations for 180° attitudes', () => {
    for (const axis of [unit([1, 1, 0]), [1, 0, 0] as Vec3, [0, 1, 0] as Vec3, [0, 0, 1] as Vec3]) {
      const half: [number, number, number, number] = [axis[0], axis[1], axis[2], 0]
      const flipped = quaternionToDcm(half)
      const s = quest(obs(flipped))
      expect(angleBetween(s.dcm, flipped)).toBeLessThan(1e-6)
      expect(angleBetween(qMethod(obs(flipped)).dcm, flipped)).toBeLessThan(1e-6)
    }
  })

  it('converts between quaternions and attitude matrices on every Shepperd branch', () => {
    for (const q of [[0, 0, 0, 1], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0.1, -0.7, 0.2, -0.3]] as const) {
      const n = Math.hypot(...q)
      const expected = q.map(x => (q[3] < 0 ? -x : x) / n)
      const back = dcmToQuaternion(quaternionToDcm([q[0] / n, q[1] / n, q[2] / n, q[3] / n]))
      back.forEach((value, i) => {
        expect(value).toBeCloseTo(expected[i] as number, 12)
      })
    }
  })

  it('bounds the attitude error and rejects degenerate inputs', () => {
    const sigma = attitudeSigma(obs(truth))
    expect(Math.max(...sigma)).toBeLessThan(2e-3)
    expect(Math.min(...sigma)).toBeGreaterThan(5e-5)
    const one = obs(truth).slice(0, 1)
    expect(() => triad(one)).toThrow('two vector observations')
    expect(() => qMethod(one)).toThrow('at least two')
    expect(() => quest(one)).toThrow('at least two')
    const parallel: VectorObservation[] = [obs(truth)[0]!, { ...obs(truth)[0]! }]
    expect(() => triad(parallel)).toThrow('parallel')
    expect(norm(sub(triad(obs(truth)).dcm[0], truth[0]))).toBeLessThan(1e-7)
  })
})
