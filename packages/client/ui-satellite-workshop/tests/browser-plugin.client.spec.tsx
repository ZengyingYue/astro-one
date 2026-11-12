// @vitest-environment jsdom
import { Context } from '@astro-one/cordis'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { LocaleRuntime } from '@astro-one/client-locale/client'
import { SlotRegistry } from '@astro-one/client-ui-renderer/client'
import { resolveSlotLabel } from '@astro-one/client-ui-slots'
import { usePinnedBrowserLanguages } from '@astro-one/client-test-runtime'
import { apply as applyHost } from '../src/index.ts'
import { apply, inject, NS, PANEL_ID } from '../src/client/index.ts'
import { SatelliteWorkshopPage, type WorkshopInjected } from '../src/client/SatelliteWorkshopPage.tsx'
import { WorkshopPanelIcon } from '../src/client/WorkshopPanelIcon.tsx'

usePinnedBrowserLanguages('zh-CN')
afterEach(cleanup)

interface World {
  workspaces: { workspaceId: string; sessionIds: string[] }[]
  /** Sessions by id with their main-view retain count. */
  sessions: Record<string, number>
}

/** Load the plugin over stand-ins for the Session, Workspace, and navigation services. */
async function load(world: World) {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const session = {
    beginSubmission: vi.fn(() => ({ requestId: 'request-1', abandon: () => {} })),
    prompt: vi.fn(() => Promise.resolve<{ ok: boolean }>({ ok: true })),
  }
  const services = {
    connectWorkspace: vi.fn((_workspaceId: string) => Promise.resolve('session-new')),
    openSession: vi.fn(),
    binding: vi.fn((_sessionId: string): { session: typeof session } | undefined => ({ session })),
  }
  ctx.provide('workspaces', { list: { getSnapshot: () => ({ items: world.workspaces }) } } as never)
  ctx.provide('sessions', {
    list: {
      getSnapshot: () => ({
        byId: Object.fromEntries(Object.entries(world.sessions).map(([id, mainView]) =>
          [id, { id, retainedBy: mainView > 0 ? { mainView } : {} }])),
      }),
    },
    binding: services.binding,
  } as never)
  ctx.provide('uiWorkspace', { connectWorkspace: services.connectWorkspace, openSession: services.openSession } as never)
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({
    name: 'root',
    children: { 'main': { kind: 'keyed', scope: 'root' }, 'sidebar.panellist': { kind: 'list', scope: 'root' } },
  } as never, () => null)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  const page = slots.entries('main')[0]!
  const evaluate = page.inject?.()['evaluate']
  if (typeof evaluate !== 'function') throw new Error('the page registration injects no evaluate callback')
  const face = { evaluate: evaluate as WorkshopInjected['evaluate'] }
  return { ctx, slots, fiber, page, face, session, ...services }
}

const TWO = { workspaces: [{ workspaceId: 'ws-a', sessionIds: ['s1'] }, { workspaceId: 'ws-b', sessionIds: ['s2'] }] }

describe('ui-satellite-workshop browser plugin', () => {
  it('declares only the services the registrations and the hand-off use', () => {
    expect(inject).toEqual(['slots', 'locale', 'sessions', 'workspaces', 'uiWorkspace'])
    expect(applyHost).not.toThrow()
  })

  it('registers the sidebar entry and the page it opens, and removes both with the plugin', async () => {
    const plugin = await load({ ...TWO, sessions: {} })
    expect(plugin.page.component).toBe(SatelliteWorkshopPage)
    expect(plugin.page.options).toMatchObject({ key: PANEL_ID })
    expect(plugin.page.locale).toBe(NS)
    const icon = plugin.slots.entries('sidebar.panellist')[0]!
    expect(icon.component).toBe(WorkshopPanelIcon)
    expect(icon.options).toMatchObject({ id: PANEL_ID, order: 10 })
    expect(resolveSlotLabel(icon.options.label)).toBe('卫星工坊')
    const unread = (): never => { throw new Error('The sidebar icon must not read application state') }
    const glyph = render(<WorkshopPanelIcon size={18} active={false}
      usePanelInfo={unread} useSessions={unread} useSessionStatus={unread} useSessionRetainInfo={unread}
      useWorkspaces={unread} useResource={unread}
      useRemoteAccess={unread} useSessionAccess={unread} useContextMenu={unread} useWorkspaceAccess={unread} />)
    expect(glyph.container.querySelector('svg')?.getAttribute('width')).toBe('18')

    await plugin.fiber.dispose()
    expect(plugin.slots.entries('main')).toEqual([])
    expect(plugin.slots.entries('sidebar.panellist')).toEqual([])
  })

  it('sends the evaluation as the first prompt of a new session in the workspace on screen', async () => {
    const plugin = await load({ ...TWO, sessions: { s1: 0, s2: 1 } })
    await expect(plugin.face.evaluate('Evaluate this build')).resolves.toBe('sent')
    expect(plugin.connectWorkspace).toHaveBeenCalledWith('ws-b')
    expect(plugin.openSession).toHaveBeenCalledWith('session-new')
    expect(plugin.binding).toHaveBeenCalledWith('session-new')
    expect(plugin.session.beginSubmission).toHaveBeenCalledWith({ mode: 'queue', text: 'Evaluate this build', attachments: [] })
    expect(plugin.session.prompt).toHaveBeenCalledWith([{ type: 'text', text: 'Evaluate this build' }], 'queue', undefined, 'request-1')
  })

  it('uses the first workspace when no session is on screen', async () => {
    const plugin = await load({ ...TWO, sessions: { s1: 0 } })
    await expect(plugin.face.evaluate('prompt')).resolves.toBe('sent')
    expect(plugin.connectWorkspace).toHaveBeenCalledWith('ws-a')
    // A session on screen that belongs to no workspace also falls back to the first one.
    const ungrouped = await load({ ...TWO, sessions: { s9: 1 } })
    await ungrouped.face.evaluate('prompt')
    expect(ungrouped.connectWorkspace).toHaveBeenCalledWith('ws-a')
  })

  it('reports a missing workspace without creating a session', async () => {
    const plugin = await load({ workspaces: [], sessions: { s1: 1 } })
    await expect(plugin.face.evaluate('prompt')).resolves.toBe('noWorkspace')
    expect(plugin.connectWorkspace).not.toHaveBeenCalled()
  })

  it('reports a refused prompt, an unbound session, and a failed session creation', async () => {
    const refused = await load({ ...TWO, sessions: {} })
    refused.session.prompt.mockResolvedValueOnce({ ok: false })
    await expect(refused.face.evaluate('prompt')).resolves.toBe('failed')

    const unbound = await load({ ...TWO, sessions: {} })
    unbound.binding.mockReturnValueOnce(undefined)
    await expect(unbound.face.evaluate('prompt')).resolves.toBe('failed')
    expect(unbound.session.prompt).not.toHaveBeenCalled()

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    onTestFinished(() => { warn.mockRestore() })
    const broken = await load({ ...TWO, sessions: {} })
    const failure = new Error('host refused')
    broken.connectWorkspace.mockRejectedValueOnce(failure)
    await expect(broken.face.evaluate('prompt')).resolves.toBe('failed')
    expect(warn).toHaveBeenCalledWith('satellite workshop: evaluation was not sent:', failure)
    expect(broken.openSession).not.toHaveBeenCalled()
  })
})
