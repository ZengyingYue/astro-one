/**
 * `ssa_catalog_screen`: screen one primary against every object of a workspace catalog for
 * close approaches, with Alfano maximum and optional covariance-based collision probability.
 * @module @astro-one/tool-space-awareness/tools/screen
 */

import { addMat3, collisionProbability2D, formatUtc, rtnToInertialCovariance } from '@astro-one/astrodynamics'
import type { Mat3 } from '@astro-one/astrodynamics'
import type { Context } from '@astro-one/cordis'
import { defineTool } from '@astro-one/tools'
import type { ToolDefinition } from '@astro-one/tools'
import { catalogObject, readCatalog } from '../catalog.ts'
import type { CatalogObject } from '../catalog.ts'
import { elementSetOf, positiveOf, roundTo, windowOf, withinBudget } from '../inputs.ts'
import type { ElementSetArgs } from '../inputs.ts'
import { CATALOG_PATH, ELEMENT_SET, NUMBER_OR_NULL, TIME, TRIPLE } from '../schema.ts'
import { sampleCount, screenCatalog, screeningCandidates } from '../screening.ts'
import type { Bounds } from '../settings.ts'

const DESCRIPTION = 'Screen one primary object against every object of a workspace catalog between start and end and '
  + 'report close approaches closer than screening_distance_km (default 5), sorted by miss distance. primary is either '
  + 'catalog_number (an object of the same catalog) or an inline element set; objects sharing the primary catalog number '
  + 'are skipped. The Hoots apogee/perigee filter (with filter_pad_km, default 30, for SGP4 short-period motion) removes '
  + 'pairs whose radial bands cannot meet, a step_s grid (default 30) bounds each remaining pair, and the time of closest '
  + 'approach is refined on SGP4. Each approach gives miss distance, relative speed, the miss vector in the primary '
  + 'radial/transverse/normal frame, the covariance-free Alfano maximum collision probability for hard_body_radius_km '
  + '(default 0.02), and the 2D Foster probability when both primary_sigma_rtn_km and secondary_sigma_rtn_km are given.'

/** Primary selector fields. */
interface PrimaryArgs extends ElementSetArgs {
  readonly catalog_number?: string
}

function sigmaCovariance(sigma: readonly number[] | undefined, field: string): Mat3 | undefined {
  if (sigma === undefined) return undefined
  if (sigma.length !== 3 || !sigma.every(s => s > 0)) throw new Error(`${field} must hold three positive numbers`)
  const [r, t, n] = sigma as [number, number, number]
  return [[r * r, 0, 0], [0, t * t, 0], [0, 0, n * n]]
}

function primaryObject(args: PrimaryArgs, objects: readonly CatalogObject[]): CatalogObject {
  if (args.catalog_number === undefined) {
    const parsed = elementSetOf(args, 'primary')
    return catalogObject(parsed.name, parsed.elements)
  }
  if (args.line1 !== undefined || args.line2 !== undefined || args.omm !== undefined) throw new Error('primary: give either catalog_number or an element set, not both')
  const number = args.catalog_number.trim().padStart(5, '0')
  const found = objects.find(o => o.catalogNumber === number)
  if (found === undefined) throw new Error(`primary.catalog_number ${number} is not in the catalog`)
  return found
}

/**
 * Build the `ssa_catalog_screen` tool.
 * @param ctx - context carrying the filesystem.
 * @param bounds - deployment bounds.
 * @returns the tool definition.
 */
export function screenTool(ctx: Context, bounds: Bounds): ToolDefinition {
  return defineTool({
    name: 'ssa_catalog_screen',
    description: DESCRIPTION,
    parameters: {
      catalog_path: { ...CATALOG_PATH, required: true },
      primary: { ...ELEMENT_SET, required: true, properties: { ...ELEMENT_SET.properties, catalog_number: { type: 'string' } } },
      start: { ...TIME, required: true },
      end: { ...TIME, required: true },
      step_s: { type: 'number' },
      screening_distance_km: { type: 'number' },
      filter_pad_km: { type: 'number' },
      hard_body_radius_km: { type: 'number' },
      primary_sigma_rtn_km: TRIPLE,
      secondary_sigma_rtn_km: TRIPLE,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          primary: { type: 'string', required: true },
          catalog_objects: { type: 'integer', required: true },
          candidates_after_filter: { type: 'integer', required: true },
          propagation_failures: {
            type: 'array',
            required: true,
            items: { type: 'object', additionalProperties: false, properties: { catalog_number: { type: 'string', required: true }, reason: { type: 'string', required: true } } },
          },
          approaches: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                catalog_number: { type: 'string', required: true },
                tca: { type: 'string', required: true },
                miss_distance_km: { type: 'number', required: true },
                relative_speed_km_s: { type: 'number', required: true },
                miss_rtn_km: { ...TRIPLE, required: true },
                max_collision_probability: { type: 'number', required: true },
                collision_probability: NUMBER_OR_NULL,
              },
            },
          },
          more_approaches: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.approaches.length === 0 ? `No approach inside the screening distance among ${String(value.candidates_after_filter)} filtered candidates.` : JSON.stringify(value) }],
    },
    presentCall: args => ({ card: 'generic', title: 'Catalog conjunction screening', kind: 'search', locations: [{ path: args.catalog_path }] }),
    async execute(args, exec) {
      const { start, end } = windowOf(args.start, args.end)
      const options = {
        start,
        end,
        stepMs: positiveOf(args.step_s ?? 30, 'step_s') * 1000,
        screenKm: positiveOf(args.screening_distance_km ?? 5, 'screening_distance_km'),
        padKm: positiveOf(args.filter_pad_km ?? 30, 'filter_pad_km'),
      }
      const hbr = positiveOf(args.hard_body_radius_km ?? 0.02, 'hard_body_radius_km')
      const covPrimary = sigmaCovariance(args.primary_sigma_rtn_km, 'primary_sigma_rtn_km')
      const covSecondary = sigmaCovariance(args.secondary_sigma_rtn_km, 'secondary_sigma_rtn_km')
      const catalog = await readCatalog(ctx, exec, args.catalog_path, bounds)
      const primary = primaryObject(args.primary, catalog.objects)
      const candidates = screeningCandidates(primary, catalog.objects, options)
      withinBudget((candidates.length + 1) * sampleCount(start, end, options.stepMs), bounds.maxEvaluations, 'increase step_s, shorten the window, or lower filter_pad_km')
      const result = screenCatalog(primary.elements, candidates, options)
      const rows = result.approaches.map(({ object, approach, primary: p, secondary: s }) => {
        const combined = covPrimary !== undefined && covSecondary !== undefined
          ? addMat3(rtnToInertialCovariance(p, covPrimary), rtnToInertialCovariance(s, covSecondary))
          : undefined
        const covariance: Mat3 = combined ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
        const pc = collisionProbability2D(approach.relativePosition, approach.relativeVelocity, covariance, hbr)
        return {
          name: object.name,
          catalog_number: object.catalogNumber,
          tca: formatUtc(approach.tca),
          miss_distance_km: roundTo(approach.missDistance, 6),
          relative_speed_km_s: roundTo(approach.relativeSpeed, 6),
          miss_rtn_km: approach.rtn.map(x => roundTo(x, 6)),
          max_collision_probability: Number(pc.pcMax.toPrecision(6)),
          collision_probability: combined === undefined ? null : Number(pc.pc.toPrecision(6)),
        }
      }).sort((a, b) => a.miss_distance_km - b.miss_distance_km)
      return {
        primary: primary.name,
        catalog_objects: catalog.objects.length,
        candidates_after_filter: result.candidates,
        propagation_failures: result.failures.slice(0, bounds.maxResults)
          .map(f => ({ catalog_number: f.object.catalogNumber, reason: f.reason })),
        approaches: rows.slice(0, bounds.maxResults),
        more_approaches: Math.max(0, rows.length - bounds.maxResults),
      }
    },
  })
}
