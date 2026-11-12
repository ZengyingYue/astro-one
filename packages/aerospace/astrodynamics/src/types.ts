/**
 * Value types shared by the astrodynamics algorithms. Distances are kilometres, velocities
 * kilometres per second, angles radians, and instants UTC milliseconds since the Unix epoch
 * unless a field name states another unit.
 * @module @astro-one/astrodynamics/types
 */

/** Cartesian three-vector. */
export type Vec3 = readonly [number, number, number]

/** Row-major 3×3 matrix. */
export type Mat3 = readonly [Vec3, Vec3, Vec3]

/** Dense row-major matrix used by the estimators. */
export type Matrix = number[][]

/** UTC instant in milliseconds since 1970-01-01T00:00:00Z. */
export type UtcMs = number

/** Position and velocity in one reference frame. */
export interface StateVector {
  /** Position, km. */
  readonly r: Vec3
  /** Velocity, km/s. */
  readonly v: Vec3
}

/** State vector bound to its UTC epoch. */
export interface TimedState extends StateVector {
  /** Epoch of `r` and `v`. */
  readonly t: UtcMs
}

/** Geodetic coordinates on the WGS-84 ellipsoid. */
export interface Geodetic {
  /** Geodetic latitude, rad. */
  readonly lat: number
  /** East longitude in (-π, π], rad. */
  readonly lon: number
  /** Height above the ellipsoid, km. */
  readonly h: number
}

/** Classical orbital elements with the singular-case angles that remain defined. */
export interface ClassicalElements {
  /** Semi-latus rectum, km. */
  readonly p: number
  /** Semi-major axis, km; `Infinity` for a parabola and negative for a hyperbola. */
  readonly a: number
  /** Eccentricity. */
  readonly e: number
  /** Inclination, rad. */
  readonly i: number
  /** Right ascension of the ascending node, rad; 0 for an equatorial orbit. */
  readonly raan: number
  /** Argument of periapsis, rad; 0 for a circular orbit. */
  readonly argp: number
  /** True anomaly, rad; measured from the node (circular) or the x axis (circular equatorial). */
  readonly nu: number
  /** Mean anomaly, rad (elliptic), hyperbolic mean anomaly (hyperbolic), or Barker's M (parabolic). */
  readonly m: number
  /** Argument of latitude ω + ν, rad. */
  readonly argLat: number
  /** True longitude Ω + ω + ν, rad. */
  readonly trueLon: number
  /** Orbital period, s; `undefined` for open orbits. */
  readonly period: number | undefined
}

/** Look angles from a ground site to a target. */
export interface LookAngles {
  /** Azimuth clockwise from north in [0, 2π), rad. */
  readonly az: number
  /** Elevation above the local horizontal plane, rad. */
  readonly el: number
  /** Slant range, km. */
  readonly range: number
  /** Range rate, km/s; positive when the target recedes. */
  readonly rangeRate: number
}
