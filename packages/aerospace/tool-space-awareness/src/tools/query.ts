/**
 * `ssa_catalog_query`: filter and sort a workspace element-set catalog and report each object's
 * mean orbit, ESA orbit class, and geosynchronous longitude and drift.
 * @module @astro-one/tool-space-awareness/tools/query
 */

import { DEG, formatUtc, R_EARTH } from '@astro-one/astrodynamics'
import type { Context } from '@astro-one/cordis'
import { defineTool } from '@astro-one/tools'
import type { ToolDefinition } from '@astro-one/tools'
import { geoView, orbitRegime, readCatalog, REGIMES } from '../catalog.ts'
import type { CatalogObject, Regime } from '../catalog.ts'
import { roundTo } from '../inputs.ts'
import { CATALOG_PATH, NUMBER_OR_NULL } from '../schema.ts'
import type { Bounds } from '../settings.ts'

const DESCRIPTION = 'Query a workspace element-set catalog. Filters: regimes (ESA orbit classes: GEO geostationary, IGO '
  + 'inclined geosynchronous, EGO extended geostationary, NSO navigation, GTO GEO transfer, MEO, GHO GEO-superGEO crossing, '
  + 'LEO, HAO high altitude, MGO MEO-GEO crossing, HEO highly eccentric, LMO LEO-MEO crossing, UFO undefined), name_contains '
  + '(case-insensitive), catalog_numbers, perigee/apogee altitude and inclination ranges. Returns the per-class counts of the '
  + 'whole catalog and, for each match, SGP4 mean elements, perigee/apogee altitude, period, B*, and for geosynchronous '
  + 'classes the sub-satellite longitude and drift rate at the element-set epoch. sort_by picks the order (default '
  + 'catalog_number); limit caps the rows.'

const SORT_KEYS = ['catalog_number', 'perigee_alt_km', 'apogee_alt_km', 'inclination_deg', 'epoch'] as const

/** Output row of one object. */
interface ObjectRow {
  name: string
  catalog_number: string
  epoch: string
  regime: Regime
  a_km: number
  e: number
  i_deg: number
  raan_deg: number
  perigee_alt_km: number
  apogee_alt_km: number
  period_min: number
  bstar: number
  geo_longitude_deg: number | null
  geo_drift_deg_per_day: number | null
}

function row(object: CatalogObject): ObjectRow {
  const m = object.mean
  const regime = orbitRegime(m)
  const geo = regime === 'GEO' || regime === 'IGO' || regime === 'EGO' ? geoView(object) : undefined
  return {
    name: object.name,
    catalog_number: object.catalogNumber,
    epoch: formatUtc(object.elements.epoch),
    regime,
    a_km: roundTo(m.a, 3),
    e: roundTo(m.e, 7),
    i_deg: roundTo(m.i / DEG, 4),
    raan_deg: roundTo(m.raan / DEG, 4),
    perigee_alt_km: roundTo(m.a * (1 - m.e) - R_EARTH, 3),
    apogee_alt_km: roundTo(m.a * (1 + m.e) - R_EARTH, 3),
    period_min: roundTo((2 * Math.PI) / m.meanMotion / 60, 4),
    bstar: Number(m.bstar.toPrecision(6)),
    geo_longitude_deg: geo === undefined ? null : roundTo(geo.longitudeDeg, 4),
    geo_drift_deg_per_day: geo === undefined ? null : roundTo(geo.driftDegPerDay, 5),
  }
}

/**
 * Build the `ssa_catalog_query` tool.
 * @param ctx - context carrying the filesystem.
 * @param bounds - deployment bounds.
 * @returns the tool definition.
 */
export function queryTool(ctx: Context, bounds: Bounds): ToolDefinition {
  return defineTool({
    name: 'ssa_catalog_query',
    description: DESCRIPTION,
    parameters: {
      catalog_path: { ...CATALOG_PATH, required: true },
      regimes: { type: 'array', items: { type: 'string', enum: [...REGIMES] } },
      name_contains: { type: 'string' },
      catalog_numbers: { type: 'array', items: { type: 'string' } },
      min_perigee_alt_km: { type: 'number' },
      max_perigee_alt_km: { type: 'number' },
      min_apogee_alt_km: { type: 'number' },
      max_apogee_alt_km: { type: 'number' },
      min_inclination_deg: { type: 'number' },
      max_inclination_deg: { type: 'number' },
      sort_by: { type: 'string', enum: [...SORT_KEYS] },
      limit: { type: 'integer' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          total_objects: { type: 'integer', required: true },
          rejected_entries: { type: 'integer', required: true },
          regime_counts: {
            type: 'array',
            required: true,
            items: { type: 'object', additionalProperties: false, properties: { regime: { type: 'string', required: true }, count: { type: 'integer', required: true } } },
          },
          matched: { type: 'integer', required: true },
          objects: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                catalog_number: { type: 'string', required: true },
                epoch: { type: 'string', required: true },
                regime: { type: 'string', required: true },
                a_km: { type: 'number', required: true },
                e: { type: 'number', required: true },
                i_deg: { type: 'number', required: true },
                raan_deg: { type: 'number', required: true },
                perigee_alt_km: { type: 'number', required: true },
                apogee_alt_km: { type: 'number', required: true },
                period_min: { type: 'number', required: true },
                bstar: { type: 'number', required: true },
                geo_longitude_deg: NUMBER_OR_NULL,
                geo_drift_deg_per_day: NUMBER_OR_NULL,
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    presentCall: args => ({ card: 'generic', title: 'Catalog query', kind: 'read', locations: [{ path: args.catalog_path }] }),
    async execute(args, exec) {
      const limit = args.limit ?? bounds.maxResults
      if (!(Number.isInteger(limit) && limit >= 1 && limit <= bounds.maxResults)) throw new Error(`limit must be an integer from 1 to ${String(bounds.maxResults)}`)
      const catalog = await readCatalog(ctx, exec, args.catalog_path, bounds)
      const rows = catalog.objects.map(row)
      const counts = new Map<Regime, number>()
      for (const r of rows) counts.set(r.regime, (counts.get(r.regime) ?? 0) + 1)
      const needle = args.name_contains?.toLowerCase()
      const numbers = args.catalog_numbers === undefined ? undefined : new Set(args.catalog_numbers.map(n => n.trim().padStart(5, '0')))
      const within = (x: number, lo: number | undefined, hi: number | undefined): boolean =>
        (lo === undefined || x >= lo) && (hi === undefined || x <= hi)
      const matched = rows.filter(r => (args.regimes === undefined || args.regimes.includes(r.regime))
        && (needle === undefined || r.name.toLowerCase().includes(needle))
        && (numbers === undefined || numbers.has(r.catalog_number))
        && within(r.perigee_alt_km, args.min_perigee_alt_km, args.max_perigee_alt_km)
        && within(r.apogee_alt_km, args.min_apogee_alt_km, args.max_apogee_alt_km)
        && within(r.i_deg, args.min_inclination_deg, args.max_inclination_deg))
      const key = args.sort_by ?? 'catalog_number'
      const value = (r: ObjectRow): number | string => (key === 'inclination_deg' ? r.i_deg : r[key])
      matched.sort((a, b) => {
        const x = value(a)
        const y = value(b)
        return x < y ? -1 : x > y ? 1 : 0
      })
      return {
        total_objects: catalog.objects.length,
        rejected_entries: catalog.rejected.length,
        regime_counts: REGIMES.filter(r => counts.has(r)).map(r => ({ regime: r, count: counts.get(r) as number })),
        matched: matched.length,
        objects: matched.slice(0, limit),
      }
    },
  })
}
