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

/** Required Cordis services whose Host imports are type-only. */
const REQUIRED_SERVICE_PEERS = {
  '@astro-one/api-terminal-controller': ['@astro-one/subprocess'],
} as const satisfies Readonly<Record<string, readonly string[]>>

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
  '@astro-one/util-code-language',
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
  '@astro-one/atomic-write': ['withFileLock', 'writeFileAtomic'],
  '@astro-one/computer-use/brand': ['ComputerUseProviderName'],
  '@astro-one/credentials': ['credentialKey'],
  '@astro-one/deque': ['Deque'],
  // Builds a dispatcher from the resolved proxy policy; the caller owns and closes it.
  '@astro-one/http-proxy': ['createRouteDispatcher'],
  // The Liveshare wire codec and identity helpers are stateless functions over caller-owned values.
  '@astro-one/experimental-liveshare-protocol': [
    'LIVESHARE_CAPABILITIES', 'LIVESHARE_PROTOCOL_VERSION', 'parseRelayFrame', 'parseShareAccessState',
    'parseTunnelWorkerCommand', 'parseTunnelWorkerEvent', 'rawText', 'sendFrame', 'unsupportedFrameRefusal',
    'viewerRequestFields', 'identityFromKey', 'identityKeyOf',
  ],
  // The shipped profile templates are plain data; a consumer reads their bundle names only.
  '@astro-one/official-bundles': ['PROFILE_TEMPLATES'],
  '@astro-one/llm': ['callConfigEquals'],
  '@astro-one/session': ['SessionId'],
  '@astro-one/session-format': ['sessionFormatLogFilename'],
  '@astro-one/storage-domain': ['defineDomain'],
  '@astro-one/timeout': ['MAX_TIMER_DELAY_MS'],
  '@astro-one/schemastery': ['default'],
} as const satisfies HostDependencyExports

/** Runtime exports that require every consumer to resolve the provider's shared peer instance. */
const PEER_REQUIRED_HOST_EXPORTS = {
  // Profile settings must match the installed Node provider's configuration schema.
  '@astro-one/ptc-runtime-node/configuration': ['resolvePersistentExecution'],
  // CUA checks UserQuestionError and preserves AttachmentError from image admission.
  '@astro-one/attachment': ['admitEncodedImages'],
  '@astro-one/user-questions': ['UserQuestionError'],
  // `instanceof` checks need the translator's own class instance.
  '@astro-one/experimental-translator': ['TranslationError'],
  // Stateless; a safe classification would turn the forge panel's forge and worktree peers into dependencies.
  '@astro-one/experimental-forge': ['changeRequestKey'],
  '@astro-one/experimental-worktree': ['generatedWorktreeName'],
  // The forge panel matches ctx.fs failures with `instanceof FsError`.
  '@astro-one/fs': ['FsError'],
  '@astro-one/scope': ['carrierKeyOf', 'createScope', 'scopeOf', 'scopeTarget'],
  // appendPluginRecord writes through the Session class's private log; pluginRecordOf is stateless.
  '@astro-one/session': ['SESSION_FORMAT_VERSION', 'appendPluginRecord', 'pluginRecordOf'],
  '@astro-one/session-persistence': ['SessionPersistenceNotFoundError'],
  // Readers recognize a deadline's TimeoutReason only by `instanceof` against their own copy.
  '@astro-one/timeout': ['deadline'],
} as const satisfies HostDependencyExports

/** Exact import specifier to reviewed runtime exports. */
type HostDependencyExports = Readonly<Record<string, readonly string[]>>

/** Complete configurable input to package dependency classification. */
export interface PackageDependencyPolicy {
  readonly clientFaceInclude: readonly string[]
  readonly clientFaceExclude: readonly string[]
  readonly hostPackages: readonly string[]
  readonly requiredServicePeers?: Readonly<Record<string, readonly string[]>>
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
  requiredServicePeers: REQUIRED_SERVICE_PEERS,
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
