import { describe, expect, it } from 'vitest'
import { AU_KM, DEG, MU_EARTH, MU_SUN, R_EARTH, ZONAL_J } from '../src/constants.ts'
import { moonPosition, sunlitFraction, sunPosition } from '../src/ephemeris.ts'
import { atmosphericDensity, buildAcceleration, thirdBody, zonalAcceleration } from '../src/forces.ts'
import { integrate, rkf78Step, RKF78_TABLEAU } from '../src/integrator.ts'
import { propagateKepler, stateToElements } from '../src/kepler.ts'
import { dot, norm, scale, sub, unit, wrapPi } from '../src/linalg.ts'
import { propagateNumerical, propagateTwoBody, vec3At } from '../src/propagate.ts'
import type { Mat3, TimedState, Vec3 } from '../src/types.ts'

const IDENTITY: Mat3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
const SETTINGS = { relTol: 1e-12, absTol: 1e-10, maxSteps: 100000, initialStep: 60 }

describe('Sun and Moon ephemerides', () => {
  it('places the Sun within the low-precision budget (Meeus Example 25.a, J2000 frame)', () => {
    const s = sunPosition(Date.UTC(1992, 9, 13) - 59184)
    const ra = (Math.atan2(s[1], s[0]) / DEG + 360) % 360
    const dec = Math.asin(s[2] / norm(s)) / DEG
    // Meeus gives apparent-of-date 198.378°, −7.785°; J2000 adds ~0.11° of precession.
    expect(Math.abs(ra - 198.49)).toBeLessThan(0.05)
    expect(Math.abs(dec + 7.83)).toBeLessThan(0.05)
    expect(norm(s) / AU_KM).toBeCloseTo(0.99761, 3)
  })

  it('places the Moon within the low-precision budget (Meeus Example 47.a, J2000 frame)', () => {
    const m = moonPosition(Date.UTC(1992, 3, 12) - 58184)
    const eps = 23.43929111 * DEG
    const y = Math.cos(eps) * m[1] + Math.sin(eps) * m[2]
    const z = -Math.sin(eps) * m[1] + Math.cos(eps) * m[2]
    const lon = Math.atan2(y, m[0]) / DEG
    const lat = Math.asin(z / norm(m)) / DEG
    // Meeus of-date λ = 133.1627°, β = −3.2291°, Δ = 368409.7 km; J2000 λ ≈ 133.27°.
    expect(Math.abs(lon - 133.27)).toBeLessThan(0.05)
    expect(Math.abs(lat + 3.229)).toBeLessThan(0.02)
    expect(Math.abs(norm(m) - 368409.7)).toBeLessThan(200)
  })

  it('computes sunlight, umbra, penumbra, and annular shadow fractions', () => {
    const sun: Vec3 = [AU_KM, 0, 0]
    expect(sunlitFraction([7000, 0, 0], sun)).toBe(1)
    expect(sunlitFraction([-7000, 0, 0], sun)).toBe(0)
    // Scan across the shadow edge for a partial value.
    let partial = 0
    for (let y = 6300; y < 6450; y += 1) {
      const f = sunlitFraction([-7000, y, 0], sun)
      if (f > 0 && f < 1) partial = f
    }
    expect(partial).toBeGreaterThan(0)
    expect(partial).toBeLessThan(1)
    const far = sunlitFraction([-3e6, 0, 0], sun)
    // Annular eclipse: the Earth disk covers (b/a)² of the Sun.
    expect(far).toBeGreaterThan(0.7)
    expect(far).toBeLessThan(1)
  })
})

describe('force model', () => {
  it('reproduces the closed-form J2 acceleration', () => {
    const r: Vec3 = [5000, 3000, 4000]
    const rn = norm(r)
    const k = (1.5 * ZONAL_J[2] * MU_EARTH * R_EARTH ** 2) / rn ** 5
    const zz = (r[2] / rn) ** 2
    const expected: Vec3 = [k * r[0] * (5 * zz - 1), k * r[1] * (5 * zz - 1), k * r[2] * (5 * zz - 3)]
    const a = zonalAcceleration(r, 2)
    a.forEach((value, i) => {
      expect(value).toBeCloseTo(expected[i] as number, 18)
    })
  })

  it('matches the numerical gradient of the zonal potential through J6', () => {
    const potential = (r: Vec3): number => {
      const rn = norm(r)
      const s = r[2] / rn
      const p = [1, s]
      for (let n = 2; n <= 6; n++) p[n] = ((2 * n - 1) * s * (p[n - 1] as number) - (n - 1) * (p[n - 2] as number)) / n
      let u = 0
      for (let n = 2; n <= 6; n++) u -= (MU_EARTH / rn) * ZONAL_J[n as 2] * (R_EARTH / rn) ** n * (p[n] as number)
      return u
    }
    for (const r of [[6800, 1200, 2500], [-4000, 200, -6000], [100, 50, 7000]] as Vec3[]) {
      const a = zonalAcceleration(r, 6)
      for (let i = 0; i < 3; i++) {
        const h = 1e-3
        const plus = [...r] as [number, number, number]
        const minus = [...r] as [number, number, number]
        plus[i] = r[i as 0] + h
        minus[i] = r[i as 0] - h
        const grad = (potential(plus) - potential(minus)) / (2 * h)
        expect(a[i]).toBeCloseTo(grad, 13)
      }
    }
  })

  it('reads the exponential atmosphere', () => {
    expect(atmosphericDensity(0)).toBeCloseTo(1.225, 12)
    expect(atmosphericDensity(-5)).toBeCloseTo(1.225, 12)
    expect(atmosphericDensity(400)).toBeCloseTo(3.725e-12, 20)
    expect(atmosphericDensity(425)).toBeCloseTo(3.725e-12 * Math.exp(-25 / 58.515), 20)
    expect(atmosphericDensity(1500)).toBeLessThan(3.019e-15)
  })

  it('combines drag, radiation pressure, and third bodies', () => {
    const t = Date.UTC(2024, 5, 1)
    const r: Vec3 = [6778, 0, 0]
    const v: Vec3 = [0, 7.67, 0]
    const twoBody = buildAcceleration({ zonalDegree: 0, sun: false, moon: false }, IDENTITY)(t, r, v)
    const drag0 = { cd: 2.2, areaM2: 10, massKg: 400 }
    const withDrag = buildAcceleration({ zonalDegree: 0, sun: false, moon: false, drag: drag0 }, IDENTITY)(t, r, v)
    const drag = sub(withDrag, twoBody)
    expect(dot(drag, v)).toBeLessThan(0)
    expect(norm(drag)).toBeGreaterThan(1e-11)
    const rSun = sunPosition(t)
    const lit = scale(unit(rSun), 7000)
    const srpOnly = sub(
      buildAcceleration({ zonalDegree: 0, sun: false, moon: false, srp: { cr: 1.5, areaM2: 20, massKg: 500 } }, IDENTITY)(t, lit, v),
      buildAcceleration({ zonalDegree: 0, sun: false, moon: false }, IDENTITY)(t, lit, v),
    )
    expect(dot(srpOnly, unit(rSun))).toBeLessThan(0)
    const dark = scale(unit(rSun), -7000)
    const eclipsed = sub(
      buildAcceleration({ zonalDegree: 0, sun: false, moon: false, srp: { cr: 1.5, areaM2: 20, massKg: 500 } }, IDENTITY)(t, dark, v),
      buildAcceleration({ zonalDegree: 0, sun: false, moon: false }, IDENTITY)(t, dark, v),
    )
    expect(norm(eclipsed)).toBe(0)
    const thirdBodies = sub(
      buildAcceleration({ zonalDegree: 2, sun: true, moon: true }, IDENTITY)(t, r, v),
      buildAcceleration({ zonalDegree: 2, sun: false, moon: false }, IDENTITY)(t, r, v),
    )
    expect(norm(thirdBodies)).toBeGreaterThan(1e-10)
    expect(norm(thirdBodies)).toBeLessThan(1e-8)
    const tidal = thirdBody([7000, 0, 0], [AU_KM, 0, 0], MU_SUN)
    expect(tidal[0] / ((2 * MU_SUN * 7000) / AU_KM ** 3)).toBeCloseTo(1, 3)
  })
})

describe('RKF7(8) integrator', () => {
  it('satisfies the quadrature order conditions', () => {
    const { a, b, b7, c } = RKF78_TABLEAU
    a.forEach((row, i) => {
      expect(row.reduce((s, x) => s + x, 0)).toBeCloseTo(c[i] as number, 14)
    })
    for (let k = 0; k <= 7; k++) {
      expect(b.reduce((s, w, i) => s + w * (c[i] as number) ** k, 0)).toBeCloseTo(1 / (k + 1), 14)
      if (k <= 6) expect(b7.reduce((s, w, i) => s + w * (c[i] as number) ** k, 0)).toBeCloseTo(1 / (k + 1), 14)
    }
  })

  it('integrates a harmonic oscillator forward and backward', () => {
    const f = (_t: number, y: readonly number[]): number[] => [y[1] as number, -(y[0] as number)]
    const out = integrate(f, 0, [1, 0], [1, 10, 2, -3], SETTINGS)
    ;[1, 10, 2, -3].forEach((t, i) => {
      expect((out[i] as number[])[0]).toBeCloseTo(Math.cos(t), 9)
      expect((out[i] as number[])[1]).toBeCloseTo(-Math.sin(t), 9)
    })
    // A zero error estimate grows the step at the maximum rate.
    expect(integrate(() => [0], 0, [5], [100], SETTINGS)[0]).toEqual([5])
    expect(rkf78Step(f, 0, [1, 0], 0.1).y[0]).toBeCloseTo(Math.cos(0.1), 13)
  })

  it('fails on an exhausted budget and on step underflow', () => {
    const f = (_t: number, y: readonly number[]): number[] => [y[1] as number, -(y[0] as number)]
    expect(() => integrate(f, 0, [1, 0], [1000], { ...SETTINGS, maxSteps: 3 })).toThrow('exceeded 3 steps')
    const blowUp = (_t: number, y: readonly number[]): number[] => [(y[0] as number) ** 2]
    expect(() => integrate(blowUp, 0, [1], [2], { ...SETTINGS, maxSteps: 1e7 })).toThrow('underflow')
  })
})

describe('orbit propagation', () => {
  const epoch = Date.UTC(2024, 0, 1)
  const initial: TimedState = { t: epoch, r: [6878, 0, 0], v: [0, 5.3, 5.3] }

  it('agrees with two-body propagation when perturbations are off', () => {
    const times = [epoch + 3600e3, epoch - 1800e3, epoch, epoch + 7200e3, epoch - 600e3]
    const numeric = propagateNumerical(initial, times, { zonalDegree: 0, sun: false, moon: false }, SETTINGS)
    const kepler = propagateTwoBody(initial, times)
    numeric.forEach((s, i) => {
      expect(s.t).toBe(times[i])
      expect(norm(sub(s.r, (kepler[i] as TimedState).r))).toBeLessThan(1e-5)
    })
    expect(propagateNumerical(initial, [], { zonalDegree: 0, sun: false, moon: false }, SETTINGS)).toEqual([])
    expect(propagateTwoBody(initial, [epoch - 60e3])[0]!.r).toEqual(propagateKepler(initial, -60).r)
  })

  it('reproduces the J2 nodal regression rate', () => {
    const day = 86400e3
    const loose = { ...SETTINGS, relTol: 1e-10, absTol: 1e-8 }
    const [s] = propagateNumerical(initial, [epoch + day], { zonalDegree: 2, sun: false, moon: false }, loose)
    const e0 = stateToElements(initial)
    const e1 = stateToElements(s!)
    const n = Math.sqrt(MU_EARTH / e0.a ** 3)
    const rate = -1.5 * n * ZONAL_J[2] * (R_EARTH / e0.p) ** 2 * Math.cos(e0.i)
    expect(wrapPi(e1.raan - e0.raan) / (rate * 86400)).toBeCloseTo(1, 1)
  })

  it('decays a low orbit under drag', () => {
    const low: TimedState = { t: epoch, r: [6578, 0, 0], v: [0, Math.sqrt(MU_EARTH / 6578), 0] }
    const [s] = propagateNumerical(low, [epoch + 6 * 3600e3], {
      zonalDegree: 0, sun: false, moon: false, drag: { cd: 2.2, areaM2: 5, massKg: 100 },
    }, { ...SETTINGS, relTol: 1e-10, absTol: 1e-8 })
    expect(stateToElements(s!).a).toBeLessThan(6578)
    expect(vec3At([1, 2, 3, 4], 1)).toEqual([2, 3, 4])
  })
})
