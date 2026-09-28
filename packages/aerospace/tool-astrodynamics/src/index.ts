/**
 * Astrodynamics tool plugin: registers `orbit_propagate`, `orbit_determine`, `orbit_transfer`,
 * `orbit_passes`, `orbit_conjunction`, `orbit_convert`, and `attitude_determine` on `ctx.tools`.
 * Named exports preserve loader injection metadata.
 * @module @astro-one/tool-astrodynamics
 */

import type { Context } from '@astro-one/cordis'
import z from '@astro-one/schemastery'
import { attitudeTool } from './attitude.ts'
import { conjunctionTool } from './conjunction.ts'
import { convertTool } from './convert.ts'
import { determineTool } from './determine.ts'
import { passesTool } from './passes.ts'
import { propagateTool } from './propagate.ts'
import type { ToolSettings } from './settings.ts'
import { transferTool } from './transfer.ts'

export type { ToolSettings } from './settings.ts'

export const name = 'tool-astrodynamics'
export const inject = ['tools']

/** Deployment bounds and numerical settings. */
export interface Config {
  /** Largest ephemeris, event-search, or numerical-grid sample count per call. */
  maxSamples: number
  /** Largest observation count accepted by `orbit_determine`. */
  maxObservations: number
  /** RKF7(8) relative tolerance for numerical propagation. */
  relativeTolerance: number
  /** RKF7(8) absolute tolerance in km and km/s. */
  absoluteTolerance: number
  /** RKF7(8) step budget per propagation. */
  maxIntegratorSteps: number
}

/** Schemastery configuration; every bound is an explicit deployment choice. */
export const Config: z<Config> = z.object({
  maxSamples: z.natural().min(1).required(),
  maxObservations: z.natural().min(1).required(),
  relativeTolerance: z.number().min(0).required(),
  absoluteTolerance: z.number().min(0).required(),
  maxIntegratorSteps: z.natural().min(1).required(),
})

/**
 * Register the astrodynamics tools.
 * @param ctx - context carrying the tool registry.
 * @param config - deployment bounds.
 */
export function apply(ctx: Context, config: Config): void {
  if (!(config.relativeTolerance > 0) || !(config.absoluteTolerance > 0)) {
    throw new Error('tool-astrodynamics: relativeTolerance and absoluteTolerance must be positive')
  }
  const settings: ToolSettings = {
    maxSamples: config.maxSamples,
    maxObservations: config.maxObservations,
    integrator: {
      relTol: config.relativeTolerance,
      absTol: config.absoluteTolerance,
      maxSteps: config.maxIntegratorSteps,
      initialStep: 60,
    },
  }
  for (const tool of [
    propagateTool(settings),
    determineTool(settings),
    transferTool(),
    passesTool(settings),
    conjunctionTool(settings),
    convertTool(),
    attitudeTool(),
  ]) ctx.tools.register(tool)
}
