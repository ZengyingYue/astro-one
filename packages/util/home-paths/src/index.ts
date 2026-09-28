/**
 * Shared filesystem path helpers for Astro One user data.
 *
 * @module @astro-one/home-paths
 */

import { opendir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

/** Directory name for the default Astro One home under the OS home. */
export const ASTRO_ONE_HOME_DIR_NAME = '.astro-one'

/** Stable user-facing display form for the default Astro One home. */
export const DEFAULT_ASTRO_ONE_HOME_DISPLAY = `~/${ASTRO_ONE_HOME_DIR_NAME}`

/** Environment variable that overrides the default Astro One home. */
export const ASTRO_ONE_HOME_ENV = 'ASTRO_ONE_HOME'

/**
 * Give a native filesystem watcher one canonical spelling of a path, even
 * when its final components do not exist yet. The deepest existing ancestor
 * is resolved through {@link realpath}; when a suffix is missing, that
 * ancestor is also proved to be an enumerable directory before the suffix is
 * restored. This prevents Windows from treating a regular-file ancestor as
 * ordinary absence, and prevents short-name aliases from being mixed with
 * long paths emitted by the native watcher backend.
 * @param path - Watch target or root, resolved against the current directory.
 * @returns the target with its existing ancestor canonicalized.
 * @throws when ancestor traversal encounters an error other than absence, or
 * the existing ancestor of a missing suffix is not an enumerable directory.
 */
export async function canonicalizeWatchPath(path: string): Promise<string> {
  let current = resolve(path)
  const missing: string[] = []
  while (true) {
    try {
      const canonical = await realpath(current)
      if (missing.length > 0) {
        // A Windows file-as-parent probe reports ENOENT. Opening the resolved
        // ancestor preserves the cross-platform directory requirement.
        const directory = await opendir(canonical)
        await directory.close()
      }
      return join(canonical, ...missing.reverse())
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = dirname(current)
      /* v8 ignore next -- a filesystem root exists, so traversal resolves before this guard */
      if (parent === current) throw error
      missing.push(basename(current))
      current = parent
    }
  }
}

/**
 * Resolve the default Astro One home using Node's platform path rules.
 * @returns the absolute default harness home path.
 */
export function defaultAstroOneHome(): string {
  return join(homedir(), ASTRO_ONE_HOME_DIR_NAME)
}

/**
 * Expand supported tilde prefixes against the operating-system home.
 * @param path - configured path that may begin with `~`, `~/`, or `~\`.
 * @returns the expanded path, or the original value when no supported prefix is present.
 */
export function expandHomePath(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

/**
 * Resolve the single-root Astro One home.
 *
 * Precedence, highest first: an explicit configured path, `$ASTRO_ONE_HOME`, then
 * `~/.astro-one`. The harness keeps all user data under one root. An empty or
 * whitespace-only `$ASTRO_ONE_HOME` is treated as unset, so a blank override never
 * resolves the home to the current working directory.
 * @param configured - explicit harness-home override, which has highest precedence.
 * @param env - environment mapping used to read `ASTRO_ONE_HOME`.
 * @returns the normalized absolute harness home path.
 */
export function resolveAstroOneHome(configured?: string, env: Record<string, string | undefined> = process.env): string {
  const fromEnv = env[ASTRO_ONE_HOME_ENV]
  const selected = configured ?? (fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : defaultAstroOneHome())
  return resolve(expandHomePath(selected))
}

/**
 * Join path segments onto the resolved Astro One home.
 * @param segments - path segments appended to the Harness home; an empty list returns the home itself.
 * @returns the normalized absolute joined path.
 */
export function astroOneHomePath(...segments: string[]): string {
  return join(resolveAstroOneHome(), ...segments)
}

/**
 * Join path segments onto the resolved Harness home's `cache` directory without creating it; no arguments returns the directory itself.
 * @param optionsOrSegment - explicit home override, or the first path segment; omission uses the default home resolution.
 * @param segments - additional path segments after the first child, if any.
 * @returns the normalized absolute cache path.
 */
export function astroOneCachePath(optionsOrSegment: { astroOneHome?: string } | string = {}, ...segments: string[]): string {
  if (typeof optionsOrSegment === 'string') return astroOneHomePath('cache', optionsOrSegment, ...segments)
  return join(resolveAstroOneHome(optionsOrSegment.astroOneHome), 'cache', ...segments)
}

/**
 * Describe a resolved harness home symbolically for user-facing display.
 *
 * It never returns an absolute machine path: the default home is labelled
 * `~/.astro-one`, and any configured home is labelled `$ASTRO_ONE_HOME`.
 * @param resolvedHome - the absolute path returned by {@link resolveAstroOneHome}.
 * @returns `~/.astro-one` for the default home, otherwise `$ASTRO_ONE_HOME`.
 */
export function astroOneHomeDisplay(resolvedHome: string): string {
  return resolvedHome === resolve(defaultAstroOneHome()) ? DEFAULT_ASTRO_ONE_HOME_DISPLAY : `$${ASTRO_ONE_HOME_ENV}`
}
