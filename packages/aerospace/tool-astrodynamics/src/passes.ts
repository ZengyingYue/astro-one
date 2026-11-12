/**
 * `orbit_passes`: ground-station visibility passes with rise, culmination, and set geometry,
 * satellite illumination, and site sun elevation.
 * @module @astro-one/tool-astrodynamics/passes
 */

import { DEG, findPasses, formatUtc } from '@astro-one/astrodynamics'
import { defineTool } from '@astro-one/tools'
import type { ToolDefinition } from '@astro-one/tools'
import { eopOf, finite, forceModel, instant, parseSource, positive, round, station } from './inputs.ts'
import { FORCES, INSTANT, METHOD, SOURCE, STATION } from './schema.ts'
import type { ToolSettings } from './settings.ts'
import { trajectory } from './trajectory.ts'

const DESCRIPTION = 'Predict when a satellite is visible from a ground station between start and end: rise, culmination, '
  + 'and set times with azimuth/elevation/range, above min_elevation_deg (default 10). step_s (default 60) is the coarse '
  + 'search step and must be shorter than the shortest pass of interest. Each pass also reports whether the satellite is '
  + 'sunlit at culmination and the Sun elevation at the site (optically visible passes need a sunlit satellite and a site '
  + 'Sun elevation below about -6 deg).'

/**
 * Build the `orbit_passes` tool.
 * @param settings - deployment bounds and integrator settings.
 * @returns the tool definition.
 */
export function passesTool(settings: ToolSettings): ToolDefinition {
  const angles = { type: 'object', additionalProperties: false, properties: {
    time: { type: 'string', required: true },
    azimuth_deg: { type: 'number', required: true },
    elevation_deg: { type: 'number', required: true },
    range_km: { type: 'number', required: true },
  } } as const
  return defineTool({
    name: 'orbit_passes',
    description: DESCRIPTION,
    parameters: {
      source: { ...SOURCE, required: true },
      method: { ...METHOD, required: true },
      station: { ...STATION, required: true },
      start: { ...INSTANT, required: true },
      end: { ...INSTANT, required: true },
      min_elevation_deg: { type: 'number' },
      step_s: { type: 'number' },
      forces: FORCES,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          passes: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                rise: { ...angles, required: true },
                culmination: { ...angles, required: true },
                set: { ...angles, required: true },
                duration_s: { type: 'number', required: true },
                in_progress_at_start: { type: 'boolean', required: true },
                in_progress_at_end: { type: 'boolean', required: true },
                sunlit_fraction: { type: 'number', required: true },
                site_sun_elevation_deg: { type: 'number', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.passes.length === 0 ? 'No passes above the elevation mask in the window.' : JSON.stringify(value) }],
    },
    presentCall: args => ({ card: 'generic', title: `Satellite passes (${String(args.station.lat_deg)}°, ${String(args.station.lon_deg)}°)`, kind: 'search' }),
    // oxlint-disable-next-line typescript/require-await -- async turns synchronous validation throws into rejected tool calls
    async execute(args) {
      const source = parseSource(args.source, eopOf(undefined))
      const site = station(args.station, 'station')
      const start = instant(args.start, 'start')
      const end = instant(args.end, 'end')
      if (!(end > start)) throw new Error('end must follow start')
      const stepMs = positive(args.step_s ?? 60, 'step_s') * 1000
      if ((end - start) / stepMs > settings.maxSamples) throw new Error(`the window needs more than ${String(settings.maxSamples)} search steps; increase step_s or shorten the window`)
      const mask = finite(args.min_elevation_deg ?? 10, 'min_elevation_deg') * DEG
      const context = { method: args.method, forces: forceModel(args.forces), integrator: settings.integrator }
      const path = trajectory(source, context, start, end, stepMs, settings.maxSamples)
      const view = (t: number, a: { az: number; el: number; range: number }) => ({
        time: formatUtc(t), azimuth_deg: round(a.az / DEG, 4), elevation_deg: round(a.el / DEG, 4), range_km: round(a.range, 3),
      })
      return {
        passes: findPasses(path, site, start, end, mask, stepMs).map(p => ({
          rise: view(p.rise, p.riseAngles),
          culmination: view(p.culmination, p.culminationAngles),
          set: view(p.set, p.setAngles),
          duration_s: round((p.set - p.rise) / 1000, 3),
          in_progress_at_start: p.truncatedStart,
          in_progress_at_end: p.truncatedEnd,
          sunlit_fraction: round(p.sunlit, 4),
          site_sun_elevation_deg: round(p.siteSunElevation / DEG, 3),
        })),
      }
    },
  })
}
