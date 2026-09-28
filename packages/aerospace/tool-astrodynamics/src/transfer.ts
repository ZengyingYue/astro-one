/**
 * `orbit_transfer`: Lambert arcs (Izzo) with optional departure/arrival Δv, and impulsive
 * Hohmann, bi-elliptic, and plane-change budgets.
 * @module @astro-one/tool-astrodynamics/transfer
 */

import { biElliptic, DEG, hohmann, MU_EARTH, norm, planeChange, solveLambert, sub } from '@astro-one/astrodynamics'
import { defineTool } from '@astro-one/tools'
import type { ToolDefinition } from '@astro-one/tools'
import { finite, positive, round, roundVec, vec3 } from './inputs.ts'
import { VEC3 } from './schema.ts'

const DESCRIPTION = 'Design an impulsive transfer. mode=lambert solves the two-point boundary problem (Izzo 2015) from '
  + 'position r1_km to position r2_km in tof_s, returning every zero- and multi-revolution arc up to max_revolutions; give '
  + 'v1_km_s and/or v2_km_s (current and target velocities) to get departure/arrival Δv. mode=hohmann and mode=bi-elliptic '
  + 'price coplanar circular-to-circular transfers from radius1_km to radius2_km (bi-elliptic also needs the intermediate '
  + 'apoapsis radius rb_km). mode=plane-change prices an inclination change of delta_inclination_deg at speed_km_s. '
  + 'mu_km3_s2 defaults to Earth (398600.4418).'

/**
 * Build the `orbit_transfer` tool.
 * @returns the tool definition.
 */
export function transferTool(): ToolDefinition {
  return defineTool({
    name: 'orbit_transfer',
    description: DESCRIPTION,
    parameters: {
      mode: { type: 'string', enum: ['lambert', 'hohmann', 'bi-elliptic', 'plane-change'], required: true },
      r1_km: { ...VEC3, description: 'lambert: departure position [x,y,z].' },
      r2_km: { ...VEC3, description: 'lambert: arrival position [x,y,z].' },
      radius1_km: { type: 'number', description: 'hohmann/bi-elliptic: initial circular-orbit radius.' },
      radius2_km: { type: 'number', description: 'hohmann/bi-elliptic: final circular-orbit radius.' },
      tof_s: { type: 'number' },
      prograde: { type: 'boolean', description: 'lambert: transfer direction about +z (default true).' },
      max_revolutions: { type: 'integer', description: 'lambert: largest revolution count (default 0).' },
      v1_km_s: VEC3,
      v2_km_s: VEC3,
      rb_km: { type: 'number' },
      speed_km_s: { type: 'number' },
      delta_inclination_deg: { type: 'number' },
      mu_km3_s2: { type: 'number' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          mode: { type: 'string', required: true },
          arcs: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                revolutions: { type: 'integer', required: true },
                branch: { type: 'string', required: true },
                v1_km_s: { ...VEC3, required: true },
                v2_km_s: { ...VEC3, required: true },
                departure_dv_km_s: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
                arrival_dv_km_s: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
                total_dv_km_s: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
              },
            },
          },
          impulses_km_s: { type: 'array', items: { type: 'number' }, required: true },
          total_dv_km_s: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
          time_of_flight_s: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    presentCall: args => ({ card: 'generic', title: `Orbit transfer (${args.mode})`, kind: 'other' }),
    // oxlint-disable-next-line typescript/require-await -- async turns synchronous validation throws into rejected tool calls
    async execute(args) {
      const mu = args.mu_km3_s2 === undefined ? MU_EARTH : positive(args.mu_km3_s2, 'mu_km3_s2')
      const empty = { arcs: [], impulses_km_s: [], total_dv_km_s: null, time_of_flight_s: null }
      if (args.mode === 'plane-change') {
        const dv = planeChange(positive(args.speed_km_s, 'speed_km_s'), finite(args.delta_inclination_deg, 'delta_inclination_deg') * DEG)
        return { mode: args.mode, ...empty, impulses_km_s: [round(dv, 9)], total_dv_km_s: round(dv, 9) }
      }
      if (args.mode === 'lambert') {
        const r1 = vec3(args.r1_km, 'r1_km')
        const r2 = vec3(args.r2_km, 'r2_km')
        const maxRev = args.max_revolutions ?? 0
        if (!Number.isInteger(maxRev) || maxRev < 0 || maxRev > 20) throw new Error('max_revolutions must be an integer from 0 to 20')
        const v1 = args.v1_km_s === undefined ? undefined : vec3(args.v1_km_s, 'v1_km_s')
        const v2 = args.v2_km_s === undefined ? undefined : vec3(args.v2_km_s, 'v2_km_s')
        const arcs = solveLambert(r1, r2, positive(args.tof_s, 'tof_s'), { mu, prograde: args.prograde ?? true, maxRevolutions: maxRev })
        return {
          mode: args.mode,
          ...empty,
          time_of_flight_s: args.tof_s as number,
          arcs: arcs.map((a) => {
            const dep = v1 === undefined ? null : round(norm(sub(a.v1, v1)), 9)
            const arr = v2 === undefined ? null : round(norm(sub(v2, a.v2)), 9)
            return {
              revolutions: a.revolutions,
              branch: a.branch,
              v1_km_s: roundVec(a.v1, 9),
              v2_km_s: roundVec(a.v2, 9),
              departure_dv_km_s: dep,
              arrival_dv_km_s: arr,
              total_dv_km_s: dep === null && arr === null ? null : round((dep ?? 0) + (arr ?? 0), 9),
            }
          }),
        }
      }
      const r1 = positive(args.radius1_km, 'radius1_km')
      const r2 = positive(args.radius2_km, 'radius2_km')
      const budget = args.mode === 'hohmann' ? hohmann(r1, r2, mu) : biElliptic(r1, r2, positive(args.rb_km, 'rb_km'), mu)
      return {
        mode: args.mode,
        ...empty,
        impulses_km_s: budget.impulses.map(x => round(x, 9)),
        total_dv_km_s: round(budget.totalDeltaV, 9),
        time_of_flight_s: round(budget.timeOfFlight, 6),
      }
    },
  })
}
