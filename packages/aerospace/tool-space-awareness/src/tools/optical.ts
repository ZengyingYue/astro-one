/**
 * `ssa_optical_windows`: when a ground telescope can see an object, where to point, and how
 * bright it appears.
 * @module @astro-one/tool-space-awareness/tools/optical
 */

import { DEG, formatUtc } from '@astro-one/astrodynamics'
import { defineTool } from '@astro-one/tools'
import type { ToolDefinition } from '@astro-one/tools'
import { elementSetOf, positiveOf, roundTo, siteOf, windowOf, withinBudget } from '../inputs.ts'
import { opticalWindows, standardMagnitude } from '../photometry.ts'
import type { OpticalSample } from '../photometry.ts'
import { sampleCount, sampleTimes } from '../screening.ts'
import { ELEMENT_SET, SITE, TIME } from '../schema.ts'
import type { Bounds } from '../settings.ts'

const DESCRIPTION = 'Find optical observing windows of one object from a ground site between start and end: intervals '
  + 'where the object is above min_elevation_deg (default 15), sunlit, the site Sun elevation is at most '
  + 'max_sun_elevation_deg (default -12, nautical twilight), the Moon is at least min_moon_separation_deg away (default 10), '
  + 'and, when limiting_magnitude is given, the object is at least that bright. Brightness uses a diffuse-sphere model: '
  + 'give standard_magnitude (at 1000 km range and 90° phase, as published in visual-satellite catalogs) or '
  + 'cross_section_m2 with albedo (default 0.15); extinction_mag_per_airmass (default 0.2) dims low passes. Each window '
  + 'reports its edges (refined to 1 s) and, at its brightest sample on the step_s grid (default 30), the pointing (azimuth, '
  + 'elevation, topocentric J2000 right ascension/declination), range, phase angle, magnitude, and line-of-sight rate.'

function sampleView(s: OpticalSample): {
  time: string
  azimuth_deg: number
  elevation_deg: number
  ra_deg: number
  dec_deg: number
  range_km: number
  phase_angle_deg: number
  magnitude: number
  sun_elevation_deg: number
  moon_separation_deg: number
} {
  return {
    time: formatUtc(s.t),
    azimuth_deg: roundTo(s.az / DEG, 3),
    elevation_deg: roundTo(s.el / DEG, 3),
    ra_deg: roundTo(s.ra / DEG, 4),
    dec_deg: roundTo(s.dec / DEG, 4),
    range_km: roundTo(s.range, 3),
    phase_angle_deg: roundTo(s.phase / DEG, 3),
    magnitude: roundTo(s.magnitude, 2),
    sun_elevation_deg: roundTo(s.sunElevation / DEG, 3),
    moon_separation_deg: roundTo(s.moonSeparation / DEG, 3),
  }
}

/**
 * Build the `ssa_optical_windows` tool.
 * @param bounds - deployment bounds.
 * @returns the tool definition.
 */
export function opticalTool(bounds: Bounds): ToolDefinition {
  const num = { type: 'number', required: true } as const
  const point = {
    type: 'object',
    additionalProperties: false,
    properties: {
      time: { type: 'string', required: true },
      azimuth_deg: num,
      elevation_deg: num,
      ra_deg: num,
      dec_deg: num,
      range_km: num,
      phase_angle_deg: num,
      magnitude: num,
      sun_elevation_deg: num,
      moon_separation_deg: num,
    },
  } as const
  return defineTool({
    name: 'ssa_optical_windows',
    description: DESCRIPTION,
    parameters: {
      object: { ...ELEMENT_SET, required: true },
      station: { ...SITE, required: true },
      start: { ...TIME, required: true },
      end: { ...TIME, required: true },
      step_s: { type: 'number' },
      min_elevation_deg: { type: 'number' },
      max_sun_elevation_deg: { type: 'number' },
      min_moon_separation_deg: { type: 'number' },
      limiting_magnitude: { type: 'number' },
      standard_magnitude: { type: 'number' },
      cross_section_m2: { type: 'number' },
      albedo: { type: 'number' },
      extinction_mag_per_airmass: { type: 'number' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          object: { type: 'string', required: true },
          standard_magnitude: { type: 'number', required: true },
          windows: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                start: { type: 'string', required: true },
                end: { type: 'string', required: true },
                duration_s: { type: 'number', required: true },
                open_at_start: { type: 'boolean', required: true },
                open_at_end: { type: 'boolean', required: true },
                brightest: { ...point, required: true },
                faintest_magnitude: { type: 'number', required: true },
                angular_rate_deg_s: { type: 'number', required: true },
              },
            },
          },
          more_windows: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.windows.length === 0 ? 'No observable window in the search interval.' : JSON.stringify(value) }],
    },
    presentCall: args => ({ card: 'generic', title: `Optical windows (${String(args.station.lat_deg)}°, ${String(args.station.lon_deg)}°)`, kind: 'search' }),
    // oxlint-disable-next-line typescript/require-await -- async turns synchronous validation throws into rejected tool calls
    async execute(args) {
      const target = elementSetOf(args.object, 'object')
      const site = siteOf(args.station, 'station')
      const { start, end } = windowOf(args.start, args.end)
      const stepMs = positiveOf(args.step_s ?? 30, 'step_s') * 1000
      const minElevation = args.min_elevation_deg ?? 15
      if (!(minElevation >= 0 && minElevation < 90)) throw new Error('min_elevation_deg must lie in [0, 90)')
      const minMoon = args.min_moon_separation_deg ?? 10
      if (!(minMoon >= 0 && minMoon <= 180)) throw new Error('min_moon_separation_deg must lie in [0, 180]')
      const maxSun = args.max_sun_elevation_deg ?? -12
      if (!(Math.abs(maxSun) <= 90)) throw new Error('max_sun_elevation_deg must lie in [-90, 90]')
      if ((args.standard_magnitude === undefined) === (args.cross_section_m2 === undefined)) throw new Error('give exactly one of standard_magnitude or cross_section_m2')
      const albedo = args.albedo ?? 0.15
      if (!(albedo > 0 && albedo <= 1)) throw new Error('albedo must lie in (0, 1]')
      const stdMag = args.standard_magnitude ?? standardMagnitude(positiveOf(args.cross_section_m2 as number, 'cross_section_m2'), albedo)
      const extinction = args.extinction_mag_per_airmass ?? 0.2
      if (!(extinction >= 0)) throw new Error('extinction_mag_per_airmass must not be negative')
      // Each grid sample, two 1 s edge bisections per window, and window summaries.
      withinBudget(sampleCount(start, end, stepMs) * 1.2, bounds.maxEvaluations, 'increase step_s or shorten the window')
      const times = sampleTimes(start, end, stepMs)
      const windows = opticalWindows(target.elements, site, { standardMagnitude: stdMag, extinction }, {
        minElevation: minElevation * DEG,
        maxSunElevation: maxSun * DEG,
        minMoonSeparation: minMoon * DEG,
        ...args.limiting_magnitude !== undefined ? { limitingMagnitude: args.limiting_magnitude } : {},
      }, times)
      return {
        object: target.name,
        standard_magnitude: roundTo(stdMag, 2),
        windows: windows.slice(0, bounds.maxResults).map(w => ({
          start: formatUtc(w.start),
          end: formatUtc(w.end),
          duration_s: roundTo((w.end - w.start) / 1000, 1),
          open_at_start: w.openAtStart,
          open_at_end: w.openAtEnd,
          brightest: sampleView(w.brightest),
          faintest_magnitude: roundTo(w.faintestMagnitude, 2),
          angular_rate_deg_s: roundTo(w.angularRate / DEG, 5),
        })),
        more_windows: Math.max(0, windows.length - bounds.maxResults),
      }
    },
  })
}
