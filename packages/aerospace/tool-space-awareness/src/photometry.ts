/**
 * Optical observability of a satellite from a ground site: apparent visual magnitude of a
 * diffuse (Lambertian) sphere, Kasten–Young air mass extinction, Earth-shadow dimming, site
 * darkness, Moon separation, and constrained window search on an SGP4 trajectory.
 * @module @astro-one/tool-space-awareness/photometry
 */

import {
  apply3, DEG, dot, enuMatrix, gcrfToItrf, geodeticToItrf, lookAngles, moonPosition, norm, propagateSgp4, siteGcrf, sub, sunlitFraction,
  sunPosition, temeToGcrf,
} from '@astro-one/astrodynamics'
import type { Geodetic, Sgp4Elements, TimedState, UtcMs, Vec3 } from '@astro-one/astrodynamics'

/** Apparent visual magnitude of the Sun. */
export const SUN_MAGNITUDE = -26.74

/**
 * Diffuse-sphere phase law relative to its value at 90°: ((π − φ) cos φ + sin φ).
 * @param phase - Sun–object–observer angle, rad.
 * @returns brightness relative to the 90° phase.
 */
export function diffusePhase(phase: number): number {
  return (Math.PI - phase) * Math.cos(phase) + Math.sin(phase)
}

/**
 * Standard magnitude (1000 km range, 90° phase) of a diffuse sphere.
 * @param areaM2 - cross-sectional area, m².
 * @param albedo - Bond albedo.
 * @returns the standard magnitude.
 */
export function standardMagnitude(areaM2: number, albedo: number): number {
  return SUN_MAGNITUDE - 2.5 * Math.log10((2 * albedo * areaM2) / (3 * Math.PI * Math.PI) / 1e12)
}

/**
 * Kasten and Young (1989) relative air mass.
 * @param elevation - apparent elevation, rad.
 * @returns air mass (1 at the zenith, about 38 at the horizon).
 */
export function airMass(elevation: number): number {
  const deg = elevation / DEG
  return 1 / (Math.sin(elevation) + 0.50572 * (deg + 6.07995) ** -1.6364)
}

/** Brightness model. */
export interface BrightnessModel {
  /** Standard magnitude at 1000 km and 90° phase. */
  readonly standardMagnitude: number
  /** Zenith extinction, magnitudes per air mass. */
  readonly extinction: number
}

/** Observing constraints. */
export interface ObservingConstraints {
  /** Lowest object elevation, rad. */
  readonly minElevation: number
  /** Highest Sun elevation at the site, rad. */
  readonly maxSunElevation: number
  /** Smallest object–Moon separation, rad. */
  readonly minMoonSeparation: number
  /** Faintest magnitude the sensor detects, when limited. */
  readonly limitingMagnitude?: number
}

/** Geometry and brightness at one instant. */
export interface OpticalSample {
  /** Instant. */
  readonly t: UtcMs
  /** Azimuth, rad. */
  readonly az: number
  /** Elevation, rad. */
  readonly el: number
  /** Slant range, km. */
  readonly range: number
  /** Topocentric J2000 right ascension, rad in [0, 2π). */
  readonly ra: number
  /** Topocentric J2000 declination, rad. */
  readonly dec: number
  /** Sun–object–observer angle, rad. */
  readonly phase: number
  /** Fraction of the solar disk visible from the object. */
  readonly sunlit: number
  /** Sun elevation at the site, rad. */
  readonly sunElevation: number
  /** Object–Moon angular separation, rad. */
  readonly moonSeparation: number
  /** Apparent magnitude with extinction; Infinity in umbra. */
  readonly magnitude: number
}

/**
 * Evaluate geometry and brightness.
 * @param elements - object element set.
 * @param site - observing site.
 * @param model - brightness model.
 * @param t - instant.
 * @returns the sample.
 */
export function opticalSample(elements: Sgp4Elements, site: Geodetic, model: BrightnessModel, t: UtcMs): OpticalSample {
  const teme = propagateSgp4(elements, [t])[0] as TimedState
  const object = temeToGcrf(teme, t)
  const observer = siteGcrf(site, t).r
  const sun = sunPosition(t)
  const rho = sub(object.r, observer)
  const range = norm(rho)
  const look = lookAngles(site, gcrfToItrf(object, t))
  const toSun = sub(sun, object.r)
  const phase = angle(toSun, scaleBy(rho, -1))
  const sunlit = sunlitFraction(object.r, sun)
  const sunEnu = apply3(enuMatrix(site.lat, site.lon), sub(gcrfToItrf({ r: sun, v: [0, 0, 0] }, t).r, geodeticToItrf(site)))
  const magnitude = sunlit === 0
    ? Infinity
    : model.standardMagnitude - 2.5 * Math.log10(diffusePhase(phase) * sunlit) + 5 * Math.log10(range / 1000)
      + (look.el > 0 ? model.extinction * airMass(look.el) : Infinity)
  const ra = Math.atan2(rho[1], rho[0])
  return {
    t,
    az: look.az,
    el: look.el,
    range,
    ra: ra < 0 ? ra + 2 * Math.PI : ra,
    dec: Math.asin(rho[2] / range),
    phase,
    sunlit,
    sunElevation: Math.asin(sunEnu[2] / norm(sunEnu)),
    moonSeparation: angle(rho, sub(moonPosition(t), observer)),
    magnitude,
  }
}

function scaleBy(v: Vec3, k: number): Vec3 {
  return [v[0] * k, v[1] * k, v[2] * k]
}

function angle(a: Vec3, b: Vec3): number {
  return Math.acos(Math.min(1, Math.max(-1, dot(a, b) / (norm(a) * norm(b)))))
}

/**
 * Whether a sample satisfies every constraint.
 * @param s - sample.
 * @param c - constraints.
 * @returns true when the object is observable.
 */
export function observable(s: OpticalSample, c: ObservingConstraints): boolean {
  return s.el >= c.minElevation && s.sunElevation <= c.maxSunElevation && s.sunlit > 0 && s.moonSeparation >= c.minMoonSeparation
    && (c.limitingMagnitude === undefined || s.magnitude <= c.limitingMagnitude)
}

/** One observable window. */
export interface OpticalWindow {
  /** Window start (refined to 1 s), or the search start. */
  readonly start: UtcMs
  /** Window end (refined to 1 s), or the search end. */
  readonly end: UtcMs
  /** Whether the window was open at the search start. */
  readonly openAtStart: boolean
  /** Whether the window was open at the search end. */
  readonly openAtEnd: boolean
  /** Brightest grid sample inside the window, including both ends. */
  readonly brightest: OpticalSample
  /** Faintest magnitude among those samples. */
  readonly faintestMagnitude: number
  /** Angular rate of the line of sight at the brightest sample, rad/s. */
  readonly angularRate: number
}

/**
 * Search observable windows on a sampling grid with bisection-refined edges.
 * @param elements - object element set.
 * @param site - observing site.
 * @param model - brightness model.
 * @param constraints - observing constraints.
 * @param times - sampling grid, ascending, first and last being the search bounds.
 * @returns windows in time order.
 */
export function opticalWindows(
  elements: Sgp4Elements, site: Geodetic, model: BrightnessModel, constraints: ObservingConstraints, times: readonly UtcMs[],
): OpticalWindow[] {
  const sample = (t: UtcMs): OpticalSample => opticalSample(elements, site, model, t)
  const ok = (t: UtcMs): boolean => observable(sample(t), constraints)
  const edge = (outside: UtcMs, inside: UtcMs): UtcMs => {
    let a = outside
    let b = inside
    while (Math.abs(b - a) > 1000) {
      const mid = (a + b) / 2
      if (ok(mid)) b = mid
      else a = mid
    }
    return b
  }
  const windows: OpticalWindow[] = []
  let open: { start: UtcMs; samples: OpticalSample[] } | undefined
  const close = (end: UtcMs, atEnd: boolean): void => {
    const current = open as { start: UtcMs; samples: OpticalSample[] }
    const samples = [...current.samples, sample(end)]
    const brightest = samples.reduce((best, s) => (s.magnitude < best.magnitude ? s : best))
    const next = sample(brightest.t + 1000)
    windows.push({
      start: current.start,
      end,
      openAtStart: current.start === times[0],
      openAtEnd: atEnd,
      brightest,
      faintestMagnitude: Math.max(...samples.map(s => s.magnitude)),
      angularRate: angle(raDecVector(brightest), raDecVector(next)),
    })
    open = undefined
  }
  times.forEach((t, k) => {
    const s = sample(t)
    const inside = observable(s, constraints)
    if (inside && open === undefined) open = { start: k === 0 ? t : edge(times[k - 1] as UtcMs, t), samples: [] }
    if (inside) (open as { samples: OpticalSample[] }).samples.push(s)
    if (!inside && open !== undefined) close(edge(t, times[k - 1] as UtcMs), false)
  })
  if (open !== undefined) close(times[times.length - 1] as UtcMs, true)
  return windows
}

function raDecVector(s: OpticalSample): Vec3 {
  return [Math.cos(s.dec) * Math.cos(s.ra), Math.cos(s.dec) * Math.sin(s.ra), Math.sin(s.dec)]
}
