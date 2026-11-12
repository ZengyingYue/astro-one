import { afterEach, beforeEach, vi } from 'vitest'
import { Vector3, type Mesh, type Object3D, type PerspectiveCamera, type Scene } from 'three'
import type { BenchRenderer } from '../src/client/bench.ts'

/** Canvas size every bench test draws at, in CSS pixels. */
export const SIZE = { width: 400, height: 300 }

/**
 * Give jsdom the browser pieces the bench canvas uses: a sized canvas, pointer
 * capture, ResizeObserver, a reduced-motion preference (so a build is in place
 * after one frame), and an animation-frame queue the test advances by hand.
 */
export function useBenchDom(): { frame: (count?: number) => void } {
  let queue: FrameRequestCallback[] = []
  let now = 0
  beforeEach(() => {
    queue = []
    now = 0
    vi.stubGlobal('ResizeObserver', class { observe(): void {} disconnect(): void {} })
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => queue.push(callback))
    vi.stubGlobal('cancelAnimationFrame', () => { queue = [] })
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, value: SIZE.width })
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { configurable: true, value: SIZE.height })
    HTMLCanvasElement.prototype.getBoundingClientRect = () => new DOMRect(0, 0, SIZE.width, SIZE.height)
    HTMLCanvasElement.prototype.setPointerCapture = () => {}
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
  return {
    frame: (count = 1) => {
      for (let index = 0; index < count; index++) {
        const callbacks = queue
        queue = []
        now += 50
        for (const callback of callbacks) callback(now)
      }
    },
  }
}

/** A renderer that records the scene and camera it was last asked to draw. */
export function recordingRenderer() {
  let scene: Scene | undefined
  let camera: PerspectiveCamera | undefined
  const dispose = vi.fn<() => void>()
  const renderer: BenchRenderer = {
    setSize: () => {},
    setPixelRatio: () => {},
    render: (drawnScene, drawnCamera) => { scene = drawnScene; camera = drawnCamera },
    dispose,
  }
  const tagged = (slotId: string): Object3D[] => {
    const found: Object3D[] = []
    scene!.traverse((node) => { if (node.userData['slotId'] === slotId) found.push(node) })
    return found
  }
  const client = (node: Object3D): { clientX: number; clientY: number } => {
    camera!.updateMatrixWorld()
    const point = node.getWorldPosition(new Vector3()).project(camera!)
    return { clientX: (point.x + 1) / 2 * SIZE.width, clientY: (1 - point.y) / 2 * SIZE.height }
  }
  return {
    renderer: { ...renderer, dispose },
    create: () => renderer,
    cameraPosition: () => camera!.position.clone(),
    /** Client coordinates of a slot's marker. */
    slot: (slotId: string) => client(tagged(slotId).find(node => (node as Mesh).isMesh)!),
    /** Client coordinates of the outermost piece of the part mounted on a slot. */
    part: (slotId: string) => client(tagged(slotId).find(node => !(node as Mesh).isMesh)!.children.at(-1)!),
    /** Client coordinates of empty space in a canvas corner. */
    space: { clientX: 2, clientY: 2 },
  }
}
