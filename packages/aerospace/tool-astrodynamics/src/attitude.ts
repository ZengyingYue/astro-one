/**
 * `attitude_determine`: static attitude from vector observations by the q-method, QUEST, or TRIAD.
 * @module @astro-one/tool-astrodynamics/attitude
 */

import { DEG, dcmToEuler321, qMethod, quest, triad } from '@astro-one/astrodynamics'
import type { VectorObservation } from '@astro-one/astrodynamics'
import { defineTool } from '@astro-one/tools'
import type { ToolDefinition } from '@astro-one/tools'
import { positive, round, roundVec, vec3 } from './inputs.ts'
import { VEC3 } from './schema.ts'

const DESCRIPTION = 'Estimate spacecraft attitude from two or more vector observations (Wahba problem), for example Sun '
  + 'sensor, magnetometer, and star-tracker directions. Each observation pairs a measured body-frame vector with the same '
  + 'direction known in the reference frame (for example J2000) and a measurement sigma_deg. method q-method (Davenport, '
  + 'exact optimum, default), quest (Shuster, fast), or triad (first two vectors, first one trusted exactly). Returns the '
  + 'reference-to-body quaternion (scalar last, q4 >= 0), direction-cosine matrix, 3-2-1 yaw/pitch/roll, Wahba loss, and '
  + '1-sigma attitude errors about the body axes.'

/**
 * Build the `attitude_determine` tool.
 * @returns the tool definition.
 */
export function attitudeTool(): ToolDefinition {
  return defineTool({
    name: 'attitude_determine',
    description: DESCRIPTION,
    parameters: {
      method: { type: 'string', enum: ['q-method', 'quest', 'triad'] },
      observations: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            body: { ...VEC3, required: true },
            reference: { ...VEC3, required: true },
            sigma_deg: { type: 'number', required: true },
          },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          method: { type: 'string', required: true },
          quaternion: { type: 'array', items: { type: 'number' }, required: true },
          dcm: { type: 'array', items: VEC3, required: true },
          yaw_pitch_roll_deg: { ...VEC3, required: true },
          loss: { type: 'number', required: true },
          sigma_deg: { ...VEC3, required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    presentCall: args => ({ card: 'generic', title: `Attitude determination (${args.method ?? 'q-method'})`, kind: 'other' }),
    // oxlint-disable-next-line typescript/require-await -- async turns synchronous validation throws into rejected tool calls
    async execute(args) {
      const method = args.method ?? 'q-method'
      const obs: VectorObservation[] = args.observations.map((o, i) => {
        const field = `observations[${String(i)}]`
        const body = vec3(o.body, `${field}.body`)
        const reference = vec3(o.reference, `${field}.reference`)
        if (Math.hypot(...body) === 0 || Math.hypot(...reference) === 0) throw new Error(`${field} vectors must be non-zero`)
        return { body, reference, sigma: positive(o.sigma_deg, `${field}.sigma_deg`) * DEG }
      })
      const solve = method === 'quest' ? quest : method === 'triad' ? triad : qMethod
      const s = solve(obs)
      return {
        method,
        quaternion: roundVec(s.quaternion, 12),
        dcm: s.dcm.map(row => roundVec(row, 12)),
        yaw_pitch_roll_deg: roundVec(dcmToEuler321(s.dcm).map(x => x / DEG), 9),
        loss: Number(s.loss.toPrecision(8)),
        sigma_deg: s.sigma.map(x => round(x / DEG, 9)),
      }
    },
  })
}
