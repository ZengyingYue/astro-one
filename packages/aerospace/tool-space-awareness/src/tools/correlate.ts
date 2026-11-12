/**
 * `ssa_correlate`: rank the objects of a workspace catalog by how well their element sets
 * explain a tracklet, flagging an uncorrelated track when none passes the gate.
 * @module @astro-one/tool-space-awareness/tools/correlate
 */

import { ARCSEC, DEG } from '@astro-one/astrodynamics'
import type { Observation } from '@astro-one/astrodynamics'
import type { Context } from '@astro-one/cordis'
import { defineTool } from '@astro-one/tools'
import type { ToolDefinition } from '@astro-one/tools'
import { readCatalog } from '../catalog.ts'
import { BIAS_SCAN_POINTS, refineFit, REFINEMENT_FITS, residualRms, scanFit } from '../correlation.ts'
import { instantOf, positiveOf, roundTo, siteOf, withinBudget } from '../inputs.ts'
import type { SiteArgs } from '../inputs.ts'
import { CATALOG_PATH, NUMBER_OR_NULL, SITE, TIME } from '../schema.ts'
import type { Bounds } from '../settings.ts'

const DESCRIPTION = 'Correlate a tracklet with a workspace catalog: predict every observation from each element set with '
  + 'SGP4 and rank objects by score_sigma, the RMS of residuals divided by their sigma. Observation types and units: radec '
  + '[right ascension, declination] deg topocentric J2000; azel [azimuth, elevation] deg; range km; range_rate km/s; each '
  + 'needs sigma in the same units and a station. Angular residuals are measured as arc length. A candidate passes when '
  + 'score_sigma <= gate_sigma (default 3); when no object passes, the tracklet is an uncorrelated track (a new, maneuvered, '
  + 'or mis-cataloged object) and orbit_determine can build an orbit from it. max_time_bias_s (default 0) lets each element '
  + 'set slide along its orbit by up to that many seconds, which absorbs the along-track error of old element sets; the '
  + 'fitted time_bias_s then estimates that error.'

/** One model-supplied observation. */
interface ObservationArgs {
  readonly time: string
  readonly type: 'radec' | 'azel' | 'range' | 'range_rate'
  readonly value: readonly number[]
  readonly sigma: number
  readonly station: SiteArgs
}

function observationOf(o: ObservationArgs, index: number): Observation {
  const field = `observations[${String(index)}]`
  const t = instantOf(o.time, `${field}.time`)
  const site = siteOf(o.station, `${field}.station`)
  const size = o.type === 'radec' || o.type === 'azel' ? 2 : 1
  if (o.value.length !== size) throw new Error(`${field}.value must hold ${String(size)} number(s) for type ${o.type}`)
  const sigma = positiveOf(o.sigma, `${field}.sigma`)
  switch (o.type) {
    case 'radec':
    case 'azel': {
      const value: [number, number] = [(o.value[0] as number) * DEG, (o.value[1] as number) * DEG]
      return o.type === 'radec' ? { kind: 'radec', t, site, value, sigma: sigma * DEG } : { kind: 'azel', t, site, value, sigma: sigma * DEG }
    }
    case 'range': return { kind: 'range', t, site, value: o.value[0] as number, sigma }
    case 'range_rate': return { kind: 'range-rate', t, site, value: o.value[0] as number, sigma }
  }
}

/**
 * Build the `ssa_correlate` tool.
 * @param ctx - context carrying the filesystem.
 * @param bounds - deployment bounds.
 * @returns the tool definition.
 */
export function correlateTool(ctx: Context, bounds: Bounds): ToolDefinition {
  return defineTool({
    name: 'ssa_correlate',
    description: DESCRIPTION,
    parameters: {
      catalog_path: { ...CATALOG_PATH, required: true },
      observations: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            time: { ...TIME, required: true },
            type: { type: 'string', enum: ['radec', 'azel', 'range', 'range_rate'], required: true },
            value: { type: 'array', items: { type: 'number' }, required: true },
            sigma: { type: 'number', required: true },
            station: { ...SITE, required: true },
          },
        },
      },
      gate_sigma: { type: 'number' },
      max_time_bias_s: { type: 'number' },
      candidates: { type: 'integer', description: 'Ranked candidates to return (default 5).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          observations: { type: 'integer', required: true },
          catalog_objects: { type: 'integer', required: true },
          gate_sigma: { type: 'number', required: true },
          correlated: { type: 'boolean', required: true },
          candidates: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                catalog_number: { type: 'string', required: true },
                score_sigma: { type: 'number', required: true },
                passes_gate: { type: 'boolean', required: true },
                time_bias_s: NUMBER_OR_NULL,
                rms_angle_arcsec: NUMBER_OR_NULL,
                rms_range_km: NUMBER_OR_NULL,
                rms_range_rate_km_s: NUMBER_OR_NULL,
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    presentCall: args => ({ card: 'generic', title: `Track correlation (${String(args.observations.length)} observations)`, kind: 'search', locations: [{ path: args.catalog_path }] }),
    async execute(args, exec) {
      if (args.observations.length === 0) throw new Error('observations must not be empty')
      if (args.observations.length > bounds.maxObservations) throw new Error(`at most ${String(bounds.maxObservations)} observations are allowed`)
      const observations = args.observations.map(observationOf).sort((a, b) => a.t - b.t)
      const gate = positiveOf(args.gate_sigma ?? 3, 'gate_sigma')
      const maxBias = args.max_time_bias_s ?? 0
      if (!(maxBias >= 0)) throw new Error('max_time_bias_s must not be negative')
      const count = args.candidates ?? 5
      if (!(Number.isInteger(count) && count >= 1 && count <= bounds.maxResults)) throw new Error(`candidates must be an integer from 1 to ${String(bounds.maxResults)}`)
      const catalog = await readCatalog(ctx, exec, args.catalog_path, bounds)
      const scanFits = maxBias === 0 ? 1 : BIAS_SCAN_POINTS
      withinBudget(observations.length * (catalog.objects.length * scanFits + (maxBias === 0 ? 0 : count * REFINEMENT_FITS)), bounds.maxEvaluations, 'use fewer observations, a smaller catalog, or max_time_bias_s 0')
      const ranked = catalog.objects
        .map(object => ({ object, fit: scanFit(object.elements, observations, maxBias) }))
        .filter(c => Number.isFinite(c.fit.chi2))
        .sort((a, b) => a.fit.chi2 - b.fit.chi2)
        .slice(0, count)
        .map(c => ({ object: c.object, fit: maxBias === 0 ? c.fit : refineFit(c.object.elements, observations, c.fit, maxBias) }))
        .sort((a, b) => a.fit.chi2 - b.fit.chi2)
      const candidates = ranked.map(({ object, fit }) => {
        const score = Math.sqrt(fit.chi2 / fit.dof)
        const rms = residualRms(object.elements, observations, fit.biasS)
        return {
          name: object.name,
          catalog_number: object.catalogNumber,
          score_sigma: roundTo(score, 4),
          passes_gate: score <= gate,
          time_bias_s: maxBias === 0 ? null : roundTo(fit.biasS, 3),
          rms_angle_arcsec: rms.angle === null ? null : roundTo(rms.angle / ARCSEC, 3),
          rms_range_km: rms.range === null ? null : roundTo(rms.range, 6),
          rms_range_rate_km_s: rms.rangeRate === null ? null : roundTo(rms.rangeRate, 9),
        }
      })
      return {
        observations: observations.length,
        catalog_objects: catalog.objects.length,
        gate_sigma: gate,
        correlated: candidates[0]?.passes_gate === true,
        candidates,
      }
    },
  })
}
