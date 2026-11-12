import { afterEach, describe, expect, it } from 'vitest'
import { DEG, predictObservation, propagateSgp4, temeToGcrf, gcrfToItrf, gcrfToTeme } from '@astro-one/astrodynamics'
import type { JsonValue } from '@astro-one/util-values'
import { queryTool } from '../src/tools/query.ts'
import { screenTool } from '../src/tools/screen.ts'
import { correlateTool } from '../src/tools/correlate.ts'
import { maneuverTool } from '../src/tools/maneuver.ts'
import { opticalTool } from '../src/tools/optical.ts'
import { lightcurveTool } from '../src/tools/lightcurve.ts'
import { decayTool } from '../src/tools/decay.ts'
import { tleFitTool } from '../src/tools/tle-fit.ts'
import { call, catalogText, cleanup, CONFIG, config, elements, EPOCH, fail, history, ok, omm, parse, sessionAgent, setup, tle } from './fixtures.ts'
import type { SetSpec } from './fixtures.ts'

afterEach(cleanup)

const iss: SetSpec = { name: 'ISS', number: 25544, n: 15.5, i: 51.6, raan: 10 }
const crosser: SetSpec = { name: 'CROSSER', number: 40000, n: 15.5, i: 97.5, raan: 10 }
const geo: SetSpec = { name: 'GEO SAT', number: 30000, n: 1.0027, i: 0.05, m: 100 }
const gps: SetSpec = { name: 'GPS', number: 20000, n: 2.0056, i: 55, e: 0.005 }
const iso = (t: number): string => new Date(t).toISOString()
const lines = (s: SetSpec): { line1: string; line2: string } => {
  const [line1, line2] = tle(s)
  return { line1, line2 }
}
const CATALOG = { 'cat.txt': catalogText([iss, crosser, geo, gps]) }

describe('evaluation budget', () => {
  const window = { start: iso(EPOCH), end: iso(EPOCH + 3650 * 86_400_000), step_s: 0.001 }

  it('rejects a window before building its sample grid', async () => {
    const { ctx } = await setup(CATALOG)
    expect(await fail(ctx, 'ssa_catalog_screen', { catalog_path: 'cat.txt', primary: { catalog_number: '25544' }, ...window })).toContain('model evaluations')
    expect(await fail(ctx, 'ssa_optical_windows', {
      object: lines(iss), station: { lat_deg: 40, lon_deg: 116, alt_km: 0 }, standard_magnitude: 0, ...window,
    })).toContain('model evaluations')
  })
})

describe('ssa_catalog_query', () => {
  it('reports classes, filters, and sorts', async () => {
    const { ctx } = await setup(CATALOG)
    const all = await ok(ctx, 'ssa_catalog_query', { catalog_path: 'cat.txt' })
    expect(all.total_objects).toBe(4)
    expect(all.regime_counts).toEqual([{ regime: 'GEO', count: 1 }, { regime: 'NSO', count: 1 }, { regime: 'LEO', count: 2 }])
    const rows = all.objects as { catalog_number: string; geo_longitude_deg: number | null; period_min: number }[]
    expect(rows.map(r => r.catalog_number)).toEqual(['20000', '25544', '30000', '40000'])
    expect(rows.map(r => r.geo_longitude_deg === null)).toEqual([true, true, false, true])
    expect(rows[1]!.period_min).toBeCloseTo(1440 / 15.5, 0)
    const leo = await ok(ctx, 'ssa_catalog_query', { catalog_path: 'cat.txt', regimes: ['LEO'], sort_by: 'inclination_deg', limit: 1 })
    expect([leo.matched, (leo.objects as { name: string }[]).map(r => r.name)]).toEqual([2, ['ISS']])
    const byName = await ok(ctx, 'ssa_catalog_query', { catalog_path: 'cat.txt', name_contains: 'sat', catalog_numbers: ['30000', '1'] })
    expect((byName.objects as { name: string }[]).map(r => r.name)).toEqual(['GEO SAT'])
    const band = await ok(ctx, 'ssa_catalog_query', {
      catalog_path: 'cat.txt', min_perigee_alt_km: 300, max_perigee_alt_km: 30000, min_apogee_alt_km: 300, max_apogee_alt_km: 30000,
      min_inclination_deg: 50, max_inclination_deg: 60, sort_by: 'perigee_alt_km',
    })
    expect((band.objects as { name: string }[]).map(r => r.name)).toEqual(['ISS', 'GPS'])
    const byEpoch = await ok(ctx, 'ssa_catalog_query', { catalog_path: 'cat.txt', sort_by: 'epoch' })
    expect(byEpoch.matched).toBe(4)
    const byApogee = await ok(ctx, 'ssa_catalog_query', { catalog_path: 'cat.txt', sort_by: 'apogee_alt_km' })
    expect((byApogee.objects as { name: string }[]).map(r => r.name)).toEqual(['CROSSER', 'ISS', 'GPS', 'GEO SAT'])
    expect(await fail(ctx, 'ssa_catalog_query', { catalog_path: 'cat.txt', limit: 0 })).toContain('limit must be an integer from 1 to 20')
  })

  it('reads catalogs relative to the calling session and names the file in failures', async () => {
    const { ctx, dir } = await setup({ ...CATALOG, 'bad.txt': 'NAME ONLY\n' })
    const agent = sessionAgent(dir)
    expect((await call(ctx, 'ssa_catalog_query', { catalog_path: 'cat.txt' }, agent)).isError).toBe(false)
    expect((await call(ctx, 'ssa_catalog_query', { catalog_path: 'bad.txt' })).text).toContain('bad.txt: the catalog holds no element sets')
    expect((await call(ctx, 'ssa_catalog_query', { catalog_path: '.' })).text).toContain('not a regular file')
  })
})

describe('ssa_catalog_screen', () => {
  const window = { start: iso(EPOCH - 600_000), end: iso(EPOCH + 600_000) }

  it('screens a catalog primary and an inline primary', async () => {
    const { ctx } = await setup(CATALOG)
    const out = await ok(ctx, 'ssa_catalog_screen', { catalog_path: 'cat.txt', primary: { catalog_number: '25544' }, ...window })
    expect(out.primary).toBe('ISS')
    expect(out.candidates_after_filter).toBe(1)
    type Approach = { name: string; miss_distance_km: number; collision_probability: number | null; max_collision_probability: number }
    const [hit] = out.approaches as Approach[]
    expect(hit!.name).toBe('CROSSER')
    expect(hit!.miss_distance_km).toBeLessThan(5)
    expect(hit!.collision_probability).toBeNull()
    expect(hit!.max_collision_probability).toBeGreaterThan(0)
    const inline = await ok(ctx, 'ssa_catalog_screen', {
      catalog_path: 'cat.txt', primary: { ...lines(iss), name: 'MY SAT' }, ...window,
      primary_sigma_rtn_km: [0.1, 0.5, 0.1], secondary_sigma_rtn_km: [0.2, 1, 0.2],
      step_s: 20, screening_distance_km: 10, hard_body_radius_km: 0.01, filter_pad_km: 50,
    })
    expect(inline.primary).toBe('MY SAT')
    expect((inline.approaches as { collision_probability: number }[])[0]!.collision_probability).toBeGreaterThanOrEqual(0)
  })

  it('renders an empty screen and caps the reported rows', async () => {
    const { ctx } = await setup({ ...CATALOG, 'many.txt': catalogText([iss, ...[1, 2, 3].map(k => ({ ...crosser, number: 40000 + k, name: `C${String(k)}` }))]) }, config({ maxResults: 2 }))
    const empty = await call(ctx, 'ssa_catalog_screen', { catalog_path: 'cat.txt', primary: { catalog_number: '30000' }, ...window })
    expect(empty.text).toMatch(/^No approach inside the screening distance among \d+ filtered candidates\.$/)
    const capped = await ok(ctx, 'ssa_catalog_screen', { catalog_path: 'many.txt', primary: { catalog_number: '25544' }, ...window })
    expect([(capped.approaches as unknown[]).length, capped.more_approaches]).toEqual([2, 1])
  })

  it('reports decaying secondaries and rejects invalid requests', async () => {
    const debris = { name: 'DEBRIS', number: 3, n: 16.3, i: 51, bstar: 0.2 }
    const { ctx } = await setup({ ...CATALOG, 'decay.txt': catalogText([iss, debris]) }, config({ maxEvaluations: 200 }))
    const decayed = await ok(ctx, 'ssa_catalog_screen', { catalog_path: 'decay.txt', primary: { catalog_number: '25544' }, start: iso(EPOCH), end: iso(EPOCH + 7200_000), step_s: 120, filter_pad_km: 1000 })
    expect((decayed.propagation_failures as { catalog_number: string }[]).map(f => f.catalog_number)).toEqual(['00003'])
    const base = { catalog_path: 'cat.txt', ...window }
    expect(await fail(ctx, 'ssa_catalog_screen', { ...base, primary: { catalog_number: '99' } })).toContain('00099 is not in the catalog')
    expect(await fail(ctx, 'ssa_catalog_screen', { ...base, primary: { catalog_number: '25544', ...lines(iss) } })).toContain('not both')
    expect(await fail(ctx, 'ssa_catalog_screen', { ...base, primary: { catalog_number: '25544' }, primary_sigma_rtn_km: [1, 0, 1] })).toContain('three positive numbers')
    expect(await fail(ctx, 'ssa_catalog_screen', { ...base, primary: { catalog_number: '25544' }, step_s: 1 })).toContain('at most 200 are allowed')
    expect(await fail(ctx, 'ssa_catalog_screen', { ...base, primary: { catalog_number: '25544' }, end: window.start })).toContain('end must follow start')
    expect(await fail(ctx, 'ssa_catalog_screen', { ...base, primary: { catalog_number: '25544' }, start: '2025-03-01' })).toContain('start: expected an ISO 8601')
  })
})

describe('ssa_correlate', () => {
  const site = { lat: 0.6, lon: 2.0, h: 0.1 }
  const station = { lat_deg: 0.6 / DEG, lon_deg: 2.0 / DEG, alt_km: 0.1 }
  const times = [0, 20, 40, 60].map(s => EPOCH + 5 * 3600_000 + s * 1000)
  const track = (aheadS: number): JsonValue[] => times.flatMap((t) => {
    const state = temeToGcrf(propagateSgp4(elements(iss), [t + aheadS * 1000])[0]!, t)
    const radec = predictObservation({ kind: 'radec', t, site, value: [0, 0], sigma: 1 }, state).map(x => x / DEG)
    const azel = predictObservation({ kind: 'azel', t, site, value: [0, 0], sigma: 1 }, state).map(x => x / DEG)
    const [range] = predictObservation({ kind: 'range', t, site, value: 0, sigma: 1 }, state)
    const [rate] = predictObservation({ kind: 'range-rate', t, site, value: 0, sigma: 1 }, state)
    return [
      { time: iso(t), type: 'radec', value: radec, sigma: 0.001, station },
      { time: iso(t), type: 'azel', value: azel, sigma: 0.001, station },
      { time: iso(t), type: 'range', value: [range!], sigma: 0.01, station },
      { time: iso(t), type: 'range_rate', value: [rate!], sigma: 0.0001, station },
    ]
  })

  it('identifies the observed object and its timing bias', async () => {
    const { ctx } = await setup(CATALOG)
    const exact = await ok(ctx, 'ssa_correlate', { catalog_path: 'cat.txt', observations: track(0), candidates: 2 })
    expect(exact.correlated).toBe(true)
    type Candidate = { catalog_number: string; score_sigma: number; time_bias_s: null; rms_range_km: number; passes_gate: boolean }
    const [best, second] = exact.candidates as Candidate[]
    expect([best!.catalog_number, best!.time_bias_s, best!.passes_gate, second!.passes_gate]).toEqual(['25544', null, true, false])
    expect(best!.score_sigma).toBeLessThan(1e-3)
    expect(best!.rms_range_km).toBeLessThan(1e-6)
    const ranges = track(0).filter(o => (o as { type: string }).type.startsWith('range'))
    const ranged = (await ok(ctx, 'ssa_correlate', { catalog_path: 'cat.txt', observations: ranges, candidates: 1 }))
      .candidates as Record<string, JsonValue>[]
    expect([ranged[0]!.rms_angle_arcsec, typeof ranged[0]!.rms_range_km]).toEqual([null, 'number'])
    const angles = track(0).filter(o => (o as { type: string }).type === 'radec')
    const angled = (await ok(ctx, 'ssa_correlate', { catalog_path: 'cat.txt', observations: angles, candidates: 1 }))
      .candidates as Record<string, JsonValue>[]
    expect([angled[0]!.rms_range_km, angled[0]!.rms_range_rate_km_s]).toEqual([null, null])
    const late = await ok(ctx, 'ssa_correlate', { catalog_path: 'cat.txt', observations: track(30), gate_sigma: 5 })
    expect(late.correlated).toBe(false)
    const biased = await ok(ctx, 'ssa_correlate', { catalog_path: 'cat.txt', observations: track(30), max_time_bias_s: 100, candidates: 1 })
    expect(biased.correlated).toBe(true)
    expect((biased.candidates as { time_bias_s: number }[])[0]!.time_bias_s).toBeCloseTo(30, 1)
  })

  it('reports an uncorrelated track when every element set fails and validates observations', async () => {
    const { ctx } = await setup({ 'decay.txt': catalogText([{ name: 'DEBRIS', number: 3, n: 16.3, i: 51, bstar: 0.2 }]) }, config({ maxObservations: 3 }))
    const one = (track(0) as Record<string, JsonValue>[]).slice(0, 2)
    expect(await ok(ctx, 'ssa_correlate', { catalog_path: 'decay.txt', observations: one })).toMatchObject({ correlated: false, candidates: [] })
    const base = { catalog_path: 'decay.txt' }
    expect(await fail(ctx, 'ssa_correlate', { ...base, observations: [] })).toContain('must not be empty')
    expect(await fail(ctx, 'ssa_correlate', { ...base, observations: track(0).slice(0, 4) })).toContain('at most 3 observations')
    expect(await fail(ctx, 'ssa_correlate', { ...base, observations: [{ ...one[0]!, value: [1] }] })).toContain('observations[0].value must hold 2 number(s) for type radec')
    expect(await fail(ctx, 'ssa_correlate', { ...base, observations: [{ ...one[0]!, sigma: 0 }] })).toContain('observations[0].sigma must be positive')
    expect(await fail(ctx, 'ssa_correlate', { ...base, observations: one, max_time_bias_s: -1 })).toContain('must not be negative')
    expect(await fail(ctx, 'ssa_correlate', { ...base, observations: one, candidates: 21 })).toContain('candidates must be an integer from 1 to 20')
    expect(await fail(ctx, 'ssa_correlate', { ...base, observations: [{ ...one[0]!, station: { lat_deg: 91, lon_deg: 0, alt_km: 0 } }] })).toContain('lat_deg must lie in [-90, 90]')
  })

  it('refuses requests over the evaluation budget', async () => {
    const { ctx } = await setup(CATALOG, config({ maxEvaluations: 50 }))
    expect(await fail(ctx, 'ssa_correlate', { catalog_path: 'cat.txt', observations: track(0).slice(0, 4), max_time_bias_s: 10 })).toContain('at most 50 are allowed')
  })
})

describe('ssa_maneuver_detect', () => {
  const base: SetSpec = { name: 'SAT', number: 25544, n: 15.5, i: 51.6 }
  const sets = history(base, [0, 1, 2, 3, 4, 5, 6, 7], k => ({ n: (k >= 4 ? 15.49 : 15.5) + 1e-6 * Math.sin(k * 12.9898) }))

  it('finds a maneuver in inline and file histories', async () => {
    const other = history({ ...base, number: 1 }, [0, 1, 2, 3, 4])
    const { ctx } = await setup({ 'hist.txt': catalogText([...sets, ...other]), 'one.json': JSON.stringify(sets.map(omm)) })
    const inline = await ok(ctx, 'ssa_maneuver_detect', { element_sets: [...sets, sets[2]!].map(lines) })
    expect(inline.element_sets).toBe(8)
    const [event] = inline.events as { kind: string; dv_in_plane_m_s: number; dv_total_m_s: number; after_epoch: string }[]
    expect([event!.kind, event!.after_epoch]).toEqual(['in-plane', iso(EPOCH + 3 * 86_400_000)])
    expect(event!.dv_total_m_s).toBe(event!.dv_in_plane_m_s)
    const file = await ok(ctx, 'ssa_maneuver_detect', { history_path: 'hist.txt', catalog_number: '25544', z_threshold: 8, min_delta_a_km: 0.1, min_plane_change_deg: 0.01 })
    expect([file.name, file.events]).toEqual(['SAT', [expect.objectContaining({ kind: 'in-plane' })]])
    expect((await ok(ctx, 'ssa_maneuver_detect', { history_path: 'one.json' })).catalog_number).toBe('25544')
    expect(await fail(ctx, 'ssa_maneuver_detect', { history_path: 'hist.txt' })).toContain('holds 2 objects; give catalog_number')
    expect(await fail(ctx, 'ssa_maneuver_detect', { history_path: 'hist.txt', catalog_number: '1', z_threshold: 0 })).toContain('z_threshold must be positive')
  })

  it('caps events and validates the history', async () => {
    const jumps = history(base, [0, 1, 2, 3, 4, 5, 6, 7, 8], k => ({ n: 15.5 + (k % 2 === 0 ? 0 : 0.01) }))
    const { ctx } = await setup({}, config({ maxResults: 1, maxObservations: 6 }))
    expect(await fail(ctx, 'ssa_maneuver_detect', { element_sets: jumps.map(lines) })).toContain('at most 6 element sets')
    const capped = await ok(ctx, 'ssa_maneuver_detect', { element_sets: jumps.slice(0, 6).map(lines), z_threshold: 1 })
    expect([(capped.events as unknown[]).length, (capped.more_events as number) > 0]).toEqual([1, true])
    expect(await fail(ctx, 'ssa_maneuver_detect', { element_sets: sets.slice(0, 4).map(lines) })).toContain('has 4 element set(s) with distinct epochs; at least 5 are needed')
    expect(await fail(ctx, 'ssa_maneuver_detect', {})).toContain('give exactly one of history_path or element_sets')
    const { ctx: tight } = await setup({}, config({ maxEvaluations: 5 }))
    expect(await fail(tight, 'ssa_maneuver_detect', { element_sets: sets.slice(0, 5).map(lines) })).toContain('at most 5 are allowed')
  })
})

describe('ssa_optical_windows', () => {
  const args = {
    object: lines(iss), station: { lat_deg: 40, lon_deg: 116, alt_km: 0.05 }, start: iso(EPOCH), end: iso(EPOCH + 2 * 86_400_000),
    min_elevation_deg: 10, min_moon_separation_deg: 0,
  }

  it('lists windows with pointing and brightness', async () => {
    const { ctx } = await setup()
    const out = await ok(ctx, 'ssa_optical_windows', { ...args, standard_magnitude: -1.8 })
    type Window = { duration_s: number; brightest: { magnitude: number; elevation_deg: number; sun_elevation_deg: number } }
    const windows = out.windows as Window[]
    expect(windows.length).toBeGreaterThan(0)
    expect(windows[0]!.brightest.elevation_deg).toBeGreaterThanOrEqual(10)
    expect(windows[0]!.brightest.sun_elevation_deg).toBeLessThanOrEqual(-12)
    const sized = await ok(ctx, 'ssa_optical_windows', { ...args, cross_section_m2: 2000, albedo: 0.2, extinction_mag_per_airmass: 0, max_sun_elevation_deg: -6, step_s: 20 })
    expect(sized.standard_magnitude).toBeCloseTo(-26.74 - 2.5 * Math.log10((2 * 0.2 * 2000) / (3 * Math.PI ** 2) / 1e12), 2)
    const faint = await call(ctx, 'ssa_optical_windows', { ...args, standard_magnitude: 8, limiting_magnitude: 4 })
    expect(faint.text).toBe('No observable window in the search interval.')
    const { ctx: capped } = await setup({}, config({ maxResults: 1 }))
    expect(((await ok(capped, 'ssa_optical_windows', { ...args, standard_magnitude: -1.8 })).windows as unknown[]).length).toBe(1)
  })

  it('validates constraints and the brightness model', async () => {
    const { ctx } = await setup({}, config({ maxEvaluations: 100 }))
    const m = { ...args, standard_magnitude: 0, end: iso(EPOCH + 600_000) }
    expect(await fail(ctx, 'ssa_optical_windows', { ...m, min_elevation_deg: 90 })).toContain('min_elevation_deg must lie in [0, 90)')
    expect(await fail(ctx, 'ssa_optical_windows', { ...m, min_moon_separation_deg: 181 })).toContain('min_moon_separation_deg')
    expect(await fail(ctx, 'ssa_optical_windows', { ...m, max_sun_elevation_deg: 91 })).toContain('max_sun_elevation_deg')
    expect(await fail(ctx, 'ssa_optical_windows', { ...m, cross_section_m2: 1 })).toContain('exactly one of standard_magnitude or cross_section_m2')
    expect(await fail(ctx, 'ssa_optical_windows', { ...m, albedo: 0 })).toContain('albedo must lie in (0, 1]')
    expect(await fail(ctx, 'ssa_optical_windows', { ...m, extinction_mag_per_airmass: -1 })).toContain('must not be negative')
    expect(await fail(ctx, 'ssa_optical_windows', { ...m, step_s: 1 })).toContain('at most 100 are allowed')
    expect(await fail(ctx, 'ssa_optical_windows', { ...m, object: { line1: 'x' } })).toContain('object needs line1 and line2, or omm')
  })
})

describe('ssa_lightcurve', () => {
  const points = Array.from({ length: 200 }, (_, k) => ({
    t_s: k * 2, magnitude: 6 + 0.3 * Math.cos((2 * Math.PI * k * 2) / 30) + 0.01 * Math.sin(k * 7.1),
  }))

  it('finds the period from inline points and CSV files', async () => {
    const csv = ['time,magnitude,sigma', '# exported', ...points.map(p => `${iso(EPOCH + p.t_s * 1000)},${String(p.magnitude)},0.02`)].join('\n')
    const plain = points.map(p => `${String(p.t_s)},${String(p.magnitude)}`).join('\n')
    const { ctx, dir } = await setup({ 'lc.csv': csv, 'plain.csv': plain, 'bad.csv': 'time,magnitude\n1,x\n' })
    expect((await call(ctx, 'ssa_lightcurve', { path: 'plain.csv' }, sessionAgent(dir))).isError).toBe(false)
    const inline = await ok(ctx, 'ssa_lightcurve', { points, peaks: 2 })
    const [peak] = inline.peaks as { period_s: number; amplitude_mag: number; false_alarm_probability: number }[]
    expect(peak!.period_s).toBeCloseTo(30, 1)
    expect(peak!.amplitude_mag).toBeCloseTo(0.3, 2)
    expect(peak!.false_alarm_probability).toBeLessThan(1e-20)
    const fromCsv = await ok(ctx, 'ssa_lightcurve', { path: 'lc.csv', min_period_s: 10, max_period_s: 100, oversampling: 5 })
    expect((fromCsv.peaks as { period_s: number }[])[0]!.period_s).toBeCloseTo(30, 1)
    expect((await ok(ctx, 'ssa_lightcurve', { path: 'plain.csv' })).points).toBe(200)
    expect(await fail(ctx, 'ssa_lightcurve', { path: 'bad.csv' })).toContain('bad.csv: row 2 must hold a time and a magnitude')
    expect(await fail(ctx, 'ssa_lightcurve', { path: '.' })).toContain('not a regular file')
  })

  it('validates points and search bounds', async () => {
    const { ctx } = await setup({}, config({ maxObservations: 150 }))
    expect(await fail(ctx, 'ssa_lightcurve', {})).toContain('exactly one of points or path')
    expect(await fail(ctx, 'ssa_lightcurve', { points: points.slice(0, 9) })).toContain('at least 10 points; got 9')
    expect(await fail(ctx, 'ssa_lightcurve', { points })).toContain('at most 150 points')
    const few = points.slice(0, 100)
    expect(await fail(ctx, 'ssa_lightcurve', { points: [{ ...few[0]!, sigma: 1 }, ...few.slice(1)] })).toContain('sigma for every point or for none')
    expect(await fail(ctx, 'ssa_lightcurve', { points: few.map(p => ({ ...p, sigma: 0 })) })).toContain('points[0].sigma must be positive')
    expect(await fail(ctx, 'ssa_lightcurve', { points: few, min_period_s: 50, max_period_s: 40 })).toContain('max_period_s must exceed min_period_s')
    expect(await fail(ctx, 'ssa_lightcurve', { points: few, peaks: 0 })).toContain('peaks must be an integer')
    const { ctx: tight } = await setup({}, config({ maxEvaluations: 1000 }))
    expect(await fail(tight, 'ssa_lightcurve', { points: few })).toContain('at most 1000 are allowed')
  })
})

describe('ssa_decay', () => {
  it('predicts re-entry from an element set and from an orbit', async () => {
    const { ctx } = await setup()
    const low = { ...iss, n: 15.9, bstar: 4e-4 }
    const fromSet = await ok(ctx, 'ssa_decay', { object: lines(low) })
    expect(fromSet.ballistic_coefficient_m2_kg).toBeCloseTo(12.741621 * 4e-4, 8)
    const nominal = Date.parse(fromSet.reentry_epoch as string)
    expect(Date.parse(fromSet.early_reentry_epoch as string)).toBeLessThan(nominal)
    expect(Date.parse(fromSet.late_reentry_epoch as string)).toBeGreaterThan(nominal)
    expect(fromSet.lifetime_days).toBeCloseTo((nominal - EPOCH) / 86_400_000, 1)
    const history = fromSet.history as { perigee_alt_km: number }[]
    expect(history.length).toBeLessThanOrEqual(20)
    expect(history.at(-1)!.perigee_alt_km).toBeLessThanOrEqual(121)
    const orbit = await ok(ctx, 'ssa_decay', {
      orbit: { epoch: iso(EPOCH), perigee_alt_km: 250, apogee_alt_km: 260, inclination_deg: 97 },
      ballistic: { cd: 2.2, area_m2: 1, mass_kg: 100 }, density_scale: 1.5, uncertainty_factor: 1, reentry_altitude_km: 150,
    })
    expect(orbit.early_reentry_epoch).toBe(orbit.reentry_epoch)
    const overridden = await ok(ctx, 'ssa_decay', { object: lines(low), ballistic: { cd: 2, area_m2: 1, mass_kg: 1000 }, max_years: 0.01 })
    expect([overridden.ballistic_coefficient_m2_kg, overridden.reentry_epoch, overridden.lifetime_days]).toEqual([0.002, null, null])
  })

  it('validates inputs', async () => {
    const { ctx } = await setup({}, config({ maxResults: 1 }))
    const orbit = { epoch: iso(EPOCH), perigee_alt_km: 250, apogee_alt_km: 260, inclination_deg: 97 }
    const ballistic = { cd: 2.2, area_m2: 1, mass_kg: 100 }
    expect(await fail(ctx, 'ssa_decay', {})).toContain('exactly one of object or orbit')
    expect(await fail(ctx, 'ssa_decay', { orbit })).toContain('orbit needs ballistic')
    expect(await fail(ctx, 'ssa_decay', { orbit: { ...orbit, perigee_alt_km: 300 }, ballistic })).toContain('0 < perigee_alt_km <= apogee_alt_km')
    expect(await fail(ctx, 'ssa_decay', { orbit: { ...orbit, inclination_deg: 200 }, ballistic })).toContain('inclination_deg must lie in [-180, 180]')
    expect(await fail(ctx, 'ssa_decay', { object: lines(iss) })).toContain('non-positive B*')
    expect(await fail(ctx, 'ssa_decay', { orbit, ballistic, uncertainty_factor: 0.5 })).toContain('at least 1')
    expect(await fail(ctx, 'ssa_decay', { orbit, ballistic: { ...ballistic, mass_kg: 0 } })).toContain('ballistic.mass_kg must be positive')
    expect(((await ok(ctx, 'ssa_decay', { orbit, ballistic })).history as unknown[]).length).toBe(1)
  })
})

describe('ssa_tle_fit', () => {
  const truth = { ...iss, e: 0.001, argp: 30, m: 50 }
  const times = Array.from({ length: 24 }, (_, k) => EPOCH + k * 300_000)
  const states = propagateSgp4(elements(truth), times)
  const rows = (frame: 'gcrf' | 'teme' | 'itrf'): JsonValue[] => states.map((s) => {
    const g = temeToGcrf(s, s.t)
    const state = frame === 'teme' ? s : frame === 'itrf' ? gcrfToItrf(g, s.t) : g
    return { time: iso(s.t), position_km: [...state.r], velocity_km_s: [...state.v] }
  })

  it('fits a TLE in every input frame', async () => {
    const { ctx } = await setup()
    const out = await ok(ctx, 'ssa_tle_fit', { ephemeris: rows('gcrf'), catalog_number: '25544', international_designator: '1998-067A', name: 'ISS' })
    expect((out.line1 as string).slice(0, 18)).toBe('1 25544U 98067A   ')
    expect(out.rms_position_km).toBeLessThan(0.02)
    expect(out.converged).toBe(true)
    expect((out.omm as { OBJECT_NAME: string }).OBJECT_NAME).toBe('ISS')
    // The TLE day field resolves 10⁻⁸ day, about 0.9 ms.
    expect(Math.abs(parse([out.line1 as string, out.line2 as string]).epoch - times[23]!)).toBeLessThan(1)
    for (const frame of ['teme', 'itrf'] as const) {
      expect((await ok(ctx, 'ssa_tle_fit', { ephemeris: rows(frame), frame, epoch: iso(EPOCH + 3600_000), fit_bstar: true, bstar: 1e-5 })).rms_position_km).toBeLessThan(0.05)
    }
    const unnamed = await ok(ctx, 'ssa_tle_fit', { ephemeris: rows('gcrf') })
    expect([(unnamed.line1 as string).slice(2, 17), (unnamed.omm as { OBJECT_ID: string }).OBJECT_ID]).toEqual(['99999U         ', 'UNKNOWN'])
    expect(gcrfToTeme).toBeTypeOf('function')
  })

  it('validates the ephemeris and labels', async () => {
    const { ctx } = await setup({}, config({ maxObservations: 30, maxEvaluations: 20000 }))
    const ephemeris = rows('gcrf')
    expect(await fail(ctx, 'ssa_tle_fit', { ephemeris: ephemeris.slice(0, 5) })).toContain('at least 6 ephemeris rows; got 5')
    expect(await fail(ctx, 'ssa_tle_fit', { ephemeris: [...ephemeris, ...ephemeris] })).toContain('at most 30 ephemeris rows')
    expect(await fail(ctx, 'ssa_tle_fit', { ephemeris, max_iterations: 0 })).toContain('max_iterations must be a positive integer')
    expect(await fail(ctx, 'ssa_tle_fit', { ephemeris, max_iterations: 100 })).toContain('at most 20000 are allowed')
    expect(await fail(ctx, 'ssa_tle_fit', { ephemeris, catalog_number: 'A1234' })).toContain('one to five digits')
    expect(await fail(ctx, 'ssa_tle_fit', { ephemeris, international_designator: '98067A' })).toContain('2025-001A')
    expect(await fail(ctx, 'ssa_tle_fit', { ephemeris: [{ ...(ephemeris[0] as Record<string, JsonValue>), position_km: [1, 2] }, ...ephemeris.slice(1)] })).toContain('ephemeris[0].position_km must hold three numbers')
  })
})

describe('presentation and element-set inputs', () => {
  const bounds = CONFIG
  it('titles pending calls from their arguments', async () => {
    const { ctx } = await setup()
    const views = [
      queryTool(ctx, bounds).presentCall?.({ catalog_path: 'c.txt' }),
      screenTool(ctx, bounds).presentCall?.({ catalog_path: 'c.txt', primary: {}, start: 's', end: 'e' }),
      correlateTool(ctx, bounds).presentCall?.({ catalog_path: 'c.txt', observations: [] }),
      maneuverTool(ctx, bounds).presentCall?.({ history_path: 'h.txt' }),
      maneuverTool(ctx, bounds).presentCall?.({}),
      opticalTool(bounds).presentCall?.({ object: {}, station: { lat_deg: 1, lon_deg: 2, alt_km: 0 }, start: 's', end: 'e' }),
      lightcurveTool(ctx, bounds).presentCall?.({ path: 'l.csv' }),
      lightcurveTool(ctx, bounds).presentCall?.({}),
      decayTool(bounds).presentCall?.({}),
      tleFitTool(bounds).presentCall?.({ ephemeris: [] }),
    ] as { title: string; locations?: { path: string }[] }[]
    expect(views.map(v => [v.title, v.locations?.[0]?.path ?? null])).toEqual([
      ['Catalog query', 'c.txt'],
      ['Catalog conjunction screening', 'c.txt'],
      ['Track correlation (0 observations)', 'c.txt'],
      ['Maneuver detection', 'h.txt'],
      ['Maneuver detection', null],
      ['Optical windows (1°, 2°)', null],
      ['Light-curve period', 'l.csv'],
      ['Light-curve period', null],
      ['Orbital decay', null],
      ['TLE fit (0 rows)', null],
    ])
  })

  it('accepts OMM element sets and rejects malformed ones', async () => {
    const { ctx } = await setup()
    const station = { lat_deg: 40, lon_deg: 116, alt_km: 0 }
    const window = { station, start: iso(EPOCH), end: iso(EPOCH + 600_000), standard_magnitude: 0 }
    expect((await ok(ctx, 'ssa_optical_windows', { ...window, object: { omm: omm(iss) } })).object).toBe('ISS')
    expect((await ok(ctx, 'ssa_optical_windows', { ...window, object: { omm: omm(iss), name: 'LABEL' } })).object).toBe('LABEL')
    expect((await ok(ctx, 'ssa_optical_windows', { ...window, object: lines(iss) })).object).toBe('25544')
    expect(await fail(ctx, 'ssa_optical_windows', { ...window, object: { omm: omm(iss), ...lines(iss) } })).toContain('either line1/line2 or omm')
    expect(await fail(ctx, 'ssa_optical_windows', { ...window, object: { omm: [1] } })).toContain('object.omm must be an object')
    expect(await fail(ctx, 'ssa_optical_windows', { ...window, object: { line1: lines(iss).line2, line2: lines(iss).line1 } })).toContain('object: TLE lines must start')
  })
})
