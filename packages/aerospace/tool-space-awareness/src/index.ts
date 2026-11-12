/**
 * Space-object awareness tool plugin: registers `ssa_catalog_query`, `ssa_catalog_screen`,
 * `ssa_correlate`, `ssa_maneuver_detect`, `ssa_optical_windows`, `ssa_lightcurve`, `ssa_decay`,
 * and `ssa_tle_fit` on `ctx.tools`, reading workspace catalogs and light curves through `ctx.fs`.
 * Named exports preserve loader injection metadata.
 * @module @astro-one/tool-space-awareness
 */

import type { Context } from '@astro-one/cordis'
import z from '@astro-one/schemastery'
import type { Bounds } from './settings.ts'
import { correlateTool } from './tools/correlate.ts'
import { decayTool } from './tools/decay.ts'
import { lightcurveTool } from './tools/lightcurve.ts'
import { maneuverTool } from './tools/maneuver.ts'
import { opticalTool } from './tools/optical.ts'
import { queryTool } from './tools/query.ts'
import { screenTool } from './tools/screen.ts'
import { tleFitTool } from './tools/tle-fit.ts'

export type { Bounds } from './settings.ts'

export const name = 'tool-space-awareness'
export const inject = ['tools', 'fs']

/** Deployment bounds. */
export interface Config {
  /** Largest workspace catalog or light-curve file read, bytes. */
  maxFileBytes: number
  /** Largest number of entries parsed from one catalog file. */
  maxCatalogObjects: number
  /** Largest number of SGP4, photometric, or drag-model evaluations one call may plan. */
  maxEvaluations: number
  /** Largest number of observations, photometric points, ephemeris rows, or element sets per call. */
  maxObservations: number
  /** Largest number of result rows returned to the model. */
  maxResults: number
}

/** Schemastery configuration; every bound is an explicit deployment choice. */
export const Config: z<Config> = z.object({
  maxFileBytes: z.natural().min(1).required(),
  maxCatalogObjects: z.natural().min(1).required(),
  maxEvaluations: z.natural().min(1).required(),
  maxObservations: z.natural().min(1).required(),
  maxResults: z.natural().min(1).required(),
})

/**
 * Register the space-awareness tools.
 * @param ctx - context carrying the tool registry and the filesystem.
 * @param config - deployment bounds.
 */
export function apply(ctx: Context, config: Config): void {
  const bounds: Bounds = {
    maxFileBytes: config.maxFileBytes,
    maxCatalogObjects: config.maxCatalogObjects,
    maxEvaluations: config.maxEvaluations,
    maxObservations: config.maxObservations,
    maxResults: config.maxResults,
  }
  for (const tool of [
    queryTool(ctx, bounds),
    screenTool(ctx, bounds),
    correlateTool(ctx, bounds),
    maneuverTool(ctx, bounds),
    opticalTool(bounds),
    lightcurveTool(ctx, bounds),
    decayTool(bounds),
    tleFitTool(bounds),
  ]) ctx.tools.register(tool)
}
