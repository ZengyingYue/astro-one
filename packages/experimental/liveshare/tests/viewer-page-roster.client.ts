/**
 * Test-only client roster of the assembled viewer page.
 *
 * A served viewer page is the owner's own Web shell with the owner's client plugins; this roster is the
 * subset the viewer page specs need: the wire plugin, the Gateway, remote access, the Session/Workspace controllers,
 * the menu service, presentation plugins, and the Liveshare `./client` face, which mounts the viewer surfaces when the
 * carrier names a share. Every row is the package's own `/client` face registered as a module-table
 * factory. It must be imported only after {@link prepareViewerRemoteFaces} answered the generated
 * `/remote` faces these plugins import.
 *
 * @module @astro-one/experimental-liveshare/tests/viewer-page-roster
 */

import * as apiGateway from '@astro-one/api-gateway/client'
import * as apiRemoteAccess from '@astro-one/api-remote-access/client'
import * as apiRemotes from '@astro-one/api-remotes/client'
import * as apiSessionController from '@astro-one/api-session-controller/client'
import * as apiWorkspaceController from '@astro-one/api-workspace-controller/client'
import * as clientConnection from '@astro-one/client-connection/client'
import * as clientFileUpload from '@astro-one/client-file-upload/client'
import * as clientLocale from '@astro-one/client-locale/client'
import * as clientModules from '@astro-one/client-modules/client'
import * as clientResources from '@astro-one/client-resources/client'
import * as clientShortcuts from '@astro-one/client-shortcuts/client'
import * as uiAttachment from '@astro-one/client-ui-attachment/client'
import * as uiChat from '@astro-one/client-ui-chat/client'
import * as uiContextMenu from '@astro-one/client-ui-context-menu/client'
import * as uiConversation from '@astro-one/client-ui-conversation/client'
import * as uiDeliverables from '@astro-one/client-ui-deliverables/client'
import * as uiFileDrag from '@astro-one/client-ui-file-drag/client'
import * as uiLayout from '@astro-one/client-ui-layout/client'
import * as uiRenderer from '@astro-one/client-ui-renderer/client'
import * as uiSession from '@astro-one/client-ui-session/client'
import * as uiSettings from '@astro-one/client-ui-settings/client'
import * as uiSidebar from '@astro-one/client-ui-sidebar/client'
import * as uiSidebarRight from '@astro-one/client-ui-sidebar-right/client'
import * as uiTheme from '@astro-one/client-ui-theme/client'
import * as uiTool from '@astro-one/client-ui-tool/client'
import * as uiTrajectory from '@astro-one/client-ui-trajectory/client'
import * as uiWorkspace from '@astro-one/client-ui-workspace/client'
import * as typertRegistry from '@astro-one/typert-registry/client'
import * as liveshare from '../src/client/index.ts'

/** One module-table row: the entry id the Loader creates, and that plugin's client exports. */
export interface ViewerPageRosterRow {
  readonly id: string
  readonly exports: Readonly<Record<string, unknown>>
}

/** Entry id of the module-system bootstrap whose exports the facade hands to the module system. */
export const VIEWER_PAGE_BOOTSTRAP_ID = '@astro-one/client-modules'

/** The viewer page roster; Cordis composes these entries by service injection, so order is irrelevant. */
export const VIEWER_PAGE_ROSTER: readonly ViewerPageRosterRow[] = [
  { id: '@astro-one/typert-registry', exports: typertRegistry },
  { id: '@astro-one/experimental-liveshare', exports: liveshare },
  { id: VIEWER_PAGE_BOOTSTRAP_ID, exports: clientModules },
  { id: '@astro-one/client-connection', exports: clientConnection },
  { id: '@astro-one/api-gateway', exports: apiGateway },
  { id: '@astro-one/api-remote-access', exports: apiRemoteAccess },
  { id: '@astro-one/api-remotes', exports: apiRemotes },
  { id: '@astro-one/api-session-controller', exports: apiSessionController },
  { id: '@astro-one/api-workspace-controller', exports: apiWorkspaceController },
  { id: '@astro-one/client-file-upload', exports: clientFileUpload },
  { id: '@astro-one/client-locale', exports: clientLocale },
  { id: '@astro-one/client-resources', exports: clientResources },
  { id: '@astro-one/client-shortcuts', exports: clientShortcuts },
  { id: '@astro-one/client-ui-renderer', exports: uiRenderer },
  { id: '@astro-one/client-ui-theme', exports: uiTheme },
  { id: '@astro-one/client-ui-settings', exports: uiSettings },
  { id: '@astro-one/client-ui-layout', exports: uiLayout },
  { id: '@astro-one/client-ui-session', exports: uiSession },
  { id: '@astro-one/client-ui-sidebar', exports: uiSidebar },
  { id: '@astro-one/client-ui-conversation', exports: uiConversation },
  { id: '@astro-one/client-ui-chat', exports: uiChat },
  { id: '@astro-one/client-ui-context-menu', exports: uiContextMenu },
  { id: '@astro-one/client-ui-tool', exports: uiTool },
  { id: '@astro-one/client-ui-attachment', exports: uiAttachment },
  { id: '@astro-one/client-ui-file-drag', exports: uiFileDrag },
  { id: '@astro-one/client-ui-sidebar-right', exports: uiSidebarRight },
  { id: '@astro-one/client-ui-trajectory', exports: uiTrajectory },
  { id: '@astro-one/client-ui-deliverables', exports: uiDeliverables },
  { id: '@astro-one/client-ui-workspace', exports: uiWorkspace },
]
