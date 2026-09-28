/**
 * RINEX 3.0x readers: GPS/Galileo/BeiDou broadcast navigation records with the header GPS
 * Klobuchar coefficients, and observation epochs with per-satellite code, phase, and
 * loss-of-lock indicators. Times are GPS seconds since 1980-01-06 00:00:00 GPST.
 * @module @astro-one/tool-gnss/rinex
 */

/** GNSS constellations this package processes. */
export type GnssSystem = 'G' | 'E' | 'C'

/** Keplerian broadcast ephemeris shared by GPS LNAV, Galileo I/NAV-F/NAV, and BeiDou D1/D2. */
export interface BroadcastEphemeris {
  /** Constellation letter. */
  readonly system: GnssSystem
  /** Satellite id such as `G05`. */
  readonly sat: string
  /** PRN number. */
  readonly prn: number
  /** Clock reference time, GPS seconds. */
  readonly toc: number
  /** Clock bias, s. */
  readonly af0: number
  /** Clock drift, s/s. */
  readonly af1: number
  /** Clock drift rate, s/s². */
  readonly af2: number
  /** Issue of data (IODE, IODnav, or AODE). */
  readonly iode: number
  readonly crs: number
  readonly deltaN: number
  readonly m0: number
  readonly cuc: number
  readonly e: number
  readonly cus: number
  readonly sqrtA: number
  /** Ephemeris reference time, GPS seconds. */
  readonly toe: number
  /** Ephemeris reference time as seconds of week in the satellite's own system time. */
  readonly toeSow: number
  readonly cic: number
  readonly omega0: number
  readonly cis: number
  readonly i0: number
  readonly crc: number
  readonly omega: number
  readonly omegaDot: number
  readonly idot: number
  /** Health flag (0 = usable). */
  readonly health: number
  /** Group delay removed from the single-frequency clock: GPS TGD, Galileo BGD, or BeiDou TGD1, s. */
  readonly groupDelay: number
}

/** Parsed navigation file. */
export interface NavigationData {
  /** Ephemerides of the supported constellations, in file order. */
  readonly ephemerides: BroadcastEphemeris[]
  /** GPS Klobuchar α and β coefficients, when the header carries them. */
  readonly klobuchar?: { readonly alpha: readonly number[]; readonly beta: readonly number[] }
}

/** One satellite's observations at one epoch, keyed by RINEX 3 observation code. */
export interface SatelliteObservation {
  /** Observation values by code (for example `C1C`, `L1C`). */
  readonly values: Readonly<Record<string, number>>
  /** Loss-of-lock indicators by code. */
  readonly lli: Readonly<Record<string, number>>
}

/** One receiver epoch. */
export interface ObservationEpoch {
  /** Receiver time, GPS seconds. */
  readonly time: number
  /** Observations by satellite id. */
  readonly satellites: ReadonlyMap<string, SatelliteObservation>
}

/** Parsed observation file. */
export interface ObservationData {
  /** Marker name. */
  readonly marker: string
  /** Approximate ECEF position from the header, m. */
  readonly approxPosition?: readonly [number, number, number]
  /** Observation codes per constellation. */
  readonly types: Readonly<Record<string, readonly string[]>>
  /** Epochs with flag 0 or 1, in file order. */
  readonly epochs: ObservationEpoch[]
}

/** GPS epoch in Unix milliseconds. */
export const GPS_EPOCH_MS = Date.UTC(1980, 0, 6)

/** BeiDou time lags GPS time by this many seconds. */
export const BDT_OFFSET_S = 14

/** BeiDou week 0 begins at GPS week 1356. */
export const BDT_WEEK_OFFSET = 1356

function num(text: string): number {
  const t = text.trim().replace(/[dD]/, 'E')
  return t === '' ? 0 : Number(t)
}

function label(line: string): string {
  return line.slice(60).trim()
}

/**
 * GPS seconds of a calendar instant written in a GPS-aligned time scale.
 * @param y - year.
 * @param mo - month 1–12.
 * @param d - day.
 * @param h - hour.
 * @param mi - minute.
 * @param s - seconds (fractional).
 * @returns GPS seconds.
 */
export function calendarToGps(y: number, mo: number, d: number, h: number, mi: number, s: number): number {
  return (Date.UTC(y, mo - 1, d, h, mi) - GPS_EPOCH_MS) / 1000 + s
}

function epochFields(text: string): number[] {
  return text.trim().split(/\s+/).map(Number)
}

function checkVersion(lines: readonly string[], kind: 'N' | 'O'): void {
  const first = lines[0] as string
  if (label(first) !== 'RINEX VERSION / TYPE') throw new Error('not a RINEX file: missing RINEX VERSION / TYPE header')
  const version = num(first.slice(0, 9))
  if (!(version >= 3 && version < 4)) throw new Error(`RINEX version ${String(version)} is not supported; convert to RINEX 3.0x`)
  if (first[20] !== kind) throw new Error(`expected a RINEX ${kind === 'N' ? 'navigation' : 'observation'} file`)
}

/**
 * Parse a RINEX 3 navigation file.
 * @param text - file content.
 * @returns GPS, Galileo, and BeiDou ephemerides plus GPS ionosphere coefficients.
 */
export function parseNavigation(text: string): NavigationData {
  const lines = text.split(/\r?\n/)
  checkVersion(lines, 'N')
  let alpha: number[] | undefined
  let beta: number[] | undefined
  let i = 0
  for (; i < lines.length; i++) {
    const line = lines[i] as string
    const l = label(line)
    if (l === 'END OF HEADER') break
    if (l === 'IONOSPHERIC CORR') {
      const kind = line.slice(0, 4)
      const values = [0, 1, 2, 3].map(k => num(line.slice(5 + 12 * k, 17 + 12 * k)))
      if (kind === 'GPSA') alpha = values
      else if (kind === 'GPSB') beta = values
    }
  }
  const ephemerides: BroadcastEphemeris[] = []
  for (i += 1; i < lines.length; i++) {
    const line = lines[i] as string
    if (line.trim() === '') continue
    const system = line[0] as string
    const orbitLines = system === 'R' || system === 'S' ? 3 : 7
    const block = lines.slice(i + 1, i + 1 + orbitLines)
    i += orbitLines
    if (system !== 'G' && system !== 'E' && system !== 'C') continue
    if (block.length < 7) throw new Error(`truncated navigation record for ${line.slice(0, 3)}`)
    const values = (row: number): number[] => {
      const l = block[row] as string
      return [0, 1, 2, 3].map(k => num(l.slice(4 + 19 * k, 23 + 19 * k)))
    }
    const [y, mo, d, h, mi, s] = epochFields(line.slice(3, 23))
    const tocCal = calendarToGps(y as number, mo as number, d as number, h as number, mi as number, s as number)
    const shift = system === 'C' ? BDT_OFFSET_S : 0
    const clock = [0, 1, 2].map(k => num(line.slice(23 + 19 * k, 42 + 19 * k)))
    const [iode, crs, deltaN, m0] = values(0) as [number, number, number, number]
    const [cuc, e, cus, sqrtA] = values(1) as [number, number, number, number]
    const [toeSow, cic, omega0, cis] = values(2) as [number, number, number, number]
    const [i0, crc, omega, omegaDot] = values(3) as [number, number, number, number]
    const [idot, dataSources, week] = values(4) as [number, number, number, number]
    const [, health, tgd1, tgd2] = values(5) as [number, number, number, number]
    const gpsWeek = system === 'C' ? week + BDT_WEEK_OFFSET : week
    // Galileo I/NAV (data-source bit 0 or 2) uses BGD(E5b/E1); F/NAV uses BGD(E5a/E1).
    const groupDelay = system === 'E' ? ((dataSources & 5) !== 0 ? tgd2 : tgd1) : tgd1
    ephemerides.push({
      system,
      sat: line.slice(0, 3).replace(' ', '0'),
      prn: Number(line.slice(1, 3)),
      toc: tocCal + shift,
      af0: clock[0] as number,
      af1: clock[1] as number,
      af2: clock[2] as number,
      iode, crs, deltaN, m0, cuc, e, cus, sqrtA,
      toe: gpsWeek * 604800 + toeSow + shift,
      toeSow,
      cic, omega0, cis, i0, crc, omega, omegaDot, idot,
      health,
      groupDelay,
    })
  }
  return { ephemerides, ...alpha && beta ? { klobuchar: { alpha, beta } } : {} }
}

/**
 * Parse a RINEX 3 observation file.
 * @param text - file content.
 * @param maxEpochs - largest epoch count to read.
 * @returns header facts and epochs.
 */
export function parseObservation(text: string, maxEpochs: number): ObservationData {
  const lines = text.split(/\r?\n/)
  checkVersion(lines, 'O')
  let marker = ''
  let approx: [number, number, number] | undefined
  const types: Record<string, string[]> = {}
  let pendingSystem = ''
  let pendingCount = 0
  let i = 0
  for (; i < lines.length; i++) {
    const line = lines[i] as string
    const l = label(line)
    if (l === 'END OF HEADER') break
    if (l === 'MARKER NAME') marker = line.slice(0, 60).trim()
    else if (l === 'APPROX POSITION XYZ') {
      const [x, y, z] = [0, 1, 2].map(k => num(line.slice(14 * k, 14 * k + 14)))
      approx = [x as number, y as number, z as number]
    } else if (l === 'SYS / # / OBS TYPES') {
      if (line[0] !== ' ') {
        pendingSystem = line[0] as string
        pendingCount = Number(line.slice(3, 6))
        types[pendingSystem] = []
      }
      const list = types[pendingSystem] as string[]
      for (const code of line.slice(7, 60).trim().split(/\s+/)) if (code !== '' && list.length < pendingCount) list.push(code)
    }
  }
  const epochs: ObservationEpoch[] = []
  for (i += 1; i < lines.length && epochs.length < maxEpochs; i++) {
    const line = lines[i] as string
    if (!line.startsWith('>')) continue
    const flag = Number(line.slice(31, 32))
    const count = Number(line.slice(32, 35))
    if (flag > 1) {
      i += count
      continue
    }
    const [y, mo, d, h, mi, s] = epochFields(line.slice(1, 29))
    const time = calendarToGps(y as number, mo as number, d as number, h as number, mi as number, s as number)
    const satellites = new Map<string, SatelliteObservation>()
    for (let k = 0; k < count; k++) {
      const row = lines[i + 1 + k] ?? ''
      const sat = row.slice(0, 3).replace(' ', '0')
      const codes = types[sat[0] as string] ?? []
      const values: Record<string, number> = {}
      const lli: Record<string, number> = {}
      codes.forEach((code, c) => {
        const field = row.slice(3 + 16 * c, 17 + 16 * c)
        if (field.trim() === '') return
        values[code] = Number(field)
        lli[code] = num(row.slice(17 + 16 * c, 18 + 16 * c))
      })
      satellites.set(sat, { values, lli })
    }
    i += count
    epochs.push({ time, satellites })
  }
  return { marker, ...approx ? { approxPosition: approx } : {}, types, epochs }
}
