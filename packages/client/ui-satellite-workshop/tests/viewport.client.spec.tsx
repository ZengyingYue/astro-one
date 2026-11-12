// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { PRESETS, mountsOf, slotsOf } from '../src/client/assembly.ts'
import type { BenchView } from '../src/client/bench.ts'
import { busOf, findPart } from '../src/client/catalog.ts'
import { Viewport, type ViewportActions, type ViewportProps } from '../src/client/Viewport.tsx'
import { recordingRenderer, useBenchDom } from './dom.client.ts'

const dom = useBenchDom()
afterEach(cleanup)

const DRAG_TYPE = 'application/x-test-part'
const EO = { ...PRESETS[0]!.mounts, 'ram-1': '' }

function view(extra: Partial<BenchView> = {}): BenchView {
  const bus = busOf('bus-small')
  const mounts = mountsOf({ busId: bus.id, mounts: EO })
  return { bus, slots: slotsOf(bus), mounts, heldKind: null, focus: null, exploded: false, ...extra }
}

function mount(extra: Partial<ViewportProps> = {}) {
  const recording = recordingRenderer()
  const actions = {
    onPick: vi.fn(), onMove: vi.fn(), onRemove: vi.fn(), onDropPart: vi.fn(), onStepFocus: vi.fn(), onConfirm: vi.fn(),
    onRemoveFocused: vi.fn(), onToggleExploded: vi.fn(), onCancel: vi.fn(),
  } satisfies ViewportActions
  const props: ViewportProps = {
    view: view(), kindOf: partId => findPart(partId)?.mount, className: 'canvas', unavailableClassName: 'notice',
    dragType: DRAG_TYPE, label: 'Bench', unavailable: 'No WebGL', resetSignal: 0, createRenderer: recording.create,
    ...actions, ...extra,
  }
  const rendered = render(<Viewport {...props} />)
  act(() => { dom.frame() })
  const canvas = screen.queryByRole('application') as HTMLCanvasElement
  const press = (from: { clientX: number; clientY: number }, to = from, steps: { clientX: number; clientY: number }[] = []): void => {
    fireEvent.pointerDown(canvas, { ...from, button: 0, pointerId: 1 })
    for (const step of [...steps, ...(to === from ? [] : [to])]) fireEvent.pointerMove(canvas, { ...step, pointerId: 1 })
    fireEvent.pointerUp(canvas, { ...to, pointerId: 1 })
  }
  const rerender = (next: Partial<ViewportProps>): void => { rendered.rerender(<Viewport {...props} {...next} />) }
  return { ...recording, actions, canvas, press, props, rerender, unmount: rendered.unmount }
}

describe('bench canvas', () => {
  it('shows the notice where no renderer can be created', () => {
    mount({ createRenderer: () => null })
    expect(screen.getByRole('status').textContent).toBe('No WebGL')
    expect(screen.queryByRole('application')).toBeNull()
  })

  it('falls back to the notice when the default WebGL renderer cannot start', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mount({ createRenderer: undefined })
    expect(screen.getByRole('status').textContent).toBe('No WebGL')
    error.mockRestore()
  })

  it('names the canvas and releases the renderer on unmount', () => {
    const bench = mount()
    expect(bench.canvas.getAttribute('aria-label')).toBe('Bench')
    expect(bench.canvas.className).toBe('canvas')
    bench.unmount()
    expect(bench.renderer.dispose).toHaveBeenCalledOnce()
  })

  it('reports a click on a slot, on a mounted part, and on empty space', () => {
    const bench = mount()
    bench.press(bench.slot('ram-1'))
    bench.press(bench.part('zenith-1'))
    bench.press(bench.space)
    expect(bench.actions.onPick.mock.calls).toEqual([['ram-1'], ['zenith-1'], [null]])
  })

  it('answers a click with only the slots the held part fits', () => {
    const bench = mount({ view: view({ heldKind: 'wing' }) })
    bench.press(bench.slot('ram-1'))
    bench.press(bench.part('wing-l'))
    expect(bench.actions.onPick.mock.calls).toEqual([[null], ['wing-l']])
  })

  it('turns the camera when empty space is dragged, and ignores other buttons and stray moves', () => {
    const bench = mount()
    const home = bench.cameraPosition()
    fireEvent.pointerMove(bench.canvas, { clientX: 50, clientY: 50 })
    fireEvent.pointerUp(bench.canvas, { clientX: 50, clientY: 50 })
    fireEvent.pointerDown(bench.canvas, { ...bench.space, button: 2 })
    fireEvent.pointerMove(bench.canvas, { clientX: 90, clientY: 90 })
    act(() => { dom.frame() })
    expect(bench.cameraPosition().distanceTo(home)).toBeCloseTo(0, 6)
    // A move inside the click tolerance does not start a drag.
    bench.press(bench.space, { clientX: 80, clientY: 30 }, [{ clientX: 3, clientY: 3 }, { clientX: 40, clientY: 20 }])
    act(() => { dom.frame() })
    expect(bench.cameraPosition().distanceTo(home)).toBeGreaterThan(0.5)
    expect(bench.actions.onPick).not.toHaveBeenCalled()
    expect(bench.actions.onMove).not.toHaveBeenCalled()
  })

  it('moves a mounted part dragged onto another slot of its kind', () => {
    const bench = mount()
    const from = bench.part('zenith-1')
    fireEvent.pointerDown(bench.canvas, { ...from, button: 0, pointerId: 1 })
    fireEvent.pointerMove(bench.canvas, { clientX: from.clientX + 10, clientY: from.clientY, pointerId: 1 })
    expect(bench.canvas.hasAttribute('data-dragging')).toBe(true)
    fireEvent.pointerUp(bench.canvas, { ...bench.slot('ram-1'), pointerId: 1 })
    expect(bench.canvas.hasAttribute('data-dragging')).toBe(false)
    expect(bench.actions.onMove.mock.calls).toEqual([['zenith-1', 'ram-1']])

    // Dropped on its own slot, on a slot of another kind, or on empty space, the part stays.
    bench.press(from, { clientX: from.clientX + 6, clientY: from.clientY })
    bench.press(from, bench.slot('wing-r'))
    bench.press(from, bench.space)
    expect(bench.actions.onMove).toHaveBeenCalledOnce()

    fireEvent.pointerDown(bench.canvas, { ...from, button: 0, pointerId: 1 })
    fireEvent.pointerMove(bench.canvas, { clientX: from.clientX + 10, clientY: from.clientY, pointerId: 1 })
    fireEvent.pointerCancel(bench.canvas, { pointerId: 1 })
    expect(bench.canvas.hasAttribute('data-dragging')).toBe(false)
    fireEvent.pointerUp(bench.canvas, { ...bench.slot('ram-1'), pointerId: 1 })
    expect(bench.actions.onMove).toHaveBeenCalledOnce()
  })

  it('removes a mounted part on right click', () => {
    const bench = mount()
    const onPart = createEvent.contextMenu(bench.canvas, bench.part('zenith-1'))
    fireEvent(bench.canvas, onPart)
    fireEvent.contextMenu(bench.canvas, bench.slot('ram-1'))
    fireEvent.contextMenu(bench.canvas, bench.space)
    expect(onPart.defaultPrevented).toBe(true)
    expect(bench.actions.onRemove.mock.calls).toEqual([['zenith-1']])
  })

  it('zooms on the wheel', () => {
    const bench = mount()
    const home = bench.cameraPosition().length()
    fireEvent.wheel(bench.canvas, { deltaY: -100 })
    act(() => { dom.frame() })
    expect(bench.cameraPosition().length()).toBeCloseTo(home * 0.88, 6)
    fireEvent.wheel(bench.canvas, { deltaY: 100 })
    act(() => { dom.frame() })
    expect(bench.cameraPosition().length()).toBeCloseTo(home, 6)
  })

  it('accepts a bin part dropped on a fitting slot or beside the satellite', () => {
    const bench = mount()
    const transfer = (data: Record<string, string>) => ({ types: Object.keys(data), getData: (type: string) => data[type] ?? '' })
    const over = createEvent.dragOver(bench.canvas, { dataTransfer: transfer({ [DRAG_TYPE]: 'radiator' }) })
    fireEvent(bench.canvas, over)
    expect(over.defaultPrevented).toBe(true)
    const foreign = createEvent.dragOver(bench.canvas, { dataTransfer: transfer({ 'text/plain': 'radiator' }) })
    fireEvent(bench.canvas, foreign)
    expect(foreign.defaultPrevented).toBe(false)

    // jsdom has no DragEvent, so the drop's pointer position is set on the event by hand.
    const drop = (at: { clientX: number; clientY: number }, data: Record<string, string>): void => {
      const event = createEvent.drop(bench.canvas, { dataTransfer: transfer(data) })
      Object.defineProperties(event, { clientX: { value: at.clientX }, clientY: { value: at.clientY } })
      fireEvent(bench.canvas, event)
    }
    drop(bench.slot('ram-1'), { [DRAG_TYPE]: 'radiator' })
    drop(bench.slot('ram-1'), { [DRAG_TYPE]: 'battery-s' })
    drop(bench.space, { [DRAG_TYPE]: 'radiator' })
    drop(bench.space, { 'text/plain': 'radiator' })
    expect(bench.actions.onDropPart.mock.calls).toEqual([['radiator', 'ram-1'], ['battery-s', null], ['radiator', null]])
  })

  it('maps the keys to the camera and the build actions', () => {
    const bench = mount()
    const key = (name: string, init: KeyboardEventInit = {}): boolean => {
      const event = createEvent.keyDown(bench.canvas, { key: name, ...init })
      fireEvent(bench.canvas, event)
      act(() => { dom.frame() })
      return event.defaultPrevented
    }
    const home = bench.cameraPosition()
    for (const [forth, back] of [['ArrowLeft', 'ArrowRight'], ['a', 'D'], ['ArrowUp', 'ArrowDown'], ['W', 's'], ['+', '-'], ['=', '-']] as const) {
      expect(key(forth)).toBe(true)
      expect(bench.cameraPosition().distanceTo(home), forth).toBeGreaterThan(0.05)
      key(back)
      expect(bench.cameraPosition().distanceTo(home), back).toBeCloseTo(0, 6)
    }
    key('ArrowLeft')
    key('r')
    expect(bench.cameraPosition().distanceTo(home)).toBeCloseTo(0, 6)

    for (const name of ['e', 'q', 'x', 'Enter', 'Delete', 'Backspace', 'Escape']) key(name)
    expect(bench.actions.onStepFocus.mock.calls).toEqual([[1], [-1]])
    expect(bench.actions.onToggleExploded).toHaveBeenCalledOnce()
    expect(bench.actions.onConfirm).toHaveBeenCalledOnce()
    expect(bench.actions.onRemoveFocused).toHaveBeenCalledTimes(2)
    expect(bench.actions.onCancel).toHaveBeenCalledOnce()

    // Shortcuts with a modifier and keys the bench does not use stay with the browser.
    expect(key('r', { ctrlKey: true })).toBe(false)
    expect(key('x', { metaKey: true })).toBe(false)
    expect(key('e', { altKey: true })).toBe(false)
    expect(key('Tab')).toBe(false)
    expect(key('z')).toBe(false)
    expect(bench.actions.onToggleExploded).toHaveBeenCalledOnce()
  })

  it('resets the camera when the page asks and redraws a changed build', () => {
    const bench = mount()
    const home = bench.cameraPosition()
    fireEvent.keyDown(bench.canvas, { key: 'ArrowLeft' })
    bench.rerender({ resetSignal: 1 })
    act(() => { dom.frame() })
    expect(bench.cameraPosition().distanceTo(home)).toBeCloseTo(0, 6)
    bench.rerender({ resetSignal: 1, view: view({ mounts: [] }) })
    act(() => { dom.frame() })
    bench.press(bench.slot('zenith-1'))
    expect(bench.actions.onPick).toHaveBeenLastCalledWith('zenith-1')
    expect(() => bench.part('zenith-1')).toThrow()
  })
})
