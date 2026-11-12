/**
 * The bench's canvas and its mouse and keyboard controls. Dragging empty space
 * turns the camera and the wheel zooms; a click picks a slot, a part dragged
 * off its slot moves to the slot it is dropped on, and a right click removes
 * a part. The keys mirror every pointer action for the focused canvas.
 */

import {
  useEffect, useRef, useState,
  type CanvasHTMLAttributes, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode,
} from 'react'
import { WebGLRenderer } from 'three'
import { Bench, type BenchPalette, type BenchRenderer, type BenchView } from './bench.ts'
import type { MountKind } from './catalog.ts'

/** Pointer travel in CSS pixels after which a press is a drag, not a click. */
const DRAG_THRESHOLD = 4
/** Camera turn in radians per CSS pixel of pointer travel. */
const ORBIT_PER_PIXEL = 0.008
/** Camera turn in radians per arrow-key press. */
const ORBIT_PER_KEY = 0.12
/** Distance multiplier per zoom key press or wheel notch. */
const ZOOM_STEP = 0.88

/** What the canvas reports to the page. */
export interface ViewportActions {
  /** A click landed on a slot or mounted part, or on empty space (null). */
  readonly onPick: (slotId: string | null) => void
  /** A mounted part was dragged from one slot onto another. */
  readonly onMove: (fromSlotId: string, toSlotId: string) => void
  /** A mounted part was right-clicked. */
  readonly onRemove: (slotId: string) => void
  /** A bin part was dropped on a slot it fits, or on no slot (null). */
  readonly onDropPart: (partId: string, slotId: string | null) => void
  readonly onStepFocus: (step: 1 | -1) => void
  /** Enter: mount the held part on the focused slot. */
  readonly onConfirm: () => void
  /** Delete: remove the focused slot's part. */
  readonly onRemoveFocused: () => void
  readonly onToggleExploded: () => void
  /** Escape: put the held part down. */
  readonly onCancel: () => void
}

/** Canvas props. */
export interface ViewportProps extends ViewportActions {
  readonly view: BenchView
  /** Mount kind of a bin part by id, for a drop's slot test. */
  readonly kindOf: (partId: string) => MountKind | undefined
  /** Class of the canvas element. */
  readonly className: string | undefined
  /** Class of the unavailable notice. */
  readonly unavailableClassName: string | undefined
  /** Drag-and-drop payload type carrying a bin part's id. */
  readonly dragType: string
  /** Accessible name of the canvas. */
  readonly label: string
  /** Text shown in place of the canvas when no renderer can be created. */
  readonly unavailable: string
  /** Bumped by the page's reset-view control. */
  readonly resetSignal: number
  /** Renderer factory; absent creates a WebGL renderer. A factory returning null shows `unavailable`. */
  readonly createRenderer?: ((canvas: HTMLCanvasElement) => BenchRenderer | null) | undefined
}

/**
 * Create the WebGL renderer for a canvas.
 * @param canvas - the canvas to draw on.
 * @returns the renderer, or null where WebGL is unavailable.
 */
export function createWebGLRenderer(canvas: HTMLCanvasElement): BenchRenderer | null {
  try {
    return new WebGLRenderer({ canvas, antialias: true, alpha: true })
  } catch (_webglUnavailable) {
    // The page shows its WebGL notice and keeps the bin and slot list usable.
    return null
  }
}

function readPalette(element: Element): BenchPalette {
  const style = getComputedStyle(element)
  const token = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback
  return { accent: token('--lh-ion', '#4be3d0'), focus: token('--lh-solar', '#ffb454') }
}

interface Press {
  readonly x: number
  readonly y: number
  /** Pointer position at the previous move, for the camera's turn. */
  lastX: number
  lastY: number
  /** Slot of the mounted part under the press, when the press can drag one. */
  readonly slotId: string | null
  dragging: boolean
}

/** A pointer position on the canvas. */
type At = Pick<MouseEvent<HTMLCanvasElement>, 'clientX' | 'clientY' | 'currentTarget'>

/**
 * Render the bench canvas.
 * @param props - the view to draw and the action callbacks.
 * @returns the canvas, or the unavailable notice.
 */
export function Viewport(props: ViewportProps): ReactNode {
  const { view, createRenderer = createWebGLRenderer } = props
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [bench, setBench] = useState<Bench | null>(null)
  const [failed, setFailed] = useState(false)
  const pressRef = useRef<Press | null>(null)
  // The mount kind of a part being dragged off its slot highlights where it can go.
  const [dragKind, setDragKind] = useState<MountKind | null>(null)
  const shown: BenchView = dragKind === null ? view : { ...view, heldKind: dragKind }

  useEffect(() => {
    if (canvas === null) return
    const renderer = createRenderer(canvas)
    if (renderer === null) {
      setFailed(true)
      return
    }
    const created = new Bench(renderer, readPalette(canvas), matchMedia('(prefers-reduced-motion: reduce)').matches)
    setBench(created)
    const fit = (): void => { created.resize(canvas.clientWidth, canvas.clientHeight, devicePixelRatio) }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(canvas)
    let frame = 0
    let last = performance.now()
    const tick = (now: number): void => {
      // A hidden tab resumes with one long gap; the clamp keeps animations from jumping.
      created.frame(Math.min(0.1, (now - last) / 1000))
      last = now
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      created.dispose()
    }
  }, [canvas, createRenderer])

  useEffect(() => { if (bench !== null) bench.show(shown) })
  useEffect(() => { if (bench !== null) bench.resetCamera() }, [bench, props.resetSignal])

  if (failed) return <p className={props.unavailableClassName} role="status">{props.unavailable}</p>

  const mountedKind = (slotId: string | null): MountKind | null =>
    view.mounts.find(mount => mount.slot.id === slotId)?.slot.kind ?? null

  /** The pointer and key handlers; they exist once the bench does. */
  const controls = (live: Bench): CanvasHTMLAttributes<HTMLCanvasElement> => {
    const pickAt = (event: At, kind?: MountKind): string | null => {
      const box = event.currentTarget.getBoundingClientRect()
      return live.pick(
        (event.clientX - box.left) / Math.max(box.width, 1) * 2 - 1,
        1 - (event.clientY - box.top) / Math.max(box.height, 1) * 2,
        kind,
      )
    }
    const keys: Record<string, () => void> = {
      ArrowLeft: () => { live.orbit(-ORBIT_PER_KEY, 0) },
      ArrowRight: () => { live.orbit(ORBIT_PER_KEY, 0) },
      ArrowUp: () => { live.orbit(0, -ORBIT_PER_KEY) },
      ArrowDown: () => { live.orbit(0, ORBIT_PER_KEY) },
      'a': () => { live.orbit(-ORBIT_PER_KEY, 0) },
      'd': () => { live.orbit(ORBIT_PER_KEY, 0) },
      'w': () => { live.orbit(0, -ORBIT_PER_KEY) },
      's': () => { live.orbit(0, ORBIT_PER_KEY) },
      '+': () => { live.zoom(ZOOM_STEP) },
      '=': () => { live.zoom(ZOOM_STEP) },
      '-': () => { live.zoom(1 / ZOOM_STEP) },
      'r': () => { live.resetCamera() },
      'e': () => { props.onStepFocus(1) },
      'q': () => { props.onStepFocus(-1) },
      'x': () => { props.onToggleExploded() },
      Enter: props.onConfirm,
      Delete: props.onRemoveFocused,
      Backspace: props.onRemoveFocused,
      Escape: props.onCancel,
    }
    return {
      onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        const slotId = view.heldKind === null ? pickAt(event) : null
        pressRef.current = {
          x: event.clientX,
          y: event.clientY,
          lastX: event.clientX,
          lastY: event.clientY,
          slotId: mountedKind(slotId) === null ? null : slotId,
          dragging: false,
        }
      },
      onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => {
        const press = pressRef.current
        if (press === null) return
        if (!press.dragging) {
          if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_THRESHOLD) return
          press.dragging = true
          setDragKind(mountedKind(press.slotId))
        }
        if (press.slotId === null) {
          live.orbit(-(event.clientX - press.lastX) * ORBIT_PER_PIXEL, -(event.clientY - press.lastY) * ORBIT_PER_PIXEL)
        }
        press.lastX = event.clientX
        press.lastY = event.clientY
      },
      onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => {
        const press = pressRef.current
        pressRef.current = null
        setDragKind(null)
        if (press === null) return
        if (!press.dragging) {
          props.onPick(pickAt(event, view.heldKind ?? undefined))
          return
        }
        const kind = mountedKind(press.slotId)
        if (press.slotId === null || kind === null) return
        const target = pickAt(event, kind)
        if (target !== null && target !== press.slotId) props.onMove(press.slotId, target)
      },
      onPointerCancel: () => {
        pressRef.current = null
        setDragKind(null)
      },
      onWheel: (event) => { live.zoom(event.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP) },
      onContextMenu: (event) => {
        event.preventDefault()
        const slotId = pickAt(event)
        if (slotId !== null && mountedKind(slotId) !== null) props.onRemove(slotId)
      },
      onDragOver: (event: DragEvent<HTMLCanvasElement>) => {
        if (event.dataTransfer.types.includes(props.dragType)) event.preventDefault()
      },
      onDrop: (event: DragEvent<HTMLCanvasElement>) => {
        const partId = event.dataTransfer.getData(props.dragType)
        if (partId === '') return
        event.preventDefault()
        props.onDropPart(partId, pickAt(event, props.kindOf(partId)))
      },
      onKeyDown: (event: KeyboardEvent<HTMLCanvasElement>) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return
        const handler = keys[event.key.length === 1 ? event.key.toLowerCase() : event.key]
        if (handler === undefined) return
        event.preventDefault()
        handler()
      },
    }
  }

  return (
    <canvas
      ref={setCanvas}
      className={props.className}
      tabIndex={0}
      role="application"
      aria-label={props.label}
      data-dragging={dragKind === null ? undefined : ''}
      {...bench === null ? {} : controls(bench)}
    />
  )
}
