/**
 * SGP4/SDP4 propagation of two-line element sets and CCSDS OMM records through satellite.js
 * (Vallado 2006 revision), returning TEME states.
 * @module @astro-one/astrodynamics/sgp4
 */

import { json2satrec, SatRecError, sgp4, twoline2satrec } from 'satellite.js'
import type { OMMJsonObject, SatRec } from 'satellite.js'

export type { OMMJsonObject } from 'satellite.js'
import { MS_PER_DAY } from './constants.ts'
import type { TimedState, UtcMs } from './types.ts'

/** A parsed SGP4 element set. */
export interface Sgp4Elements {
  /** satellite.js record; opaque to callers. */
  readonly satrec: SatRec
  /** NORAD catalog number as written in the source. */
  readonly catalogNumber: string
  /** Element-set epoch. */
  readonly epoch: UtcMs
}

const SATREC_ERRORS: Readonly<Record<SatRecError, string>> = {
  [SatRecError.None]: 'no error',
  [SatRecError.MeanEccentricityOutOfRange]: 'mean eccentricity is outside [0, 1)',
  [SatRecError.MeanMotionBelowZero]: 'mean motion fell below zero',
  [SatRecError.PerturbedEccentricityOutOfRange]: 'perturbed eccentricity is outside [0, 1)',
  [SatRecError.SemiLatusRectumBelowZero]: 'semi-latus rectum fell below zero',
  [SatRecError.Decayed]: 'the orbit has decayed',
}

function fromSatrec(satrec: SatRec): Sgp4Elements {
  if (satrec.error !== SatRecError.None) throw new Error(`invalid element set: ${describeError(satrec.error)}`)
  return { satrec, catalogNumber: satrec.satnum, epoch: elementEpoch(satrec.epochyr, satrec.epochdays) }
}

/**
 * Element-set epoch from the TLE year and fractional day of year, without the rounding of a
 * whole-Julian-date representation (which costs metres of along-track error).
 * @param epochyr - two-digit TLE year (57–99 → 19xx, 00–56 → 20xx).
 * @param epochdays - fractional day of year, 1.0 at 00:00 on 1 January.
 * @returns UTC milliseconds (fractional).
 */
export function elementEpoch(epochyr: number, epochdays: number): UtcMs {
  const year = epochyr < 57 ? 2000 + epochyr : 1900 + epochyr
  return Date.UTC(year, 0, 1) + (epochdays - 1) * MS_PER_DAY
}

function describeError(code: SatRecError): string {
  return SATREC_ERRORS[code]
}

/**
 * Parse a two-line element set.
 * @param line1 - first TLE line.
 * @param line2 - second TLE line.
 * @returns the element set.
 * @throws When either line is malformed or the elements are invalid.
 */
export function parseTle(line1: string, line2: string): Sgp4Elements {
  const l1 = line1.trimEnd()
  const l2 = line2.trimEnd()
  if (!/^1 /.test(l1) || !/^2 /.test(l2) || l1.length < 69 || l2.length < 69) {
    throw new Error('TLE lines must start with "1 " and "2 " and span 69 columns')
  }
  for (const line of [l1, l2]) {
    if (tleChecksum(line) !== Number(line[68])) throw new Error(`TLE checksum mismatch on line ${line[0] as string}`)
  }
  return fromSatrec(twoline2satrec(l1, l2))
}

/**
 * Modulo-10 TLE checksum of columns 1–68 (digits count, minus signs count as 1).
 * @param line - TLE line.
 * @returns expected checksum digit.
 */
export function tleChecksum(line: string): number {
  let sum = 0
  for (const ch of line.slice(0, 68)) {
    if (ch >= '0' && ch <= '9') sum += Number(ch)
    else if (ch === '-') sum += 1
  }
  return sum % 10
}

/**
 * Parse a CCSDS OMM record in the JSON keyword form (as served by CelesTrak and Space-Track).
 * @param omm - OMM keywords.
 * @returns the element set.
 */
export function parseOmm(omm: OMMJsonObject): Sgp4Elements {
  return fromSatrec(json2satrec(omm))
}

/**
 * Validate a CCSDS OMM keyword record from an untyped source (model or file JSON). Numeric
 * keywords may be numbers or numeric strings, as CelesTrak and Space-Track serve both.
 * @param record - OMM keywords.
 * @returns the typed keyword set with SGP4 defaults for the optional fields.
 * @throws When a required keyword is missing or malformed.
 */
export function ommFromRecord(record: Readonly<Record<string, unknown>>): OMMJsonObject {
  const text = (key: string): string => {
    const value = record[key]
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`OMM keyword ${key} must be a non-empty string`)
    return value
  }
  const num = (key: string): number => {
    const value = record[key]
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`OMM keyword ${key} must be a number`)
    return n
  }
  const optionalNum = (key: string, fallback: number): number => (record[key] === undefined ? fallback : num(key))
  return {
    OBJECT_NAME: text('OBJECT_NAME'),
    OBJECT_ID: text('OBJECT_ID'),
    EPOCH: text('EPOCH'),
    MEAN_MOTION: num('MEAN_MOTION'),
    ECCENTRICITY: num('ECCENTRICITY'),
    INCLINATION: num('INCLINATION'),
    RA_OF_ASC_NODE: num('RA_OF_ASC_NODE'),
    ARG_OF_PERICENTER: num('ARG_OF_PERICENTER'),
    MEAN_ANOMALY: num('MEAN_ANOMALY'),
    NORAD_CAT_ID: num('NORAD_CAT_ID'),
    ELEMENT_SET_NO: optionalNum('ELEMENT_SET_NO', 999),
    REV_AT_EPOCH: optionalNum('REV_AT_EPOCH', 0),
    BSTAR: num('BSTAR'),
    MEAN_MOTION_DOT: num('MEAN_MOTION_DOT'),
    MEAN_MOTION_DDOT: num('MEAN_MOTION_DDOT'),
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: record.CLASSIFICATION_TYPE === 'C' ? 'C' : 'U',
  }
}

/**
 * Propagate an element set to output instants.
 * @param elements - SGP4 element set.
 * @param times - output instants.
 * @returns TEME states in request order.
 * @throws When SGP4 reports an error at any instant, such as decay.
 */
export function propagateSgp4(elements: Sgp4Elements, times: readonly UtcMs[]): TimedState[] {
  return times.map((t) => {
    const result = sgp4(elements.satrec, (t - elements.epoch) / 60000)
    if (result === null) {
      throw new Error(`SGP4 failed at ${new Date(t).toISOString()}: ${describeError(elements.satrec.error)}`)
    }
    const { position: p, velocity: v } = result
    return { t, r: [p.x, p.y, p.z], v: [v.x, v.y, v.z] }
  })
}
