import { describe, expect, it } from 'vitest'
import { elementsToState, rot3 } from '@astro-one/astrodynamics'
import { C, ionoScale, isBeidouGeo, klobuchar, saastamoinen, satelliteState, selectEphemeris } from '../src/broadcast.ts'
import { lambda } from '../src/lambda.ts'
import { calendarToGps, parseNavigation, parseObservation } from '../src/rinex.ts'
import { solveRtk } from '../src/rtk.ts'
import { chi2Threshold, solveEpoch } from '../src/spp.ts'
import type { SppOptions } from '../src/spp.ts'
import { ALPHA, BETA, blankCode, blankPhase, constellation, dropSatellite, lla, navigationText, observationText, T0 } from './sim.ts'

const OPTIONS: SppOptions = { systems: ['G', 'E', 'C'], elevationMask: 10 * Math.PI / 180, codeSigma: 0.3, raim: true }
const TRUE_POS = lla(39.9, 116.4, 50)

function dist(a: readonly number[], b: readonly number[]): number {
  return Math.hypot((a[0] as number) - (b[0] as number), (a[1] as number) - (b[1] as number), (a[2] as number) - (b[2] as number))
}

describe('RINEX 3 readers', () => {
  it('reads navigation records, ionosphere coefficients, and skips unsupported constellations', () => {
    const ephs = constellation()
    const nav = parseNavigation(navigationText(ephs))
    expect(nav.ephemerides).toHaveLength(ephs.length)
    expect(nav.klobuchar?.alpha[0]).toBeCloseTo(ALPHA[0] as number, 12)
    const bds = nav.ephemerides.find(e => e.sat === 'C20')!
    expect(bds.toe).toBe(T0)
    expect(bds.toeSow).toBe((T0 % 604800) - 14)
    const gps = nav.ephemerides.find(e => e.sat === 'G01')!
    expect(gps.sqrtA).toBeCloseTo(5153.7, 9)
    expect(parseNavigation(navigationText(ephs, false)).klobuchar).toBeUndefined()
  })

  it('reads observation headers and epochs, skipping event records', () => {
    const ephs = constellation()
    const text = observationText(ephs, { position: TRUE_POS, times: [T0, T0 + 30] })
    const withEvent = text.replace(/\n(> [^\n]+)\n/, (_m, first: string) => `\n>                              4  1\nevent comment\n${first}\n`)
    const obs = parseObservation(withEvent, 10)
    expect(obs.marker).toBe('SIM')
    expect(obs.types.C).toEqual(['C2I', 'L2I', 'S2I'])
    expect(obs.approxPosition?.[0]).toBeCloseTo(TRUE_POS[0] + 100, 3)
    expect(obs.epochs).toHaveLength(2)
    expect(obs.epochs[0]!.time).toBe(T0)
    expect(parseObservation(text, 1).epochs).toHaveLength(1)
    const noApprox = parseObservation(observationText(ephs, { position: TRUE_POS, times: [T0], withApprox: false }), 5)
    expect(noApprox.approxPosition).toBeUndefined()
  })

  it('rejects files of the wrong kind or version', () => {
    expect(() => parseNavigation('garbage')).toThrow('not a RINEX file')
    expect(() => parseNavigation(`${'     2.11           N'.padEnd(60)}RINEX VERSION / TYPE\n`)).toThrow('version 2.11')
    expect(() => parseObservation(`${'     3.04           N'.padEnd(60)}RINEX VERSION / TYPE\n`, 1)).toThrow('observation file')
    const truncated = navigationText(constellation()).split('\n').slice(0, -4).join('\n')
    expect(() => parseNavigation(truncated)).toThrow('truncated navigation record')
    expect(calendarToGps(1980, 1, 6, 0, 0, 1.5)).toBe(1.5)
    const obsText = observationText(constellation(), { position: TRUE_POS, times: [T0] })
    expect(() => parseNavigation(obsText)).toThrow('expected a RINEX navigation file')
  })

  it('reads blank fields, truncated epochs, and Galileo F/NAV group delays', () => {
    const ephs = constellation()
    const nav = parseNavigation(navigationText(ephs))
    expect(nav.ephemerides.find(e => e.sat === 'E08')!.groupDelay).toBe(-5e-9)
    const text = blankCode(observationText(ephs, { position: TRUE_POS, times: [T0] }), 'G01')
    const obs = parseObservation(text, 5)
    const g01 = obs.epochs[0]!.satellites.get('G01')
    if (g01 !== undefined) expect(g01.values.C1C).toBeUndefined()
    const lines = text.trimEnd().split('\n')
    const truncated = parseObservation(lines.slice(0, -2).join('\n'), 5)
    // More than 13 codes continue on a second header line; codes beyond the declared count are ignored.
    const label = 'SYS / # / OBS TYPES'
    const original = `${'G    3 C1C L1C S1C'.padEnd(60)}${label}`
    const replacement = `${'G   15 C1C L1C S1C D1C C2W L2W S2W C5Q L5Q S5Q D5Q C1W L1W'.padEnd(60)}${label}\n${'       S1W D1W X9X'.padEnd(60)}${label}`
    const wide = text.replace(original, replacement)
    expect(parseObservation(wide, 1).types.G).toHaveLength(15)
    expect(truncated.epochs[0]!.satellites.size).toBeGreaterThan(0)
  })
})

describe('broadcast orbits and corrections', () => {
  it('reduces to Keplerian motion when perturbation terms vanish', () => {
    const base = constellation()[0]!
    const flat = { ...base, crs: 0, crc: 0, cus: 0, cuc: 0, cis: 0, cic: 0, deltaN: 0, idot: 0, omegaDot: 0, e: 0.01 }
    const t = flat.toe + 1234
    const s = satelliteState(flat, t)
    const a = flat.sqrtA ** 2
    const n = Math.sqrt(3.986005e14 / a ** 3)
    const m = flat.m0 + n * 1234
    let big = m
    for (let i = 0; i < 50; i++) big = m + flat.e * Math.sin(big)
    const nu = 2 * Math.atan(Math.sqrt((1 + flat.e) / (1 - flat.e)) * Math.tan(big / 2))
    const raan = flat.omega0 - 7.2921151467e-5 * flat.toeSow
    const inertial = elementsToState({ p: a * (1 - flat.e ** 2) / 1000, e: flat.e, i: flat.i0, raan, argp: flat.omega, nu }, 3.986005e5)
    const fixed = rot3(7.2921151467e-5 * 1234)
    const expected = [0, 1, 2].map((i) => {
      const row = fixed[i as 0]
      return 1000 * (row[0] * inertial.r[0] + row[1] * inertial.r[1] + row[2] * inertial.r[2])
    })
    expect(dist(s.position, expected)).toBeLessThan(1e-3)
    expect(Math.hypot(...s.position)).toBeGreaterThan(2.6e7)
  })

  it('places a BeiDou GEO satellite near its longitude slot at geostationary radius', () => {
    const geo = constellation().find(e => e.sat === 'C03')!
    expect(isBeidouGeo(geo)).toBe(true)
    expect(isBeidouGeo(constellation().find(e => e.sat === 'C20')!)).toBe(false)
    const a = satelliteState(geo, geo.toe)
    const b = satelliteState(geo, geo.toe + 3600)
    expect(Math.abs(Math.hypot(...a.position) / 1000 - 42166)).toBeLessThan(300)
    // Earth-fixed drift stays at libration scale; a mishandled Ωe·tk would move it ~11,000 km per hour.
    expect(dist(a.position, b.position) / 1000).toBeLessThan(1500)
  })

  it('selects the nearest healthy ephemeris within its validity', () => {
    const [e] = constellation()
    const later = { ...e!, toe: e!.toe + 7200, iode: 99 }
    const sick = { ...e!, toe: e!.toe + 3600, health: 1 }
    expect(selectEphemeris([e!, later, sick], e!.toe + 6000)?.iode).toBe(99)
    expect(selectEphemeris([e!, later], e!.toe + 3000)?.iode).toBe(e!.iode)
    expect(selectEphemeris([e!], e!.toe + 5 * 3600)).toBeUndefined()
  })

  it('models ionosphere and troposphere delays', () => {
    const noon = klobuchar({ alpha: ALPHA, beta: BETA }, 0.7, 2.03, 0, Math.PI / 2, 4 * 3600 + 86400 * 3)
    const night = klobuchar({ alpha: ALPHA, beta: BETA }, 0.7, 2.03, 0, Math.PI / 2, 16 * 3600 + 86400 * 3)
    expect(noon).toBeGreaterThan(night)
    expect(night).toBeCloseTo(5e-9 * C * (1 + 16 * 0.03 ** 3), 6)
    expect(klobuchar({ alpha: [0, 0, 0, 0], beta: [0, 0, 0, 0] }, 1.5, -3, 3, 0.05, 50000)).toBeGreaterThan(5e-9 * C)
    expect(saastamoinen(0, 0.7, Math.PI / 2)).toBeCloseTo(2.4, 0)
    expect(saastamoinen(0, 0.7, 0.2)).toBeGreaterThan(saastamoinen(0, 0.7, Math.PI / 2))
    expect(saastamoinen(-200, 0.7, 1)).toBe(0)
    expect(saastamoinen(20000, 0.7, 1)).toBe(0)
    expect(saastamoinen(100, 0.7, -0.1)).toBe(0)
    expect(ionoScale('C')).toBeGreaterThan(1)
    expect(ionoScale('G')).toBe(1)
  })
})

describe('single-point positioning', () => {
  const ephs = constellation()
  const nav = parseNavigation(navigationText(ephs))

  it('recovers a static position with per-constellation clocks', () => {
    const obs = parseObservation(observationText(ephs, { position: TRUE_POS, times: [T0], clockBias: { G: 1000, E: 1003, C: 995 } }), 5)
    const sol = solveEpoch(obs.epochs[0]!, nav, OPTIONS)!
    expect(dist(sol.position, TRUE_POS)).toBeLessThan(0.05)
    expect(sol.clocks.G).toBeCloseTo(1000, 1)
    expect(sol.valid).toBe(true)
    expect(sol.dop.pdop).toBeGreaterThan(sol.dop.hdop)
    expect(sol.dop.gdop).toBeGreaterThan(sol.dop.pdop)
  })

  it('excludes a faulty satellite with RAIM', () => {
    const obs = parseObservation(observationText(ephs, { position: TRUE_POS, times: [T0], codeError: sat => (sat === 'G03' ? 150 : 0) }), 5)
    const sol = solveEpoch(obs.epochs[0]!, nav, OPTIONS)!
    expect(sol.excluded.length).toBe(1)
    expect(dist(sol.position, TRUE_POS)).toBeLessThan(0.1)
    const raw = solveEpoch(obs.epochs[0]!, nav, { ...OPTIONS, raim: false })!
    expect(raw.valid).toBe(false)
    expect(raw.excluded).toEqual([])
  })

  it('returns undefined without enough satellites and computes χ² thresholds', () => {
    const obs = parseObservation(observationText(ephs, { position: TRUE_POS, times: [T0] }), 5)
    expect(solveEpoch(obs.epochs[0]!, nav, { ...OPTIONS, systems: ['C'], elevationMask: 1.4 })).toBeUndefined()
    expect(chi2Threshold(1)).toBeCloseTo(10.83, 2)
    expect(chi2Threshold(2)).toBeCloseTo(13.82, 2)
    expect(chi2Threshold(10)).toBeCloseTo(29.59, 0)
    const twoFaults = parseObservation(observationText(ephs, { position: TRUE_POS, times: [T0], codeError: s => (s === 'G03' ? 150 : s === 'E02' ? -140 : 0) }), 5)
    const stuck = solveEpoch(twoFaults.epochs[0]!, nav, OPTIONS)!
    expect(stuck.valid).toBe(false)
    expect(stuck.excluded).toEqual([])
    const masked = solveEpoch(twoFaults.epochs[0]!, nav, { ...OPTIONS, elevationMask: 40 * Math.PI / 180 })
    expect(masked === undefined || masked.used.length < stuck.used.length).toBe(true)
    // With one redundant measurement every single exclusion passes, so RAIM ranks them by residuals.
    const sparse = parseObservation(observationText(ephs, { position: TRUE_POS, times: [T0], codeError: s => (s === 'G03' ? 60 : 0) }), 5)
    const ranked = solveEpoch(sparse.epochs[0]!, nav, { ...OPTIONS, elevationMask: 29 * Math.PI / 180 })!
    expect(ranked.excluded).toHaveLength(1)
    const noCode = parseObservation(blankCode(observationText(ephs, { position: TRUE_POS, times: [T0] }), 'G02'), 5)
    expect(solveEpoch(noCode.epochs[0]!, nav, OPTIONS)!.used).not.toContain('G02')
  })
})

describe('LAMBDA', () => {
  function bruteForce(a: number[], q: number[][]): { best: number[]; d1: number; d2: number } {
    const n = a.length
    const inv = invert(q)
    let best: number[] = []
    let d1 = Infinity
    let d2 = Infinity
    const ranges = a.map(x => [Math.floor(x) - 3, Math.ceil(x) + 3] as const)
    const rec = (i: number, z: number[]): void => {
      if (i === n) {
        const d = a.map((x, k) => x - (z[k] as number))
        let s = 0
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) s += (d[r] as number) * (inv[r]![c] as number) * (d[c] as number)
        if (s < d1) { d2 = d1; d1 = s; best = [...z] } else if (s < d2) d2 = s
        return
      }
      for (let v = ranges[i]![0]; v <= ranges[i]![1]; v++) rec(i + 1, [...z, v])
    }
    rec(0, [])
    return { best, d1, d2 }
  }
  function invert(m: number[][]): number[][] {
    const n = m.length
    const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
    for (let c = 0; c < n; c++) {
      const piv = a[c]![c]!
      for (let k = 0; k < 2 * n; k++) a[c]![k]! /= piv
      for (let r = 0; r < n; r++) if (r !== c) { const f = a[r]![c]!; for (let k = 0; k < 2 * n; k++) a[r]![k]! -= f * a[c]![k]! }
    }
    return a.map(row => row.slice(n))
  }

  it('matches exhaustive integer search on correlated covariances', () => {
    const q = [[6.29, 5.978, 0.544], [5.978, 6.292, 2.34], [0.544, 2.34, 6.288]]
    const a = [5.45, 3.1, 2.97]
    const res = lambda(a, q, 2)
    const bf = bruteForce(a, q)
    expect(res.candidates[0]).toEqual(bf.best)
    expect(res.distances[0]).toBeCloseTo(bf.d1, 9)
    expect(res.distances[1]).toBeCloseTo(bf.d2, 9)
    const b = [[2, 0, 0, 0], [1.9, 0.3, 0, 0], [0.5, 0.7, 1.5, 0], [0.3, 0.2, 1.4, 0.5]]
    const q4 = b.map(r1 => b.map(r2 => r1.reduce((sum, v, k) => sum + v * (r2[k] as number), 0)))
    const a4 = [1.3, -2.6, 7.2, 7.4]
    const bf4 = bruteForce(a4, q4)
    expect(lambda(a4, q4).candidates[0]).toEqual(bf4.best)
    expect(lambda([0.2], [[0.01]]).candidates[0]).toEqual([0])
    const three = lambda(a4, q4, 3)
    expect(three.candidates).toHaveLength(3)
    expect(three.distances).toEqual([...three.distances].sort((x, y) => x - y))
    expect(() => lambda([1, 2], [[1, 2], [2, 1]])).toThrow('positive definite')
  })
})

describe('RTK', () => {
  const ephs = constellation()
  const nav = parseNavigation(navigationText(ephs))
  const basePos = lla(39.9, 116.4, 50)
  const roverPos = lla(39.905, 116.41, 60)
  const times = [0, 30, 60, 90].map(dt => T0 + dt)
  const ambiguity = (sat: string): number => 1000 + sat.charCodeAt(0) * 3 + Number(sat.slice(1)) * 17

  function data(slips: Set<string> = new Set()) {
    const base = parseObservation(observationText(ephs, { position: basePos, times, ambiguity, clockBias: { G: 30, E: 30, C: 30 } }), 10)
    const roverSim = { position: roverPos, times, ambiguity: (s: string) => ambiguity(s) + 7, clockBias: { G: -20, E: -20, C: -20 }, slips }
    const rover = parseObservation(observationText(ephs, roverSim), 10)
    return { base, rover }
  }

  it('fixes integer ambiguities and recovers the rover to millimetres (static and kinematic)', () => {
    const { base, rover } = data()
    for (const mode of ['static', 'kinematic'] as const) {
      const out = solveRtk(rover, base, basePos, nav, { ...OPTIONS, mode, phaseSigma: 0.003, ratioThreshold: 3 })
      expect(out).toHaveLength(4)
      const last = out.at(-1)!
      expect(last.status).toBe('fixed')
      expect(dist(last.position, roverPos)).toBeLessThan(0.01)
      expect(last.ratio).toBeGreaterThan(3)
    }
  })

  it('resets ambiguities after a cycle slip and falls back without double differences', () => {
    const { base, rover } = data(new Set(['G01@' + String(T0 + 60)]))
    const out = solveRtk(rover, base, basePos, nav, { ...OPTIONS, mode: 'static', phaseSigma: 0.003, ratioThreshold: 3 })
    expect(out.at(-1)!.status).toBe('fixed')
    const single = solveRtk(rover, base, basePos, nav, { ...OPTIONS, systems: ['C'], elevationMask: 0.5, mode: 'static', phaseSigma: 0.003, ratioThreshold: 3 })
    expect(single.every(r => r.status === 'single' || r.status === 'float' || r.status === 'fixed')).toBe(true)
    const strict = solveRtk(rover, base, basePos, nav, { ...OPTIONS, mode: 'kinematic', phaseSigma: 0.003, ratioThreshold: 1e9 })
    expect(strict.at(-1)!.status).toBe('float')
  })

  it('handles lost satellites, missing phase, sparse bases, and high masks', () => {
    const baseText = observationText(ephs, { position: basePos, times, ambiguity, withApprox: false })
    let roverText = observationText(ephs, { position: roverPos, times, ambiguity: s => ambiguity(s) + 7, withApprox: false })
    const lost = ephs.filter(e => e.system === 'G' && roverSees(e.sat)).at(-1)!.sat
    roverText = dropSatellite(roverText, lost, 2)
    roverText = blankPhase(roverText, 'E01')
    const out = solveRtk(parseObservation(roverText, 10), parseObservation(baseText, 10), basePos, nav, { ...OPTIONS, mode: 'static', phaseSigma: 0.003, ratioThreshold: 3 })
    expect(out.at(-1)!.status).toBe('fixed')
    // Base-side gaps: missing code, missing phase, and a constellation without ephemerides.
    const gappy = blankPhase(blankCode(baseText, ephs.filter(e => e.system === 'E' && roverSees(e.sat)).at(-1)!.sat), 'C20')
    const noBeidouNav = parseNavigation(navigationText(ephs.filter(e => e.system !== 'C')))
    expect(solveRtk(parseObservation(roverText, 10), parseObservation(gappy, 10), basePos, noBeidouNav, { ...OPTIONS, mode: 'static', phaseSigma: 0.003, ratioThreshold: 3 }).length).toBeGreaterThan(0)
    const masked = solveRtk(parseObservation(roverText, 10), parseObservation(baseText, 10), basePos, nav, { ...OPTIONS, elevationMask: 29 * Math.PI / 180, mode: 'kinematic', phaseSigma: 0.003, ratioThreshold: 3 })
    expect(masked.length).toBeGreaterThan(0)
    // A base that shares one satellite per constellation leaves no double difference.
    const firstOfEach = ['G', 'E', 'C'].map(sys => ephs.find(e => e.system === sys && roverSees(e.sat))!)
    const sparse = parseObservation(observationText(firstOfEach, { position: basePos, times, ambiguity }), 10)
    const single = solveRtk(parseObservation(roverText, 10), sparse, basePos, nav, { ...OPTIONS, mode: 'static', phaseSigma: 0.003, ratioThreshold: 3 })
    expect(single.every(r => r.status === 'single' && r.ratio === null)).toBe(true)
  })

  function roverSees(sat: string): boolean {
    return parseObservation(observationText(ephs, { position: roverPos, times: [T0] }), 1).epochs[0]!.satellites.has(sat)
  }
})
