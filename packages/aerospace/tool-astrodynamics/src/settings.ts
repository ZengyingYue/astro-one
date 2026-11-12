/**
 * Resolved deployment settings shared by the astrodynamics tools.
 * @module @astro-one/tool-astrodynamics/settings
 */

import type { IntegratorSettings } from '@astro-one/astrodynamics'

/** Bounds and numerical settings every tool receives from the plugin Config. */
export interface ToolSettings {
  /** Largest ephemeris, grid, or search sample count one call may request. */
  readonly maxSamples: number
  /** Largest observation count `orbit_determine` accepts. */
  readonly maxObservations: number
  /** Numerical integrator tolerances and step budget. */
  readonly integrator: IntegratorSettings
}
