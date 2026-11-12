// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import { bindSnapshotSelector } from '@astro-one/client-test-runtime'
import { createWorkshopStore } from '../src/client/assembly.ts'
import { SatelliteWorkshopPage, type EvaluateOutcome } from '../src/client/SatelliteWorkshopPage.tsx'
import { PART_DRAG_TYPE } from '../src/client/drag.ts'
import { tEn } from './locale.client.ts'
import { recordingRenderer, useBenchDom } from './dom.client.ts'

const dom = useBenchDom()
afterEach(cleanup)

const unread = (): never => { throw new Error('The workshop page must not read application state') }

async function open(evaluate: (prompt: string) => Promise<EvaluateOutcome> = () => Promise.resolve('sent')) {
  const store = createWorkshopStore().create(`page-${Math.random()}`)
  const recording = recordingRenderer()
  render(
    <SatelliteWorkshopPage
      t={tEn as never}
      useStore={bindSnapshotSelector(store)}
      actions={store.actions}
      evaluate={evaluate}
      createRenderer={recording.create}
      usePanelInfo={unread} useSessions={unread} useSessionStatus={unread} useSessionRetainInfo={unread}
      useWorkspaces={unread} useResource={unread}
      useRemoteAccess={unread} useSessionAccess={unread} useContextMenu={unread} useWorkspaceAccess={unread}
    />,
  )
  const canvas = await screen.findByRole('application') as HTMLCanvasElement
  const frame = (): void => { act(() => { dom.frame() }) }
  frame()
  const click = (at: { clientX: number; clientY: number }): void => {
    fireEvent.pointerDown(canvas, { ...at, button: 0, pointerId: 1 })
    fireEvent.pointerUp(canvas, { ...at, pointerId: 1 })
    frame()
  }
  const key = (name: string): void => { fireEvent.keyDown(canvas, { key: name }); frame() }
  const hint = (): string => screen.getAllByRole('status')[0]!.textContent
  const mounted = (): string[] => within(screen.getByText('Mounted parts').parentElement!).queryAllByRole('listitem')
    .map(item => item.textContent.replace('×', ''))
  return { store, canvas, click, key, hint, mounted, frame, ...recording }
}

const button = (name: string | RegExp): HTMLButtonElement => screen.getByRole('button', { name })

describe('satellite workshop page', () => {
  it('opens on the Earth-observation build with its budgets and a clean rule check', async () => {
    const page = await open()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Satellite assembly workshop')
    expect(button('LEO Earth observation').className).toContain('active')
    expect(screen.getByText('wet 174 / limit 240 kg (dry 134 kg)')).toBeTruthy()
    expect(screen.getByText('generation 832 / load 192 W')).toBeTruthy()
    expect(screen.getByText('Every rule passes')).toBeTruthy()
    expect(page.mounted()).toHaveLength(10)
    expect(page.mounted()[2]).toBe('Nadir faceWide-swath multispectral camera')
    expect(page.hint()).toContain('Click or drag a part from the bin')
  })

  it('judges the same build against another mission and another bus', async () => {
    const page = await open()
    fireEvent.click(button('GEO communications'))
    expect(screen.getByRole('heading', { level: 2, name: 'GEO communications' })).toBeTruthy()
    expect(screen.getByText('The payload this mission needs is missing')).toBeTruthy()
    expect(screen.getByText('The geomagnetic field on this orbit is too weak for the magnetorquers')).toBeTruthy()
    fireEvent.click(button('Microsatellite bus (50 kg class)'))
    expect(page.store.getSnapshot().busId).toBe('bus-micro')
    expect(screen.getByText(/exceeds the bus limit of 60 kg/)).toBeTruthy()
  })

  it('picks a part up from the bin and mounts it on the clicked slot', async () => {
    const page = await open()
    fireEvent.click(button('Remove X-band downlink antenna'))
    expect(screen.getByText('Average downlink 0.16 Mbps is below the 8 Mbps the payloads produce')).toBeTruthy()
    fireEvent.click(button('Pick up Ka-band high-gain antenna'))
    expect(button('Pick up Ka-band high-gain antenna').getAttribute('aria-pressed')).toBe('true')
    expect(page.hint()).toContain('Holding Ka-band high-gain antenna')
    page.frame()
    page.click(page.slot('ram-1'))
    expect(page.store.getSnapshot()).toMatchObject({ held: null, focus: 'ram-1' })
    expect(page.mounted()).toContain('Ram faceKa-band high-gain antenna')
    expect(page.hint()).toBe('Ram face: Ka-band high-gain antenna')
    // Clicking the held part again puts it down; a click on empty space clears the slot cursor.
    fireEvent.click(button('Pick up Star tracker'))
    fireEvent.click(button('Pick up Star tracker'))
    expect(page.store.getSnapshot().held).toBeNull()
    page.click(page.space)
    expect(page.store.getSnapshot().focus).toBeNull()
  })

  it('mounts a double-clicked or dropped part on the first free slot, and says when none is free', async () => {
    const page = await open()
    fireEvent.doubleClick(button('Pick up Li-ion battery (160 Wh)'))
    expect(page.mounted()).toContain('Internal bay 4Li-ion battery (160 Wh)')
    fireEvent.doubleClick(button('Pick up Small deployable solar wing'))
    expect(screen.getByRole('alert').textContent).toBe('No free slot fits Small deployable solar wing')

    const transfer = { setData: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(button('Pick up Deployable radiator'), { dataTransfer: transfer })
    expect(transfer.setData).toHaveBeenCalledWith(PART_DRAG_TYPE, 'radiator')
    expect(transfer.effectAllowed).toBe('copy')
    const drop = (partId: string, at: { clientX: number; clientY: number }): void => {
      const event = createEvent.drop(page.canvas, { dataTransfer: { types: [PART_DRAG_TYPE], getData: () => partId } })
      Object.defineProperties(event, { clientX: { value: at.clientX }, clientY: { value: at.clientY } })
      fireEvent(page.canvas, event)
    }
    fireEvent.click(button('Remove X-band downlink antenna'))
    drop('radiator', page.space)
    expect(page.mounted()).toContain('Ram faceDeployable radiator')
    drop('laser', page.slot('zenith-1'))
    expect(page.mounted()).toContain('Zenith face 1Laser communication terminal')
    const before = page.mounted()
    drop('not-a-part', page.space)
    expect(page.mounted()).toEqual(before)
  })

  it('drives the build from the keyboard', async () => {
    const page = await open()
    page.key('Enter')
    page.key('Delete')
    expect(page.mounted()).toHaveLength(10)
    page.key('e')
    expect(page.hint()).toBe('Left wing hinge: Medium deployable solar wing')
    page.key('Delete')
    expect(page.hint()).toBe('Left wing hinge: empty')
    expect(screen.getByText(/A single solar wing/)).toBeTruthy()
    fireEvent.click(button('Pick up Large deployable solar wing'))
    page.key('Enter')
    expect(page.mounted()[0]).toBe('Left wing hingeLarge deployable solar wing')
    fireEvent.click(button('Pick up Star tracker'))
    page.key('Escape')
    expect(page.store.getSnapshot().held).toBeNull()
    page.key('x')
    expect(button('Assembled view').getAttribute('aria-pressed')).toBe('true')
  })

  it('moves and removes parts with the pointer on the bench and from the mounted list', async () => {
    const page = await open()
    const from = page.part('zenith-1')
    fireEvent.pointerDown(page.canvas, { ...from, button: 0, pointerId: 1 })
    fireEvent.pointerMove(page.canvas, { clientX: from.clientX + 10, clientY: from.clientY, pointerId: 1 })
    fireEvent.pointerUp(page.canvas, { ...page.part('zenith-2'), pointerId: 1 })
    expect(page.store.getSnapshot().mounts).toMatchObject({ 'zenith-1': 'ant-s', 'zenith-2': 'star-tracker' })
    page.frame()
    fireEvent.contextMenu(page.canvas, page.part('zenith-2'))
    expect(page.store.getSnapshot().mounts['zenith-2']).toBeUndefined()

    fireEvent.click(screen.getByText('Aft thrust plate'))
    expect(page.store.getSnapshot().focus).toBe('aft-1')
    expect(screen.getByText('Aft thrust plate').closest('li')!.className).toContain('mountFocus')
  })

  it('switches views, loads the reference build, and strips the bus from the bench bar', async () => {
    const page = await open()
    fireEvent.click(button('Exploded view'))
    expect(page.store.getSnapshot().exploded).toBe(true)
    fireEvent.click(button('Assembled view'))
    fireEvent.keyDown(page.canvas, { key: 'ArrowLeft' })
    page.frame()
    const turned = page.cameraPosition()
    fireEvent.click(button('Reset view'))
    page.frame()
    expect(page.cameraPosition().distanceTo(turned)).toBeGreaterThan(0.1)

    fireEvent.click(button('Remove all parts'))
    expect(screen.getByText('No part is mounted yet')).toBeTruthy()
    expect(button('Remove all parts').disabled).toBe(true)
    fireEvent.click(button('MEO navigation'))
    expect(button('Load reference build')).toMatchObject({ disabled: true, title: 'This mission has no reference build' })
    fireEvent.click(button('Deep-space science'))
    expect(button('Load reference build').title).toBe('')
    fireEvent.click(button('Load reference build'))
    expect(page.store.getSnapshot().busId).toBe('bus-large')
    expect(screen.getByText('Every rule passes')).toBeTruthy()
  })

  it('hands the build to the model and reports a hand-off that did not go out', async () => {
    let settle: (outcome: EvaluateOutcome) => void = () => {}
    const evaluate = vi.fn((_prompt: string) => new Promise<EvaluateOutcome>((resolve) => { settle = resolve }))
    await open(evaluate)
    const finish = async (outcome: EvaluateOutcome): Promise<void> => {
      fireEvent.click(button('Evaluate with the model'))
      expect(button('Sending…').disabled).toBe(true)
      await act(async () => { settle(outcome); await Promise.resolve() })
      expect(button('Evaluate with the model').disabled).toBe(false)
    }
    await finish('sent')
    expect(evaluate.mock.calls[0]![0]).toContain('## Mounted parts\n- Left wing hinge: Medium deployable solar wing')
    expect(screen.queryByRole('alert')).toBeNull()
    await finish('noWorkspace')
    expect(screen.getByRole('alert').textContent).toBe('Add a workspace in the sidebar before requesting an evaluation.')
    await finish('failed')
    expect(screen.getByRole('alert').textContent).toBe('The evaluation request was not sent. Try again later.')
  })

  it('copies the evaluation prompt and clears its notice after the hold', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await open()
    vi.useFakeTimers()
    try {
      fireEvent.click(button('Copy evaluation prompt'))
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(writeText.mock.calls[0]![0]).toContain('Act as a satellite systems engineer')
      expect(screen.getByRole('alert').textContent).toBe('Copied')
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
      expect(screen.queryByRole('alert')).toBeNull()

      writeText.mockRejectedValueOnce(new Error('denied'))
      fireEvent.click(button('Copy evaluation prompt'))
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(screen.queryByRole('alert')).toBeNull()
    } finally {
      vi.useRealTimers()
      Reflect.deleteProperty(navigator, 'clipboard')
    }
  })
})
