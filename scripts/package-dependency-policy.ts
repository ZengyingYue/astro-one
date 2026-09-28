/** Explicit exceptions and Host packages for the published dependency policy. */

/** Packages treated as Client/Host packages without declaring `astroOne.client`. */
const CLIENT_FACE_INCLUDE: readonly string[] = []

/** Packages exempted from automatic Client/Host treatment despite declaring `astroOne.client`. */
const CLIENT_FACE_EXCLUDE: readonly string[] = [
  '@astro-one/api-session-controller',
  '@astro-one/api-workspace-controller',
]

/** Host-only packages whose peer relays are deliberately flattened. */
const HOST_DEPENDENCY_PACKAGES: readonly string[] = [
  '@astro-one/llm',
  '@astro-one/session',
]

/** Development-only package relationships not represented by source imports. */
const CONFIGURATION_ONLY_DEV_DEPENDENCIES = {
  '@astro-one/client-locale': ['@astro-one/api-remotes'],
  '@astro-one/client-ui-conversation': [
    '@astro-one/api-remotes',
    '@astro-one/client-ui-workspace',
  ],
  '@astro-one/client-ui-model-selection': ['@astro-one/client-ui-input-trigger'],
  '@astro-one/client-ui-sidebar': ['@astro-one/client-ui-workspace'],
  '@astro-one/client-ui-subagent': ['@astro-one/client-ui-input-trigger'],
  '@astro-one/client-ui-theme': ['@astro-one/api-remotes'],
  '@astro-one/client-ui-tool': ['@astro-one/api-remotes'],
} as const satisfies Readonly<Record<string, readonly string[]>>

/** Workspace packages whose complete runtime surface is safe across duplicate installations. */
const DUPLICATE_SAFE_PACKAGES: readonly string[] = [
  '@astro-one/brand',
  '@astro-one/lazy-require',
  '@astro-one/typert-protocol',
  '@astro-one/util-crypto',
  '@astro-one/util-values',
]

/**
 * Runtime exports whose values remain valid when npm installs another package copy.
 * New entries are forbidden by default. Automated agents must not add an
 * exception; every addition requires explicit human review and a dedicated,
 * prominent heading in the pull request description.
 */
const SAFE_HOST_DEPENDENCY_EXPORTS = {
  '@astro-one/credentials': ['credentialKey'],
  '@astro-one/deque': ['Deque'],
  '@astro-one/llm': ['callConfigEquals'],
  '@astro-one/session-format': ['sessionFormatLogFilename'],
  '@astro-one/timeout': ['MAX_TIMER_DELAY_MS'],
  '@astro-one/schemastery': ['default'],
} as const satisfies HostDependencyExports

/** Runtime exports that require every consumer to resolve the provider's shared peer instance. */
const PEER_REQUIRED_HOST_EXPORTS = {
  '@astro-one/client-connection': ['OperatorPeer'],
  '@astro-one/subprocess': ['SubprocessExecutableNotFoundError'],
  '@astro-one/scope': ['carrierKeyOf', 'createScope', 'scopeOf', 'scopeTarget'],
  '@astro-one/session': ['SESSION_FORMAT_VERSION'],
  '@astro-one/session-persistence': ['SessionPersistenceNotFoundError'],
} as const satisfies HostDependencyExports

/** Exact import specifier to reviewed runtime exports. */
type HostDependencyExports = Readonly<Record<string, readonly string[]>>

/** Complete configurable input to package dependency classification. */
export interface PackageDependencyPolicy {
  readonly clientFaceInclude: readonly string[]
  readonly clientFaceExclude: readonly string[]
  readonly hostPackages: readonly string[]
  readonly configurationOnlyDevDependencies: Readonly<Record<string, readonly string[]>>
  readonly duplicateSafePackages?: readonly string[]
  readonly safeHostDependencyExports: HostDependencyExports
  readonly peerRequiredHostExports: HostDependencyExports
}

/** Repository dependency policy consumed by verification and benchmarking. */
export const PACKAGE_DEPENDENCY_POLICY: PackageDependencyPolicy = {
  clientFaceInclude: CLIENT_FACE_INCLUDE,
  clientFaceExclude: CLIENT_FACE_EXCLUDE,
  hostPackages: HOST_DEPENDENCY_PACKAGES,
  configurationOnlyDevDependencies: CONFIGURATION_ONLY_DEV_DEPENDENCIES,
  duplicateSafePackages: DUPLICATE_SAFE_PACKAGES,
  safeHostDependencyExports: SAFE_HOST_DEPENDENCY_EXPORTS,
  peerRequiredHostExports: PEER_REQUIRED_HOST_EXPORTS,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether a package manifest declares a dynamically loaded Client entry. */
export function hasClientDeclaration(astroOneField: unknown): boolean {
  return isRecord(astroOneField) && Object.hasOwn(astroOneField, 'client')
}

/** Whether the repository policy flattens one package's non-Cordis peers. */
export function usesFlattenedPackageDependencies(
  manifestPath: string,
  packageName: string,
  astroOneField: unknown,
  policy: PackageDependencyPolicy = PACKAGE_DEPENDENCY_POLICY,
): boolean {
  if (!manifestPath.startsWith('packages/') || manifestPath.startsWith('packages/experimental/')) return false
  if (policy.hostPackages.includes(packageName)) return true
  if (manifestPath.startsWith('packages/client/')) return true
  const included = hasClientDeclaration(astroOneField) || policy.clientFaceInclude.includes(packageName)
  return included && !policy.clientFaceExclude.includes(packageName)
}
