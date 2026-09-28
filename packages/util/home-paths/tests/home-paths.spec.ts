import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_ASTRO_ONE_HOME_DISPLAY,
  ASTRO_ONE_HOME_DIR_NAME,
  canonicalizeWatchPath,
  defaultAstroOneHome,
  astroOneCachePath,
  astroOneHomeDisplay,
  astroOneHomePath,
  expandHomePath,
  resolveAstroOneHome,
} from '@astro-one/home-paths'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('astro-one path helpers', () => {
  it('owns the shared default Astro One home directory name', () => {
    expect(ASTRO_ONE_HOME_DIR_NAME).toBe('.astro-one')
    expect(DEFAULT_ASTRO_ONE_HOME_DISPLAY).toBe('~/.astro-one')
    expect(defaultAstroOneHome()).toBe(join(homedir(), '.astro-one'))
  })

  it('expands tilde paths without changing non-tilde paths', () => {
    expect(expandHomePath('~')).toBe(homedir())
    expect(expandHomePath('~/.astro-one')).toBe(join(homedir(), '.astro-one'))
    expect(expandHomePath('~\\.astro-one')).toBe(join(homedir(), '.astro-one'))
    expect(expandHomePath('/tmp/.astro-one')).toBe('/tmp/.astro-one')
    expect(expandHomePath('~other/.astro-one')).toBe('~other/.astro-one')
  })

  it('resolves explicit path before ASTRO_ONE_HOME and the default', () => {
    const envHome = join(homedir(), 'env-astro-one')

    expect(resolveAstroOneHome('/tmp/explicit-astro-one', { ASTRO_ONE_HOME: '~/env-astro-one' })).toBe(resolve('/tmp/explicit-astro-one'))
    expect(resolveAstroOneHome(undefined, { ASTRO_ONE_HOME: '~/env-astro-one' })).toBe(envHome)
    expect(resolveAstroOneHome(undefined, {})).toBe(defaultAstroOneHome())
  })

  it('treats an empty or whitespace-only ASTRO_ONE_HOME as unset', () => {
    expect(resolveAstroOneHome(undefined, { ASTRO_ONE_HOME: '' })).toBe(defaultAstroOneHome())
    expect(resolveAstroOneHome(undefined, { ASTRO_ONE_HOME: '   ' })).toBe(defaultAstroOneHome())
  })

  it('joins child segments onto the resolved ASTRO_ONE_HOME', () => {
    vi.stubEnv('ASTRO_ONE_HOME', '~/env-astro-one')
    expect(astroOneHomePath()).toBe(join(homedir(), 'env-astro-one'))
    expect(astroOneHomePath('storages', 'cache')).toBe(join(homedir(), 'env-astro-one', 'storages', 'cache'))
  })

  it('labels a resolved home by whether it is the default root', () => {
    expect(astroOneHomeDisplay(resolve(defaultAstroOneHome()))).toBe('~/.astro-one')
    expect(astroOneHomeDisplay('/some/other/root')).toBe('$ASTRO_ONE_HOME')
  })

  it.each([
    [undefined, join(homedir(), '.astro-one')],
    ['', join(homedir(), '.astro-one')],
    ['   ', join(homedir(), '.astro-one')],
    ['~/env-astro-one', join(homedir(), 'env-astro-one')],
    ['./relative-astro-one', resolve('./relative-astro-one')],
  ] as const)('resolves cache paths with ASTRO_ONE_HOME=%j', (home, expectedHome) => {
    vi.stubEnv('ASTRO_ONE_HOME', home)
    try {
      expect(astroOneCachePath()).toBe(join(expectedHome, 'cache'))
      expect(astroOneCachePath('models', 'index.json')).toBe(join(expectedHome, 'cache', 'models', 'index.json'))
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('resolves configured cache homes before the environment', () => {
    vi.stubEnv('ASTRO_ONE_HOME', '~/env-astro-one')
    try {
      expect(astroOneCachePath({ astroOneHome: '~/explicit-astro-one' })).toBe(join(homedir(), 'explicit-astro-one', 'cache'))
      expect(astroOneCachePath({ astroOneHome: './explicit-astro-one' }, 'attachments', 'request-images'))
        .toBe(resolve('./explicit-astro-one/cache/attachments/request-images'))
      expect(astroOneCachePath({}, 'attachments')).toBe(join(homedir(), 'env-astro-one', 'cache', 'attachments'))
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('canonicalizes a watcher ancestor while preserving a missing suffix', async () => {
    const root = await mkdtemp(join(tmpdir(), 'astro-one-watch-path-'))
    const target = join(root, 'target')
    const alias = join(root, 'alias')
    try {
      await mkdir(target)
      await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir')
      await expect(canonicalizeWatchPath(alias)).resolves.toBe(await realpath(target))
      await expect(canonicalizeWatchPath(join(alias, 'later', 'config.yml'))).resolves.toBe(
        join(await realpath(target), 'later', 'config.yml'),
      )
      const file = join(root, 'file')
      await writeFile(file, 'not a directory')
      await expect(canonicalizeWatchPath(join(file, 'child'))).rejects.toMatchObject({ code: 'ENOTDIR' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
