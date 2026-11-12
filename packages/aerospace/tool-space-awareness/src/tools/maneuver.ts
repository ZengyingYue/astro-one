/**
 * `ssa_maneuver_detect`: find maneuvers in the element-set history of one object.
 * @module @astro-one/tool-space-awareness/tools/maneuver
 */

import { DEG, formatUtc } from '@astro-one/astrodynamics'
import type { Context } from '@astro-one/cordis'
import { defineTool } from '@astro-one/tools'
import type { ToolDefinition } from '@astro-one/tools'
import { catalogObject, readCatalog } from '../catalog.ts'
import type { CatalogObject } from '../catalog.ts'
import { elementSetOf, positiveOf, roundTo, withinBudget } from '../inputs.ts'
import type { ElementSetArgs } from '../inputs.ts'
import { detectManeuvers } from '../maneuvers.ts'
import { CATALOG_PATH, ELEMENT_SET, TRIPLE } from '../schema.ts'
import type { Bounds } from '../settings.ts'

const DESCRIPTION = 'Detect maneuvers in the element-set history of one object, given as history_path (a workspace '
  + 'catalog file holding many sets of the object; catalog_number selects the object when the file holds several) or as '
  + 'inline element_sets; at least five sets with distinct epochs are needed, and more give steadier statistics. For each '
  + 'pair of consecutive sets it compares SGP4 mean semi-major axis (after removing the median decay rate), the orbit-plane '
  + 'rotation beyond the secular node drift, and the position difference of the earlier set propagated to the later epoch. '
  + 'Changes whose robust z-score (deviation from the history median over 1.4826 × MAD) exceeds z_threshold (default 6) '
  + 'are reported with near-circular Gauss Δv estimates; the spread is at least min_delta_a_km (default 0.05) or '
  + 'min_plane_change_deg (default 0.005) divided by z_threshold, so a noiseless history flags changes of that size. A '
  + 'single bad element set also produces outliers, typically one followed by an opposite one.'

/**
 * Build the `ssa_maneuver_detect` tool.
 * @param ctx - context carrying the filesystem.
 * @param bounds - deployment bounds.
 * @returns the tool definition.
 */
export function maneuverTool(ctx: Context, bounds: Bounds): ToolDefinition {
  return defineTool({
    name: 'ssa_maneuver_detect',
    description: DESCRIPTION,
    parameters: {
      history_path: CATALOG_PATH,
      element_sets: { type: 'array', items: ELEMENT_SET },
      catalog_number: { type: 'string' },
      z_threshold: { type: 'number' },
      min_delta_a_km: { type: 'number' },
      min_plane_change_deg: { type: 'number' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', required: true },
          catalog_number: { type: 'string', required: true },
          element_sets: { type: 'integer', required: true },
          first_epoch: { type: 'string', required: true },
          last_epoch: { type: 'string', required: true },
          decay_rate_km_per_day: { type: 'number', required: true },
          delta_a_sigma_km: { type: 'number', required: true },
          plane_change_sigma_deg: { type: 'number', required: true },
          events: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                after_epoch: { type: 'string', required: true },
                before_epoch: { type: 'string', required: true },
                kind: { type: 'string', required: true },
                delta_a_km: { type: 'number', required: true },
                delta_e: { type: 'number', required: true },
                plane_change_deg: { type: 'number', required: true },
                position_residual_rtn_km: { ...TRIPLE, required: true },
                z_delta_a: { type: 'number', required: true },
                z_plane_change: { type: 'number', required: true },
                z_position: { type: 'number', required: true },
                dv_in_plane_m_s: { type: 'number', required: true },
                dv_out_of_plane_m_s: { type: 'number', required: true },
                dv_total_m_s: { type: 'number', required: true },
              },
            },
          },
          more_events: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    presentCall: args => ({
      card: 'generic',
      title: 'Maneuver detection',
      kind: 'read',
      ...args.history_path !== undefined ? { locations: [{ path: args.history_path }] } : {},
    }),
    async execute(args, exec) {
      const options = {
        zThreshold: positiveOf(args.z_threshold ?? 6, 'z_threshold'),
        minDeltaAKm: positiveOf(args.min_delta_a_km ?? 0.05, 'min_delta_a_km'),
        minPlaneChange: positiveOf(args.min_plane_change_deg ?? 0.005, 'min_plane_change_deg') * DEG,
      }
      if ((args.history_path === undefined) === (args.element_sets === undefined)) throw new Error('give exactly one of history_path or element_sets')
      const all: CatalogObject[] = args.history_path !== undefined
        ? (await readCatalog(ctx, exec, args.history_path, bounds)).objects
        : (args.element_sets as readonly ElementSetArgs[]).map((set, k) => {
          const parsed = elementSetOf(set, `element_sets[${String(k)}]`)
          return catalogObject(parsed.name, parsed.elements)
        })
      const numbers = [...new Set(all.map(o => o.catalogNumber))]
      const wanted = args.catalog_number?.trim().padStart(5, '0')
      if (wanted === undefined && numbers.length > 1) throw new Error(`the history holds ${String(numbers.length)} objects; give catalog_number`)
      const selected = wanted ?? numbers[0]
      const byEpoch = new Map<number, CatalogObject>()
      for (const o of all) if (o.catalogNumber === selected) byEpoch.set(o.elements.epoch, o)
      const sets = [...byEpoch.values()].sort((a, b) => a.elements.epoch - b.elements.epoch)
      if (sets.length < 5) throw new Error(`object ${String(selected)} has ${String(sets.length)} element set(s) with distinct epochs; at least 5 are needed`)
      if (sets.length > bounds.maxObservations) throw new Error(`at most ${String(bounds.maxObservations)} element sets are allowed`)
      withinBudget(2 * sets.length, bounds.maxEvaluations, 'use fewer element sets')
      const result = detectManeuvers(sets, options)
      const events = result.events.map(e => ({
        after_epoch: formatUtc(e.interval.from),
        before_epoch: formatUtc(e.interval.to),
        kind: e.kind,
        delta_a_km: roundTo(e.deltaAResidual, 4),
        delta_e: roundTo(e.interval.deltaE, 7),
        plane_change_deg: roundTo(e.interval.planeChange / DEG, 5),
        position_residual_rtn_km: e.interval.positionRtn.map(x => roundTo(x, 3)),
        z_delta_a: roundTo(e.zA, 2),
        z_plane_change: roundTo(e.zPlane, 2),
        z_position: roundTo(e.zPosition, 2),
        dv_in_plane_m_s: roundTo(e.dvInPlane * 1000, 3),
        dv_out_of_plane_m_s: roundTo(e.dvOutOfPlane * 1000, 3),
        dv_total_m_s: roundTo(Math.hypot(e.dvInPlane, e.dvOutOfPlane) * 1000, 3),
      }))
      const first = sets[0] as CatalogObject
      const last = sets[sets.length - 1] as CatalogObject
      return {
        name: last.name,
        catalog_number: last.catalogNumber,
        element_sets: sets.length,
        first_epoch: formatUtc(first.elements.epoch),
        last_epoch: formatUtc(last.elements.epoch),
        decay_rate_km_per_day: roundTo(result.decayRateKmPerDay, 6),
        delta_a_sigma_km: roundTo(result.deltaASpread.sigma, 6),
        plane_change_sigma_deg: roundTo(result.planeSpread.sigma / DEG, 7),
        events: events.slice(0, bounds.maxResults),
        more_events: Math.max(0, events.length - bounds.maxResults),
      }
    },
  })
}
