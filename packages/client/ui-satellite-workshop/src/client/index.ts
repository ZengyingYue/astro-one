/**
 * Satellite workshop, browser half: the **Satellite workshop** entry of the
 * sidebar and the page it opens in the main column. The page assembles a
 * satellite from the part catalog on a 3D bench, budgets the build in the
 * browser, and sends the build to the model as the first prompt of a new
 * Session, so the evaluation is an ordinary logged conversation.
 */

import type {} from '@astro-one/client-locale/client'
import type { Context as ClientContext } from '@astro-one/cordis'
import type {} from '@astro-one/api-session-controller/client'
import type {} from '@astro-one/api-workspace-controller/client'
// Type-only: the root `main` keyed slot the page registers into, declared by
// ui-layout with the panel id brand, and the `sidebar.panellist` list the
// entry registers into, declared by ui-sidebar.
import type { MainPanelId } from '@astro-one/client-ui-layout/client'
import type {} from '@astro-one/client-ui-renderer/client'
import type {} from '@astro-one/client-ui-sidebar/client'
// Type-only: the `uiWorkspace` navigation service.
import type {} from '@astro-one/client-ui-workspace/client'
import { createWorkshopStore } from './assembly.ts'
import { en, zh, type WorkshopLocaleKey } from './locales.ts'
import { SatelliteWorkshopPage, type EvaluateOutcome, type WorkshopInjected } from './SatelliteWorkshopPage.tsx'
import { WorkshopPanelIcon } from './WorkshopPanelIcon.tsx'

export type { EvaluateOutcome, SatelliteWorkshopPageProps, WorkshopInjected } from './SatelliteWorkshopPage.tsx'
export type { WorkshopLocaleKey } from './locales.ts'
export { createWorkshopStore } from './assembly.ts'

declare module '@astro-one/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Satellite workshop copy. */
    'satelliteWorkshop': WorkshopLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'satelliteWorkshop'

/** The id shared by the sidebar entry and the main panel it opens. */
export const PANEL_ID = 'satellite-workshop' as MainPanelId

/** Services the registrations and the evaluation hand-off use. */
export const inject = ['slots', 'locale', 'sessions', 'workspaces', 'uiWorkspace']

/**
 * Contribute the Satellite workshop entry to the sidebar with the page it opens.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-satellite-workshop: dictionaries')
  const t = ctx.locale.bind(NS)

  // The evaluation opens a blank Session in the Workspace of the Session on
  // screen, or in the first Workspace, and submits the prompt there.
  const evaluate = async (prompt: string): Promise<EvaluateOutcome> => {
    const workspaces = ctx.workspaces.list.getSnapshot().items
    const shown = Object.values(ctx.sessions.list.getSnapshot().byId)
      .find(session => (session.retainedBy.mainView ?? 0) > 0)
    const workspace = workspaces.find(item => shown !== undefined && item.sessionIds.includes(shown.id)) ?? workspaces[0]
    if (workspace === undefined) return 'noWorkspace'
    try {
      const sessionId = await ctx.uiWorkspace.connectWorkspace(workspace.workspaceId)
      ctx.uiWorkspace.openSession(sessionId)
      const session = ctx.sessions.binding(sessionId)?.session
      if (session === undefined) return 'failed'
      const submission = session.beginSubmission({ mode: 'queue', text: prompt, attachments: [] })
      const result = await session.prompt([{ type: 'text', text: prompt }], 'queue', undefined, submission.requestId)
      return result.ok ? 'sent' : 'failed'
    } catch (error: unknown) {
      console.warn('satellite workshop: evaluation was not sent:', error)
      return 'failed'
    }
  }

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    store: createWorkshopStore(),
    inject: (): WorkshopInjected => ({ evaluate }),
  }, SatelliteWorkshopPage))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 10,
    label: () => t('panel'),
    locale: NS,
  }, WorkshopPanelIcon))
}
