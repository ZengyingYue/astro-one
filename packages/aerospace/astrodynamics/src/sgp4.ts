/**
 * SGP4/SDP4 propagation of two-line element sets and CCSDS OMM records through satellite.js
 * (Vallado 2006 revision), returning TEME states, plus the mean elements SGP4 initialized from
 * a set and the fixed-column TLE encoding.
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

/** Equatorial radius of the WGS-72 constants SGP4 uses, km. */
const SGP4_RADIUS_KM = 6378.135

/** Brouwer mean elements and secular rates that SGP4 derived from an element set. */
export interface Sgp4MeanElements {
  /** Mean semi-major axis, km. */
  readonly a: number
  /** Mean eccentricity. */
  readonly e: number
  /** Mean inclination, rad. */
  readonly i: number
  /** Right ascension of the ascending node at epoch, rad. */
  readonly raan: number
  /** Argument of perigee at epoch, rad. */
  readonly argp: number
  /** Mean anomaly at epoch, rad. */
  readonly m: number
  /** Brouwer mean motion, rad/s. */
  readonly meanMotion: number
  /** Secular mean-anomaly rate including zonal gravity, rad/s. */
  readonly meanAnomalyRate: number
  /** Secular node rate from zonal gravity, rad/s. */
  readonly raanRate: number
  /** Secular perigee rate from zonal gravity, rad/s. */
  readonly argpRate: number
  /** SGP4 drag term B*, 1/Earth radii. */
  readonly bstar: number
}

/**
 * Mean elements of an element set as SGP4 initialized them.
 * @param elements - SGP4 element set.
 * @returns Brouwer mean elements at the set epoch and their secular rates.
 */
export function sgp4MeanElements(elements: Sgp4Elements): Sgp4MeanElements {
  const s = elements.satrec
  return {
    a: s.a * SGP4_RADIUS_KM,
    e: s.ecco,
    i: s.inclo,
    raan: s.nodeo,
    argp: s.argpo,
    m: s.mo,
    meanMotion: s.no / 60,
    meanAnomalyRate: s.mdot / 60,
    raanRate: s.nodedot / 60,
    argpRate: s.argpdot / 60,
    bstar: s.bstar,
  }
}

/** Fields of one two-line element set. Angles are degrees, as the TLE columns store them. */
export interface TleFields {
  /** Catalog number: up to five digits, or Alpha-5 (one letter and four digits). */
  readonly catalogNumber: string
  /** Security classification character. */
  readonly classification: 'U' | 'C' | 'S'
  /** International designator in TLE form (for example `98067A`), at most 8 characters. */
  readonly designator: string
  /** Element-set epoch. */
  readonly epoch: UtcMs
  /** Half the first derivative of mean motion, rev/day². */
  readonly meanMotionDot: number
  /** One sixth of the second derivative of mean motion, rev/day³. */
  readonly meanMotionDdot: number
  /** Drag term B*, 1/Earth radii. */
  readonly bstar: number
  /** Element set number, 0–9999. */
  readonly elementSetNumber: number
  /** Inclination, deg. */
  readonly inclinationDeg: number
  /** Right ascension of the ascending node, deg. */
  readonly raanDeg: number
  /** Eccentricity in [0, 1). */
  readonly eccentricity: number
  /** Argument of perigee, deg. */
  readonly argpDeg: number
  /** Mean anomaly, deg. */
  readonly meanAnomalyDeg: number
  /** Kozai mean motion, rev/day. */
  readonly meanMotion: number
  /** Revolution number at epoch, 0–99999. */
  readonly revolution: number
}

/**
 * Encode a two-line element set in the fixed-column format with checksums.
 * @param f - element-set fields.
 * @returns line 1 and line 2.
 * @throws When a field does not fit its columns.
 */
export function formatTle(f: TleFields): [string, string] {
  if (!/^(?:\d{1,5}|[A-HJ-NP-Z]\d{4})$/.test(f.catalogNumber)) throw new Error('catalog number must be up to five digits or Alpha-5')
  if (f.designator.length > 8) throw new Error('international designator must fit 8 characters')
  if (!(f.eccentricity >= 0 && f.eccentricity < 1)) throw new Error('eccentricity must lie in [0, 1)')
  if (!(f.meanMotion > 0 && f.meanMotion < 100)) throw new Error('mean motion must lie in (0, 100) rev/day')
  if (!(Math.abs(f.meanMotionDot) < 1)) throw new Error('mean motion derivative must be smaller than 1 rev/day² in magnitude')
  const catalog = f.catalogNumber.padStart(5, '0')
  const date = new Date(f.epoch)
  const year = date.getUTCFullYear()
  if (year < 1957 || year > 2056) throw new Error('TLE epochs must lie in 1957–2056')
  const day = (f.epoch - Date.UTC(year, 0, 1)) / MS_PER_DAY + 1
  const fixed = (x: number, width: number, digits: number): string => x.toFixed(digits).padStart(width, ' ')
  const angle = (deg: number): string => {
    const text = fixed(((deg % 360) + 360) % 360, 8, 4)
    return text === '360.0000' ? '  0.0000' : text
  }
  const ndot = `${f.meanMotionDot < 0 ? '-' : ' '}${Math.abs(f.meanMotionDot).toFixed(8).slice(1)}`
  const line1 = `1 ${catalog}${f.classification} ${f.designator.padEnd(8, ' ')} ${String(year % 100).padStart(2, '0')}`
    + `${day.toFixed(8).padStart(12, '0')} ${ndot} ${exponential(f.meanMotionDdot)} ${exponential(f.bstar)} 0 `
    + String(f.elementSetNumber % 10000).padStart(4, ' ')
  const line2 = `2 ${catalog} ${angle(f.inclinationDeg)} ${angle(f.raanDeg)} `
    + `${String(Math.min(9999999, Math.round(f.eccentricity * 1e7))).padStart(7, '0')} ${angle(f.argpDeg)} ${angle(f.meanAnomalyDeg)} `
    + `${fixed(f.meanMotion, 11, 8)}${String(f.revolution % 100000).padStart(5, ' ')}`
  return [`${line1}${String(tleChecksum(line1))}`, `${line2}${String(tleChecksum(line2))}`]
}

/**
 * TLE assumed-decimal exponential field: sign, five mantissa digits, exponent sign and digit.
 * @param x - value.
 * @returns eight characters such as ` 28098-4`.
 */
function exponential(x: number): string {
  if (x === 0 || Math.abs(x) < 1e-10) return ' 00000-0'
  let exponent = Math.floor(Math.log10(Math.abs(x))) + 1
  let mantissa = Math.round((Math.abs(x) / 10 ** exponent) * 1e5)
  if (mantissa >= 100000) {
    mantissa = 10000
    exponent += 1
  }
  if (exponent > 9) throw new Error(`${String(x)} does not fit a TLE exponential field`)
  return `${x < 0 ? '-' : ' '}${String(mantissa).padStart(5, '0')}${exponent < 0 ? '-' : '+'}${String(Math.abs(exponent))}`
}
