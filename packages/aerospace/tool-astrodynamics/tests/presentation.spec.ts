import { describe, expect, it } from 'vitest'
import { attitudeTool } from '../src/attitude.ts'
import { conjunctionTool } from '../src/conjunction.ts'
import { convertTool } from '../src/convert.ts'
import { alternativeView, determineTool } from '../src/determine.ts'
import { passesTool } from '../src/passes.ts'
import { propagateTool } from '../src/propagate.ts'
import { transferTool } from '../src/transfer.ts'
import { fail, ok, setup } from './helpers.ts'

const SETTINGS = { maxSamples: 10, maxObservations: 10, integrator: { relTol: 1e-10, absTol: 1e-8, maxSteps: 1000, initialStep: 60 } }

describe('tool presentation', () => {
  it('titles every pending call from its arguments', () => {
    const source = { kind: 'tle' }
    const obs = { time: 't', type: 'range', value: [1] }
    const object = { source, method: 'sgp4' }
    const titles = [
      propagateTool(SETTINGS).presentCall?.({ source, method: 'sgp4' }),
      determineTool(SETTINGS).presentCall?.({ method: 'batch', observations: [obs, obs] }),
      transferTool().presentCall?.({ mode: 'lambert' }),
      passesTool(SETTINGS).presentCall?.({ source, method: 'sgp4', station: { lat_deg: 1, lon_deg: 2, alt_km: 0 }, start: 's', end: 'e' }),
      conjunctionTool(SETTINGS).presentCall?.({ primary: object, secondary: object, start: 's', end: 'e' }),
      convertTool().presentCall?.({ operation: 'time' }),
      attitudeTool().presentCall?.({ observations: [] }),
      attitudeTool().presentCall?.({ method: 'quest', observations: [] }),
    ].map(view => (view as { title: string }).title)
    expect(titles).toEqual([
      'Propagate orbit (sgp4)',
      'Determine orbit (batch, 2 observations)',
      'Orbit transfer (lambert)',
      'Satellite passes (1°, 2°)',
      'Conjunction screening',
      'Convert (time)',
      'Attitude determination (q-method)',
      'Attitude determination (quest)',
    ])
  })

  it('reports alternative Gauss roots', () => {
    expect(alternativeView({ state: { t: 0, r: [1, 2, 3], v: [0.1, 0.2, 0.3] }, notes: ['root'] }))
      .toEqual({ position_km: [1, 2, 3], velocity_km_s: [0.1, 0.2, 0.3], note: 'root' })
  })
})

describe('input defaults and edge outputs', () => {
  it('defaults state frames to GCRF and reports parabolic elements', async () => {
    const ctx = await setup()
    const v = Math.sqrt((2 * 398600.4418) / 7000)
    const out = await ok(ctx, 'orbit_convert', {
      operation: 'state', source: { kind: 'state', epoch: '2024-01-01T00:00:00Z', position_km: [7000, 0, 0], velocity_km_s: [0, v, 0] },
    })
    expect((out.elements as { a_km: null }).a_km).toBeNull()
    expect(await fail(ctx, 'orbit_passes', {
      source: { kind: 'state', epoch: '2024-01-01T00:00:00Z', position_km: [7000, 0, 0], velocity_km_s: [0, 7.5, 0] },
      method: 'sgp4', station: { lat_deg: 0, lon_deg: 0, alt_km: 0 }, start: '2024-01-01T00:00:00Z', end: '2024-01-01T01:00:00Z',
    })).toContain('needs a tle or omm source')
  })
})
