/**
 * Broadcast-ephemeris satellite positions and clocks (IS-GPS-200 §20.3.3.4.3, Galileo OS SIS
 * ICD §5.1.1, BeiDou ICD §5.2.4 including the GEO frame rotation), ephemeris selection, and
 * the atmospheric delay models used for single-frequency positioning.
 * @module @astro-one/tool-gnss/broadcast
 */

import type { BroadcastEphemeris, GnssSystem } from './rinex.ts'

/** Speed of light, m/s. */
export const C = 299792458

const GM: Record<GnssSystem, number> = { G: 3.986005e14, E: 3.986004418e14, C: 3.986004418e14 }
const OMEGA_E: Record<GnssSystem, number> = { G: 7.2921151467e-5, E: 7.2921151467e-5, C: 7.292115e-5 }

/** Carrier wavelengths of the processed signals: GPS L1, Galileo E1, BeiDou B1I, m. */
export const WAVELENGTH: Record<GnssSystem, number> = { G: C / 1575.42e6, E: C / 1575.42e6, C: C / 1561.098e6 }

/** Largest |t − toe| for which an ephemeris is used, s. */
export const EPHEMERIS_VALIDITY_S = 4 * 3600

/**
 * Whether a BeiDou PRN is a geostationary satellite.
 * @param eph - ephemeris.
 * @returns true for BeiDou GEO PRNs 1–5 and 59–63.
 */
export function isBeidouGeo(eph: BroadcastEphemeris): boolean {
  return eph.system === 'C' && (eph.prn <= 5 || eph.prn >= 59)
}

/** Satellite state from a broadcast ephemeris. */
export interface SatelliteState {
  /** ECEF position at transmission, m (Earth-fixed axes at the transmission instant). */
  readonly position: [number, number, number]
  /** Satellite clock offset including the relativistic term and group delay, s. */
  readonly clock: number
}

/**
 * Evaluate a broadcast ephemeris.
 * @param eph - ephemeris.
 * @param t - GPS seconds (system time corrected to GPST).
 * @returns ECEF position and clock offset.
 */
export function satelliteState(eph: BroadcastEphemeris, t: number): SatelliteState {
  const mu = GM[eph.system]
  const we = OMEGA_E[eph.system]
  const a = eph.sqrtA * eph.sqrtA
  const tk = t - eph.toe
  const n = Math.sqrt(mu / (a * a * a)) + eph.deltaN
  const m = eph.m0 + n * tk
  let e = m
  for (let k = 0; k < 30; k++) {
    const d = (e - eph.e * Math.sin(e) - m) / (1 - eph.e * Math.cos(e))
    e -= d
    if (Math.abs(d) < 1e-14) break
  }
  const nu = Math.atan2(Math.sqrt(1 - eph.e * eph.e) * Math.sin(e), Math.cos(e) - eph.e)
  const phi = nu + eph.omega
  const s2 = Math.sin(2 * phi)
  const c2 = Math.cos(2 * phi)
  const u = phi + eph.cus * s2 + eph.cuc * c2
  const r = a * (1 - eph.e * Math.cos(e)) + eph.crs * s2 + eph.crc * c2
  const inc = eph.i0 + eph.cis * s2 + eph.cic * c2 + eph.idot * tk
  const xp = r * Math.cos(u)
  const yp = r * Math.sin(u)
  const geo = isBeidouGeo(eph)
  const node = eph.omega0 + (eph.omegaDot - (geo ? 0 : we)) * tk - we * eph.toeSow
  const x = xp * Math.cos(node) - yp * Math.cos(inc) * Math.sin(node)
  const y = xp * Math.sin(node) + yp * Math.cos(inc) * Math.cos(node)
  const z = yp * Math.sin(inc)
  let position: [number, number, number] = [x, y, z]
  if (geo) {
    // BeiDou GEO: rotate the inertial-like frame by −5° about x, then by Ωe·tk about z.
    const f = -5 * Math.PI / 180
    const y1 = Math.cos(f) * y + Math.sin(f) * z
    const z1 = -Math.sin(f) * y + Math.cos(f) * z
    const w = we * tk
    position = [Math.cos(w) * x + Math.sin(w) * y1, -Math.sin(w) * x + Math.cos(w) * y1, z1]
  }
  const dt = t - eph.toc
  const relativity = (-2 * Math.sqrt(mu) / (C * C)) * eph.e * eph.sqrtA * Math.sin(e)
  return { position, clock: eph.af0 + eph.af1 * dt + eph.af2 * dt * dt + relativity - eph.groupDelay }
}

/**
 * Select the healthy ephemeris with the nearest reference time.
 * @param ephemerides - candidates for one satellite.
 * @param t - GPS seconds.
 * @returns the ephemeris, or undefined when none is valid at `t`.
 */
export function selectEphemeris(ephemerides: readonly BroadcastEphemeris[], t: number): BroadcastEphemeris | undefined {
  let best: BroadcastEphemeris | undefined
  for (const eph of ephemerides) {
    if (eph.health !== 0 || Math.abs(t - eph.toe) > EPHEMERIS_VALIDITY_S) continue
    if (best === undefined || Math.abs(t - eph.toe) < Math.abs(t - best.toe)) best = eph
  }
  return best
}

/**
 * Klobuchar ionospheric delay on GPS L1 (IS-GPS-200 §20.3.3.5.2.5).
 * @param coeff - α and β coefficients.
 * @param coeff.alpha - amplitude coefficients.
 * @param coeff.beta - period coefficients.
 * @param lat - receiver geodetic latitude, rad.
 * @param lon - receiver longitude, rad.
 * @param az - satellite azimuth, rad.
 * @param el - satellite elevation, rad.
 * @param t - GPS seconds.
 * @returns slant delay, m.
 */
export function klobuchar(
  coeff: { readonly alpha: readonly number[]; readonly beta: readonly number[] },
  lat: number, lon: number, az: number, el: number, t: number,
): number {
  const semi = (x: number): number => x / Math.PI
  const e = semi(el)
  const psi = 0.0137 / (e + 0.11) - 0.022
  let phiI = semi(lat) + psi * Math.cos(az)
  phiI = Math.max(-0.416, Math.min(0.416, phiI))
  const lamI = semi(lon) + (psi * Math.sin(az)) / Math.cos(phiI * Math.PI)
  const phiM = phiI + 0.064 * Math.cos((lamI - 1.617) * Math.PI)
  let local = 43200 * lamI + (t % 86400)
  local -= Math.floor(local / 86400) * 86400
  const f = 1 + 16 * (0.53 - e) ** 3
  const poly = (c: readonly number[]): number =>
    (c[0] as number) + phiM * ((c[1] as number) + phiM * ((c[2] as number) + phiM * (c[3] as number)))
  const amp = Math.max(0, poly(coeff.alpha))
  const per = Math.max(72000, poly(coeff.beta))
  const x = (2 * Math.PI * (local - 50400)) / per
  const delay = Math.abs(x) < 1.57 ? f * (5e-9 + amp * (1 - (x * x) / 2 + (x ** 4) / 24)) : f * 5e-9
  return delay * C
}

/**
 * Saastamoinen tropospheric delay with a standard atmosphere (70 % humidity) and 1/cos(z)
 * mapping, as in RTKLIB.
 * @param heightM - receiver ellipsoidal height, m.
 * @param lat - receiver latitude, rad.
 * @param el - satellite elevation, rad.
 * @returns slant delay, m (0 outside −100 m…10 km or at non-positive elevation).
 */
export function saastamoinen(heightM: number, lat: number, el: number): number {
  if (heightM < -100 || heightM > 1e4 || el <= 0) return 0
  const h = Math.max(heightM, 0)
  const pressure = 1013.25 * (1 - 2.2557e-5 * h) ** 5.2568
  const temp = 15 - 6.5e-3 * h + 273.16
  const e = 6.108 * 0.7 * Math.exp((17.15 * temp - 4684) / (temp - 38.45))
  const z = Math.PI / 2 - el
  const dry = (0.0022768 * pressure) / (1 - 0.00266 * Math.cos(2 * lat) - 0.00028 * (h / 1e3)) / Math.cos(z)
  const wet = (0.002277 * (1255 / temp + 0.05) * e) / Math.cos(z)
  return dry + wet
}

/**
 * Frequency scaling of the L1 Klobuchar delay to another carrier.
 * @param system - constellation of the processed signal.
 * @returns (f_L1 / f)².
 */
export function ionoScale(system: GnssSystem): number {
  return system === 'C' ? (1575.42 / 1561.098) ** 2 : 1
}
