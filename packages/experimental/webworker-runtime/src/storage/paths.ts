/**
 * Virtual root of the worker host's in-memory filesystem. Kept
 * in one module so the process shim, the path/os shims, and the VFS image
 * collector cannot drift apart.
 */

/** Virtual filesystem root; `process.cwd()` and every absolute path start here. */
export const ASTRO_ONE_ROOT = '/astro-one'

/** `$ASTRO_ONE_HOME`: durable-state directory inside the image. */
export const ASTRO_ONE_HOME = `${ASTRO_ONE_ROOT}/home`

/** Flat, symlink-free package tree resolved by the worker module loader. */
export const ASTRO_ONE_NODE_MODULES = `${ASTRO_ONE_ROOT}/node_modules`

/** Directory holding the composed cordis.yml. */
export const ASTRO_ONE_CONFIG = `${ASTRO_ONE_ROOT}/config`

/** Default (empty) workspace directory. */
export const ASTRO_ONE_WORKSPACE = `${ASTRO_ONE_ROOT}/workspace`

/** Temporary directory reported by `os.tmpdir()`. */
export const ASTRO_ONE_TMP = `${ASTRO_ONE_ROOT}/tmp`
