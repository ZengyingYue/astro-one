/**
 * `orbit_conjunction`: close-approach screening between two objects with time of closest
 * approach, RTN miss components, and 2D collision probability when covariances are given.
 * @module @astro-one/tool-astrodynamics/conjunction
 */

import { collisionProbability2D, findCloseApproaches, formatUtc, rtnToInertialCovariance } from '@astro-one/astrodynamics'
import type { Mat3, StateVector } from '@astro-one/astrodynamics'
import { defineTool } from '@astro-one/tools'
import type { ToolDefinition } from '@astro-one/tools'
import { eopOf, forceModel, instant, parseSource, positive, round, roundVec } from './inputs.ts'
import { FORCES, INSTANT, METHOD, SOURCE, VEC3 } from './schema.ts'
import type { ToolSettings } from './settings.ts'
import { trajectory } from './trajectory.ts'

const DESCRIPTION = 'Screen two objects for close approaches between start and end and report each local minimum closer '
  + 'than screening_distance_km (default 10): time of closest approach, miss distance, relative speed, and the miss vector in '
  + 'the primary radial/transverse/normal frame. When both position covariances are given (3x3 RTN matrices in km², or '
  + 'sigma_rtn_km diagonals), also returns the short-encounter (2D, Foster) collision probability for hard_body_radius_km '
  + '(combined object radius, default 0.02 km) and the covariance-free Alfano maximum. step_s (default 10) must be short '
  + 'relative to the encounter; each object has its own source and method.'

/** Covariance fields for one object. */
interface CovarianceArgs {
  readonly covariance_rtn_km2?: readonly (readonly number[])[]
  readonly sigma_rtn_km?: readonly number[]
}

function covariance(args: CovarianceArgs | undefined, label: string): Mat3 | undefined {
  if (args?.covariance_rtn_km2 !== undefined) {
    const m = args.covariance_rtn_km2
    if (m.length !== 3 || !m.every(row => row.length === 3 && row.every(Number.isFinite))) throw new Error(`${label}.covariance_rtn_km2 must be a 3x3 matrix`)
    const r = (i: number): [number, number, number] => {
      const row = m[i] as number[]
      return [row[0] as number, row[1] as number, row[2] as number]
    }
    return [r(0), r(1), r(2)]
  }
  if (args?.sigma_rtn_km !== undefined) {
    const s = args.sigma_rtn_km
    if (s.length !== 3 || !s.every(x => Number.isFinite(x) && x > 0)) throw new Error(`${label}.sigma_rtn_km must hold three positive numbers`)
    return [[(s[0] as number) ** 2, 0, 0], [0, (s[1] as number) ** 2, 0], [0, 0, (s[2] as number) ** 2]]
  }
  return undefined
}

function add3(a: Mat3, b: Mat3): Mat3 {
  const row = (i: 0 | 1 | 2): [number, number, number] => [a[i][0] + b[i][0], a[i][1] + b[i][1], a[i][2] + b[i][2]]
  return [row(0), row(1), row(2)]
}

/**
 * Build the `orbit_conjunction` tool.
 * @param settings - deployment bounds and integrator settings.
 * @returns the tool definition.
 */
export function conjunctionTool(settings: ToolSettings): ToolDefinition {
  const object = {
    type: 'object',
    additionalProperties: false,
    properties: {
      source: { ...SOURCE, required: true },
      method: { ...METHOD, required: true },
      covariance_rtn_km2: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
      sigma_rtn_km: VEC3,
    },
  } as const
  return defineTool({
    name: 'orbit_conjunction',
    description: DESCRIPTION,
    parameters: {
      primary: { ...object, required: true },
      secondary: { ...object, required: true },
      start: { ...INSTANT, required: true },
      end: { ...INSTANT, required: true },
      step_s: { type: 'number' },
      screening_distance_km: { type: 'number' },
      hard_body_radius_km: { type: 'number' },
      forces: FORCES,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          approaches: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                tca: { type: 'string', required: true },
                miss_distance_km: { type: 'number', required: true },
                relative_speed_km_s: { type: 'number', required: true },
                miss_rtn_km: { ...VEC3, required: true },
                collision_probability: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
                max_collision_probability: { type: 'number', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.approaches.length === 0 ? 'No close approach inside the screening distance.' : JSON.stringify(value) }],
    },
    presentCall: () => ({ card: 'generic', title: 'Conjunction screening', kind: 'search' }),
    // oxlint-disable-next-line typescript/require-await -- async turns synchronous validation throws into rejected tool calls
    async execute(args) {
      const start = instant(args.start, 'start')
      const end = instant(args.end, 'end')
      if (!(end > start)) throw new Error('end must follow start')
      const stepMs = positive(args.step_s ?? 10, 'step_s') * 1000
      if ((end - start) / stepMs > settings.maxSamples) throw new Error(`the window needs more than ${String(settings.maxSamples)} screening steps; increase step_s or shorten the window`)
      const screen = positive(args.screening_distance_km ?? 10, 'screening_distance_km')
      const hbr = positive(args.hard_body_radius_km ?? 0.02, 'hard_body_radius_km')
      const forces = forceModel(args.forces)
      const context = (method: 'sgp4' | 'numerical' | 'two-body') => ({ method, forces, integrator: settings.integrator })
      const eop = eopOf(undefined)
      const path = (o: { source: typeof args.primary.source; method: typeof args.primary.method }) =>
        trajectory(parseSource(o.source, eop), context(o.method), start, end, stepMs, settings.maxSamples)
      const primary = path(args.primary)
      const secondary = path(args.secondary)
      const covA = covariance(args.primary, 'primary')
      const covB = covariance(args.secondary, 'secondary')
      return {
        approaches: findCloseApproaches(primary, secondary, start, end, stepMs, screen).map((a) => {
          const pa: StateVector = primary(a.tca)
          const pb: StateVector = secondary(a.tca)
          const combined = covA !== undefined && covB !== undefined
            ? add3(rtnToInertialCovariance(pa, covA), rtnToInertialCovariance(pb, covB))
            : undefined
          const identity: Mat3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
          const p = collisionProbability2D(a.relativePosition, a.relativeVelocity, combined ?? identity, hbr)
          return {
            tca: formatUtc(a.tca),
            miss_distance_km: round(a.missDistance, 6),
            relative_speed_km_s: round(a.relativeSpeed, 6),
            miss_rtn_km: roundVec(a.rtn, 6),
            collision_probability: combined === undefined ? null : Number(p.pc.toPrecision(6)),
            max_collision_probability: Number(p.pcMax.toPrecision(6)),
          }
        }),
      }
    },
  })
}
