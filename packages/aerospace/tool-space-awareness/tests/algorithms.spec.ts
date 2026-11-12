import { describe, expect, it } from 'vitest'
import { DEG, MU_EARTH, predictObservation, propagateSgp4, R_EARTH, sgp4MeanElements, temeToGcrf } from '@astro-one/astrodynamics'
import type { Geodetic, Observation, TimedState } from '@astro-one/astrodynamics'
import { catalogObject } from '../src/catalog.ts'
import { fitAt, refineFit, residualRms, residualRows, scanFit } from '../src/correlation.ts'
import { ballisticFromBstar, decayRates, integrateDecay } from '../src/decay.ts'
import { falseAlarmProbability, lombScargle, phaseDispersion, refinePeak, strongestPeaks } from '../src/lightcurve.ts'
import type { Photometry } from '../src/lightcurve.ts'
import { detectManeuvers, robustSpread } from '../src/maneuvers.ts'
import { airMass, diffusePhase, observable, opticalSample, opticalWindows, standardMagnitude, SUN_MAGNITUDE } from '../src/photometry.ts'
import { radialBandsOverlap, sampleTimes, screenCatalog, screeningCandidates } from '../src/screening.ts'
import { classicalOf, equinoctialFromState, fitElementSet, ommBuilder, positionErrors } from '../src/tle-fit.ts'
import { elements, EPOCH, history } from './fixtures.ts'

const iss = { name: 'ISS', number: 25544, n: 15.5, i: 51.6, raan: 10 }
const crosser = { name: 'CROSSER', number: 40000, n: 15.5, i: 97.5, raan: 10 }
const object = (s: typeof iss) => catalogObject(s.name, elements(s))

describe('screening', () => {
  it('filters on radial bands and samples windows with the end included', () => {
    const low = sgp4MeanElements(elements(iss))
    const high = sgp4MeanElements(elements({ number: 2, n: 14, i: 98 }))
    expect(radialBandsOverlap(low, high, 10)).toBe(false)
    expect(radialBandsOverlap(low, high, 1000)).toBe(true)
    expect(sampleTimes(0, 25, 10)).toEqual([0, 10, 20, 25])
    expect(sampleTimes(0, 20, 10)).toEqual([0, 10, 20])
    const options = { start: EPOCH, end: EPOCH + 3600_000, stepMs: 30_000, screenKm: 5, padKm: 30 }
    expect(screeningCandidates(object(iss), [object(iss), object(crosser), catalogObject('HIGH', elements({ number: 2, n: 14, i: 98 }))], options).map(o => o.name))
      .toEqual(['CROSSER'])
  })

  it('finds the node crossing of two orbits that share the node at epoch', () => {
    const options = { start: EPOCH - 600_000, end: EPOCH + 600_000, stepMs: 30_000, screenKm: 5, padKm: 30 }
    const result = screenCatalog(elements(iss), [object(crosser)], options)
    expect(result.candidates).toBe(1)
    expect(result.approaches).toHaveLength(1)
    const hit = result.approaches[0]!
    expect(Math.abs(hit.approach.tca - EPOCH)).toBeLessThan(10_000)
    expect(hit.approach.missDistance).toBeLessThan(5)
    // The planes cross at about 46°, so the relative speed is 2·7.66·sin(23°) ≈ 6 km/s.
    expect(hit.approach.relativeSpeed).toBeCloseTo(5.97, 1)
    expect(hit.primary.r).not.toEqual(hit.secondary.r)
    expect(screenCatalog(elements(iss), [object(crosser)], { ...options, screenKm: 1 }).approaches).toEqual([])
  })

  it('skips grid brackets whose separation cannot reach the screening distance', () => {
    const far = catalogObject('FAR', elements({ number: 5, n: 14.2, i: 98, raan: 200 }))
    const result = screenCatalog(elements(iss), [far], { start: EPOCH, end: EPOCH + 86_400_000, stepMs: 60_000, screenKm: 5, padKm: 1000 })
    expect([result.candidates, result.approaches]).toEqual([1, []])
  })

  it('reports secondaries that decay inside the window', () => {
    const decaying = catalogObject('DEBRIS', elements({ number: 3, n: 16.3, i: 51, bstar: 0.2 }))
    const options = { start: EPOCH, end: EPOCH + 7200_000, stepMs: 60_000, screenKm: 5, padKm: 1000 }
    const result = screenCatalog(elements(iss), [decaying], options)
    expect(result.failures.map(f => f.object.name)).toEqual(['DEBRIS'])
    expect(result.failures[0]!.reason).toContain('SGP4 failed')
  })
})

const site: Geodetic = { lat: 0.6, lon: 2.0, h: 0.1 }

function radec(el: ReturnType<typeof elements>, t: number, aheadS: number, sigmaDeg: number): Observation {
  const state = temeToGcrf(propagateSgp4(el, [t + aheadS * 1000])[0]!, t)
  const [ra, dec] = predictObservation({ kind: 'radec', t, site, value: [0, 0], sigma: 1 }, state) as [number, number]
  return { kind: 'radec', t, site, value: [ra, dec], sigma: sigmaDeg * DEG }
}

describe('correlation', () => {
  const el = elements(iss)
  const times = [0, 20, 40, 60].map(s => EPOCH + 5 * 3600_000 + s * 1000)

  it('scores an exact tracklet at zero and scales angle residuals by the declination cosine', () => {
    const obs = times.map(t => radec(el, t, 0, 0.001))
    expect(fitAt(el, obs, 0).chi2).toBeLessThan(1e-12)
    expect(fitAt(el, obs, 0).dof).toBe(8)
    const [ra, dec] = obs[0]!.value as readonly [number, number]
    const [dRa] = residualRows(el, [{ kind: 'radec', t: times[0]!, site, value: [ra + 0.001 * DEG, dec], sigma: DEG }], 0)[0]!
    expect(dRa! / (0.001 * DEG)).toBeCloseTo(Math.cos(dec), 6)
  })

  it('recovers an along-track timing bias by scan and golden-section refinement', () => {
    const obs = times.map(t => radec(el, t, 30, 0.001))
    expect(Math.sqrt(fitAt(el, obs, 0).chi2 / 8)).toBeGreaterThan(100)
    const scanned = scanFit(el, obs, 100)
    expect(scanned.biasS).toBeCloseTo(30, 6)
    const refined = refineFit(el, obs, scanFit(el, obs, 95), 95)
    expect(refined.biasS).toBeCloseTo(30, 2)
    expect(refineFit(el, obs, scanned, 100)).toBe(scanned)
    expect(scanFit(el, obs, 0).biasS).toBe(0)
  })

  it('treats a decaying set as an infinite misfit and splits RMS by measurement group', () => {
    const obs = times.map(t => radec(el, t, 0, 0.001))
    expect(fitAt(elements({ number: 3, n: 16.3, i: 51, bstar: 0.2 }), obs, 0).chi2).toBe(Infinity)
    const mixed: Observation[] = [obs[0]!, { kind: 'range', t: times[1]!, site, value: 1e4, sigma: 1 }, { kind: 'range-rate', t: times[2]!, site, value: 0, sigma: 1 }]
    const rms = residualRms(el, mixed, 0)
    expect(rms.angle).toBeLessThan(1e-9)
    expect(rms.range).toBeGreaterThan(0)
    expect(rms.rangeRate).toBeGreaterThan(0)
    const angleOnly = residualRms(el, [obs[0]!], 0)
    expect([typeof angleOnly.angle, angleOnly.range, angleOnly.rangeRate]).toEqual(['number', null, null])
    const azel: Observation = { kind: 'azel', t: times[0]!, site, value: [1, 0.5], sigma: DEG }
    expect(fitAt(el, [azel], 0).dof).toBe(2)
  })
})

describe('maneuver detection', () => {
  const base = { number: 25544, n: 15.5, i: 51.6, e: 0.0005 }
  const days = Array.from({ length: 12 }, (_, k) => k)
  // Deterministic sub-metre noise on mean motion keeps the MAD above zero.
  const noise = (k: number): number => 1e-6 * Math.sin(k * 12.9898)

  it('separates in-plane, out-of-plane, and combined maneuvers from element-set noise', () => {
    const sets = history(base, days, k => ({
      n: (k >= 4 ? 15.48 : 15.5) + (k >= 8 ? 0.01 : 0) + noise(k),
      i: k >= 6 ? 51.65 : 51.6,
    })).map(s => catalogObject('SAT', elements(s)))
    const result = detectManeuvers(sets, { zThreshold: 6, minDeltaAKm: 0.05, minPlaneChange: 0.005 * DEG })
    expect(result.intervals).toHaveLength(11)
    expect(result.events.map(e => [new Date(e.interval.from).getUTCDate(), e.kind])).toEqual([[4, 'in-plane'], [6, 'out-of-plane'], [8, 'in-plane']])
    const first = result.events[0]!
    const a = first.interval.a
    // a ∝ n^(−2/3): Δn/n = −0.02/15.5 raises a by 2/3 of that ratio; Δv = v·Δa/(2a).
    expect(first.deltaAResidual).toBeCloseTo((2 / 3) * (0.02 / 15.5) * a, 1)
    expect(first.dvInPlane * 1000).toBeCloseTo(((Math.sqrt(MU_EARTH / a) * first.deltaAResidual) / (2 * a)) * 1000, 6)
    expect(result.events[1]!.interval.planeChange / DEG).toBeCloseTo(0.05, 3)
    expect(result.events[1]!.dvOutOfPlane * 1000).toBeCloseTo(2 * Math.sqrt(MU_EARTH / a) * Math.sin(0.025 * DEG) * 1000, 0)
    const combined = history(base, days, k => ({ n: k >= 5 ? 15.49 : 15.5, i: k >= 5 ? 51.62 : 51.6 })).map(s => catalogObject('SAT', elements(s)))
    expect(detectManeuvers(combined, { zThreshold: 6, minDeltaAKm: 0.05, minPlaneChange: 0.005 * DEG }).events.map(e => e.kind)).toEqual(['combined'])
  })

  it('computes medians and MAD sigmas for odd and even samples', () => {
    expect(robustSpread([1, 2, 3, 4, 100])).toEqual({ median: 3, sigma: 1.4826 })
    expect(robustSpread([1, 2, 3, 4])).toEqual({ median: 2.5, sigma: 1.4826 })
  })
})

describe('photometry', () => {
  it('follows the diffuse-sphere phase law, standard magnitude, and air mass', () => {
    expect(diffusePhase(Math.PI / 2)).toBeCloseTo(1, 12)
    expect(diffusePhase(0)).toBeCloseTo(Math.PI, 12)
    expect(diffusePhase(Math.PI)).toBeCloseTo(0, 12)
    // A 1 m² sphere of albedo 1 reflects 2/(3π²) of the solar flux it intercepts per steradian.
    expect(standardMagnitude(1, 1)).toBeCloseTo(SUN_MAGNITUDE - 2.5 * Math.log10(2 / (3 * Math.PI ** 2) / 1e12), 10)
    expect(standardMagnitude(100, 0.2) - standardMagnitude(1, 0.2)).toBeCloseTo(-5, 10)
    expect(airMass(Math.PI / 2)).toBeCloseTo(1, 3)
    expect(airMass(0)).toBeCloseTo(37.9, 0)
  })

  it('finds dark-sky windows of a sunlit LEO object and honours each constraint', () => {
    const el = elements({ number: 25544, n: 15.5, i: 51.6, raan: 10 })
    const station: Geodetic = { lat: 40 * DEG, lon: 116 * DEG, h: 0.05 }
    const model = { standardMagnitude: -1.8, extinction: 0.2 }
    const constraints = { minElevation: 10 * DEG, maxSunElevation: -12 * DEG, minMoonSeparation: 0 }
    const times = sampleTimes(EPOCH, EPOCH + 2 * 86_400_000, 30_000)
    const windows = opticalWindows(el, station, model, constraints, times)
    expect(windows.length).toBeGreaterThan(0)
    for (const w of windows) {
      expect(w.end).toBeGreaterThan(w.start)
      expect(w.brightest.el).toBeGreaterThanOrEqual(10 * DEG)
      expect(w.brightest.sunElevation).toBeLessThanOrEqual(-12 * DEG)
      expect(w.brightest.sunlit).toBeGreaterThan(0)
      expect(w.faintestMagnitude).toBeGreaterThanOrEqual(w.brightest.magnitude)
      // A LEO object crosses the sky at a few tenths of a degree per second.
      expect(w.angularRate / DEG).toBeGreaterThan(0.05)
      expect(w.angularRate / DEG).toBeLessThan(2)
    }
    const s = windows[0]!.brightest
    expect(observable(s, { ...constraints, limitingMagnitude: s.magnitude - 0.1 })).toBe(false)
    expect(observable(s, { ...constraints, minMoonSeparation: s.moonSeparation + 0.01 })).toBe(false)
    const open = opticalWindows(el, station, model, constraints, sampleTimes(windows[0]!.start + 5000, windows[0]!.end - 5000, 1000))
    expect(open.map(w => [w.openAtStart, w.openAtEnd])).toEqual([[true, true]])
  })

  it('reports umbra and below-horizon samples as infinitely faint', () => {
    const el = elements({ number: 25544, n: 15.5, i: 51.6, raan: 10 })
    const model = { standardMagnitude: 0, extinction: 0.2 }
    const samples = sampleTimes(EPOCH, EPOCH + 6000_000, 60_000).map(t => opticalSample(el, site, model, t))
    expect(samples.some(s => s.sunlit === 0 && s.magnitude === Infinity)).toBe(true)
    expect(samples.some(s => s.sunlit > 0 && s.el < 0 && s.magnitude === Infinity)).toBe(true)
    expect(samples.every(s => s.ra >= 0 && s.ra < 2 * Math.PI)).toBe(true)
  })
})

function sinusoid(period: number, harmonic: number, count: number): Photometry[] {
  return Array.from({ length: count }, (_, k) => {
    const t = k * 2 + 0.3 * Math.sin(k)
    const phase = (2 * Math.PI * t) / period
    return { t, mag: 5 + 0.4 * Math.cos(phase) + harmonic * Math.cos(2 * phase + 1) + 0.02 * Math.sin(k * 12.9898), sigma: 0.02 }
  })
}

describe('light curves', () => {
  it('recovers a sinusoid period and amplitude', () => {
    const points = sinusoid(37, 0, 300)
    const df = 1 / (10 * 598)
    const grid = Array.from({ length: 1000 }, (_, k) => lombScargle(points, 0.005 + k * df))
    const [peak] = strongestPeaks(grid, 3)
    const refined = refinePeak(points, peak!, df)
    expect(1 / refined.frequency).toBeCloseTo(37, 1)
    expect(refined.amplitude).toBeCloseTo(0.4, 2)
    expect(refined.power).toBeGreaterThan(0.95)
    expect(refinePeak(points, { ...refined, power: 2 }, df).power).toBe(2)
    expect(falseAlarmProbability(refined.power, points.length, 600)).toBeLessThan(1e-100)
    expect(falseAlarmProbability(0, points.length, 600)).toBe(1)
    expect(falseAlarmProbability(0.99, 10, 0)).toBeCloseTo(1 - (1 - 0.01 ** 3.5), 12)
  })

  it('separates a double-peaked rotation from its photometric period', () => {
    // Rotation period 80 s with two maxima per rotation: the periodogram peaks at 40 s.
    const points = Array.from({ length: 300 }, (_, k) => {
      const phase = (2 * Math.PI * k * 2) / 80
      return { t: k * 2, mag: 5 + 0.4 * Math.cos(2 * phase) + 0.1 * Math.cos(phase), sigma: 1 }
    })
    // Twice the bins at twice the period keeps the bin width in seconds equal.
    expect(phaseDispersion(points, 80, 20)).toBeLessThan(phaseDispersion(points, 40, 10))
    expect(phaseDispersion(points, 37.3, 10)).toBeGreaterThan(0.9)
  })

  it('returns neutral values for degenerate inputs', () => {
    const flat = Array.from({ length: 12 }, (_, k) => ({ t: k, mag: 3, sigma: 1 }))
    expect(lombScargle(flat, 0.1)).toEqual({ frequency: 0.1, power: 0, amplitude: 0 })
    expect(phaseDispersion(flat, 5, 10)).toBe(1)
    expect(phaseDispersion([{ t: 0, mag: 1, sigma: 1 }, { t: 0.5, mag: 2, sigma: 1 }], 1, 2)).toBe(1)
    const edges = [0.5, 0.1, 0.4].map((power, k) => ({ frequency: k + 1, power, amplitude: 1 }))
    expect(strongestPeaks(edges, 5).map(p => p.frequency)).toEqual([1, 3])
  })
})

describe('orbital decay', () => {
  it('converts B* to a ballistic coefficient', () => {
    expect(ballisticFromBstar(1e-4)).toBeCloseTo(1.2741621e-3, 12)
  })

  it('matches the analytic circular-orbit decay rate', () => {
    const a = R_EARTH + 400
    const p = { inclination: Math.PI / 2, ballistic: 0.01, densityScale: 1 }
    const { da, de } = decayRates({ a, e: 0 }, p)
    // Polar orbit: the co-rotation factor is 1, so da/dt = −B·ρ·√(μa)·1000.
    const rho = 3.725e-12
    expect(da).toBeCloseTo(-0.01 * rho * Math.sqrt(MU_EARTH * a) * 1000, 14)
    expect(de).toBeCloseTo(0, 18)
  })

  it('integrates eccentric orbits to re-entry and stops at the span limit', () => {
    const settings = { reentryAltitudeKm: 120, maxSeconds: 30 * 365.25 * 86400, maxPerigeeChangeKm: 0.5, maxStepS: 86400, maxSteps: 100000 }
    const p = { inclination: 51.6 * DEG, ballistic: 0.01, densityScale: 1 }
    const start = { a: R_EARTH + (300 + 700) / 2, e: 400 / (2 * R_EARTH + 1000) }
    const result = integrateDecay(EPOCH, start, p, settings)
    expect(result.reentry).toBeGreaterThan(EPOCH)
    const last = result.history[result.history.length - 1]!.state
    expect(last.a * (1 - last.e) - R_EARTH).toBeLessThanOrEqual(121)
    // Drag circularizes: apogee falls faster than perigee.
    const mid = result.history[Math.floor(result.history.length / 2)]!.state
    expect(mid.e).toBeLessThan(start.e)
    const survive = integrateDecay(EPOCH, { a: R_EARTH + 800, e: 0 }, p, { ...settings, maxSeconds: 86400 * 10 })
    expect(survive.reentry).toBeUndefined()
    expect(survive.history.at(-1)!.t).toBe(EPOCH + 86400 * 10 * 1000)
    expect(() => integrateDecay(EPOCH, start, p, { ...settings, maxSteps: 3 })).toThrow('more than 3 steps')
    const sunk = { a: R_EARTH + 100, e: 0 }
    expect(integrateDecay(EPOCH, sunk, p, settings)).toEqual({ reentry: EPOCH, history: [{ t: EPOCH, state: sunk }] })
  })
})

describe('TLE fitting', () => {
  it('round-trips equinoctial and classical elements', () => {
    const el = elements({ number: 1, n: 15.5, i: 51.6, raan: 300, argp: 80, m: 20, e: 0.01 })
    const state = propagateSgp4(el, [EPOCH])[0] as TimedState
    const q = equinoctialFromState(state, 1e-4)
    const c = classicalOf(q)
    expect(c.inclinationDeg).toBeCloseTo(51.6, 0)
    expect(c.raanDeg).toBeCloseTo(300, 0)
    expect(c.bstar).toBe(1e-4)
    expect(() => equinoctialFromState({ r: [7000, 0, 0], v: [0, 12, 0] }, 0)).toThrow('elliptic')
  })

  it('reproduces an SGP4 element set from its own ephemeris', () => {
    const truth = elements({ number: 25544, n: 15.5, i: 51.6, raan: 10, e: 0.001, argp: 30, m: 50, bstar: 3e-4 })
    const times = Array.from({ length: 30 }, (_, k) => EPOCH + k * 600_000)
    const samples = propagateSgp4(truth, times).map(s => ({ t: s.t, r: s.r }))
    const id = { name: 'X', catalogNumber: 25544, objectId: '1998-067A', epoch: EPOCH }
    const build = ommBuilder(id)
    const start = equinoctialFromState(propagateSgp4(truth, [EPOCH])[0] as TimedState, 0)
    const fixed = fitElementSet(start, samples, build, { fitBstar: false, maxIterations: 30 })
    const free = fitElementSet(start, samples, build, { fitBstar: true, maxIterations: 30 })
    expect(free.converged).toBe(true)
    expect(free.rms).toBeLessThan(1e-4)
    expect(classicalOf(free.set).bstar).toBeCloseTo(3e-4, 6)
    expect(fixed.rms).toBeGreaterThan(free.rms)
    expect(positionErrors(build(free.set), samples).max).toBeLessThan(1e-3)
    const capped = fitElementSet(start, samples, build, { fitBstar: false, maxIterations: 1 })
    expect(capped.iterations).toBe(1)
    expect(capped.converged).toBe(false)
  })

  it('rejects an initial set that SGP4 cannot propagate', () => {
    const samples = [{ t: EPOCH, r: [7000, 0, 0] as const }]
    const build = ommBuilder({ name: 'X', catalogNumber: 1, objectId: 'UNKNOWN', epoch: EPOCH })
    const hyperbolic = { n: 15, af: 1.2, ag: 0, chi: 0, psi: 0.4, lambda: 0, bstar: 0 }
    expect(() => fitElementSet(hyperbolic, samples, build, { fitBstar: false, maxIterations: 5 }))
      .toThrow('SGP4 rejects the initial element set')
  })
})
