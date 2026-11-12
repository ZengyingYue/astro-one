import type { DesktopFileActions } from '@astro-one/client-ui-file-actions/types'
/** Typed preload operations exposed only by the Electron shell. */

export type { DesktopChannelState, DesktopChannelChangeResult } from '@astro-one/client-ui-settings-general/types'
import type { DesktopChannelBridge, DesktopChannelState } from '@astro-one/client-ui-settings-general/types'
import type { DesktopKeyboardApi, DesktopShortcutsApi } from '@astro-one/client-shortcuts/protocol'
import type { IpcMainInvokeEvent } from 'electron'
import type { DesktopBrowserBridge } from '@astro-one/client-ui-sidebar-browser/types'
import type { DesktopFileDrag } from '@astro-one/util-file-drag'

/** IPC channel names kept private to the desktop application bundle. */
export const DESKTOP_IPC = {
  fileSave: 'astro-one-desktop:file-save',
  clipboardImageRead: 'astro-one-desktop:clipboard-image-read',
  shortcutsInput: 'astro-one-desktop:shortcuts-input',
  shortcutsCloseWindow: 'astro-one-desktop:shortcuts-close-window',
  shortcutsGet: 'astro-one-desktop:shortcuts-get',
  shortcutsEdit: 'astro-one-desktop:shortcuts-edit',
  shortcutsChanged: 'astro-one-desktop:shortcuts-changed',
  shortcutsRecording: 'astro-one-desktop:shortcuts-recording',
  boot: 'astro-one-desktop:boot',
  enterWorkspace: 'astro-one-desktop:enter-workspace',
  onboardingActive: 'astro-one-desktop:onboarding-active',
  onboardingApiKey: 'astro-one-desktop:onboarding-api-key',
  bootFailed: 'astro-one-desktop:boot-failed',
  browserAcquire: 'astro-one-desktop:browser-acquire',
  browserRelease: 'astro-one-desktop:browser-release',
  browserOpenRequested: 'astro-one-desktop:browser-open-requested',
  directoryPick: 'astro-one-desktop:directory-pick',
  fileDragPrepare: 'astro-one-desktop:file-drag-prepare',
  fileDragCancel: 'astro-one-desktop:file-drag-cancel',
  fileDragStart: 'astro-one-desktop:file-drag-start',
  fileDragRelease: 'astro-one-desktop:file-drag-release',
  deviceInfo: 'astro-one-desktop:device-info',
  localeBootstrap: 'astro-one-desktop:locale-bootstrap',
  localeChanged: 'astro-one-desktop:locale-changed',
  updatesChannelGet: 'astro-one-desktop:updates-channel-get',
  updatesChannelSet: 'astro-one-desktop:updates-channel-set',
  updatesChannelChanged: 'astro-one-desktop:updates-channel-changed',
  updatesStatus: 'astro-one-desktop:updates-status',
  updatesOpen: 'astro-one-desktop:updates-open',
  updatesPresentation: 'astro-one-desktop:updates-presentation',
  nativeThemeSet: 'astro-one-desktop:native-theme-set',
  windowFullscreen: 'astro-one-desktop:window-fullscreen',
  windowsAppearance: 'astro-one-desktop:windows-appearance',
  windowsMenu: 'astro-one-desktop:windows-menu',
} as const

/** Desktop release update state rendered by desktop-owned UI. */
export type DesktopUpdatePreparationFailureKind = 'stop-failed' | 'tasks-changed' | 'tasks-unavailable' | 'fullscreen-timeout'

export interface DesktopUpdateState {
  readonly phase: 'idle' | 'checking' | 'available' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'error'
  readonly version?: string
  readonly message?: string
  /** Main-owned diagnostics without subprocess output or credentials; hidden until expanded. */
  readonly technicalDetails?: string
  readonly percent?: number
  readonly failedOperation?: 'check' | 'download' | 'install' | 'configuration'
  /** Main-owned preparation cause; UI wording is selected by the active locale. */
  readonly preparationFailure?: DesktopUpdatePreparationFailureKind
  /** Current filesystem failure, independent of previous cache cleanup attempts. */
  readonly downloadFailure?: 'space' | 'permission' | 'busy'
}

/** Classified failure copy selected by the Web locale without exposing raw updater diagnostics. */
export type DesktopUpdateFailureKind =
  | 'configuration'
  | 'check'
  | 'check-network'
  | 'download'
  | 'download-network'
  | 'download-space'
  | 'download-permission'
  | 'download-busy'
  | 'install'
  | 'install-network'
  | 'stop-failed'
  | 'tasks-changed'
  | 'tasks-unavailable'
  | 'fullscreen-timeout'

/** Semantic status content; actions open main-process confirmation dialogs only. */
export interface DesktopUpdatePresentation {
  readonly phase: DesktopUpdateState['phase']
  readonly version?: string
  readonly percent?: number
  readonly failure?: DesktopUpdateFailureKind
  readonly configurationError?: DesktopChannelState['error']
}

/** Product documents cannot supply update versions, package URLs, or installation authorization. */
export interface AstroOneDesktopProductApi {
  readonly fileActions: DesktopFileActions
  readonly protocolVersion: 1
  readonly browser: DesktopBrowserBridge
  readonly fileDrag: DesktopFileDrag
  readonly keyboard: DesktopKeyboardApi
  readonly shortcuts: DesktopShortcutsApi
  /**
   * Local machine description for the feedback questionnaire.
   * @returns `name=value` fields separated by `; `, with no hostname, user name, or serial number.
   */
  deviceInfo(): Promise<string>
  readonly updates: {
    readonly channels: DesktopChannelBridge
    status(): Promise<DesktopUpdatePresentation>
    open(): Promise<void>
    subscribe(listener: (state: DesktopUpdatePresentation) => void): () => void
  }
}

/** Scheme of Desktop-owned application documents. */
export const SCHEME = 'astro-one-app'

/**
 * Reject IPC outside the allowed Desktop document origins.
 * @param event - IPC caller whose frame URL supplies the origin.
 * @param hostnames - Desktop document hosts allowed for this operation.
 */
export function assertDesktopSender(event: IpcMainInvokeEvent, hostnames: readonly string[]): void {
  const senderFrame = event.senderFrame
  if (senderFrame === null) throw new Error('astro-one desktop: rejected IPC without a sender frame')
  const url = new URL(senderFrame.url)
  if (url.protocol !== `${SCHEME}:` || !hostnames.includes(url.hostname)) {
    throw new Error('astro-one desktop: rejected IPC from an unowned renderer')
  }
}
