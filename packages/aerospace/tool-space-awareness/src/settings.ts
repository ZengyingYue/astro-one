/**
 * Resolved deployment bounds shared by the space-awareness tools.
 * @module @astro-one/tool-space-awareness/settings
 */

/** Bounds every tool receives from the plugin Config. */
export interface Bounds {
  /** Largest workspace file read, bytes. */
  readonly maxFileBytes: number
  /** Largest number of catalog entries parsed from one file. */
  readonly maxCatalogObjects: number
  /** Largest number of SGP4, photometric, or drag-model evaluations one call may plan. */
  readonly maxEvaluations: number
  /** Largest number of observations, photometric points, ephemeris rows, or element sets per call. */
  readonly maxObservations: number
  /** Largest number of result rows returned to the model. */
  readonly maxResults: number
}
