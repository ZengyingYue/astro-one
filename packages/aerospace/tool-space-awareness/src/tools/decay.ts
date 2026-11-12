/**
 * `ssa_decay`: predict orbital lifetime and re-entry epoch under atmospheric drag.
 * @module @astro-one/tool-space-awareness/tools/decay
 */

import { DEG, formatUtc, R_EARTH } from '@astro-one/astrodynamics'
import { defineTool } from '@astro-one/tools'
import type { ToolDefinition } from '@astro-one/tools'
import { ballisticFromBstar, integrateDecay, QUADRATURE_POINTS } from '../decay.ts'
import type { DecayResult, DecaySample, DecayState } from '../decay.ts'
import { catalogObject } from '../catalog.ts'
import { elementSetOf, instantOf, positiveOf, roundTo } from '../inputs.ts'
import type { ElementSetArgs } from '../inputs.ts'
import { ELEMENT_SET, STRING_OR_NULL, NUMBER_OR_NULL, TIME } from '../schema.ts'
import type { Bounds } from '../settings.ts'

const DESCRIPTION = 'Predict the orbital lifetime and re-entry epoch of an object under atmospheric drag with orbit-averaged '
  + 'King-Hele equations over a static exponential atmosphere. Give object (an element set; its SGP4 mean elements and, '
  + 'unless ballistic is given, its B* drag term set the orbit and the ballistic coefficient) or orbit (epoch, perigee and '
  + 'apogee altitude, inclination; ballistic is then required). ballistic is cd, area_m2, and mass_kg. Re-entry is the '
  + 'first time the perigee falls to reentry_altitude_km (default 120); the run stops after max_years (default 25, the '
  + 'IADC post-mission disposal guideline). Solar activity changes thermospheric density by a factor of several, so the '
  + 'result also gives early and late re-entry epochs with the density multiplied and divided by uncertainty_factor '
  + '(default 2); density_scale (default 1) shifts the nominal model.'

/** Numerical step limits; they bound truncation error, not deployment cost. */
const PERIGEE_CHANGE_PER_STEP_KM = 0.5
const MAX_STEP_S = 86_400

/** Model-facing circular-or-elliptic orbit fields. */
interface OrbitArgs {
  readonly epoch: string
  readonly perigee_alt_km: number
  readonly apogee_alt_km: number
  readonly inclination_deg: number
}

function orbitState(orbit: OrbitArgs): { epoch: number; state: DecayState; inclination: number } {
  const rp = R_EARTH + orbit.perigee_alt_km
  const ra = R_EARTH + orbit.apogee_alt_km
  if (!(orbit.perigee_alt_km > 0 && ra >= rp)) throw new Error('orbit needs 0 < perigee_alt_km <= apogee_alt_km')
  if (!(Math.abs(orbit.inclination_deg) <= 180)) throw new Error('orbit.inclination_deg must lie in [-180, 180]')
  return { epoch: instantOf(orbit.epoch, 'orbit.epoch'), state: { a: (rp + ra) / 2, e: (ra - rp) / (ra + rp) }, inclination: orbit.inclination_deg * DEG }
}

/**
 * Build the `ssa_decay` tool.
 * @param bounds - deployment bounds.
 * @returns the tool definition.
 */
export function decayTool(bounds: Bounds): ToolDefinition {
  return defineTool({
    name: 'ssa_decay',
    description: DESCRIPTION,
    parameters: {
      object: ELEMENT_SET,
      orbit: {
        type: 'object',
        additionalProperties: false,
        properties: {
          epoch: { ...TIME, required: true },
          perigee_alt_km: { type: 'number', required: true },
          apogee_alt_km: { type: 'number', required: true },
          inclination_deg: { type: 'number', required: true },
        },
      },
      ballistic: {
        type: 'object',
        additionalProperties: false,
        properties: { cd: { type: 'number', required: true }, area_m2: { type: 'number', required: true }, mass_kg: { type: 'number', required: true } },
      },
      density_scale: { type: 'number' },
      uncertainty_factor: { type: 'number' },
      reentry_altitude_km: { type: 'number' },
      max_years: { type: 'number' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          epoch: { type: 'string', required: true },
          ballistic_coefficient_m2_kg: { type: 'number', required: true },
          reentry_epoch: STRING_OR_NULL,
          lifetime_days: NUMBER_OR_NULL,
          early_reentry_epoch: STRING_OR_NULL,
          late_reentry_epoch: STRING_OR_NULL,
          history: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                time: { type: 'string', required: true },
                perigee_alt_km: { type: 'number', required: true },
                apogee_alt_km: { type: 'number', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    presentCall: () => ({ card: 'generic', title: 'Orbital decay', kind: 'other' }),
    // oxlint-disable-next-line typescript/require-await -- async turns synchronous validation throws into rejected tool calls
    async execute(args) {
      if ((args.object === undefined) === (args.orbit === undefined)) throw new Error('give exactly one of object or orbit')
      let start: { epoch: number; state: DecayState; inclination: number }
      let ballistic: number
      if (args.object !== undefined) {
        const parsed = elementSetOf(args.object as ElementSetArgs, 'object')
        const mean = catalogObject(parsed.name, parsed.elements).mean
        start = { epoch: parsed.elements.epoch, state: { a: mean.a, e: mean.e }, inclination: mean.i }
        ballistic = ballisticFromBstar(mean.bstar)
      } else {
        if (args.ballistic === undefined) throw new Error('orbit needs ballistic (cd, area_m2, mass_kg)')
        start = orbitState(args.orbit as OrbitArgs)
        ballistic = 0
      }
      if (args.ballistic !== undefined) {
        const b = args.ballistic
        ballistic = (positiveOf(b.cd, 'ballistic.cd') * positiveOf(b.area_m2, 'ballistic.area_m2')) / positiveOf(b.mass_kg, 'ballistic.mass_kg')
      }
      if (!(ballistic > 0)) throw new Error('the element set has a non-positive B*; give ballistic (cd, area_m2, mass_kg)')
      const scale = positiveOf(args.density_scale ?? 1, 'density_scale')
      const factor = positiveOf(args.uncertainty_factor ?? 2, 'uncertainty_factor')
      if (factor < 1) throw new Error('uncertainty_factor must be at least 1')
      const reentry = positiveOf(args.reentry_altitude_km ?? 120, 'reentry_altitude_km')
      const years = positiveOf(args.max_years ?? 25, 'max_years')
      const settings = {
        reentryAltitudeKm: reentry,
        maxSeconds: years * 365.25 * 86400,
        maxPerigeeChangeKm: PERIGEE_CHANGE_PER_STEP_KM,
        maxStepS: MAX_STEP_S,
        maxSteps: Math.floor(bounds.maxEvaluations / (3 * 4 * QUADRATURE_POINTS)),
      }
      const run = (densityScale: number): DecayResult =>
        integrateDecay(start.epoch, start.state, { inclination: start.inclination, ballistic, densityScale }, settings)
      const nominal = run(scale)
      const early = run(scale * factor)
      const late = run(scale / factor)
      const when = (r: DecayResult): string | null => (r.reentry === undefined ? null : formatUtc(r.reentry))
      const last = nominal.history.length - 1
      const rows = Math.min(nominal.history.length, bounds.maxResults)
      return {
        epoch: formatUtc(start.epoch),
        ballistic_coefficient_m2_kg: Number(ballistic.toPrecision(6)),
        reentry_epoch: when(nominal),
        lifetime_days: nominal.reentry === undefined ? null : roundTo((nominal.reentry - start.epoch) / 86_400_000, 2),
        early_reentry_epoch: when(early),
        late_reentry_epoch: when(late),
        history: Array.from({ length: rows }, (_, k) => {
          const s = nominal.history[Math.round((k * last) / Math.max(1, rows - 1))] as DecaySample
          return {
            time: formatUtc(s.t),
            perigee_alt_km: roundTo(s.state.a * (1 - s.state.e) - R_EARTH, 3),
            apogee_alt_km: roundTo(s.state.a * (1 + s.state.e) - R_EARTH, 3),
          }
        }),
      }
    },
  })
}
