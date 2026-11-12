// Boots the plugin from a cordis.yml through the real Loader beside a local filesystem: the
// configured bounds reach the model-visible tools and a missing bound fails at load.
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@astro-one/cordis'
import Loader, { type ModuleLoaderV2 } from '@astro-one/cordis-plugin-loader'
import Include from '@astro-one/cordis-plugin-include'
import LocalFileSystem from '@astro-one/fs-local'
import SystemPrompt from '@astro-one/system-prompt'
import ToolRuntime from '@astro-one/tools'
import * as Plugin from '@astro-one/tool-space-awareness'
import { call, catalogText } from './fixtures.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function boot(configLines: readonly string[]): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'astro-one-ssa-loader-'))
  await writeFile(join(root, 'cat.txt'), catalogText([{ number: 1, n: 15.5, i: 51.6 }, { number: 2, n: 15.4, i: 97 }]))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@astro-one/system-prompt'",
    "- name: '@astro-one/tools'",
    "- name: '@astro-one/fs-local'",
    '  config:',
    `    cwd: ${JSON.stringify(root)}`,
    '- id: space-awareness',
    "  name: '@astro-one/tool-space-awareness'",
    ...configLines.length > 0 ? ['  config:', ...configLines] : [],
    '',
  ].join('\n'))
  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@astro-one/system-prompt', SystemPrompt],
    ['@astro-one/tools', ToolRuntime],
    ['@astro-one/fs-local', LocalFileSystem],
    ['@astro-one/tool-space-awareness', Plugin],
  ])
  const internal: ModuleLoaderV2 = {
    version: 'v2',
    loadCache: new Map(),
    import: (specifier: string) => {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return Promise.resolve(modules.get(specifier))
    },
    register(): never { throw new Error('unexpected module hook registration') },
    getOrCreateModuleJob(): never { throw new Error('unexpected module job creation') },
    resolveSync(): never { throw new Error('unexpected synchronous module resolution') },
    load(): never { throw new Error('unexpected module load') },
  }
  ctx.loader.internal = internal
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  for (const entry of ctx.loader.entries()) await entry.fiber?.await()
  return ctx
}

const VALID = [
  '    maxFileBytes: 1000000',
  '    maxCatalogObjects: 1',
  '    maxEvaluations: 100000',
  '    maxObservations: 100',
  '    maxResults: 10',
]

describe('tool-space-awareness real Loader composition', () => {
  it('registers every tool and applies the configured catalog bound', async () => {
    const ctx = await boot(VALID)
    expect(ctx.tools.schemas().map(s => s.name).filter(n => n.startsWith('ssa_')).sort()).toEqual([
      'ssa_catalog_query', 'ssa_catalog_screen', 'ssa_correlate', 'ssa_decay', 'ssa_lightcurve', 'ssa_maneuver_detect', 'ssa_optical_windows', 'ssa_tle_fit',
    ])
    const result = await call(ctx, 'ssa_catalog_query', { catalog_path: 'cat.txt' })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('more than 1 entries')
  }, 30_000)

  it('fails loading when a bound is missing', async () => {
    await expect(boot(VALID.slice(1))).rejects.toThrow('maxFileBytes')
  }, 30_000)
})
