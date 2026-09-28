import { describe, expect, it } from 'vitest'
import { DEG, elementsToState, formatUtc, norm, predictObservation, propagateTwoBody, sub } from '@astro-one/astrodynamics'
import type { Geodetic, Observation, TimedState, Vec3 } from '@astro-one/astrodynamics'
import type { JsonValue } from '@astro-one/util-values'
import { fail, ISS_OMM, ok, setup } from './helpers.ts'

const EPOCH = Date.UTC(2024, 2, 1, 6)
const TRUTH: TimedState = {
  t: EPOCH,
  ...elementsToState({ p: 6900, e: 0.001, i: 51.6 * DEG, raan: 40 * DEG, argp: 10 * DEG, nu: 20 * DEG }),
}
const SITE = { lat_deg: 40, lon_deg: -105, alt_km: 1.6 }
const SITE_G: Geodetic = { lat: 40 * DEG, lon: -105 * DEG, h: 1.6 }

function v3(value: JsonValue | undefined): Vec3 {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(x => typeof x === 'number')) throw new Error('expected a 3-vector')
  return [value[0] as number, value[1] as number, value[2] as number]
}

function truthAt(t: number): TimedState {
  return propagateTwoBody(TRUTH, [t])[0] as TimedState
}

function positions(offsets: readonly number[]): JsonValue[] {
  return offsets.map(dt => ({ time: formatUtc(EPOCH + dt * 1000), type: 'position', value: [...truthAt(EPOCH + dt * 1000).r], sigma: 0.01 }))
}

function radec(offsets: readonly number[]): JsonValue[] {
  return offsets.map((dt) => {
    const t = EPOCH + dt * 1000
    const [ra, dec] = predictObservation({ kind: 'radec', t, site: SITE_G, value: [0, 0], sigma: 1 }, truthAt(t))
    return { time: formatUtc(t), type: 'radec', value: [ra! / DEG, dec! / DEG], sigma: 0.001, station: SITE }
  })
}

function tracking(): JsonValue[] {
  const obs: JsonValue[] = []
  for (let k = 0; k < 30; k++) {
    const t = EPOCH + k * 120e3
    const s = truthAt(t)
    const kinds = ['range', 'range_rate', 'azel'] as const
    const type = kinds[k % 3] as (typeof kinds)[number]
    const draft: Observation = type === 'range'
      ? { kind: 'range', t, site: SITE_G, value: 0, sigma: 1 }
      : type === 'range_rate' ? { kind: 'range-rate', t, site: SITE_G, value: 0, sigma: 1 } : { kind: 'azel', t, site: SITE_G, value: [0, 0], sigma: 1 }
    const p = predictObservation(draft, s)
    obs.push(type === 'azel'
      ? { time: formatUtc(t), type, value: [p[0]! / DEG, p[1]! / DEG], sigma: 0.001, station: SITE }
      : { time: formatUtc(t), type, value: [p[0]!], sigma: type === 'range' ? 0.005 : 1e-5, station: SITE })
  }
  return obs
}

describe('orbit_determine', () => {
  it('solves Gibbs, Herrick–Gibbs, and Gauss initial orbits', async () => {
    const ctx = await setup()
    const g = await ok(ctx, 'orbit_determine', { method: 'gibbs', observations: positions([-600, 0, 600]) })
    expect(norm(sub(v3(g.velocity_km_s), TRUTH.v))).toBeLessThan(1e-3)
    const close = await ok(ctx, 'orbit_determine', { method: 'gibbs', observations: positions([-30, 0, 30]) })
    expect((close.notes as string[]).some(n => n.includes('herrick-gibbs is usually more accurate'))).toBe(true)
    const hg = await ok(ctx, 'orbit_determine', { method: 'herrick-gibbs', observations: positions([-30, 0, 30]) })
    expect((hg.notes as string[])[0]).toContain('Herrick–Gibbs')
    const gauss = await ok(ctx, 'orbit_determine', { method: 'gauss', observations: radec([-300, 0, 300]) })
    expect(norm(sub(v3(gauss.position_km), TRUTH.r))).toBeLessThan(1)
    expect(gauss.alternatives).toEqual([])
  })

  it('runs batch least squares and the UKF with automatic and explicit initial orbits', async () => {
    const ctx = await setup()
    const obs = [...positions([0, 600, 1200]), ...tracking()]
    const batch = await ok(ctx, 'orbit_determine', { method: 'batch', observations: obs, dynamics: 'two-body' })
    expect(batch.converged).toBe(true)
    // Automatic Gibbs anchors the estimate at the middle position observation.
    expect(batch.epoch).toBe(formatUtc(EPOCH + 600e3))
    expect(norm(sub(v3(batch.position_km), truthAt(EPOCH + 600e3).r))).toBeLessThan(0.05)
    expect((batch.notes as string[])[0]).toContain('A priori from automatic')
    expect((batch.sigma_position_km as number[])).toHaveLength(3)
    const numeric = await ok(ctx, 'orbit_determine', {
      method: 'batch', observations: obs, forces: { zonal_degree: 0 }, max_iterations: 1, edit_sigma: 0,
      initial: { kind: 'state', epoch: formatUtc(EPOCH), frame: 'gcrf', position_km: [...TRUTH.r], velocity_km_s: [...TRUTH.v] },
    })
    expect(numeric.iterations).toBe(1)
    const ukf = await ok(ctx, 'orbit_determine', { method: 'ukf', observations: [...radec([0, 300, 600]), ...tracking()], dynamics: 'two-body', initial_sigma_km: 5, initial_sigma_km_s: 0.005, process_noise_km_s2: 1e-10 })
    expect(ukf.rms).toBeNull()
    const defaults = await ok(ctx, 'orbit_determine', { method: 'ukf', observations: [...positions([0, 60, 120]), ...tracking().slice(0, 6)], dynamics: 'two-body' })
    expect(defaults.method).toBe('ukf')
    expect((ukf.notes as string[]).at(-1)).toContain('pre-fit innovations')
    const stalled = await ok(ctx, 'orbit_determine', {
      method: 'batch', observations: tracking(), dynamics: 'two-body', max_iterations: 1,
      initial: { kind: 'state', epoch: formatUtc(EPOCH), frame: 'gcrf', position_km: [TRUTH.r[0] + 30, TRUTH.r[1], TRUTH.r[2]], velocity_km_s: [...TRUTH.v] },
    })
    expect((stalled.notes as string[]).some(n => n.includes('did not converge'))).toBe(true)
  })

  it('rejects malformed tracking data', async () => {
    const ctx = await setup({
      maxSamples: 100, maxObservations: 5, relativeTolerance: 1e-10, absoluteTolerance: 1e-8, maxIntegratorSteps: 10000,
    })
    const cases: [Record<string, JsonValue>, string][] = [
      [{ method: 'batch', observations: tracking().slice(0, 6) }, 'at most 5 observations'],
      [{ method: 'gibbs', observations: positions([0, 60]) }, 'exactly three position'],
      [{ method: 'gibbs', observations: tracking().slice(0, 3) }, 'position IOD needs three observations'],
      [{ method: 'gauss', observations: radec([0, 60]) }, 'exactly three radec'],
      [{ method: 'batch', observations: tracking().slice(0, 3) }, 'need initial, or at least three'],
      [{ method: 'batch', observations: [{ time: formatUtc(EPOCH), type: 'range', value: [1000], station: SITE }] }, 'sigma must be a finite number'],
      [{ method: 'gibbs', observations: [{ time: formatUtc(EPOCH), type: 'range', value: [1000] }] }, 'station is required'],
      [{ method: 'gibbs', observations: [{ time: formatUtc(EPOCH), type: 'azel', value: [1], station: SITE }] }, 'must hold 2 finite number(s)'],
      [{ method: 'batch', observations: positions([0, 60, 120]), max_iterations: 0 }, 'max_iterations'],
    ]
    for (const [args, message] of cases) expect(await fail(ctx, 'orbit_determine', args)).toContain(message)
  })
})

describe('orbit_passes', () => {
  it('lists passes and rejects oversized windows', async () => {
    const ctx = await setup()
    const passes = await ok(ctx, 'orbit_passes', {
      source: { kind: 'omm', omm: ISS_OMM }, method: 'sgp4', station: { lat_deg: 39.9, lon_deg: 116.4, alt_km: 0.05 },
      start: '2025-03-01T00:00:00Z', end: '2025-03-02T00:00:00Z',
    })
    expect((passes.passes as JsonValue[]).length).toBeGreaterThan(2)
    const numeric = await ok(ctx, 'orbit_passes', {
      source: { kind: 'omm', omm: ISS_OMM }, method: 'numerical', station: { lat_deg: 39.9, lon_deg: 116.4, alt_km: 0.05 },
      start: '2025-03-01T00:00:00Z', end: '2025-03-01T01:00:00Z', min_elevation_deg: 89.9, step_s: 30, forces: { zonal_degree: 2 },
    })
    expect(numeric.passes).toEqual([])
    expect(await fail(ctx, 'orbit_passes', {
      source: { kind: 'omm', omm: ISS_OMM }, method: 'sgp4', station: { lat_deg: 0, lon_deg: 0, alt_km: 0 },
      start: '2025-03-01T00:00:00Z', end: '2025-03-01T00:00:00Z',
    })).toContain('end must follow start')
    expect(await fail(ctx, 'orbit_passes', {
      source: { kind: 'omm', omm: ISS_OMM }, method: 'sgp4', station: { lat_deg: 0, lon_deg: 0, alt_km: 0 },
      start: '2025-03-01T00:00:00Z', end: '2025-03-10T00:00:00Z', step_s: 60,
    })).toContain('search steps')
    expect(await fail(ctx, 'orbit_passes', {
      source: { kind: 'omm', omm: ISS_OMM }, method: 'numerical', station: { lat_deg: 0, lon_deg: 0, alt_km: 0 },
      start: '2025-03-01T00:00:00Z', end: '2025-03-02T09:19:00Z', step_s: 60,
    })).toContain('numerical propagation over this window')
  })
})

describe('orbit_conjunction', () => {
  it('screens a constructed encounter with and without covariance', async () => {
    const ctx = await setup()
    const tca = Date.UTC(2025, 5, 1, 12)
    const a = { r: [7000, 0, 0] as const, v: [0, 7.546, 0] as const }
    const b = { r: [7000.1, 0, 0] as const, v: [0, 7.546 * Math.cos(10 * DEG), 7.546 * Math.sin(10 * DEG)] as const }
    const src = (s: typeof a | typeof b) => ({ kind: 'state', epoch: formatUtc(tca), frame: 'gcrf', position_km: [...s.r], velocity_km_s: [...s.v] })
    const base = { start: formatUtc(tca - 600e3), end: formatUtc(tca + 600e3), screening_distance_km: 1 }
    const withCov = await ok(ctx, 'orbit_conjunction', {
      ...base,
      primary: { source: src(a), method: 'two-body', sigma_rtn_km: [0.05, 0.2, 0.05] },
      secondary: { source: src(b), method: 'two-body', covariance_rtn_km2: [[0.0025, 0, 0], [0, 0.04, 0], [0, 0, 0.0025]] },
      hard_body_radius_km: 0.01,
    })
    const approach = (withCov.approaches as Record<string, JsonValue>[])[0]!
    expect(approach.miss_distance_km as number).toBeCloseTo(0.1, 3)
    expect(approach.collision_probability as number).toBeGreaterThan(0)
    const bare = await ok(ctx, 'orbit_conjunction', { ...base, primary: { source: src(a), method: 'two-body' }, secondary: { source: src(b), method: 'numerical' }, forces: { zonal_degree: 0 } })
    expect((bare.approaches as Record<string, JsonValue>[])[0]!.collision_probability).toBeNull()
    const defaultScreen = await ok(ctx, 'orbit_conjunction', { start: base.start, end: base.end, primary: { source: src(a), method: 'two-body' }, secondary: { source: src(b), method: 'two-body' } })
    expect(defaultScreen.approaches).toHaveLength(1)
    const none = await ok(ctx, 'orbit_conjunction', { ...base, screening_distance_km: 0.001, primary: { source: src(a), method: 'two-body' }, secondary: { source: src(b), method: 'two-body' } })
    expect(none.approaches).toEqual([])
    const bad: [Record<string, JsonValue>, string][] = [
      [{ ...base, end: base.start, primary: { source: src(a), method: 'two-body' }, secondary: { source: src(b), method: 'two-body' } }, 'end must follow start'],
      [{ ...base, step_s: 0.01, primary: { source: src(a), method: 'two-body' }, secondary: { source: src(b), method: 'two-body' } }, 'screening steps'],
      [{ ...base, primary: { source: src(a), method: 'two-body', sigma_rtn_km: [1, 0, 1] }, secondary: { source: src(b), method: 'two-body' } }, 'primary.sigma_rtn_km'],
      [{ ...base, primary: { source: src(a), method: 'two-body' }, secondary: { source: src(b), method: 'two-body', covariance_rtn_km2: [[1, 0], [0, 1]] } }, 'secondary.covariance_rtn_km2'],
    ]
    for (const [args, message] of bad) expect(await fail(ctx, 'orbit_conjunction', args)).toContain(message)
  })
})
