import { describe, expect, it } from 'vitest'
import { DEG, MU_EARTH } from '../src/constants.ts'
import { cross, dot, norm, sub } from '../src/linalg.ts'
import {
  elementsToState, meanFromTrue, propagateKepler, solveUniversal, stateToElements, stumpffC, stumpffS, trueFromMean,
} from '../src/kepler.ts'
import { solveLambert } from '../src/lambert.ts'
import { biElliptic, hohmann, planeChange } from '../src/maneuver.ts'
import type { StateVector, Vec3 } from '../src/types.ts'

function close(actual: Vec3, expected: Vec3, tol: number): void {
  expect(norm(sub(actual, expected))).toBeLessThan(tol)
}

function energy(s: StateVector): number {
  return dot(s.v, s.v) / 2 - MU_EARTH / norm(s.r)
}

describe('classical elements', () => {
  it('converts a state to elements (Vallado Example 2-5)', () => {
    const el = stateToElements({ r: [6524.834, 6862.875, 6448.296], v: [4.901327, 5.533756, -1.976341] })
    expect(el.p).toBeCloseTo(11067.79, 0)
    expect(el.a).toBeCloseTo(36127.343, 0)
    expect(el.e).toBeCloseTo(0.832853, 5)
    expect(el.i / DEG).toBeCloseTo(87.87, 2)
    expect(el.raan / DEG).toBeCloseTo(227.89, 1)
    expect(el.argp / DEG).toBeCloseTo(53.38, 1)
    expect(el.nu / DEG).toBeCloseTo(92.335, 2)
    expect(el.argLat).toBeCloseTo(el.argp + el.nu, 12)
    expect(el.period).toBeCloseTo(2 * Math.PI * Math.sqrt(el.a ** 3 / MU_EARTH), 6)
  })

  it('converts elements to a state (Vallado Example 2-6)', () => {
    const s = elementsToState({ p: 11067.79, e: 0.83285, i: 87.87 * DEG, raan: 227.89 * DEG, argp: 53.38 * DEG, nu: 92.335 * DEG })
    close(s.r, [6525.368, 6861.532, 6449.119], 0.002)
    close(s.v, [4.902279, 5.53314, -1.97571], 2e-6)
  })

  it('handles circular, equatorial, retrograde, parabolic, and hyperbolic orbits', () => {
    const circularEquatorial = stateToElements({ r: [7000, 0, 0], v: [0, Math.sqrt(MU_EARTH / 7000), 0] })
    expect(circularEquatorial.e).toBeLessThan(1e-12)
    expect(circularEquatorial.raan).toBe(0)
    expect(circularEquatorial.argp).toBe(0)
    expect(circularEquatorial.trueLon).toBeCloseTo(0, 12)
    const circularInclined = stateToElements(elementsToState({ p: 8000, e: 0, i: 1, raan: 2, argp: 0, nu: 0.7 }))
    expect(circularInclined.argLat).toBeCloseTo(0.7, 10)
    expect(circularInclined.raan).toBeCloseTo(2, 10)
    const retro = stateToElements({ r: [7000, 0, 0], v: [0, -7.6, 0] })
    expect(retro.i).toBeCloseTo(Math.PI, 12)
    const parabolic = stateToElements({ r: [7000, 0, 0], v: [0, Math.sqrt((2 * MU_EARTH) / 7000), 0] })
    expect(parabolic.a).toBe(Infinity)
    expect(parabolic.period).toBeUndefined()
    const hyper = stateToElements({ r: [7000, 0, 0], v: [0, 12, 1] })
    expect(hyper.a).toBeLessThan(0)
    expect(hyper.e).toBeGreaterThan(1)
    const round = elementsToState({ p: hyper.p, e: hyper.e, i: hyper.i, raan: hyper.raan, argp: hyper.argp, nu: hyper.nu })
    close(round.r, [7000, 0, 0], 1e-8)
  })

  it('rejects rectilinear states and anomalies beyond the asymptotes', () => {
    expect(() => stateToElements({ r: [7000, 0, 0], v: [1, 0, 0] })).toThrow('rectilinear')
    expect(() => elementsToState({ p: 7000, e: 2, i: 0, raan: 0, argp: 0, nu: 2.5 })).toThrow('asymptotes')
  })

  it('solves Kepler equation for every conic', () => {
    for (const e of [0, 0.3, 0.85, 0.99, 1, 1.5, 4]) {
      for (const nu of [-2, -0.5, 0, 0.4, 1.9]) {
        if (e > 1 && Math.abs(nu) >= Math.acos(-1 / e)) continue
        const m = meanFromTrue(nu, e)
        const back = trueFromMean(m, e)
        const expected = e < 1 ? ((nu % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) : nu
        expect(back).toBeCloseTo(expected, 9)
      }
    }
  })

  it('evaluates Stumpff functions on every branch', () => {
    for (const z of [-4, -1e-4, 0, 1e-4, 4]) {
      const c = stumpffC(z)
      const s = stumpffS(z)
      expect(c).toBeGreaterThan(0)
      expect(s).toBeGreaterThan(0)
    }
    expect(stumpffC(4)).toBeCloseTo((1 - Math.cos(2)) / 4, 14)
    expect(stumpffS(-4)).toBeCloseTo((Math.sinh(2) - 2) / 8, 14)
    expect(stumpffC(1e-4)).toBeCloseTo(0.5, 5)
  })
})

describe('two-body propagation', () => {
  it('matches Vallado Example 2-4', () => {
    const s = propagateKepler({ r: [1131.34, -2282.343, 6672.423], v: [-5.64305, 4.30333, 2.42879] }, 2400)
    close(s.r, [-4219.7527, 4363.0292, -3958.7666], 0.001)
    close(s.v, [3.689866, -1.916735, -6.112511], 1e-6)
  })

  it('conserves energy and angular momentum on elliptic, parabolic, and hyperbolic arcs, forward and back', () => {
    const cases: StateVector[] = [
      { r: [7000, 0, 0], v: [0, 7.5, 1] },
      { r: [7000, 0, 0], v: [0, Math.sqrt((2 * MU_EARTH) / 7000), 0] },
      { r: [7000, 100, 0], v: [0.5, 15, 2] },
    ]
    for (const s0 of cases) {
      for (const dt of [-86400, -600, 1, 3600, 5 * 86400]) {
        const s1 = propagateKepler(s0, dt)
        expect(energy(s1)).toBeCloseTo(energy(s0), 7)
        close(cross(s1.r, s1.v), cross(s0.r, s0.v), 1e-6 * norm(cross(s0.r, s0.v)))
        const back = propagateKepler(s1, -dt)
        close(back.r, s0.r, 1e-5 * norm(s0.r))
      }
    }
    expect(propagateKepler(cases[0] as StateVector, 0)).toBe(cases[0])
  })

  it('reports a universal-variable failure', () => {
    expect(() => solveUniversal(7000, 0, 1 / 7000, Number.NaN)).toThrow('did not converge')
  })
})

describe('Lambert problem (Izzo)', () => {
  it('reproduces Curtis Example 5.2', () => {
    const [arc] = solveLambert([5000, 10000, 2100], [-14600, 2500, 7000], 3600)
    close(arc!.v1, [-5.9925, 1.9254, 3.2456], 2e-4)
    close(arc!.v2, [-3.3125, -4.1966, -0.38529], 2e-4)
    expect(arc!.branch).toBe('single')
  })

  it('returns arcs that land on the target, including multi-revolution and retrograde solutions', () => {
    const r1: Vec3 = [7000, 0, 0]
    const r2: Vec3 = [-3000, 6500, 1000]
    const tof = 4 * 3600
    const arcs = solveLambert(r1, r2, tof, { maxRevolutions: 3 })
    expect(arcs.length).toBeGreaterThan(1)
    expect(new Set(arcs.map(a => a.branch))).toEqual(new Set(['single', 'low', 'high']))
    for (const arc of arcs) {
      const end = propagateKepler({ r: r1, v: arc.v1 }, tof)
      close(end.r, r2, 1e-3)
      close(end.v, arc.v2, 1e-6)
    }
    const retro = solveLambert(r1, r2, 3000, { prograde: false })[0]!
    expect(cross(r1, retro.v1)[2]).toBeLessThan(0)
    close(propagateKepler({ r: r1, v: retro.v1 }, 3000).r, r2, 1e-3)
    // Positions below the xy plane flip the transfer-plane normal.
    const low = solveLambert([7000, 0, 0], [0, -7000, 500], 1500)[0]!
    close(propagateKepler({ r: [7000, 0, 0], v: low.v1 }, 1500).r, [0, -7000, 500], 1e-3)
  })

  it('covers short, long, and hyperbolic transfer-time regimes', () => {
    const r1: Vec3 = [7000, 0, 0]
    const r2: Vec3 = [0, 8000, 500]
    for (const tof of [300, 900, 2000, 20000]) {
      const arc = solveLambert(r1, r2, tof)[0]!
      close(propagateKepler({ r: r1, v: arc.v1 }, tof).r, r2, 1e-3)
    }
    // Near-parabolic (series branch) and very fast hyperbolic transfers.
    for (const tof of [1008.57, 50]) {
      const arc = solveLambert(r1, r2, tof)[0]!
      close(propagateKepler({ r: r1, v: arc.v1 }, tof).r, r2, 1e-3)
    }
    // A revolution limit above what the time allows is trimmed: 5150 s exceeds π in
    // normalized time but falls below the one-revolution minimum.
    expect(solveLambert(r1, r2, 5150, { maxRevolutions: 5 }).map(a => a.revolutions)).toEqual([0])
    expect(solveLambert(r1, r2, 7000, { maxRevolutions: 5 }).every(a => a.revolutions <= 1)).toBe(true)
  })

  it('reports non-convergence', () => {
    expect(() => solveLambert([7000, 0, 0], [0, 8000, 500], Infinity)).toThrow('did not converge')
  })

  it('rejects degenerate requests', () => {
    expect(() => solveLambert([7000, 0, 0], [8000, 0, 0], 100)).toThrow('collinear')
    expect(() => solveLambert([7000, 0, 0], [0, 8000, 0], 0)).toThrow('positive')
  })
})

describe('impulsive transfers', () => {
  it('prices a Hohmann transfer (Vallado Example 6-1)', () => {
    const h = hohmann(6569.4811, 42159.48)
    expect(h.impulses[0]).toBeCloseTo(2.457, 3)
    expect(h.impulses[1]).toBeCloseTo(1.478, 3)
    expect(h.timeOfFlight / 3600).toBeCloseTo(5.257, 2)
  })

  it('prices bi-elliptic transfers and plane changes', () => {
    const mu = MU_EARTH
    const [r1, r2, rb] = [7000, 105000, 210000]
    const b = biElliptic(r1, r2, rb)
    const a1 = (r1 + rb) / 2
    const a2 = (r2 + rb) / 2
    expect(b.impulses[0]).toBeCloseTo(Math.sqrt(mu * (2 / r1 - 1 / a1)) - Math.sqrt(mu / r1), 12)
    expect(b.impulses[1]).toBeCloseTo(Math.sqrt(mu * (2 / rb - 1 / a2)) - Math.sqrt(mu * (2 / rb - 1 / a1)), 12)
    expect(b.impulses[2]).toBeCloseTo(Math.sqrt(mu * (2 / r2 - 1 / a2)) - Math.sqrt(mu / r2), 12)
    // Above r2/r1 ≈ 15.58 a distant bi-elliptic apoapsis beats Hohmann.
    expect(biElliptic(r1, r2, 5e6).totalDeltaV).toBeLessThan(hohmann(r1, r2).totalDeltaV)
    expect(() => biElliptic(7000, 9000, 8000)).toThrow('apoapsis')
    expect(planeChange(7.5, -28.5 * DEG)).toBeCloseTo(2 * 7.5 * Math.sin(14.25 * DEG), 12)
  })
})
