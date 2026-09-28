/** Platform-neutral assembly of generated Host Remote contributions. */

import type { Context } from '@astro-one/cordis'
import agentPresetsRemote from '@astro-one/agent-preset-registry/remote'
import commandsRemote from '@astro-one/commands/remote'
import accountRemote from '@astro-one/api-account-controller/remote'
import settingsControllerRemote from '@astro-one/api-settings-controller/remote'
import officeToPdfRemote from '@astro-one/office-to-pdf/remote'
import goalsRemote from '@astro-one/goal/remote'
import llmRemote from '@astro-one/llm/remote'
import dynamicRemote from '@astro-one/cordis-host-runner/remote'
import pluginManagerRemote from '@astro-one/plugin-manager/remote'
import pluginRegistryProbeRemote from '@astro-one/client-ui-plugin-manager/remote'
import pluginInventoryRemote from '@astro-one/host-plugin-inventory/remote'
import messageFeedbackRemote from '@astro-one/message-feedback/remote'
import permissionPresetsRemote from '@astro-one/permission-presets/remote'
import sessionFeedbackRemote from '@astro-one/command-feedback/remote'
import fileUploadsRemote from '@astro-one/client-file-upload/remote'
import sessionReferencesRemote from '@astro-one/session-reference/remote'
import subagentsRemote from '@astro-one/subagent/remote'
import sessionRemote from '@astro-one/api-session-controller/remote'
import jobRemote from '@astro-one/api-job-controller/remote'
import workspaceRemote from '@astro-one/api-workspace-controller/remote'
import terminalRemote from '@astro-one/api-terminal-controller/remote'
import workspaceFilesRemote from '@astro-one/api-workspace-files/remote'
import type { ClientRemote } from '@astro-one/api-gateway/client'

export type { ClientRemote } from '@astro-one/api-gateway/client'
export type {
  BundleInfo, BundleRowInfo, ChangeResult, IncompatiblePlugin, InspectOptions, InstallBundleOptions, InstallSpecKind, ManagementError,
  PackageResult,
  PluginChange, PluginEntryId, PluginInfo, PluginInspectProblem, PluginInstallCancellation, PluginInstallFailureKind,
  PluginInstallLogChunk, PluginInstallProgress, PluginInstallRequestId, PluginRegistries, PluginSpecInspection, ReadOnlyReason, Registry,
} from '@astro-one/plugin-manager/types'
export type {} from '@astro-one/plugin-manager/remote'
export type {} from '@astro-one/client-ui-plugin-manager/remote'
export type { PluginInventorySnapshot } from '@astro-one/host-plugin-inventory/types'
export type {} from '@astro-one/agent-preset-registry/remote'
export type {} from '@astro-one/commands/remote'
export type {} from '@astro-one/api-settings-controller/remote'
export type {} from '@astro-one/api-account-controller/remote'
export type {} from '@astro-one/goal/remote'
export type {} from '@astro-one/office-to-pdf/remote'
export type {} from '@astro-one/llm/remote'
export type {} from '@astro-one/host-plugin-inventory/remote'
export type {} from '@astro-one/message-feedback/remote'
export type {} from '@astro-one/permission-presets/remote'
export type {} from '@astro-one/command-feedback/remote'
export type {} from '@astro-one/client-file-upload/remote'
export type {} from '@astro-one/session-reference/remote'
export type {} from '@astro-one/subagent/remote'
export type * from '@astro-one/subagent/client'
export type {} from '@astro-one/api-session-controller/remote'
export type * from '@astro-one/api-session-controller/types'
export type {} from '@astro-one/api-job-controller/remote'
export type * from '@astro-one/api-job-controller/types'
export type {} from '@astro-one/api-workspace-controller/remote'
export type * from '@astro-one/api-workspace-controller/types'
export type {} from '@astro-one/api-workspace-files/remote'
export type * from '@astro-one/api-workspace-files/types'
export type {} from '@astro-one/api-terminal-controller/remote'
export type * from '@astro-one/api-terminal-controller/types'
// The forwarded-event allowlist's selection seat: without it in the consumer's
// compilation face `TypertRemoteEvent` is `never` and every `$on` call fails.
export type { ApiRemoteForwardedEvent } from '../types.ts'
// The owner packages' client-safe `./types` exports supply the `Events`
// signatures `$on` hands to a listener, so a consumer reads the very
// declaration the Host emits rather than a flattened restatement of it.
export type {} from '@astro-one/commands/types'
export type {} from '@astro-one/cordis-host-runner/types'
export type {} from '@astro-one/credentials/types'
export type {} from '@astro-one/llm/types'
export type {} from '@astro-one/agent-preset-registry/types'
export type {} from '@astro-one/permission-presets/types'
export type {} from '@astro-one/settings/types'
export type {} from '@astro-one/user-approval/types'
export type {} from '@astro-one/user-questions/types'
export type {} from '@astro-one/api-session-controller/types'

/**
 * The carrier's Client-facing types, re-exported so a business package names one
 * assembly package instead of both this facade and the Connection plugin. Type-only:
 * the carrier's runtime values stay behind their own module edge.
 */
export type {
  ConnectionHandle, ConnectionSinks, ContentBlock,
  MessageId,
  RpcId, RpcRequest, RpcResponse, RpcResult, SessionId,
  StreamChunk,
} from '@astro-one/client-connection/client'
export type {} from '@astro-one/api-gateway/client'
export type {} from '@astro-one/cordis-host-runner/remote'

// The payload vocabulary of the selected namespaces, re-exported so a Client
// contribution can name what it sends and receives without importing a Host
// package: this assembly is the one place both planes legitimately meet.
export type {
  ApprovalRequestId,
  CordisHalfState,
  CordisDynamicPackageId,
  CordisDynamicPluginId,
  CordisDynamicPluginRunId,
  CordisDynamicRunMode,
  CordisInspectMethodManifest,
  CordisInspectPlatform,
  CordisInspectProviderManifest,
  CordisInspectProviderView,
  CordisInspectQueryRequest,
  CordisInspectQueryResolution,
  CordisInspectQueryResolved,
  CordisInspectRequestId,
  CordisInspectResolveAck,
  CordisRunDiagnostic,
  CordisRunStatus,
  DynamicCordisClientSource,
  DynamicCordisHostHalfResult,
  DynamicCordisInventoryRow,
  DynamicCordisInvokeResult,
  DynamicCordisPackage,
  DynamicCordisRequestResolved,
  DynamicCordisResolveAck,
  DynamicCordisRetracted,
  DynamicCordisRunRequest,
  DynamicCordisRunResolution,
  DynamicCordisRunAttempt,
  DynamicCordisRunResponse,
  DynamicCordisStopResponse,
  DynamicCordisUndefineReceipt,
  RequestRunOutcome,
} from '@astro-one/cordis-host-runner/types'
// Credential state vocabulary for the credentials namespace (values never ride it).
export type { CredentialInfo } from '@astro-one/credentials/types'
// Redacted namespace vocabulary for the settings namespace (secrets never ride
// it). It travels with its seam, whose `./types` the Client face already reads.
export type {
  SettingsDescribeValue, SettingsNamespaceView, SettingsPathOpView, SettingsSecretView,
} from '@astro-one/settings/types'
// Provider registry and discovery vocabulary for the llm namespace.
export type {
  LlmConfigurableProvider, LlmDiscoveredModel,
  LlmModelDiscoveryRequest, LlmProviderInfo,
} from '@astro-one/llm/types'
// Reference-discovery result vocabulary for the fileReferences and
// sessionReferenceResolver namespaces.
export type { FileReferenceCandidate } from '@astro-one/file-reference/types'
export type { SessionReferenceMentionCandidate } from '@astro-one/session-reference/types'

// The Remote failure vocabulary, re-exported so business packages keep naming
// this assembly alone. Types only: a value export would make spec imports load
// this module's owner /remote artifacts; specs take RemoteError from
// astro-one-client-test-runtime instead.
export type {
  RemoteErrorCode, RemoteErrorDetailsMap, RemoteFailure, RemoteResult,
} from '@astro-one/typert-protocol'
export type { RemoteHostFacts } from '@astro-one/api-gateway/client'

declare module '@astro-one/cordis' {
  interface Context {
    /** Generated Remote namespaces selected by this Client assembly. */
    remote: ClientRemote
  }
}

/** Required service: the typed Client Remote contribution mount. */
export const inject = ['remote']

/**
 * Mount the Host capabilities explicitly selected for this Client assembly.
 * @param ctx - Client Cordis root carrying the typed API service.
 * @returns disposer after every selected Remote namespace is ready.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposers: Array<() => Promise<void>> = []
  try {
    for (const contribution of [
      agentPresetsRemote, commandsRemote, settingsControllerRemote, accountRemote, goalsRemote, llmRemote, dynamicRemote,
      pluginInventoryRemote, pluginManagerRemote, pluginRegistryProbeRemote, messageFeedbackRemote, sessionFeedbackRemote,
      fileUploadsRemote, sessionReferencesRemote,
      permissionPresetsRemote, subagentsRemote, sessionRemote, jobRemote, workspaceRemote, workspaceFilesRemote, terminalRemote,
      officeToPdfRemote,
    ]) {
      disposers.push(await ctx.remote.$mount(contribution))
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) await dispose()
    throw error
  }
  // Unwound in reverse mount order, so a namespace never outlives one mounted
  // after it.
  return async () => {
    for (const dispose of disposers.reverse()) await dispose()
  }
}
