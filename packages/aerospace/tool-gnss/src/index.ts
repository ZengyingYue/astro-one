/**
 * GNSS tool plugin: registers `gnss_position` (single-point positioning with RAIM, or RTK with
 * LAMBDA ambiguity fixing, from RINEX 3 files) and `gnss_visibility` (satellite sky view and
 * DOP planning from a navigation file) on `ctx.tools`, reading files through `ctx.fs`.
 * Named exports preserve loader injection metadata.
 * @module @astro-one/tool-gnss
 */

import { enuMatrix, geodeticToItrf, itrfToGeodetic, taiMinusUtc } from '@astro-one/astrodynamics'
import type { Vec3 } from '@astro-one/astrodynamics'
import type { Context } from '@astro-one/cordis'
import z from '@astro-one/schemastery'
import { defineTool } from '@astro-one/tools'
import type { ToolDefinition } from '@astro-one/tools'
import { C, selectEphemeris } from './broadcast.ts'
import { readTextFile } from './files.ts'
import { GPS_EPOCH_MS, parseNavigation, parseObservation } from './rinex.ts'
import type { GnssSystem } from './rinex.ts'
import { solveRtk } from './rtk.ts'
import { dilution, geometry, solveEpoch } from './spp.ts'
import type { SppOptions, SppSolution } from './spp.ts'

export const name = 'tool-gnss'
export const inject = ['tools', 'fs']

/** Deployment bounds. */
export interface Config {
  /** Largest RINEX file size read, bytes. */
  maxFileBytes: number
  /** Largest number of observation epochs processed per call. */
  maxEpochs: number
  /** Largest number of per-epoch rows returned to the model. */
  maxReportedEpochs: number
}

/** Schemastery configuration; every bound is an explicit deployment choice. */
export const Config: z<Config> = z.object({
  maxFileBytes: z.natural().min(1).required(),
  maxEpochs: z.natural().min(1).required(),
  maxReportedEpochs: z.natural().min(1).required(),
})

const SYSTEM_NAMES = { gps: 'G', galileo: 'E', beidou: 'C' } as const

const SYSTEMS = {
  type: 'array',
  items: { type: 'string', enum: ['gps', 'galileo', 'beidou'] },
  description: 'Constellations to use (default all three).',
} as const

function systemsOf(list: readonly ('gps' | 'galileo' | 'beidou')[] | undefined): GnssSystem[] {
  const chosen = list ?? ['gps', 'galileo', 'beidou']
  if (chosen.length === 0) throw new Error('systems must name at least one constellation')
  return [...new Set(chosen.map(s => SYSTEM_NAMES[s]))]
}

function positive(value: number, field: string): number {
  if (!(value > 0)) throw new Error(`${field} must be positive`)
  return value
}

function iso(gps: number): string {
  return new Date(GPS_EPOCH_MS + gps * 1000).toISOString()
}

function r(x: number, digits: number): number {
  const k = 10 ** digits
  return Math.round(x * k) / k + 0
}

function geodetic(p: Vec3): { lat_deg: number; lon_deg: number; height_m: number } {
  const g = itrfToGeodetic([p[0] / 1000, p[1] / 1000, p[2] / 1000])
  return { lat_deg: r((g.lat * 180) / Math.PI, 9), lon_deg: r((g.lon * 180) / Math.PI, 9), height_m: r(g.h * 1000, 4) }
}

/**
 * Mean position and east/north/up scatter of epoch positions.
 * @param points - ECEF positions, metres (at least one).
 * @returns the mean ECEF position and the east, north, and up standard deviations about it.
 */
export function summarize(points: readonly Vec3[]): { mean: Vec3; enuStd: Vec3 } {
  const mean: Vec3 = [0, 1, 2].map(i => points.reduce((s, p) => s + (p[i] as number), 0) / points.length) as [number, number, number]
  const g = itrfToGeodetic([mean[0] / 1000, mean[1] / 1000, mean[2] / 1000])
  const m = enuMatrix(g.lat, g.lon)
  const enu = points.map(p => [0, 1, 2].map((i) => {
    const row = m[i as 0]
    return row[0] * (p[0] - mean[0]) + row[1] * (p[1] - mean[1]) + row[2] * (p[2] - mean[2])
  }))
  const std = [0, 1, 2].map(i => Math.sqrt(enu.reduce((s, e) => s + (e[i] as number) ** 2, 0) / points.length))
  return { mean, enuStd: [std[0] as number, std[1] as number, std[2] as number] }
}

const POSITION_DESCRIPTION = 'Compute receiver positions from RINEX 3 files in the workspace. mode=spp (default) runs '
  + 'single-point positioning on single-frequency code (GPS L1 C/A, Galileo E1, BeiDou B1I) with Klobuchar and '
  + 'Saastamoinen corrections, per-constellation clocks, and RAIM fault exclusion. mode=rtk runs short-baseline carrier-phase '
  + 'RTK against a base station (base_obs_path and surveyed base_position_m ECEF required; rover and base must share '
  + 'epochs) with LAMBDA integer ambiguity fixing accepted when the ratio test reaches ratio_threshold (default 3). Returns '
  + 'the mean position, east/north/up scatter, fix rate, DOP, RAIM exclusions, and per-epoch rows (the first epochs only when '
  + 'there are many).'

const VISIBILITY_DESCRIPTION = 'Plan GNSS observations from a RINEX 3 navigation file: for a station and a time window, list '
  + 'the satellites above elevation_mask_deg (default 10) with azimuth/elevation and the GDOP/PDOP/HDOP/VDOP of the visible '
  + 'geometry at each step_s (default 600).'

/**
 * Register the GNSS tools.
 * @param ctx - context carrying the tool registry and the filesystem.
 * @param config - deployment bounds.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(positionTool(ctx, config))
  ctx.tools.register(visibilityTool(ctx, config))
}

/**
 * Build the `gnss_position` tool.
 * @param ctx - context carrying the filesystem.
 * @param config - deployment bounds.
 * @returns the tool definition.
 */
export function positionTool(ctx: Context, config: Config): ToolDefinition {
  return defineTool({
    name: 'gnss_position',
    description: POSITION_DESCRIPTION,
    parameters: {
      rover_obs_path: { type: 'string', required: true, description: 'RINEX 3 observation file of the receiver to position.' },
      nav_path: { type: 'string', required: true, description: 'RINEX 3 navigation file (mixed or per-constellation).' },
      mode: { type: 'string', enum: ['spp', 'rtk'] },
      base_obs_path: { type: 'string' },
      base_position_m: { type: 'array', items: { type: 'number' } },
      rtk_mode: { type: 'string', enum: ['kinematic', 'static'], description: 'kinematic (default) re-estimates the rover every epoch.' },
      systems: SYSTEMS,
      elevation_mask_deg: { type: 'number' },
      code_sigma_m: { type: 'number', description: 'Zenith code sigma (default 0.3 m).' },
      phase_sigma_m: { type: 'number', description: 'Zenith phase sigma for RTK (default 0.003 m).' },
      ratio_threshold: { type: 'number' },
      raim: { type: 'boolean', description: 'Fault detection and exclusion (default true).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          mode: { type: 'string', required: true },
          epochs_processed: { type: 'integer', required: true },
          epochs_solved: { type: 'integer', required: true },
          fix_rate: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
          mean_position: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              ecef_m: { type: 'array', items: { type: 'number' }, required: true },
              lat_deg: { type: 'number', required: true },
              lon_deg: { type: 'number', required: true },
              height_m: { type: 'number', required: true },
            },
          },
          enu_std_m: { type: 'array', items: { type: 'number' }, required: true },
          baseline_m: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
          mean_pdop: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
          raim_exclusions: {
            type: 'array', required: true,
            items: { type: 'object', additionalProperties: false, properties: { time: { type: 'string', required: true }, satellite: { type: 'string', required: true } } },
          },
          epochs: { type: 'array', items: { type: 'json' }, required: true },
          epochs_truncated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    presentCall: args => ({ card: 'generic', title: `GNSS positioning (${args.mode ?? 'spp'})`, kind: 'read', locations: [{ path: args.rover_obs_path }] }),
    async execute(args, exec) {
      const mode = args.mode ?? 'spp'
      const nav = parseNavigation(await readTextFile(ctx, exec, args.nav_path, config.maxFileBytes))
      const rover = parseObservation(await readTextFile(ctx, exec, args.rover_obs_path, config.maxFileBytes), config.maxEpochs)
      const options: SppOptions = {
        systems: systemsOf(args.systems),
        elevationMask: ((args.elevation_mask_deg ?? 10) * Math.PI) / 180,
        codeSigma: positive(args.code_sigma_m ?? 0.3, 'code_sigma_m'),
        raim: args.raim ?? true,
      }
      const report = <T>(rows: readonly T[]): { epochs: T[]; epochs_truncated: boolean } => ({
        epochs: rows.slice(0, config.maxReportedEpochs), epochs_truncated: rows.length > config.maxReportedEpochs,
      })
      if (mode === 'spp') {
        const solutions: SppSolution[] = []
        let start: Vec3 = rover.approxPosition ?? [0, 0, 0]
        for (const epoch of rover.epochs) {
          const sol = solveEpoch(epoch, nav, options, start)
          if (sol === undefined) continue
          solutions.push(sol)
          start = sol.position
        }
        if (solutions.length === 0) throw new Error('no epoch had enough satellites with usable code and ephemeris for a solution')
        const { mean, enuStd } = summarize(solutions.map(s => s.position))
        return {
          mode,
          epochs_processed: rover.epochs.length,
          epochs_solved: solutions.length,
          fix_rate: null,
          mean_position: { ecef_m: mean.map(v => r(v, 4)), ...geodetic(mean) },
          enu_std_m: enuStd.map(v => r(v, 4)),
          baseline_m: null,
          mean_pdop: r(solutions.reduce((s, x) => s + x.dop.pdop, 0) / solutions.length, 3),
          raim_exclusions: solutions.flatMap(s => s.excluded.map(sat => ({ time: iso(s.time), satellite: sat }))),
          ...report(solutions.map(s => ({
            time: iso(s.time), ecef_m: s.position.map(v => r(v, 4)), satellites: s.used.length, pdop: r(s.dop.pdop, 3), valid: s.valid,
          }))),
        }
      }
      if (args.base_obs_path === undefined || args.base_position_m === undefined) throw new Error('mode=rtk needs base_obs_path and base_position_m')
      const bp = args.base_position_m
      if (bp.length !== 3) throw new Error('base_position_m must be [x, y, z] ECEF metres')
      const basePos: Vec3 = [bp[0] as number, bp[1] as number, bp[2] as number]
      const base = parseObservation(await readTextFile(ctx, exec, args.base_obs_path, config.maxFileBytes), config.maxEpochs)
      const results = solveRtk(rover, base, basePos, nav, {
        ...options,
        mode: args.rtk_mode ?? 'kinematic',
        phaseSigma: positive(args.phase_sigma_m ?? 0.003, 'phase_sigma_m'),
        ratioThreshold: positive(args.ratio_threshold ?? 3, 'ratio_threshold'),
      })
      if (results.length === 0) throw new Error('no rover epoch matched a base epoch with a usable code solution')
      const fixed = results.filter(x => x.status === 'fixed')
      const { mean, enuStd } = summarize((fixed.length > 0 ? fixed : results).map(x => x.position))
      return {
        mode,
        epochs_processed: rover.epochs.length,
        epochs_solved: results.length,
        fix_rate: r(fixed.length / results.length, 4),
        mean_position: { ecef_m: mean.map(v => r(v, 4)), ...geodetic(mean) },
        enu_std_m: enuStd.map(v => r(v, 4)),
        baseline_m: r(Math.hypot(mean[0] - basePos[0], mean[1] - basePos[1], mean[2] - basePos[2]), 4),
        mean_pdop: null,
        raim_exclusions: [],
        ...report(results.map(x => ({
          time: iso(x.time),
          status: x.status,
          ecef_m: x.position.map(v => r(v, 4)),
          ratio: x.ratio === null ? null : r(x.ratio, 3),
          satellites: x.satellites,
        }))),
      }
    },
  })
}

/**
 * Build the `gnss_visibility` tool.
 * @param ctx - context carrying the filesystem.
 * @param config - deployment bounds.
 * @returns the tool definition.
 */
export function visibilityTool(ctx: Context, config: Config): ToolDefinition {
  return defineTool({
    name: 'gnss_visibility',
    description: VISIBILITY_DESCRIPTION,
    parameters: {
      nav_path: { type: 'string', required: true },
      station: {
        type: 'object', additionalProperties: false, required: true,
        properties: { lat_deg: { type: 'number', required: true }, lon_deg: { type: 'number', required: true }, alt_m: { type: 'number', required: true } },
      },
      start: { type: 'string', required: true, description: 'ISO 8601 UTC instant.' },
      end: { type: 'string', required: true },
      step_s: { type: 'number' },
      elevation_mask_deg: { type: 'number' },
      systems: SYSTEMS,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          samples: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                time: { type: 'string', required: true },
                visible: {
                  type: 'array', required: true,
                  items: {
                    type: 'object', additionalProperties: false,
                    properties: { satellite: { type: 'string', required: true }, azimuth_deg: { type: 'number', required: true }, elevation_deg: { type: 'number', required: true } },
                  },
                },
                gdop: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
                pdop: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
                hdop: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
                vdop: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    presentCall: args => ({ card: 'generic', title: 'GNSS visibility', kind: 'read', locations: [{ path: args.nav_path }] }),
    async execute(args, exec) {
      const nav = parseNavigation(await readTextFile(ctx, exec, args.nav_path, config.maxFileBytes))
      const systems = systemsOf(args.systems)
      const start = Date.parse(args.start)
      const end = Date.parse(args.end)
      if (Number.isNaN(start) || Number.isNaN(end) || end < start) throw new Error('start and end must be ISO instants with end not before start')
      const stepMs = positive(args.step_s ?? 600, 'step_s') * 1000
      const count = Math.floor((end - start) / stepMs) + 1
      if (count > config.maxEpochs) throw new Error(`the window has ${String(count)} steps; at most ${String(config.maxEpochs)} are allowed`)
      const mask = ((args.elevation_mask_deg ?? 10) * Math.PI) / 180
      const deg = Math.PI / 180
      const siteKm = geodeticToItrf({ lat: args.station.lat_deg * deg, lon: args.station.lon_deg * deg, h: args.station.alt_m / 1000 })
      const station: Vec3 = [siteKm[0] * 1000, siteKm[1] * 1000, siteKm[2] * 1000]
      const sats = [...new Set(nav.ephemerides.filter(e => systems.includes(e.system)).map(e => e.sat))].sort()
      const samples = Array.from({ length: count }, (_, k) => {
        const utc = start + k * stepMs
        // GPST − UTC = (TAI − UTC) − 19 s.
        const t = (utc - GPS_EPOCH_MS) / 1000 + taiMinusUtc(utc) - 19
        const visible: { satellite: string; azimuth_deg: number; elevation_deg: number }[] = []
        const rows: number[][] = []
        const used = [...new Set(systems)]
        for (const sat of sats) {
          const eph = selectEphemeris(nav.ephemerides.filter(e => e.sat === sat), t)
          if (eph === undefined) continue
          const geo = geometry(eph, t, 0.075 * C, station)
          if (geo.elevation < mask) continue
          visible.push({
            satellite: sat, azimuth_deg: r((geo.azimuth * 180) / Math.PI, 2), elevation_deg: r((geo.elevation * 180) / Math.PI, 2),
          })
          rows.push([-geo.los[0], -geo.los[1], -geo.los[2], ...used.map(s => (s === eph.system ? 1 : 0))])
        }
        const present = used.filter((_, i) => rows.some(row => row[3 + i] === 1))
        const clockColumns = (row: number[]): number[] => used.flatMap((s, i) => (present.includes(s) ? [row[3 + i] as number] : []))
        const trimmed = rows.map(row => [...row.slice(0, 3), ...clockColumns(row)])
        const dop = trimmed.length >= 3 + present.length && present.length > 0 ? dilution(trimmed, station) : undefined
        return {
          time: new Date(utc).toISOString(),
          visible,
          gdop: dop ? r(dop.gdop, 3) : null,
          pdop: dop ? r(dop.pdop, 3) : null,
          hdop: dop ? r(dop.hdop, 3) : null,
          vdop: dop ? r(dop.vdop, 3) : null,
        }
      })
      return { samples }
    },
  })
}
