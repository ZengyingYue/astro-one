/**
 * `orbit_propagate`: ephemeris generation by SGP4, numerical special perturbations, or two-body
 * motion in GCRF, ITRF, TEME, or geodetic coordinates.
 * @module @astro-one/tool-astrodynamics/propagate
 */

import { formatUtc, gcrfToItrf, gcrfToTeme, itrfToGeodetic, DEG } from '@astro-one/astrodynamics'
import { defineTool } from '@astro-one/tools'
import type { ToolDefinition } from '@astro-one/tools'
import { elementsOutput, eopOf, forceModel, parseSource, round, roundVec, timeGrid } from './inputs.ts'
import type { ToolSettings } from './settings.ts'
import { initialState, propagateSource } from './trajectory.ts'
import { ELEMENTS_OUTPUT, EOP, FORCES, INSTANT, METHOD, SOURCE, VEC3 } from './schema.ts'

const DESCRIPTION = 'Propagate an orbit and return an ephemeris. Use method=sgp4 for TLE/OMM catalog element sets '
  + '(the only physically consistent model for them), numerical for precise special-perturbation propagation of a '
  + 'state or elements with the forces field (J2–J6 zonals, drag, solar radiation pressure, Sun/Moon), or two-body for '
  + 'Keplerian motion. Give either times (explicit ISO instants) or start, end, and step_s. output_frame selects gcrf '
  + '(J2000 inertial, default), itrf (Earth-fixed), teme (SGP4 frame), or geodetic (WGS-84 latitude, longitude, altitude). '
  + 'Distances are km, velocities km/s, angles degrees.'

/**
 * Build the `orbit_propagate` tool.
 * @param settings - deployment bounds and integrator settings.
 * @returns the tool definition.
 */
export function propagateTool(settings: ToolSettings): ToolDefinition {
  return defineTool({
    name: 'orbit_propagate',
    description: DESCRIPTION,
    parameters: {
      source: { ...SOURCE, required: true },
      method: { ...METHOD, required: true },
      times: { type: 'array', items: INSTANT, description: 'Explicit output instants.' },
      start: INSTANT,
      end: INSTANT,
      step_s: { type: 'number', description: 'Grid step in seconds.' },
      output_frame: { type: 'string', enum: ['gcrf', 'itrf', 'teme', 'geodetic'] },
      forces: FORCES,
      eop: EOP,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          method: { type: 'string', required: true },
          frame: { type: 'string', required: true },
          epoch: { type: 'string', required: true },
          elements_at_epoch: { ...ELEMENTS_OUTPUT, required: true },
          samples: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                time: { type: 'string', required: true },
                position_km: VEC3,
                velocity_km_s: VEC3,
                lat_deg: { type: 'number' },
                lon_deg: { type: 'number' },
                alt_km: { type: 'number' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderEphemeris(value) }],
    },
    presentCall: args => ({ card: 'generic', title: `Propagate orbit (${args.method})`, kind: 'other' }),
    // oxlint-disable-next-line typescript/require-await -- async turns synchronous validation throws into rejected tool calls
    async execute(args) {
      const eop = eopOf(args.eop)
      const source = parseSource(args.source, eop)
      const times = timeGrid(args, settings.maxSamples)
      const frame = args.output_frame ?? 'gcrf'
      const context = { method: args.method, forces: forceModel(args.forces), integrator: settings.integrator }
      const states = propagateSource(source, times, context)
      const epochState = initialState(source)
      return {
        method: args.method,
        frame,
        epoch: formatUtc(epochState.t),
        elements_at_epoch: elementsOutput(epochState),
        samples: states.map((s) => {
          const time = formatUtc(s.t)
          if (frame === 'gcrf') return { time, position_km: roundVec(s.r, 6), velocity_km_s: roundVec(s.v, 9) }
          if (frame === 'teme') {
            const teme = gcrfToTeme(s, s.t)
            return { time, position_km: roundVec(teme.r, 6), velocity_km_s: roundVec(teme.v, 9) }
          }
          const fixed = gcrfToItrf(s, s.t, eop)
          if (frame === 'itrf') return { time, position_km: roundVec(fixed.r, 6), velocity_km_s: roundVec(fixed.v, 9) }
          const g = itrfToGeodetic(fixed.r)
          return { time, lat_deg: round(g.lat / DEG, 8), lon_deg: round(g.lon / DEG, 8), alt_km: round(g.h, 6) }
        }),
      }
    },
  })
}

interface EphemerisValue {
  method: string
  frame: string
  epoch: string
  elements_at_epoch: {
    a_km: number | null
    e: number
    i_deg: number
    perigee_alt_km: number
    apogee_alt_km: number | null
    period_s: number | null
  }
  samples: { time: string; position_km?: number[]; velocity_km_s?: number[]; lat_deg?: number; lon_deg?: number; alt_km?: number }[]
}

/**
 * Model-facing ephemeris text: a summary line and CSV rows.
 * @param value - canonical tool value.
 * @returns text.
 */
export function renderEphemeris(value: EphemerisValue): string {
  const el = value.elements_at_epoch
  const header = `${value.method} ephemeris, ${String(value.samples.length)} samples, frame ${value.frame}. `
    + `Epoch ${value.epoch}: a=${String(el.a_km)} km, e=${String(el.e)}, i=${String(el.i_deg)} deg, `
    + `perigee alt=${String(el.perigee_alt_km)} km, apogee alt=${String(el.apogee_alt_km)} km, period=${String(el.period_s)} s.`
  const geodetic = value.frame === 'geodetic'
  const columns = geodetic ? 'time,lat_deg,lon_deg,alt_km' : 'time,x_km,y_km,z_km,vx_km_s,vy_km_s,vz_km_s'
  const rows = value.samples.map(s => (geodetic
    ? [s.time, s.lat_deg, s.lon_deg, s.alt_km]
    : [s.time, ...(s.position_km ?? []), ...(s.velocity_km_s ?? [])]).join(','))
  return [header, columns, ...rows].join('\n')
}
