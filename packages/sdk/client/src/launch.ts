/**
 * Resolve the public SDK launch configuration to one astro-one subprocess.
 * @module @astro-one/sdk-client/launch
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { HarnessClientOptions } from './types.ts'

/** Default bound for a profile to answer the SDK initialize handshake. */
export const DEFAULT_INITIALIZE_TIMEOUT_MS = 10_000

/** Internal generic process launch used by the transport and fake-runtime tests. */
export interface RuntimeProcessOptions {
  command: string
  args: string[]
  cwd?: string
  /** Materialize the complete child environment when the client starts its subprocess. */
  environment: () => NodeJS.ProcessEnv
  description: string
  initializeTimeoutMs: number
  requestTimeoutMs?: number
  shutdownTimeoutMs?: number
  disposeEofGraceMs?: number
  disposeGraceMs?: number
}

/** Node argv plus internal profile patches required by one resolved astro-one entry. */
export interface AstroOneNodeLaunch {
  /** Arguments before the profile selector. */
  nodeArgs: string[]
  /** Internal patches applied below caller-supplied patches. */
  patches: string[]
  /** Environment values required by the resolved entry mode. */
  environment: NodeJS.ProcessEnv
}

interface PackageManifest {
  version?: unknown
  bin?: unknown
}

/** Read a package manifest from one resolved package.json URL. */
function manifest(url: string): PackageManifest {
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as PackageManifest
}

/**
 * Resolve and version-check a astro-one executable from package manifests.
 * @param astroOneManifestUrl - resolved URL of the astro-one package manifest.
 * @param clientManifestUrl - resolved URL of the SDK client manifest.
 * @returns the absolute astro-one executable path.
 */
export function resolveAstroOneBinFromManifests(astroOneManifestUrl: string, clientManifestUrl: string): string {
  const astroOneManifest = manifest(astroOneManifestUrl)
  const clientManifest = manifest(clientManifestUrl)
  if (typeof astroOneManifest.version !== 'string' || astroOneManifest.version !== clientManifest.version) {
    throw new Error(`astro-one SDK client ${String(clientManifest.version)} requires the same astro-one version, got ${String(astroOneManifest.version)}`)
  }
  const bin = typeof astroOneManifest.bin === 'object' && astroOneManifest.bin !== null
    ? (astroOneManifest.bin as Record<string, unknown>)['astro-one']
    : astroOneManifest.bin
  if (typeof bin !== 'string' || bin === '') throw new Error('@astro-one/cli declares no astro-one executable')
  return resolve(dirname(fileURLToPath(astroOneManifestUrl)), bin)
}

/**
 * Resolve and version-check the built astro-one executable installed with this SDK.
 * @returns the absolute built executable path, whether or not it exists in a source checkout.
 */
export function installedAstroOneBin(): string {
  return resolveAstroOneBinFromManifests(
    import.meta.resolve('@astro-one/cli/package.json'),
    new URL('../package.json', import.meta.url).href,
  )
}

/**
 * Resolve the Node launch for one same-version astro-one package.
 * @param astroOneManifestUrl - resolved URL of the astro-one package manifest.
 * @param clientManifestUrl - resolved URL of the SDK client manifest.
 * @param sourceLoaderUrl - optional absolute tsx loader URL for deterministic tests.
 * @returns built output, or the source entry plus its compatibility patch and tsx environment.
 */
export function resolveAstroOneNodeLaunchFromManifests(
  astroOneManifestUrl: string,
  clientManifestUrl: string,
  sourceLoaderUrl?: string,
): AstroOneNodeLaunch {
  const bin = resolveAstroOneBinFromManifests(astroOneManifestUrl, clientManifestUrl)
  if (existsSync(bin)) return { nodeArgs: [bin], patches: [], environment: {} }

  const packageDir = dirname(fileURLToPath(astroOneManifestUrl))
  const sourceBin = resolve(packageDir, 'src/bin.ts')
  const sourcePatch = resolve(packageDir, 'src/sdk-source.cordis.patch.yml')
  const sourceTsconfig = resolve(packageDir, 'tsconfig.json')
  if (!existsSync(sourceBin) || !existsSync(sourcePatch) || !existsSync(sourceTsconfig)) {
    throw new Error(
      `@astro-one/cli is missing its built executable ${bin} and complete source launch files ${sourceBin}, ${sourcePatch}, ${sourceTsconfig}`,
    )
  }
  const loader = sourceLoaderUrl ?? import.meta.resolve('tsx/esm')
  return {
    nodeArgs: ['--import', loader, sourceBin],
    patches: [sourcePatch],
    environment: { TSX_TSCONFIG_PATH: sourceTsconfig },
  }
}

/**
 * Resolve the installed astro-one package to a built or source Node launch.
 * @returns the launch descriptor for the current checkout or installed package.
 */
function installedAstroOneNodeLaunch(): AstroOneNodeLaunch {
  return resolveAstroOneNodeLaunchFromManifests(
    import.meta.resolve('@astro-one/cli/package.json'),
    new URL('../package.json', import.meta.url).href,
  )
}

/**
 * Resolve caller-relative filesystem inputs and construct canonical astro-one argv.
 * @param options - public SDK launch options.
 * @param callerCwd - parent-process directory used for lexical resolution.
 * @returns one generic subprocess spec for the JSON-RPC transport.
 */
export function resolveAstroOneLaunch(
  options: HarnessClientOptions = {},
  callerCwd: string = process.cwd(),
): RuntimeProcessOptions {
  const profile = options.profile ?? 'sdk'
  const astroOneLaunch = options.astroOneBin === undefined
    ? installedAstroOneNodeLaunch()
    : { nodeArgs: [resolve(callerCwd, options.astroOneBin)], patches: [], environment: {} }
  const patches = [
    ...astroOneLaunch.patches,
    ...(options.patches ?? []).map(path => resolve(callerCwd, path)),
  ]
  const astroOneHome = options.astroOneHome === undefined ? undefined : resolve(callerCwd, options.astroOneHome)
  return {
    command: process.execPath,
    args: [...astroOneLaunch.nodeArgs, '--profile', profile, ...patches.flatMap(path => ['--patch', path])],
    ...options.processCwd === undefined ? {} : { cwd: resolve(callerCwd, options.processCwd) },
    environment: () => ({
      ...(options.env ?? process.env),
      ...astroOneLaunch.environment,
      ...astroOneHome === undefined ? {} : { ASTRO_ONE_HOME: astroOneHome },
    }),
    description: `astro-one profile ${JSON.stringify(profile)}`,
    initializeTimeoutMs: options.initializeTimeoutMs ?? DEFAULT_INITIALIZE_TIMEOUT_MS,
    ...options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: options.requestTimeoutMs },
    ...options.shutdownTimeoutMs === undefined ? {} : { shutdownTimeoutMs: options.shutdownTimeoutMs },
    ...options.disposeEofGraceMs === undefined ? {} : { disposeEofGraceMs: options.disposeEofGraceMs },
    ...options.disposeGraceMs === undefined ? {} : { disposeGraceMs: options.disposeGraceMs },
  }
}
