/**
 * Model-facing schema fragments shared by the space-awareness tools. Distances are km, angles
 * degrees, and instants ISO 8601 date-times with `Z` or a UTC offset.
 * @module @astro-one/tool-space-awareness/schema
 */

/** ISO 8601 instant. */
export const TIME = { type: 'string', description: 'ISO 8601 date-time with Z or a UTC offset, for example 2025-03-01T12:00:00Z.' } as const

/** Workspace catalog file. */
export const CATALOG_PATH = {
  type: 'string',
  description: 'Element-set catalog in the workspace: two- or three-line TLE text (name lines optional, "0 " prefixes allowed) or a JSON array of CCSDS OMM records as served by CelesTrak (FORMAT=json).',
} as const

/** WGS-84 observing site. */
export const SITE = {
  type: 'object',
  additionalProperties: false,
  description: 'Observing site: WGS-84 geodetic latitude and east longitude in degrees, height above the ellipsoid in km.',
  properties: { lat_deg: { type: 'number', required: true }, lon_deg: { type: 'number', required: true }, alt_km: { type: 'number', required: true } },
} as const

/** One inline element set. */
export const ELEMENT_SET = {
  type: 'object',
  additionalProperties: false,
  description: 'One element set: TLE line1 and line2, or omm (CCSDS OMM JSON keywords). name labels the object in results.',
  properties: { line1: { type: 'string' }, line2: { type: 'string' }, omm: { type: 'json' }, name: { type: 'string' } },
} as const

/** Optional three-component number array. */
export const TRIPLE = { type: 'array', items: { type: 'number' } } as const

/** Nullable number output. */
export const NUMBER_OR_NULL = { oneOf: [{ type: 'number' }, { type: 'null' }], required: true } as const

/** Nullable string output. */
export const STRING_OR_NULL = { oneOf: [{ type: 'string' }, { type: 'null' }], required: true } as const
