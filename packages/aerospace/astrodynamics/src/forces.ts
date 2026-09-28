/**
 * Orbit force model in GCRF: central gravity with zonal harmonics J2–J6 evaluated about the
 * true-of-date pole, exponential-atmosphere drag with a co-rotating atmosphere, cannonball
 * solar radiation pressure with conical shadow, and Sun/Moon third-body perturbations.
 * @module @astro-one/astrodynamics/forces
 */

import { AU_KM, MU_EARTH, MU_MOON, MU_SUN, OMEGA_EARTH, R_EARTH, SOLAR_PRESSURE, ZONAL_J } from './constants.ts'
import { add, apply3, cross, norm, scale, sub, transpose3 } from './linalg.ts'
import { itrfToGeodetic } from './frames.ts'
import { moonPosition, sunlitFraction, sunPosition } from './ephemeris.ts'
import type { Mat3, UtcMs, Vec3 } from './types.ts'

/** Ballistic properties for drag. */
export interface DragModel {
  /** Drag coefficient. */
  readonly cd: number
  /** Cross-sectional area, m². */
  readonly areaM2: number
  /** Mass, kg. */
  readonly massKg: number
}

/** Properties for cannonball solar radiation pressure. */
export interface SrpModel {
  /** Radiation-pressure coefficient (1 absorbing … 2 specular). */
  readonly cr: number
  /** Sun-facing area, m². */
  readonly areaM2: number
  /** Mass, kg. */
  readonly massKg: number
}

/** Complete perturbation selection for one propagation. */
export interface ForceModel {
  /** Highest zonal degree (0 or 1 = two-body, 2…6 = J2…Jn). */
  readonly zonalDegree: 0 | 1 | 2 | 3 | 4 | 5 | 6
  /** Atmospheric drag, when modelled. */
  readonly drag?: DragModel
  /** Solar radiation pressure, when modelled. */
  readonly srp?: SrpModel
  /** Solar gravity. */
  readonly sun: boolean
  /** Lunar gravity. */
  readonly moon: boolean
}

/**
 * Exponential atmosphere reference altitudes (km), densities (kg/m³), and scale heights (km)
 * from Vallado, Fundamentals of Astrodynamics, Table 8-4.
 */
const ATMOSPHERE: readonly (readonly [number, number, number])[] = [
  [0, 1.225, 7.249], [25, 3.899e-2, 6.349], [30, 1.774e-2, 6.682], [40, 3.972e-3, 7.554],
  [50, 1.057e-3, 8.382], [60, 3.206e-4, 7.714], [70, 8.77e-5, 6.549], [80, 1.905e-5, 5.799],
  [90, 3.396e-6, 5.382], [100, 5.297e-7, 5.877], [110, 9.661e-8, 7.263], [120, 2.438e-8, 9.473],
  [130, 8.484e-9, 12.636], [140, 3.845e-9, 16.149], [150, 2.07e-9, 22.523], [180, 5.464e-10, 29.74],
  [200, 2.789e-10, 37.105], [250, 7.248e-11, 45.546], [300, 2.418e-11, 53.628], [350, 9.518e-12, 53.298],
  [400, 3.725e-12, 58.515], [450, 1.585e-12, 60.828], [500, 6.967e-13, 63.822], [600, 1.454e-13, 71.835],
  [700, 3.614e-14, 88.667], [800, 1.17e-14, 124.64], [900, 5.245e-15, 181.05], [1000, 3.019e-15, 268],
]

/**
 * Exponential-model atmospheric density.
 * @param heightKm - geodetic height, km.
 * @returns density, kg/m³ (0 below the surface table is clamped to sea level).
 */
export function atmosphericDensity(heightKm: number): number {
  let row = ATMOSPHERE[0] as readonly [number, number, number]
  for (const candidate of ATMOSPHERE) {
    if (heightKm >= candidate[0]) row = candidate
    else break
  }
  const h = Math.max(heightKm, 0)
  return row[1] * Math.exp(-(h - row[0]) / row[2])
}

/**
 * Zonal-harmonic gravity acceleration (degrees 2…n) in a pole-aligned frame.
 * @param r - position in a frame whose z axis is Earth's rotation pole, km.
 * @param degree - highest zonal degree.
 * @returns perturbing acceleration, km/s².
 */
export function zonalAcceleration(r: Vec3, degree: number): Vec3 {
  const rn = norm(r)
  const s = r[2] / rn
  // Legendre P_n(s) and P'_n(s) by recurrence.
  const p = [1, s]
  const dp = [0, 1]
  for (let n = 2; n <= degree; n++) {
    p[n] = ((2 * n - 1) * s * (p[n - 1] as number) - (n - 1) * (p[n - 2] as number)) / n
    dp[n] = (dp[n - 2] as number) + (2 * n - 1) * (p[n - 1] as number)
  }
  let ax = 0
  let az = 0
  for (let n = 2; n <= degree; n++) {
    const jn = ZONAL_J[n as 2 | 3 | 4 | 5 | 6]
    const k = MU_EARTH * jn * R_EARTH ** n / rn ** (n + 2)
    const pn = p[n] as number
    const dpn = dp[n] as number
    ax += (k / rn) * ((n + 1) * pn + s * dpn)
    az += k * ((n + 1) * s * pn - dpn * (1 - s * s))
  }
  return [ax * r[0], ax * r[1], az]
}

/** Callable total acceleration for an integrator. */
export type Acceleration = (t: UtcMs, r: Vec3, v: Vec3) => Vec3

/**
 * Build the total GCRF acceleration for a force model.
 * @param model - selected perturbations.
 * @param toPole - GCRF → true-of-date rotation evaluated near the propagation span.
 * @returns acceleration function.
 */
export function buildAcceleration(model: ForceModel, toPole: Mat3): Acceleration {
  const fromPole = transpose3(toPole)
  const omega = apply3(fromPole, [0, 0, OMEGA_EARTH])
  return (t, r, v) => {
    const rn = norm(r)
    let acc = scale(r, -MU_EARTH / (rn * rn * rn))
    if (model.zonalDegree >= 2) acc = add(acc, apply3(fromPole, zonalAcceleration(apply3(toPole, r), model.zonalDegree)))
    if (model.drag) {
      const height = itrfToGeodetic(apply3(toPole, r)).h
      const rho = atmosphericDensity(height)
      const vRel = sub(v, cross(omega, r))
      const b = (model.drag.cd * model.drag.areaM2) / model.drag.massKg
      acc = add(acc, scale(vRel, -0.5 * rho * b * norm(vRel) * 1000))
    }
    if (model.srp || model.sun) {
      const rSun = sunPosition(t)
      if (model.sun) acc = add(acc, thirdBody(r, rSun, MU_SUN))
      if (model.srp) {
        const fromSun = sub(r, rSun)
        const d = norm(fromSun)
        const nu = sunlitFraction(r, rSun)
        const k = nu * SOLAR_PRESSURE * model.srp.cr * (model.srp.areaM2 / model.srp.massKg) * (AU_KM / d) ** 2 / 1000
        acc = add(acc, scale(fromSun, k / d))
      }
    }
    if (model.moon) acc = add(acc, thirdBody(r, moonPosition(t), MU_MOON))
    return acc
  }
}

/**
 * Third-body perturbation (difference between the direct and indirect terms).
 * @param r - satellite position, km.
 * @param rBody - body position, km.
 * @param mu - body gravitational parameter, km³/s².
 * @returns acceleration, km/s².
 */
export function thirdBody(r: Vec3, rBody: Vec3, mu: number): Vec3 {
  const d = sub(rBody, r)
  const dn = norm(d)
  const bn = norm(rBody)
  return sub(scale(d, mu / (dn * dn * dn)), scale(rBody, mu / (bn * bn * bn)))
}
