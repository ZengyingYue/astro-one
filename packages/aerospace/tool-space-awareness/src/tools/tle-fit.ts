/**
 * `ssa_tle_fit`: fit a two-line element set to an ephemeris so a determined or predicted orbit
 * can enter an SGP4 catalog.
 * @module @astro-one/tool-space-awareness/tools/tle-fit
 */

import { formatTle, gcrfToTeme, itrfToGcrf, parseTle, propagateKepler } from '@astro-one/astrodynamics'
import type { StateVector, TimedState } from '@astro-one/astrodynamics'
import { defineTool } from '@astro-one/tools'
import type { ToolDefinition } from '@astro-one/tools'
import { instantOf, roundTo, withinBudget } from '../inputs.ts'
import { TIME, TRIPLE } from '../schema.ts'
import type { Bounds } from '../settings.ts'
import { classicalOf, equinoctialFromState, fitElementSet, ommBuilder, ommRecord, positionErrors } from '../tle-fit.ts'

const DESCRIPTION = 'Fit an SGP4 two-line element set to an ephemeris (for example orbit_propagate or orbit_determine '
  + 'output): rows of time, position_km, and velocity_km_s in frame gcrf (default), teme, or itrf, at least six rows and '
  + 'preferably spanning one or more revolutions. The fit runs Levenberg–Marquardt differential correction of the SGP4 '
  + 'mean elements (equinoctial, so circular and equatorial orbits are regular) against the positions, at epoch (default '
  + 'the last row time); fit_bstar (default false) also estimates the drag term, otherwise bstar (default 0) is kept. '
  + 'Returns TLE lines and CCSDS OMM keywords, the position RMS and maximum error of the encoded TLE against the '
  + 'ephemeris, and the iteration count. catalog_number (default 99999) and international_designator (OMM form such as '
  + '2025-001A) label the set.'

/** One ephemeris row. */
interface RowArgs {
  readonly time: string
  readonly position_km: readonly number[]
  readonly velocity_km_s: readonly number[]
}

function vector(v: readonly number[], field: string): [number, number, number] {
  if (v.length !== 3) throw new Error(`${field} must hold three numbers`)
  return [v[0] as number, v[1] as number, v[2] as number]
}

function tleDesignator(objectId: string): string {
  if (objectId === '') return ''
  const match = /^(\d{4})-(\d{3})([A-Z]{1,3})$/.exec(objectId)
  if (match === null) throw new Error('international_designator must look like 2025-001A')
  return `${(match[1] as string).slice(2)}${match[2] as string}${match[3] as string}`
}

/**
 * Build the `ssa_tle_fit` tool.
 * @param bounds - deployment bounds.
 * @returns the tool definition.
 */
export function tleFitTool(bounds: Bounds): ToolDefinition {
  return defineTool({
    name: 'ssa_tle_fit',
    description: DESCRIPTION,
    parameters: {
      ephemeris: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            time: { ...TIME, required: true },
            position_km: { ...TRIPLE, required: true },
            velocity_km_s: { ...TRIPLE, required: true },
          },
        },
      },
      frame: { type: 'string', enum: ['gcrf', 'teme', 'itrf'] },
      epoch: TIME,
      fit_bstar: { type: 'boolean' },
      bstar: { type: 'number' },
      catalog_number: { type: 'string' },
      international_designator: { type: 'string' },
      name: { type: 'string' },
      max_iterations: { type: 'integer', description: 'Largest number of differential-correction iterations (default 30).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          line1: { type: 'string', required: true },
          line2: { type: 'string', required: true },
          omm: { type: 'json', required: true },
          rms_position_km: { type: 'number', required: true },
          max_position_km: { type: 'number', required: true },
          iterations: { type: 'integer', required: true },
          converged: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    presentCall: args => ({ card: 'generic', title: `TLE fit (${String(args.ephemeris.length)} rows)`, kind: 'other' }),
    // oxlint-disable-next-line typescript/require-await -- async turns synchronous validation throws into rejected tool calls
    async execute(args) {
      const rows = args.ephemeris
      if (rows.length < 6) throw new Error(`the fit needs at least 6 ephemeris rows; got ${String(rows.length)}`)
      if (rows.length > bounds.maxObservations) throw new Error(`at most ${String(bounds.maxObservations)} ephemeris rows are allowed`)
      const maxIterations = args.max_iterations ?? 30
      if (!(Number.isInteger(maxIterations) && maxIterations >= 1)) throw new Error('max_iterations must be a positive integer')
      const fitBstar = args.fit_bstar ?? false
      // Each iteration evaluates one Jacobian column per parameter and up to 12 damped trial steps.
      withinBudget(rows.length * maxIterations * ((fitBstar ? 7 : 6) + 12), bounds.maxEvaluations, 'use fewer rows or lower max_iterations')
      const frame = args.frame ?? 'gcrf'
      const teme: TimedState[] = (rows as readonly RowArgs[]).map((row, k) => {
        const t = instantOf(row.time, `ephemeris[${String(k)}].time`)
        const state: StateVector = { r: vector(row.position_km, `ephemeris[${String(k)}].position_km`), v: vector(row.velocity_km_s, `ephemeris[${String(k)}].velocity_km_s`) }
        return { t, ...frame === 'teme' ? state : gcrfToTeme(frame === 'itrf' ? itrfToGcrf(state, t) : state, t) }
      }).sort((a, b) => a.t - b.t)
      const epoch = args.epoch === undefined ? (teme[teme.length - 1] as TimedState).t : instantOf(args.epoch, 'epoch')
      const nearest = teme.reduce((best, s) => (Math.abs(s.t - epoch) < Math.abs(best.t - epoch) ? s : best))
      const catalogText = (args.catalog_number ?? '99999').trim()
      if (!/^\d{1,5}$/.test(catalogText)) throw new Error('catalog_number must be one to five digits')
      const designator = tleDesignator(args.international_designator ?? '')
      const id = { name: args.name ?? 'FITTED OBJECT', catalogNumber: Number(catalogText), objectId: args.international_designator ?? 'UNKNOWN', epoch }
      const bstar = args.bstar ?? 0
      const initial = equinoctialFromState(propagateKepler(nearest, (epoch - nearest.t) / 1000), bstar)
      const build = ommBuilder(id)
      const fit = fitElementSet(initial, teme, build, { fitBstar, maxIterations })
      const c = classicalOf(fit.set)
      const [line1, line2] = formatTle({
        catalogNumber: catalogText,
        classification: 'U',
        designator,
        epoch,
        meanMotionDot: 0,
        meanMotionDdot: 0,
        bstar: c.bstar,
        elementSetNumber: 1,
        inclinationDeg: c.inclinationDeg,
        raanDeg: c.raanDeg,
        eccentricity: c.eccentricity,
        argpDeg: c.argpDeg,
        meanAnomalyDeg: c.meanAnomalyDeg,
        meanMotion: c.meanMotion,
        revolution: 0,
      })
      const errors = positionErrors(parseTle(line1, line2), teme)
      return {
        line1,
        line2,
        omm: ommRecord(fit.set, id),
        rms_position_km: roundTo(errors.rms, 6),
        max_position_km: roundTo(errors.max, 6),
        iterations: fit.iterations,
        converged: fit.converged,
      }
    },
  })
}
