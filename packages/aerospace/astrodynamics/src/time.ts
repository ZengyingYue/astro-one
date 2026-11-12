/**
 * Time scales: ISO 8601 parsing, Julian dates, the TAI−UTC leap-second table, Terrestrial
 * Time centuries, and IAU-1982 Greenwich mean sidereal time.
 * @module @astro-one/astrodynamics/time
 */

import { JD_J2000, JD_UNIX_EPOCH, MS_PER_DAY } from './constants.ts'
import { wrap2pi } from './linalg.ts'
import type { UtcMs } from './types.ts'

/**
 * TAI−UTC steps (IERS Bulletin C): each row is the UTC instant a value takes effect and the
 * TAI−UTC offset in seconds from that instant. No leap second has been announced after
 * 2017-01-01.
 */
const LEAP_SECONDS: readonly (readonly [UtcMs, number])[] = [
  ['1972-01-01', 10], ['1972-07-01', 11], ['1973-01-01', 12], ['1974-01-01', 13],
  ['1975-01-01', 14], ['1976-01-01', 15], ['1977-01-01', 16], ['1978-01-01', 17],
  ['1979-01-01', 18], ['1980-01-01', 19], ['1981-07-01', 20], ['1982-07-01', 21],
  ['1983-07-01', 22], ['1985-07-01', 23], ['1988-01-01', 24], ['1990-01-01', 25],
  ['1991-01-01', 26], ['1992-07-01', 27], ['1993-07-01', 28], ['1994-07-01', 29],
  ['1996-01-01', 30], ['1997-07-01', 31], ['1999-01-01', 32], ['2006-01-01', 33],
  ['2009-01-01', 34], ['2012-07-01', 35], ['2015-07-01', 36], ['2017-01-01', 37],
].map(([date, offset]) => [Date.parse(`${date as string}T00:00:00Z`), offset as number] as const)

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/

/**
 * Parse an ISO 8601 instant that carries an explicit `Z` or UTC offset.
 * @param iso - instant such as `2024-03-01T12:00:00.250Z`.
 * @returns UTC milliseconds.
 * @throws When the text is not a zoned ISO 8601 date-time or names an invalid date.
 */
export function parseUtc(iso: string): UtcMs {
  if (!ISO_WITH_ZONE.test(iso)) throw new Error(`expected an ISO 8601 date-time with Z or an offset, got ${JSON.stringify(iso)}`)
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) throw new Error(`invalid date-time ${JSON.stringify(iso)}`)
  return ms
}

/**
 * Format a UTC instant as ISO 8601 with millisecond precision.
 * @param t - UTC milliseconds.
 * @returns ISO text ending in `Z`.
 */
export function formatUtc(t: UtcMs): string {
  return new Date(t).toISOString()
}

/**
 * Julian date of a UTC instant (UTC scale).
 * @param t - UTC milliseconds.
 * @returns Julian date.
 */
export function julianDate(t: UtcMs): number {
  return JD_UNIX_EPOCH + t / MS_PER_DAY
}

/**
 * TAI−UTC at a UTC instant.
 * @param t - UTC milliseconds, on or after 1972-01-01.
 * @returns offset, s.
 * @throws When `t` precedes the integer leap-second era.
 */
export function taiMinusUtc(t: UtcMs): number {
  let offset: number | undefined
  for (const [start, value] of LEAP_SECONDS) {
    if (t >= start) offset = value
    else break
  }
  if (offset === undefined) throw new Error('instants before 1972-01-01 UTC are outside the supported leap-second table')
  return offset
}

/**
 * Terrestrial Time minus UTC.
 * @param t - UTC milliseconds.
 * @returns TT−UTC, s.
 */
export function ttMinusUtc(t: UtcMs): number {
  return taiMinusUtc(t) + 32.184
}

/**
 * Julian centuries of Terrestrial Time since J2000.0.
 * @param t - UTC milliseconds.
 * @returns T_TT.
 */
export function centuriesTT(t: UtcMs): number {
  return (julianDate(t) + ttMinusUtc(t) / 86400 - JD_J2000) / 36525
}

/**
 * Greenwich mean sidereal time (IAU-1982 model, Vallado Eq. 3-47).
 * @param t - UTC milliseconds.
 * @param dut1 - UT1−UTC, s.
 * @returns GMST in [0, 2π), rad.
 */
export function gmst(t: UtcMs, dut1 = 0): number {
  const tu = (julianDate(t) + dut1 / 86400 - JD_J2000) / 36525
  const seconds = 67310.54841 + (876600 * 3600 + 8640184.812866) * tu + 0.093104 * tu * tu - 6.2e-6 * tu * tu * tu
  return wrap2pi(((seconds % 86400) / 240) * (Math.PI / 180))
}
