/**
 * Physical constants of the astrodynamics algorithms. These are published model constants
 * (WGS-84, EGM2008 zonal coefficients, IAU values), not deployment tunables.
 * @module @astro-one/astrodynamics/constants
 */

/** Earth gravitational parameter (EGM2008/WGS-84), km³/s². */
export const MU_EARTH = 398600.4418

/** WGS-84 equatorial radius, km. */
export const R_EARTH = 6378.137

/** WGS-84 flattening. */
export const FLATTENING = 1 / 298.257223563

/** WGS-84 first eccentricity squared. */
export const ECC2_EARTH = FLATTENING * (2 - FLATTENING)

/** Nominal Earth rotation rate (IERS), rad/s. */
export const OMEGA_EARTH = 7.292115146706979e-5

/** Unnormalized EGM2008 zonal coefficients J2…J6, indexed by degree. */
export const ZONAL_J: Readonly<Record<2 | 3 | 4 | 5 | 6, number>> = {
  2: 1.0826266835531513e-3,
  3: -2.5326564853322355e-6,
  4: -1.6196215913670001e-6,
  5: -2.2729608063570820e-7,
  6: 5.4068123057760e-7,
}

/** Sun gravitational parameter, km³/s². */
export const MU_SUN = 1.32712440018e11

/** Moon gravitational parameter, km³/s². */
export const MU_MOON = 4902.800066

/** Astronomical unit, km. */
export const AU_KM = 149597870.7

/** Solar radius, km. */
export const R_SUN = 696000

/** Solar radiation pressure at 1 AU, N/m². */
export const SOLAR_PRESSURE = 4.56e-6

/** Speed of light, km/s. */
export const C_LIGHT = 299792.458

/** Milliseconds per day. */
export const MS_PER_DAY = 86_400_000

/** Julian date of the Unix epoch. */
export const JD_UNIX_EPOCH = 2440587.5

/** Julian date of J2000.0. */
export const JD_J2000 = 2451545.0

/** Arcseconds to radians. */
export const ARCSEC = Math.PI / (180 * 3600)

/** Degrees to radians. */
export const DEG = Math.PI / 180

/** Two π. */
export const TWO_PI = 2 * Math.PI
