/**
 * Low-precision analytic Sun and Moon positions in the J2000 equatorial frame (Montenbruck &
 * Gill, Satellite Orbits §3.3.2; about 0.01° for the Sun and a few arcminutes for the Moon)
 * and the conical Earth-shadow function (§3.4.2).
 * @module @astro-one/astrodynamics/ephemeris
 */

import { ARCSEC, DEG, R_EARTH, R_SUN } from './constants.ts'
import { dot, norm, sub } from './linalg.ts'
import { centuriesTT } from './time.ts'
import type { UtcMs, Vec3 } from './types.ts'

/** Obliquity of the ecliptic at J2000, rad. */
const EPS_J2000 = 23.43929111 * DEG

function eclipticToEquatorial(lon: number, lat: number, r: number): Vec3 {
  const x = r * Math.cos(lat) * Math.cos(lon)
  const y = r * Math.cos(lat) * Math.sin(lon)
  const z = r * Math.sin(lat)
  const c = Math.cos(EPS_J2000)
  const s = Math.sin(EPS_J2000)
  return [x, c * y - s * z, s * y + c * z]
}

/**
 * Geocentric Sun position.
 * @param t - UTC milliseconds.
 * @returns J2000 equatorial position, km.
 */
export function sunPosition(t: UtcMs): Vec3 {
  const T = centuriesTT(t)
  const m = (357.5256 + 35999.049 * T) * DEG
  const lon = 282.94 * DEG + m + (6892 * Math.sin(m) + 72 * Math.sin(2 * m)) * ARCSEC
  const r = (149.619 - 2.499 * Math.cos(m) - 0.021 * Math.cos(2 * m)) * 1e6
  return eclipticToEquatorial(lon, 0, r)
}

/**
 * Geocentric Moon position.
 * @param t - UTC milliseconds.
 * @returns J2000 equatorial position, km.
 */
export function moonPosition(t: UtcMs): Vec3 {
  const T = centuriesTT(t)
  const l0 = (218.31617 + 481267.88088 * T - 1.3972 * T) * DEG
  const l = (134.96292 + 477198.86753 * T) * DEG
  const lp = (357.52543 + 35999.04944 * T) * DEG
  const f = (93.27283 + 483202.01873 * T) * DEG
  const d = (297.85027 + 445267.11135 * T) * DEG
  const lon = l0 + ARCSEC * (
    22640 * Math.sin(l) + 769 * Math.sin(2 * l) - 4586 * Math.sin(l - 2 * d) + 2370 * Math.sin(2 * d)
    - 668 * Math.sin(lp) - 412 * Math.sin(2 * f) - 212 * Math.sin(2 * l - 2 * d) - 206 * Math.sin(l + lp - 2 * d)
    + 192 * Math.sin(l + 2 * d) - 165 * Math.sin(lp - 2 * d) + 148 * Math.sin(l - lp) - 125 * Math.sin(d)
    - 110 * Math.sin(l + lp) - 55 * Math.sin(2 * f - 2 * d))
  const lat = ARCSEC * (
    18520 * Math.sin(f + lon - l0 + ARCSEC * (412 * Math.sin(2 * f) + 541 * Math.sin(lp)))
    - 526 * Math.sin(f - 2 * d) + 44 * Math.sin(l + f - 2 * d) - 31 * Math.sin(-l + f - 2 * d)
    - 25 * Math.sin(-2 * l + f) - 23 * Math.sin(lp + f - 2 * d) + 21 * Math.sin(-l + f)
    + 11 * Math.sin(-lp + f - 2 * d))
  const r = 385000 - 20905 * Math.cos(l) - 3699 * Math.cos(2 * d - l) - 2956 * Math.cos(2 * d)
    - 570 * Math.cos(2 * l) + 246 * Math.cos(2 * l - 2 * d) - 205 * Math.cos(lp - 2 * d)
    - 171 * Math.cos(l + 2 * d) - 152 * Math.cos(l + lp - 2 * d)
  return eclipticToEquatorial(lon, lat, r)
}

/**
 * Fraction of the solar disk visible from a satellite (conical umbra/penumbra model).
 * @param r - geocentric satellite position, km.
 * @param rSun - geocentric Sun position, km.
 * @returns 1 in sunlight, 0 in umbra, and the visible fraction in penumbra.
 */
export function sunlitFraction(r: Vec3, rSun: Vec3): number {
  const toSun = sub(rSun, r)
  const dSun = norm(toSun)
  const dEarth = norm(r)
  const a = Math.asin(R_SUN / dSun)
  const b = Math.asin(Math.min(1, R_EARTH / dEarth))
  const c = Math.acos(Math.max(-1, Math.min(1, -dot(r, toSun) / (dEarth * dSun))))
  if (c >= a + b) return 1
  if (c <= b - a) return 0
  if (c <= a - b) return 1 - (b * b) / (a * a)
  const x = (c * c + a * a - b * b) / (2 * c)
  const y = Math.sqrt(Math.max(0, a * a - x * x))
  const area = a * a * Math.acos(x / a) + b * b * Math.acos((c - x) / b) - c * y
  return 1 - area / (Math.PI * a * a)
}
