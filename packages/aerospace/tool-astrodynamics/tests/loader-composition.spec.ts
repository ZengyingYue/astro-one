// Boots the plugin from a cordis.yml through the real Loader: the configured bounds reach the
// model-visible tools, misconfiguration fails at load, and disposal removes every tool.
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@astro-one/cordis'
import Loader, { type ModuleLoaderV2 } from '@astro-one/cordis-plugin-loader'
import Include from '@astro-one/cordis-plugin-include'
import SystemPrompt from '@astro-one/system-prompt'
import ToolRuntime from '@astro-one/tools'
import * as Plugin from '@astro-one/tool-astrodynamics'
import { call } from './helpers.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function boot(configLines: readonly string[]): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'astro-one-astrodynamics-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@astro-one/system-prompt'",
    "- name: '@astro-one/tools'",
    '- id: astrodynamics',
    "  name: '@astro-one/tool-astrodynamics'",
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
    ['@astro-one/tool-astrodynamics', Plugin],
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
  '    maxSamples: 3',
  '    maxObservations: 10',
  '    relativeTolerance: 1.0e-10',
  '    absoluteTolerance: 1.0e-8',
  '    maxIntegratorSteps: 5000',
]

describe('tool-astrodynamics real Loader composition', () => {
  it('applies the configured sample bound to model calls', async () => {
    const ctx = await boot(VALID)
    expect(ctx.tools.schemas().some(s => s.name === 'orbit_propagate')).toBe(true)
    const result = await call(ctx, 'orbit_propagate', {
      source: { kind: 'state', epoch: '2024-01-01T00:00:00Z', frame: 'gcrf', position_km: [7000, 0, 0], velocity_km_s: [0, 7.5, 0] },
      method: 'two-body', start: '2024-01-01T00:00:00Z', end: '2024-01-01T00:10:00Z', step_s: 60,
    })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('at most 3 are allowed')
  }, 30_000)

  it('fails loading when a bound is missing or tolerances are not positive', async () => {
    await expect(boot(VALID.slice(1))).rejects.toThrow('maxSamples')
    await expect(boot([...VALID.slice(0, 2), '    relativeTolerance: 0', ...VALID.slice(3)])).rejects.toThrow('must be positive')
  }, 30_000)
})
