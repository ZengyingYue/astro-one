/** Filesystem ownership for the Electron-managed desktop installation. */

import { join } from 'node:path'
import { resolveAstroOneHome } from '@astro-one/home-paths'

/** Stable desktop installation paths under the shared Harness home. */
export interface DesktopPaths {
  readonly profile: string
  readonly lock: string
}

/**
 * Resolve every Electron-owned path without changing the shared data roots.
 * @param astroOneHome - Harness home shared with npm-installed astro-one.
 * @returns immutable desktop path set.
 */
export function resolveDesktopPaths(astroOneHome: string = resolveAstroOneHome()): DesktopPaths {
  return {
    profile: join(astroOneHome, 'profiles', 'desktop'),
    lock: join(astroOneHome, 'profiles', 'desktop', 'lock'),
  }
}
