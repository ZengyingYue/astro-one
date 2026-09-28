import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@astro-one/util-values'
import { renderEphemeris } from '../src/propagate.ts'
import { hermite } from '../src/trajectory.ts'
import { Context } from '@astro-one/cordis'
import SystemPrompt from '@astro-one/system-prompt'
import ToolRuntime from '@astro-one/tools'
import * as Plugin from '../src/index.ts'
import { call, CONFIG, fail, ISS_OMM, ok, setup, TLE } from './helpers.ts'

const STATE = {
  kind: 'state',
  epoch: '2024-01-01T00:00:00Z',
  frame: 'gcrf',
  position_km: [6878, 0, 0],
  velocity_km_s: [0, 5.383, 5.383],
} as const

describe('orbit_propagate', () => {
  it('registers every astrodynamics tool with a stable schema', async () => {
    const ctx = await setup()
    const names = ctx.tools.schemas().map(s => s.name).filter(n => n.startsWith('orbit_') || n.startsWith('attitude_')).sort()
    expect(names).toEqual(['attitude_determine', 'orbit_conjunction', 'orbit_convert', 'orbit_determine', 'orbit_passes', 'orbit_propagate', 'orbit_transfer'])
  })

  it('removes every tool when its plugin fiber is disposed', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const fiber = await ctx.plugin(Plugin, CONFIG)
    expect(ctx.tools.schemas().some(s => s.name === 'orbit_propagate')).toBe(true)
    await fiber.dispose()
    expect(ctx.tools.schemas().filter(s => s.name.startsWith('orbit_') || s.name === 'attitude_determine')).toEqual([])
  })

  it('propagates a TLE with SGP4 into GCRF and renders CSV', async () => {
    const ctx = await setup()
    const result = await call(ctx, 'orbit_propagate', { source: TLE, method: 'sgp4', times: ['2000-06-27T18:50:19.733Z'] })
    expect(result.isError).toBe(false)
    const value = result.value as { samples: { position_km: number[] }[]; elements_at_epoch: { e: number }; frame: string }
    expect(value.frame).toBe('gcrf')
    expect(value.samples[0]!.position_km).toHaveLength(3)
    expect(value.elements_at_epoch.e).toBeGreaterThan(0.18)
    expect(result.text).toMatch(/^sgp4 ephemeris, 1 samples, frame gcrf\./)
    expect(result.text).toContain('time,x_km,y_km,z_km,vx_km_s,vy_km_s,vz_km_s')
  })

  it('reports every output frame from a grid', async () => {
    const ctx = await setup()
    for (const output_frame of ['gcrf', 'itrf', 'teme', 'geodetic']) {
      const value = await ok(ctx, 'orbit_propagate', {
        source: { kind: 'omm', omm: ISS_OMM }, method: 'sgp4', start: '2025-03-01T00:00:00Z', end: '2025-03-01T00:10:00Z', step_s: 300, output_frame,
      })
      const samples = value.samples as Record<string, JsonValue>[]
      expect(samples).toHaveLength(3)
      if (output_frame === 'geodetic') expect(Math.abs(samples[0]!.lat_deg as number)).toBeLessThanOrEqual(51.7)
      else expect(samples[0]!.position_km).toHaveLength(3)
    }
    const text = await call(ctx, 'orbit_propagate', { source: { kind: 'omm', omm: ISS_OMM }, method: 'sgp4', times: ['2025-03-01T00:00:00Z'], output_frame: 'geodetic' })
    expect(text.text).toContain('time,lat_deg,lon_deg,alt_km')
  })

  it('propagates states and elements numerically and with two-body motion', async () => {
    const ctx = await setup()
    const numeric = await ok(ctx, 'orbit_propagate', {
      source: STATE, method: 'numerical', times: ['2024-01-01T01:00:00Z'],
      forces: {
        zonal_degree: 4, drag: { cd: 2.2, area_m2: 4, mass_kg: 500 }, srp: { cr: 1.3, area_m2: 4, mass_kg: 500 }, sun: true, moon: true,
      },
    })
    const kepler = await ok(ctx, 'orbit_propagate', { source: STATE, method: 'two-body', times: ['2024-01-01T01:00:00Z'] })
    const a = (numeric.samples as { position_km: number[] }[])[0]!.position_km
    const b = (kepler.samples as { position_km: number[] }[])[0]!.position_km
    const diff = Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!)
    expect(diff).toBeGreaterThan(0.1)
    expect(diff).toBeLessThan(200)
    const elements = await ok(ctx, 'orbit_propagate', {
      source: { kind: 'elements', epoch: '2024-01-01T00:00:00Z', a_km: 7000, e: 0.01, i_deg: 98, raan_deg: 10, argp_deg: 20, mean_anomaly_deg: 30 },
      method: 'two-body', times: ['2024-01-01T00:00:00Z'],
    })
    expect((elements.elements_at_epoch as { mean_anomaly_deg: number }).mean_anomaly_deg).toBeCloseTo(30, 6)
    const hyper = await ok(ctx, 'orbit_propagate', {
      source: { kind: 'elements', epoch: '2024-01-01T00:00:00Z', a_km: -20000, e: 1.5, i_deg: 10, raan_deg: 0, argp_deg: 0, true_anomaly_deg: 0 },
      method: 'two-body', times: ['2024-01-01T00:10:00Z'],
    })
    expect((hyper.elements_at_epoch as { period_s: null; apogee_alt_km: null }).period_s).toBeNull()
    const itrf = await ok(ctx, 'orbit_propagate', { source: { ...STATE, frame: 'itrf' }, method: 'two-body', times: ['2024-01-01T00:00:00Z'], eop: { dut1_s: 0.1, xp_arcsec: 0.1, yp_arcsec: 0.3 } })
    const teme = await ok(ctx, 'orbit_propagate', { source: { ...STATE, frame: 'teme' }, method: 'two-body', times: ['2024-01-01T00:00:00Z'] })
    expect(itrf.samples).not.toEqual(teme.samples)
    const tleNumeric = await ok(ctx, 'orbit_propagate', { source: TLE, method: 'numerical', times: ['2000-06-28T00:00:00Z'] })
    expect(tleNumeric.method).toBe('numerical')
  })

  it('names the field of every invalid input', async () => {
    const ctx = await setup()
    const cases: [Record<string, JsonValue>, string][] = [
      [{ source: STATE, method: 'sgp4', times: ['2024-01-01T00:00:00Z'] }, 'needs a tle or omm source'],
      [{ source: { kind: 'tle', line1: TLE.line1 }, method: 'sgp4', times: ['2024-01-01T00:00:00Z'] }, 'line1 and source.line2'],
      [{ source: { kind: 'omm', omm: [1] }, method: 'sgp4', times: ['2024-01-01T00:00:00Z'] }, 'CCSDS OMM keywords'],
      [{ source: { ...STATE, position_km: [1, 2] }, method: 'two-body', times: ['2024-01-01T00:00:00Z'] }, 'position_km must be'],
      [{ source: { ...STATE, epoch: 'yesterday' }, method: 'two-body', times: ['2024-01-01T00:00:00Z'] }, 'source.epoch: expected an ISO 8601'],
      [{ source: { kind: 'state', frame: 'gcrf', position_km: [7000, 0, 0], velocity_km_s: [0, 7, 0] }, method: 'two-body', times: ['2024-01-01T00:00:00Z'] }, 'source.epoch is required'],
      [{ source: { kind: 'elements', epoch: '2024-01-01T00:00:00Z', a_km: 7000, e: 1, i_deg: 0, raan_deg: 0, argp_deg: 0, true_anomaly_deg: 0 }, method: 'two-body', times: ['2024-01-01T00:00:00Z'] }, 'not exactly 1'],
      [{ source: { kind: 'elements', epoch: '2024-01-01T00:00:00Z', a_km: -7000, e: 0.1, i_deg: 0, raan_deg: 0, argp_deg: 0, true_anomaly_deg: 0 }, method: 'two-body', times: ['2024-01-01T00:00:00Z'] }, 'positive for ellipses'],
      [{ source: { kind: 'elements', epoch: '2024-01-01T00:00:00Z', a_km: 7000, e: 0.1, i_deg: 0, raan_deg: 0, argp_deg: 0 }, method: 'two-body', times: ['2024-01-01T00:00:00Z'] }, 'exactly one of'],
      [{ source: { kind: 'elements', epoch: '2024-01-01T00:00:00Z', a_km: 7000, e: 0.1, raan_deg: 0, argp_deg: 0, true_anomaly_deg: 0 }, method: 'two-body', times: ['2024-01-01T00:00:00Z'] }, 'source.i_deg must be a finite number'],
      [{ source: STATE, method: 'two-body', times: [] }, 'times must not be empty'],
      [{ source: STATE, method: 'two-body', times: ['2024-01-01T00:00:00Z'], step_s: 5 }, 'not both'],
      [{ source: STATE, method: 'two-body', start: '2024-01-01T01:00:00Z', end: '2024-01-01T00:00:00Z', step_s: 60 }, 'must not precede'],
      [{ source: STATE, method: 'two-body', start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z', step_s: 1 }, 'at most 2000 are allowed'],
      [{ source: STATE, method: 'two-body', start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z', step_s: -1 }, 'step_s must be positive'],
      [{ source: STATE, method: 'numerical', times: ['2024-01-01T00:00:00Z'], forces: { zonal_degree: 9 } }, 'zonal_degree'],
      [{ source: STATE, method: 'numerical', times: ['2024-01-01T00:00:00Z'], forces: { drag: { cd: 0, area_m2: 1, mass_kg: 1 } } }, 'forces.drag.cd must be positive'],
    ]
    for (const [args, message] of cases) expect(await fail(ctx, 'orbit_propagate', args)).toContain(message)
    expect(await fail(ctx, 'orbit_propagate', { source: STATE, method: 'two-body', times: Array.from({ length: 2001 }, () => '2024-01-01T00:00:00Z') })).toContain('at most 2000 output times')
  })

  it('renders an empty ephemeris row set and interpolates between samples', () => {
    expect(renderEphemeris({
      method: 'two-body', frame: 'gcrf', epoch: 'e', elements_at_epoch: { a_km: null, e: 1, i_deg: 0, perigee_alt_km: 0, apogee_alt_km: null, period_s: null },
      samples: [{ time: 't' }],
    })).toContain('\nt')
    const linear = hermite([{ r: [0, 0, 0], v: [1, 0, 0] }, { r: [1, 0, 0], v: [1, 0, 0] }], 0, 1000, 500)
    expect(linear.r[0]).toBeCloseTo(0.5, 12)
    expect(linear.v[0]).toBeCloseTo(1, 12)
  })
})

describe('orbit_convert', () => {
  it('converts states, stations, and time scales', async () => {
    const ctx = await setup()
    const state = await ok(ctx, 'orbit_convert', { operation: 'state', source: TLE })
    expect(Object.keys(state).sort()).toEqual(['elements', 'epoch', 'gcrf', 'itrf', 'subpoint', 'teme'])
    const direct = await ok(ctx, 'orbit_convert', { operation: 'state', source: STATE })
    expect((direct.gcrf as { position_km: number[] }).position_km).toEqual([6878, 0, 0])
    const site = await ok(ctx, 'orbit_convert', { operation: 'geodetic', station: { lat_deg: 0, lon_deg: 0, alt_km: 0 } })
    expect(site.itrf_position_km).toEqual([6378.137, 0, 0])
    const time = await ok(ctx, 'orbit_convert', { operation: 'time', time: '2024-01-07T00:00:00Z' })
    expect(time.gps_week).toBe(2296)
    expect(time.gps_seconds_of_week).toBe(18)
    expect(time.tai_minus_utc_s).toBe(37)
    expect(await fail(ctx, 'orbit_convert', { operation: 'geodetic' })).toContain('station is required')
    expect(await fail(ctx, 'orbit_convert', { operation: 'state' })).toContain('source is required')
    expect(await fail(ctx, 'orbit_convert', { operation: 'geodetic', station: { lat_deg: 91, lon_deg: 0, alt_km: 0 } })).toContain('lat_deg')
    expect(await fail(ctx, 'orbit_convert', { operation: 'time' })).toContain('time is required')
  })
})

describe('orbit_transfer', () => {
  it('solves Lambert arcs with Δv and prices impulsive transfers', async () => {
    const ctx = await setup()
    const lambert = await ok(ctx, 'orbit_transfer', {
      mode: 'lambert', r1_km: [5000, 10000, 2100], r2_km: [-14600, 2500, 7000], tof_s: 3600, v1_km_s: [-5, 2, 3], v2_km_s: [-3, -4, 0],
    })
    const arc = (lambert.arcs as { v1_km_s: number[]; total_dv_km_s: number }[])[0]!
    expect(arc.v1_km_s[0]).toBeCloseTo(-5.9925, 3)
    expect(arc.total_dv_km_s).toBeGreaterThan(0)
    const bare = await ok(ctx, 'orbit_transfer', { mode: 'lambert', r1_km: [7000, 0, 0], r2_km: [0, 7000, 100], tof_s: 20000, max_revolutions: 2, prograde: true, mu_km3_s2: 398600.4418 })
    expect((bare.arcs as { total_dv_km_s: null }[]).every(a => a.total_dv_km_s === null)).toBe(true)
    const arrivalOnly = await ok(ctx, 'orbit_transfer', { mode: 'lambert', r1_km: [7000, 0, 0], r2_km: [0, 7000, 100], tof_s: 2000, v2_km_s: [0, 0, 0] })
    expect((arrivalOnly.arcs as { departure_dv_km_s: null; total_dv_km_s: number }[])[0]!.departure_dv_km_s).toBeNull()
    const departureOnly = await ok(ctx, 'orbit_transfer', { mode: 'lambert', r1_km: [7000, 0, 0], r2_km: [0, 7000, 100], tof_s: 2000, v1_km_s: [0, 7.5, 0] })
    expect((departureOnly.arcs as { arrival_dv_km_s: null; total_dv_km_s: number }[])[0]!.total_dv_km_s).toBeGreaterThan(0)
    const hohmann = await ok(ctx, 'orbit_transfer', { mode: 'hohmann', radius1_km: 6569.4811, radius2_km: 42159.48 })
    expect(hohmann.total_dv_km_s).toBeCloseTo(3.935, 3)
    const bi = await ok(ctx, 'orbit_transfer', { mode: 'bi-elliptic', radius1_km: 7000, radius2_km: 105000, rb_km: 210000 })
    expect(bi.impulses_km_s).toHaveLength(3)
    const plane = await ok(ctx, 'orbit_transfer', { mode: 'plane-change', speed_km_s: 7.5, delta_inclination_deg: 10 })
    expect(plane.total_dv_km_s).toBeCloseTo(2 * 7.5 * Math.sin(5 * Math.PI / 180), 9)
    expect(await fail(ctx, 'orbit_transfer', { mode: 'lambert', r1_km: [7000, 0, 0], r2_km: [0, 7000, 0], tof_s: 100, max_revolutions: -1 })).toContain('max_revolutions')
    expect(await fail(ctx, 'orbit_transfer', { mode: 'hohmann', radius1_km: 7000 })).toContain('radius2_km')
    expect(await fail(ctx, 'orbit_transfer', { mode: 'plane-change', speed_km_s: 7, delta_inclination_deg: 1, mu_km3_s2: -1 })).toContain('mu_km3_s2')
  })
})

describe('attitude_determine', () => {
  it('estimates attitude with every method and validates vectors', async () => {
    const ctx = await setup()
    const observations = [
      { body: [1, 0, 0], reference: [0, 1, 0], sigma_deg: 0.01 },
      { body: [0, 1, 0], reference: [-1, 0, 0], sigma_deg: 0.05 },
      { body: [0, 0, 1], reference: [0, 0, 1], sigma_deg: 0.1 },
    ]
    for (const method of ['q-method', 'quest', 'triad']) {
      const value = await ok(ctx, 'attitude_determine', { method, observations })
      expect((value.yaw_pitch_roll_deg as number[])[0]).toBeCloseTo(90, 6)
      expect(value.loss as number).toBeLessThan(1e-12)
    }
    expect((await ok(ctx, 'attitude_determine', { observations })).method).toBe('q-method')
    expect(await fail(ctx, 'attitude_determine', { observations: [{ body: [0, 0, 0], reference: [1, 0, 0], sigma_deg: 1 }, observations[0]!] })).toContain('non-zero')
    expect(await fail(ctx, 'attitude_determine', { observations: [{ body: [1, 0, 0], reference: [1, 0, 0], sigma_deg: 0 }, observations[0]!] })).toContain('sigma_deg must be positive')
  })
})
