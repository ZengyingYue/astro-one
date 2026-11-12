/**
 * Validation of model-supplied arguments shared by the space-awareness tools: instants and
 * windows, bounded positive numbers, ground sites, inline element sets, and output rounding.
 * Every failure throws an Error whose message names the offending field.
 * @module @astro-one/tool-space-awareness/inputs
 */

import { DEG, ommFromRecord, parseOmm, parseTle, parseUtc } from '@astro-one/astrodynamics'
import type { Geodetic, Sgp4Elements, UtcMs } from '@astro-one/astrodynamics'
import type { JsonValue } from '@astro-one/util-values'

/**
 * Parse an ISO instant.
 * @param text - model-supplied instant.
 * @param field - field name for the error message.
 * @returns UTC milliseconds.
 */
export function instantOf(text: string, field: string): UtcMs {
  try {
    return parseUtc(text)
  } catch (error) {
    throw new Error(`${field}: ${(error as Error).message}`)
  }
}

/**
 * Parse a time window whose end follows its start.
 * @param start - window start text.
 * @param end - window end text.
 * @returns the window bounds in UTC milliseconds.
 */
export function windowOf(start: string, end: string): { start: UtcMs; end: UtcMs } {
  const bounds = { start: instantOf(start, 'start'), end: instantOf(end, 'end') }
  if (!(bounds.end > bounds.start)) throw new Error('end must follow start')
  return bounds
}

/**
 * Require a positive number (JSON arguments are always finite).
 * @param value - candidate.
 * @param field - field name.
 * @returns the value.
 */
export function positiveOf(value: number, field: string): number {
  if (!(value > 0)) throw new Error(`${field} must be positive`)
  return value
}

/**
 * Require that a planned amount of work fits the deployment budget.
 * @param needed - planned evaluation count.
 * @param budget - deployment budget.
 * @param advice - what the caller can change.
 */
export function withinBudget(needed: number, budget: number, advice: string): void {
  if (needed > budget) throw new Error(`this request needs about ${String(Math.ceil(needed))} model evaluations; at most ${String(budget)} are allowed (${advice})`)
}

/** Model-facing ground site. */
export interface SiteArgs {
  readonly lat_deg: number
  readonly lon_deg: number
  readonly alt_km: number
}

/**
 * Convert a ground site.
 * @param s - schema-validated site.
 * @param field - field name.
 * @returns geodetic coordinates in radians and km.
 */
export function siteOf(s: SiteArgs, field: string): Geodetic {
  if (!(Math.abs(s.lat_deg) <= 90)) throw new Error(`${field}.lat_deg must lie in [-90, 90]`)
  return { lat: s.lat_deg * DEG, lon: s.lon_deg * DEG, h: s.alt_km }
}

/** Model-facing inline element set. */
export interface ElementSetArgs {
  readonly line1?: string
  readonly line2?: string
  readonly omm?: JsonValue
  readonly name?: string
}

/** A named SGP4 element set. */
export interface NamedElements {
  /** Object name from the argument, the OMM record, or the catalog number. */
  readonly name: string
  /** Parsed element set. */
  readonly elements: Sgp4Elements
}

/**
 * Parse an inline TLE or OMM element set.
 * @param args - schema-validated element set.
 * @param field - field name.
 * @returns the named element set.
 */
export function elementSetOf(args: ElementSetArgs, field: string): NamedElements {
  if (args.omm !== undefined) {
    if (args.line1 !== undefined || args.line2 !== undefined) throw new Error(`${field}: give either line1/line2 or omm, not both`)
    const omm = args.omm
    if (omm === null || typeof omm !== 'object' || Array.isArray(omm)) throw new Error(`${field}.omm must be an object of CCSDS OMM keywords`)
    const record = ommFromRecord(omm)
    return { name: args.name ?? record.OBJECT_NAME, elements: parseOmm(record) }
  }
  if (args.line1 === undefined || args.line2 === undefined) throw new Error(`${field} needs line1 and line2, or omm`)
  try {
    const elements = parseTle(args.line1, args.line2)
    return { name: args.name ?? elements.catalogNumber, elements }
  } catch (error) {
    throw new Error(`${field}: ${(error as Error).message}`)
  }
}

/**
 * Round for compact, stable output; turns −0 into 0.
 * @param x - value.
 * @param digits - decimal places.
 * @returns the rounded value.
 */
export function roundTo(x: number, digits: number): number {
  const k = 10 ** digits
  return Math.round(x * k) / k + 0
}
