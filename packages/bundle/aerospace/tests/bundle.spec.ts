// Boots the shipped aerospace patch rows through the real Loader beside the tool runtime and a
// local filesystem, then exercises one model call per tool family.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { Context } from '@astro-one/cordis'
import Loader, { type ModuleLoaderV2 } from '@astro-one/cordis-plugin-loader'
import Include, { entryListSchema } from '@astro-one/cordis-plugin-include'
import LocalFileSystem from '@astro-one/fs-local'
import { ToolCallId } from '@astro-one/llm'
import SystemPrompt from '@astro-one/system-prompt'
import * as ToolAstrodynamics from '@astro-one/tool-astrodynamics'
import * as ToolGnss from '@astro-one/tool-gnss'
import * as ToolRemoteSensing from '@astro-one/tool-remote-sensing'
import ToolRuntime from '@astro-one/tools'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
let dir: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  dir = undefined
})

interface Row { id?: string; name?: string; config?: Record<string, unknown> }

async function patchRows(): Promise<Row[]> {
  const manifest = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8')) as { astroOne: { bundle: { patch: string } } }
  const parsed = yaml.load(await readFile(resolve(ROOT, manifest.astroOne.bundle.patch), 'utf8'), { schema: entryListSchema }) as { insert?: Row[] }[]
  return parsed.flatMap(p => p.insert ?? [])
}

async function boot(): Promise<Context> {
  dir = await mkdtemp(join(tmpdir(), 'astro-one-aerospace-bundle-'))
  const rows = await patchRows()
  const lines = [
    "- name: '@astro-one/system-prompt'",
    "- name: '@astro-one/tools'",
    "- name: '@astro-one/fs-local'",
    '  config:',
    `    cwd: ${JSON.stringify(dir)}`,
    ...rows.flatMap(row => [`- id: ${row.id as string}`, `  name: '${row.name as string}'`, '  config:', ...Object.entries(row.config ?? {}).map(([k, v]) => `    ${k}: ${JSON.stringify(v)}`)]),
    '',
  ]
  const configPath = join(dir, 'cordis.yml')
  await writeFile(configPath, lines.join('\n'))
  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(dir).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@astro-one/system-prompt', SystemPrompt],
    ['@astro-one/tools', ToolRuntime],
    ['@astro-one/fs-local', LocalFileSystem],
    ['@astro-one/tool-astrodynamics', ToolAstrodynamics],
    ['@astro-one/tool-gnss', ToolGnss],
    ['@astro-one/tool-remote-sensing', ToolRemoteSensing],
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

async function call(ctx: Context, name: string, args: Record<string, unknown>): Promise<{ isError: boolean; text: string }> {
  const r = await ctx.tools.execute({ signal: new AbortController().signal, callId: ToolCallId(name), name, arguments: args })
  return { isError: r.isError, text: r.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('') }
}

describe('aerospace bundle', () => {
  it('declares a public bundle layer that inserts the three tool plugins', async () => {
    const manifest = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8')) as { publishConfig?: { access?: string }; astroOne?: { bundle?: { patch?: string } } }
    expect(manifest.publishConfig?.access).toBe('public')
    expect(manifest.astroOne?.bundle?.patch).toBe('./cordis.patch.yml')
    expect((await patchRows()).map(r => r.name)).toEqual(['@astro-one/tool-astrodynamics', '@astro-one/tool-gnss', '@astro-one/tool-remote-sensing'])
  })

  it('boots through the Loader and serves every tool family', async () => {
    const ctx = await boot()
    const names = ctx.tools.schemas().map(s => s.name)
    expect(names).toEqual(expect.arrayContaining([
      'orbit_propagate', 'orbit_determine', 'orbit_transfer', 'orbit_passes', 'orbit_conjunction', 'orbit_convert',
      'attitude_determine', 'gnss_position', 'gnss_visibility', 'rs_spectral_index', 'rs_change_detect',
    ]))
    expect(names).not.toContain('rs_detect_objects')
    const transfer = await call(ctx, 'orbit_transfer', { mode: 'hohmann', radius1_km: 6678, radius2_km: 42164 })
    expect(transfer.isError).toBe(false)
    expect(transfer.text).toContain('total_dv_km_s')
    const missing = await call(ctx, 'gnss_position', { rover_obs_path: 'none.rnx', nav_path: 'none.rnx' })
    expect(missing.isError).toBe(true)
    const noImage = await call(ctx, 'rs_spectral_index', { index: 'ndvi', path: 'none.tif', bands: { red: 1, nir: 2 } })
    expect(noImage.isError).toBe(true)
  }, 30_000)
})
