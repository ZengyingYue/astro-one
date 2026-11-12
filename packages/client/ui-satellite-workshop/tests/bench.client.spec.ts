import { describe, expect, it, vi } from 'vitest'
import { Vector3, type BufferGeometry, type Mesh, type MeshBasicMaterial, type Object3D, type PerspectiveCamera, type Scene } from 'three'
import { PRESETS, mountsOf, slotsOf } from '../src/client/assembly.ts'
import { Bench, type BenchView } from '../src/client/bench.ts'
import { BUSES, PARTS, busOf } from '../src/client/catalog.ts'
import { buildBus, buildPart, createFinishes, disposeFinishes, disposeModel } from '../src/client/models.ts'

const PALETTE = { accent: '#4be3d0', focus: '#ffb454' }

function view(busId: string, mounts: Record<string, string>, extra: Partial<BenchView> = {}): BenchView {
  const bus = busOf(busId)
  return { bus, slots: slotsOf(bus), mounts: mountsOf({ busId, mounts }), heldKind: null, focus: null, exploded: false, ...extra }
}

/** A bench over a recording renderer, with lookups into the scene it last drew. */
function open(reducedMotion = false) {
  let scene: Scene | undefined
  let camera: PerspectiveCamera | undefined
  const renderer = {
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    render: vi.fn((drawnScene: Scene, drawnCamera: PerspectiveCamera) => { scene = drawnScene; camera = drawnCamera }),
    dispose: vi.fn(),
  }
  const bench = new Bench(renderer, PALETTE, reducedMotion)
  bench.resize(400, 300, 1)
  const nodes = (slotId: string): Object3D[] => {
    const found: Object3D[] = []
    scene!.traverse((node) => { if (node.userData['slotId'] === slotId) found.push(node) })
    return found
  }
  /** The slot's marker: the only mesh tagged with the slot id. */
  const marker = (slotId: string) => nodes(slotId).find(node => (node as Mesh).isMesh) as Mesh<BufferGeometry, MeshBasicMaterial>
  /** The model mounted on the slot: the only group tagged with the slot id. */
  const model = (slotId: string) => nodes(slotId).find(node => !(node as Mesh).isMesh)
  const screen = (node: Object3D): [number, number] => {
    camera!.updateMatrixWorld()
    const point = node.getWorldPosition(new Vector3()).project(camera!)
    return [point.x, point.y]
  }
  const run = (seconds: number): void => { for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) bench.frame(0.05) }
  return { bench, renderer, marker, model, screen, run, camera: () => camera! }
}

const EO = PRESETS[0]!

describe('part and bus models', () => {
  it('builds a model for every catalog part and bus and releases their geometries', () => {
    const finishes = createFinishes()
    for (const part of PARTS) {
      const model = buildPart(part, finishes)
      expect(model.children.length, part.id).toBeGreaterThan(0)
      disposeModel(model)
    }
    for (const bus of BUSES) {
      const model = buildBus(bus, finishes)
      const body = model.children[0] as Mesh
      body.geometry.computeBoundingBox()
      const size = body.geometry.boundingBox!.getSize(new Vector3()).toArray()
      size.forEach((edge, axis) => { expect(edge).toBeCloseTo(bus.dims[axis]!, 5) })
      disposeModel(model)
    }
    const dispose = vi.spyOn(finishes.foil, 'dispose')
    disposeFinishes(finishes)
    expect(dispose).toHaveBeenCalledOnce()
  })
})

describe('bench', () => {
  it('draws nothing and picks nothing before its first build', () => {
    const { bench, renderer } = open()
    bench.frame(0.1)
    expect(renderer.render).not.toHaveBeenCalled()
    expect(bench.pick(0, 0)).toBeNull()
  })

  it('sizes the renderer and caps the pixel ratio', () => {
    const { bench, renderer } = open()
    bench.resize(800, 0, 3)
    expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(2)
    expect(renderer.setSize).toHaveBeenLastCalledWith(800, 0, false)
  })

  it('assembles a build part by part onto the slots', () => {
    const { bench, model, run } = open()
    bench.show(view(EO.busId, EO.mounts))
    bench.frame(0.01)
    // The first part has started its travel; a later one still waits its turn.
    expect(model('wing-l')!.visible).toBe(true)
    expect(model('bay-3')!.visible).toBe(false)
    expect(model('wing-l')!.position.z).toBeGreaterThan(0.4)
    run(2)
    expect(model('wing-l')!.position.toArray()).toEqual([0, 0, 0.4])
    expect(model('nadir-1')!.position.toArray()).toEqual([0, -0.5, 0])
    expect(model('bay-3')!.visible).toBe(true)
    expect(model('bay-3')!.scale.x).toBe(1)
  })

  it('places a build at once under reduced motion', () => {
    const { bench, model } = open(true)
    bench.show(view(EO.busId, EO.mounts, { exploded: true }))
    bench.frame(0.016)
    // Exploded: one frame carries every outer part 0.55 bus edges along its slot normal.
    expect(model('aft-1')!.position.x).toBeCloseTo(-0.4 - 0.55, 6)
    expect(model('bay-1')!.position.toArray()).toEqual([0, -0.375, 0])
  })

  it('picks the mounted part or the slot marker under the pointer, filtered by mount kind', () => {
    const { bench, model, marker, screen, run } = open()
    bench.show(view(EO.busId, { ...EO.mounts, 'ram-1': '' }))
    // Look along the ram axis, where no wing crosses the ram face.
    bench.orbit(Math.PI / 2 - 0.75, 0)
    run(2)
    expect(bench.pick(...screen(marker('ram-1')))).toBe('ram-1')
    expect(bench.pick(...screen(marker('ram-1')), 'wing')).toBeNull()
    const tip = model('wing-l')!.children.at(-1)!
    expect(bench.pick(...screen(tip))).toBe('wing-l')
    expect(bench.pick(...screen(tip), 'wing')).toBe('wing-l')
    expect(bench.pick(...screen(tip), 'face')).toBeNull()
    expect(bench.pick(0.99, 0.99)).toBeNull()
  })

  it('highlights the slots a held part fits and the focused slot, and shows the bays through the bus', () => {
    const { bench, marker, run } = open()
    bench.show(view(EO.busId, { ...EO.mounts, 'ram-1': '', 'bay-4': '' }))
    run(2)
    const opacity = (slotId: string) => marker(slotId).material.opacity
    expect(opacity('ram-1')).toBe(0.2)
    expect(opacity('nadir-1')).toBe(0)
    expect(opacity('bay-4')).toBe(0)

    bench.show(view(EO.busId, { ...EO.mounts, 'ram-1': '', 'bay-4': '' }, { heldKind: 'face', focus: 'zenith-1' }))
    bench.frame(0.05)
    expect(opacity('ram-1')).toBeGreaterThanOrEqual(0.45)
    expect(opacity('nadir-1')).toBeGreaterThanOrEqual(0.45)
    expect(opacity('zenith-1')).toBeGreaterThanOrEqual(0.75)
    expect(marker('zenith-1').material.color.getHexString()).toBe('ffb454')
    expect(marker('ram-1').material.color.getHexString()).toBe('4be3d0')
    expect(marker('ram-1').scale.x).toBeGreaterThan(1)

    // A bay part in hand, or a focused bay, turns the bus translucent.
    const foil = (marker('wing-l').parent!.children.find(node => node.children.length > 4)!.children[0] as Mesh<never, MeshBasicMaterial>).material
    expect(foil.opacity).toBe(1)
    bench.show(view(EO.busId, EO.mounts, { heldKind: 'bay' }))
    bench.frame(0.05)
    expect(foil.opacity).toBeCloseTo(0.22, 6)
    expect(foil.depthWrite).toBe(false)
    expect(opacity('bay-4')).toBeGreaterThanOrEqual(0.45)
    bench.show(view(EO.busId, EO.mounts, { focus: 'bay-4' }))
    bench.frame(0.05)
    expect(foil.opacity).toBeCloseTo(0.22, 6)
  })

  it('opens and closes the exploded view over half a second', () => {
    const { bench, model, marker, run } = open()
    bench.show(view(EO.busId, EO.mounts))
    run(2)
    bench.show(view(EO.busId, EO.mounts, { exploded: true }))
    bench.frame(0.25)
    expect(model('zenith-1')!.position.y).toBeCloseTo(0.5 + 0.55 * 0.5, 6)
    run(1)
    expect(model('zenith-1')!.position.y).toBeCloseTo(0.5 + 0.55, 6)
    expect(marker('zenith-1').position.y).toBeCloseTo(0.5 + 0.012 + 0.55 * 0.5, 6)
    bench.show(view(EO.busId, EO.mounts))
    run(1)
    expect(model('zenith-1')!.position.y).toBeCloseTo(0.5, 6)
  })

  it('swaps a changed part, flies a new one in, and rebuilds on another bus', () => {
    const { bench, model, marker, run } = open()
    bench.show(view(EO.busId, EO.mounts))
    run(2)
    const camera = model('nadir-1')!
    const wing = model('wing-l')!
    bench.show(view(EO.busId, { ...EO.mounts, 'nadir-1': 'sar', 'zenith-2': '' }))
    bench.frame(0.01)
    expect(model('nadir-1')).not.toBe(camera)
    expect(model('wing-l')).toBe(wing)
    expect(model('zenith-2')).toBeUndefined()
    // The new part starts away from its slot at once, with no queue behind other parts.
    expect(model('nadir-1')!.visible).toBe(true)
    expect(model('nadir-1')!.position.y).toBeLessThan(-0.6)

    bench.show(view('bus-large', PRESETS[2]!.mounts))
    bench.frame(0.01)
    expect(model('wing-l')).not.toBe(wing)
    expect(marker('nadir-2')).toBeDefined()
    expect(marker('bay-6')).toBeDefined()
  })

  it('turns, zooms, and resets the camera within its limits and refits it to a larger build', () => {
    const { bench, camera, run } = open()
    bench.show(view(EO.busId, {}))
    bench.frame(0.05)
    const home = camera().position.clone()
    const fitted = home.length()
    bench.orbit(1, 0)
    bench.frame(0.05)
    expect(camera().position.length()).toBeCloseTo(fitted, 6)
    expect(camera().position.x).not.toBeCloseTo(home.x, 3)
    bench.orbit(0, -10)
    bench.frame(0.05)
    expect(camera().position.y).toBeCloseTo(fitted * Math.cos(0.15), 6)
    bench.orbit(0, 10)
    bench.frame(0.05)
    expect(camera().position.y).toBeCloseTo(-fitted * Math.cos(0.15), 6)
    bench.zoom(0.001)
    bench.frame(0.05)
    expect(camera().position.length()).toBeCloseTo(fitted * 0.35, 6)
    bench.zoom(1e6)
    bench.frame(0.05)
    expect(camera().position.length()).toBeCloseTo(fitted * 3, 6)
    bench.resetCamera()
    bench.frame(0.05)
    expect(camera().position.distanceTo(home)).toBeCloseTo(0, 6)

    // Wings widen the build; the camera eases out to keep it in view.
    bench.show(view(EO.busId, { 'wing-l': 'solar-wing-l' }))
    bench.frame(0.05)
    const easing = camera().position.length()
    expect(easing).toBeGreaterThan(fitted)
    run(3)
    expect(camera().position.length()).toBeGreaterThan(easing)
    expect(camera().position.length()).toBeCloseTo((0.4 + 3.6) * 2.7, 2)
  })

  it('releases the renderer and every model on dispose', () => {
    const { bench, renderer, marker, run } = open()
    bench.show(view(EO.busId, EO.mounts))
    run(1)
    const geometry = vi.spyOn(marker('ram-1').geometry, 'dispose')
    bench.dispose()
    expect(geometry).toHaveBeenCalledOnce()
    expect(renderer.dispose).toHaveBeenCalledOnce()
  })
})
