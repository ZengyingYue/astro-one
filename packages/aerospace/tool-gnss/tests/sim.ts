// Synthetic RINEX 3 generator: broadcast ephemerides for GPS, Galileo, and BeiDou (MEO and
// GEO), and code/phase observations consistent with this package's measurement model.
import type { Vec3 } from '@astro-one/astrodynamics'
import { C, ionoScale, klobuchar, saastamoinen, WAVELENGTH } from '../src/broadcast.ts'
import type { BroadcastEphemeris, GnssSystem } from '../src/rinex.ts'
import { BDT_OFFSET_S, BDT_WEEK_OFFSET, GPS_EPOCH_MS } from '../src/rinex.ts'
import { geometry } from '../src/spp.ts'
import { itrfToGeodetic } from '@astro-one/astrodynamics'

export const ALPHA = [1.1176e-8, 7.4506e-9, -5.9605e-8, -5.9605e-8]
export const BETA = [90112, 0, -196610, -65536]

/** Week 2300 (2024-02-04), 06:00 GPST. */
export const T0 = 2300 * 604800 + 6 * 3600

export function lla(latDeg: number, lonDeg: number, h: number): Vec3 {
  const a = 6378137
  const e2 = 0.00669437999014
  const lat = latDeg * Math.PI / 180
  const lon = lonDeg * Math.PI / 180
  const n = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2)
  return [(n + h) * Math.cos(lat) * Math.cos(lon), (n + h) * Math.cos(lat) * Math.sin(lon), (n * (1 - e2) + h) * Math.sin(lat)]
}

function eph(
  system: GnssSystem, prn: number, sqrtA: number, incDeg: number, omega0: number, m0: number, extra: Partial<BroadcastEphemeris> = {},
): BroadcastEphemeris {
  const shift = system === 'C' ? BDT_OFFSET_S : 0
  const toeSow = (T0 % 604800) - shift
  return {
    system, sat: `${system}${String(prn).padStart(2, '0')}`, prn,
    toc: T0, af0: 1e-5 * (prn % 5 - 2), af1: 1e-12, af2: 0,
    iode: prn, crs: 20, deltaN: 4e-9, m0, cuc: 1e-6, e: 0.005, cus: 5e-6, sqrtA,
    toe: T0, toeSow, cic: 5e-8, omega0, cis: -5e-8, i0: incDeg * Math.PI / 180, crc: 250, omega: 0.5, omegaDot: -8e-9,
    idot: 1e-10, health: 0, groupDelay: -5e-9,
    ...extra,
  }
}

export function constellation(): BroadcastEphemeris[] {
  const out: BroadcastEphemeris[] = []
  for (let k = 0; k < 12; k++) out.push(eph('G', k + 1, 5153.7, 55, (k % 6) * Math.PI / 3, k * 0.9))
  for (let k = 0; k < 8; k++) out.push(eph('E', k + 1, 5440.6, 56, (k % 3) * 2 * Math.PI / 3, k * 1.3 + 0.2))
  for (let k = 0; k < 6; k++) out.push(eph('C', k + 20, 5282.6, 55, (k % 3) * 2 * Math.PI / 3, k * 1.1 + 0.4))
  // Broadcast GEO inclinations are near 5° because the user algorithm tilts the frame by −5°.
  out.push(eph('C', 3, 6493.4, 5, 2.0, 1.0))
  return out
}

function d19(v: number): string {
  const [m, e] = v.toExponential(12).split('e') as [string, string]
  const exp = Number(e)
  return `${m}D${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`.padStart(19)
}

function header(text: string, label: string): string {
  return text.padEnd(60) + label
}

function calendar(gps: number): string[] {
  const d = new Date(GPS_EPOCH_MS + Math.floor(gps) * 1000)
  const fields = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()]
  return [...fields, d.getUTCSeconds() + (gps - Math.floor(gps))]
    .map((v, i) => (i === 0 ? String(v) : String(Math.floor(v)).padStart(2, '0')))
}

export function navigationText(ephs: readonly BroadcastEphemeris[], withIono = true): string {
  const lines = [header('     3.04           N: GNSS NAV DATA    M: MIXED', 'RINEX VERSION / TYPE')]
  if (withIono) {
    lines.push(header(`GPSA ${ALPHA.map(a => a.toExponential(4).replace('e', 'E').padStart(12)).join('')}`, 'IONOSPHERIC CORR'))
    lines.push(header(`GPSB ${BETA.map(a => a.toExponential(4).replace('e', 'E').padStart(12)).join('')}`, 'IONOSPHERIC CORR'))
    lines.push(header('GAL     1.0000E+02  0.0000E+00  0.0000E+00  0.0000E+00', 'IONOSPHERIC CORR'))
  }
  lines.push(header('', 'END OF HEADER'))
  // A GLONASS record (three orbit lines) that readers must skip.
  lines.push(`R01 ${calendar(T0).join(' ')}${d19(1e-5)}${d19(0)}${d19(0)}`, ...[0, 1, 2].map(() => `    ${d19(1)}${d19(2)}${d19(3)}${d19(4)}`))
  for (const e of ephs) {
    const shift = e.system === 'C' ? BDT_OFFSET_S : 0
    const week = Math.floor((e.toe - shift) / 604800) - (e.system === 'C' ? BDT_WEEK_OFFSET : 0)
    const orbit = [
      [e.iode, e.crs, e.deltaN, e.m0], [e.cuc, e.e, e.cus, e.sqrtA], [e.toeSow, e.cic, e.omega0, e.cis],
      [e.i0, e.crc, e.omega, e.omegaDot], [e.idot, e.system === 'E' ? (e.prn === 8 ? 258 : 517) : 1, week, 0],
      [2, e.health, e.groupDelay, e.groupDelay], [e.toeSow - 30, 4, 0, 0],
    ]
    lines.push(`${e.sat} ${calendar(e.toc - shift).join(' ')}${d19(e.af0)}${d19(e.af1)}${d19(e.af2)}`)
    for (const row of orbit) lines.push(`    ${row.map(d19).join('')}`)
  }
  return `${lines.join('\n')}\n`
}

export interface SimOptions {
  readonly position: Vec3
  readonly times: readonly number[]
  readonly clockBias?: Partial<Record<GnssSystem, number>>
  readonly ambiguity?: (sat: string) => number
  readonly codeError?: (sat: string, t: number) => number
  readonly slips?: ReadonlySet<string>
  readonly marker?: string
  readonly withApprox?: boolean
}

export function observationText(ephs: readonly BroadcastEphemeris[], sim: SimOptions): string {
  const g = itrfToGeodetic([sim.position[0] / 1000, sim.position[1] / 1000, sim.position[2] / 1000])
  const lines = [
    header('     3.04           OBSERVATION DATA    M: MIXED', 'RINEX VERSION / TYPE'),
    header(sim.marker ?? 'SIM', 'MARKER NAME'),
  ]
  if (sim.withApprox ?? true) lines.push(header(sim.position.map(v => (v + 100).toFixed(4).padStart(14)).join(''), 'APPROX POSITION XYZ'))
  lines.push(header('G    3 C1C L1C S1C', 'SYS / # / OBS TYPES'))
  lines.push(header('E    3 C1C L1C S1C', 'SYS / # / OBS TYPES'))
  lines.push(header('C    3 C2I L2I S2I', 'SYS / # / OBS TYPES'))
  lines.push(header('', 'END OF HEADER'))
  for (const t of sim.times) {
    const rows: string[] = []
    for (const e of ephs) {
      const geo = geometry(e, t, 0.075 * C, sim.position)
      if (geo.elevation < 5 * Math.PI / 180) continue
      const iono = klobuchar({ alpha: ALPHA, beta: BETA }, g.lat, g.lon, geo.azimuth, geo.elevation, t) * ionoScale(e.system)
      const tropo = saastamoinen(g.h * 1000, g.lat, geo.elevation)
      const clock = sim.clockBias?.[e.system] ?? 0
      const trueRange = geometry(e, t, geo.range + clock - C * geo.clock, sim.position)
      const rho = trueRange.range
      const code = rho + clock - C * trueRange.clock + iono + tropo + (sim.codeError?.(e.sat, t) ?? 0)
      const lam = WAVELENGTH[e.system]
      const phase = (rho + clock - C * trueRange.clock - iono + tropo) / lam + (sim.ambiguity?.(e.sat) ?? 0)
      const lli = sim.slips?.has(`${e.sat}@${String(t)}`) ? '1' : ' '
      rows.push(`${e.sat}${code.toFixed(3).padStart(14)}  ${phase.toFixed(3).padStart(14)}${lli} ${'45.000'.padStart(14)}  `)
    }
    const cal = calendar(t)
    const sec = (t - Math.floor(t) + Number(cal[5])).toFixed(7).padStart(11)
    lines.push(`> ${cal.slice(0, 5).join(' ')}${sec}  0${String(rows.length).padStart(3)}`)
    lines.push(...rows)
  }
  return `${lines.join('\n')}\n`
}

/** Remove one satellite's row from the epoch starting at `time` (GPS seconds). */
export function dropSatellite(text: string, sat: string, epochIndex: number): string {
  const lines = text.split('\n')
  let seen = -1
  for (let i = 0; i < lines.length; i++) {
    if (!(lines[i] as string).startsWith('>')) continue
    seen++
    if (seen !== epochIndex) continue
    const count = Number((lines[i] as string).slice(32, 35))
    const rows = lines.slice(i + 1, i + 1 + count)
    const kept = rows.filter(r => !r.startsWith(sat))
    lines.splice(i + 1, count, ...kept)
    lines[i] = `${(lines[i] as string).slice(0, 32)}${String(kept.length).padStart(3)}`
    break
  }
  return lines.join('\n')
}

/** Blank the first observation field (code) of a satellite in every epoch. */
export function blankCode(text: string, sat: string): string {
  return text.split('\n').map(l => (l.startsWith(sat) ? `${sat}${' '.repeat(16)}${l.slice(19)}` : l)).join('\n')
}

/** Blank the second observation field (phase) of a satellite in every epoch. */
export function blankPhase(text: string, sat: string): string {
  return text.split('\n').map(l => (l.startsWith(sat) ? `${l.slice(0, 19)}${' '.repeat(16)}${l.slice(35)}` : l)).join('\n')
}
