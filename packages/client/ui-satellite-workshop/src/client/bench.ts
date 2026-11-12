/**
 * The 3D bench: one three.js scene holding the bus, its mount-slot markers,
 * and the mounted part models, with an orbiting camera, pointer picking, and
 * the mount, explode, and marker animations. The bench draws what its owner
 * passes to {@link Bench.show}; it holds no build state of its own.
 */

import {
  AmbientLight, BoxGeometry, CircleGeometry, Color, DirectionalLight, DoubleSide, Group, HemisphereLight, Mesh, MeshBasicMaterial,
  PerspectiveCamera, Quaternion, Raycaster, RingGeometry, Scene, Vector2, Vector3,
  type Object3D,
} from 'three'
import type { Mount, Slot } from './assembly.ts'
import type { Bus, MountKind } from './catalog.ts'
import { buildBus, buildPart, createFinishes, disposeFinishes, disposeModel, type Finishes } from './models.ts'

/** The drawing surface the bench renders through; `WebGLRenderer` satisfies it. */
export interface BenchRenderer {
  setSize(width: number, height: number, updateStyle: boolean): void
  setPixelRatio(ratio: number): void
  render(scene: Scene, camera: PerspectiveCamera): void
  dispose(): void
}

/** What the bench draws. */
export interface BenchView {
  readonly bus: Bus
  /** Every mount slot of the bus. */
  readonly slots: readonly Slot[]
  readonly mounts: readonly Mount[]
  /** Mount kind of the part in hand; its fitting slots are highlighted. */
  readonly heldKind: MountKind | null
  /** Slot under the keyboard cursor. */
  readonly focus: string | null
  readonly exploded: boolean
}

/** Marker colours, read from the theme by the owner. */
export interface BenchPalette {
  /** Slots the held part fits. */
  readonly accent: string
  /** The slot under the keyboard cursor. */
  readonly focus: string
}

/** Camera polar angle limits in radians from the zenith axis. */
const POLAR_RANGE = [0.15, Math.PI - 0.15] as const
/** Zoom limits relative to the fitted distance. */
const ZOOM_RANGE = [0.35, 3] as const
/** Camera distance as a multiple of the build's bounding radius. */
const FIT_DISTANCE = 2.7
/** Seconds a part takes to travel onto its slot. */
const MOUNT_SECONDS = 0.55
/** Seconds between successive parts when a whole build assembles. */
const STAGGER_SECONDS = 0.07
/** Seconds the exploded view takes to open or close. */
const EXPLODE_SECONDS = 0.5
/** Outward travel of a part in the exploded view, relative to the bus's longest edge. */
const EXPLODE_TRAVEL = 0.55
/** Distance a part starts from its slot, relative to the bus's longest edge. */
const MOUNT_TRAVEL = 1.6
/** Bus opacity while its bays are shown through it. */
const XRAY_OPACITY = 0.22
/** Starting camera angles: azimuth, then polar. */
const HOME_ANGLES = [0.75, 1.15] as const

const UP = new Vector3(0, 1, 0)

interface SlotMarker {
  readonly slot: Slot
  readonly mesh: Mesh<RingGeometry | BoxGeometry, MeshBasicMaterial>
}

interface MountedModel {
  readonly mount: Mount
  readonly model: Group
  /** Seconds since the part started travelling; negative while it waits its turn. */
  age: number
}

function easeOut(u: number): number {
  return 1 - (1 - u) ** 3
}

function clamp(value: number, [low, high]: readonly [number, number]): number {
  return Math.min(high, Math.max(low, value))
}

/** One 3D bench bound to one renderer. */
export class Bench {
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(38, 1, 0.05, 200)
  private readonly raycaster = new Raycaster()
  private readonly finishes: Finishes = createFinishes()
  private readonly root = new Group()
  private readonly hitArea = new MeshBasicMaterial({ visible: false, side: DoubleSide })
  private readonly accent: Color
  private readonly focusColor: Color
  private busModel: Group | undefined
  private bus: Bus | undefined
  private markers: SlotMarker[] = []
  private models = new Map<string, MountedModel>()
  private view: BenchView | undefined
  private azimuth: number = HOME_ANGLES[0]
  private polar: number = HOME_ANGLES[1]
  private zoomFactor = 1
  private radius = 1
  private shownRadius = 1
  private explode = 0
  private time = 0

  /**
   * @param renderer - the drawing surface; the bench disposes it.
   * @param palette - marker colours.
   * @param reducedMotion - true to place parts and views without animating.
   */
  constructor(
    private readonly renderer: BenchRenderer,
    palette: BenchPalette,
    private readonly reducedMotion: boolean,
  ) {
    this.accent = new Color(palette.accent)
    this.focusColor = new Color(palette.focus)
    const sun = new DirectionalLight(0xfff4e0, 2.6)
    sun.position.set(4, 6, 3)
    const rim = new DirectionalLight(0x7fd8ff, 0.9)
    rim.position.set(-5, -2, -4)
    // Seam lines are decoration: the default one-unit line tolerance would let them catch rays meant for other parts.
    this.raycaster.params.Line.threshold = 0
    this.scene.add(new AmbientLight(0xffffff, 0.35), new HemisphereLight(0xbfd9ff, 0x1a2030, 0.9), sun, rim, this.root)
  }

  /**
   * Draw a build. A changed bus rebuilds the scene; a changed slot swaps its
   * model, and a newly mounted part travels onto its slot.
   * @param view - the build and the bench state to draw.
   */
  show(view: BenchView): void {
    const first = this.view === undefined
    if (view.bus !== this.bus) this.rebuildBus(view.bus, view.slots)
    const wanted = new Map(view.mounts.map(mount => [mount.slot.id, mount]))
    for (const [slotId, mounted] of this.models) {
      if (wanted.get(slotId)?.part === mounted.mount.part) continue
      this.root.remove(mounted.model)
      disposeModel(mounted.model)
      this.models.delete(slotId)
    }
    let queued = 0
    for (const mount of view.mounts) {
      if (this.models.has(mount.slot.id)) continue
      const model = buildPart(mount.part, this.finishes)
      model.userData['slotId'] = mount.slot.id
      const normal = new Vector3(...mount.slot.normal)
      if (normal.lengthSq() > 0) model.quaternion.copy(new Quaternion().setFromUnitVectors(UP, normal))
      this.root.add(model)
      // A whole build assembles part by part; a single mounted part starts at once.
      const age = this.reducedMotion ? MOUNT_SECONDS : -(first ? queued++ * STAGGER_SECONDS : 0)
      this.models.set(mount.slot.id, { mount, model, age })
    }
    this.view = view
    this.radius = Math.max(
      Math.hypot(...view.bus.dims) / 2,
      ...view.mounts.map(mount => Math.hypot(...mount.slot.position) + mount.part.size),
    )
    if (first) this.shownRadius = this.radius
    this.place()
  }

  /**
   * Fit the drawing surface to its element.
   * @param width - CSS pixels.
   * @param height - CSS pixels.
   * @param pixelRatio - device pixels per CSS pixel.
   */
  resize(width: number, height: number, pixelRatio: number): void {
    this.renderer.setPixelRatio(Math.min(pixelRatio, 2))
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / Math.max(height, 1)
    this.camera.updateProjectionMatrix()
  }

  /**
   * Turn the camera around the build.
   * @param azimuth - radians around the zenith axis.
   * @param polar - radians toward the nadir.
   */
  orbit(azimuth: number, polar: number): void {
    this.azimuth += azimuth
    this.polar = clamp(this.polar + polar, POLAR_RANGE)
  }

  /**
   * Move the camera toward or away from the build.
   * @param factor - multiplier on the distance; below 1 moves closer.
   */
  zoom(factor: number): void {
    this.zoomFactor = clamp(this.zoomFactor * factor, ZOOM_RANGE)
  }

  /** Return the camera to its starting angle and distance. */
  resetCamera(): void {
    this.azimuth = HOME_ANGLES[0]
    this.polar = HOME_ANGLES[1]
    this.zoomFactor = 1
  }

  /**
   * Find the slot under a pointer position: a mounted part or a slot marker.
   * @param x - horizontal position from -1 (left) to 1 (right).
   * @param y - vertical position from -1 (bottom) to 1 (top).
   * @param kind - restrict the answer to slots of this mount kind.
   * @returns the nearest matching slot id, or null over empty space.
   */
  pick(x: number, y: number, kind?: MountKind): string | null {
    // The pointer may arrive between frames, so the transforms are brought up to date here.
    this.place()
    this.scene.updateMatrixWorld()
    this.camera.updateMatrixWorld()
    this.raycaster.setFromCamera(new Vector2(x, y), this.camera)
    const targets: Object3D[] = [
      ...this.markers.filter(marker => kind === undefined || marker.slot.kind === kind).map(marker => marker.mesh),
      ...[...this.models.values()].filter(mounted => kind === undefined || mounted.mount.slot.kind === kind).map(mounted => mounted.model),
    ]
    for (const hit of this.raycaster.intersectObjects(targets, true)) {
      for (let node: Object3D | null = hit.object; node !== null; node = node.parent) {
        const slotId: unknown = node.userData['slotId']
        if (typeof slotId === 'string') return slotId
      }
    }
    return null
  }

  /**
   * Advance the animations and draw one frame.
   * @param seconds - time since the previous frame.
   */
  frame(seconds: number): void {
    const view = this.view
    if (view === undefined) return
    this.time += seconds
    const rate = this.reducedMotion ? Infinity : seconds / EXPLODE_SECONDS
    const target = view.exploded ? 1 : 0
    this.explode += clamp(target - this.explode, [-rate, rate])
    this.shownRadius += (this.radius - this.shownRadius) * Math.min(1, this.reducedMotion ? 1 : seconds * 4)
    for (const mounted of this.models.values()) mounted.age += seconds
    this.place()
    this.renderer.render(this.scene, this.camera)
  }

  /** Release every GPU resource and the renderer. */
  dispose(): void {
    for (const mounted of this.models.values()) disposeModel(mounted.model)
    this.models.clear()
    this.clearBus()
    disposeFinishes(this.finishes)
    this.hitArea.dispose()
    this.renderer.dispose()
  }

  private clearBus(): void {
    if (this.busModel !== undefined) {
      this.root.remove(this.busModel)
      disposeModel(this.busModel)
    }
    for (const marker of this.markers) {
      this.root.remove(marker.mesh)
      disposeModel(marker.mesh)
      marker.mesh.material.dispose()
    }
    this.markers = []
  }

  private rebuildBus(bus: Bus, slots: readonly Slot[]): void {
    this.clearBus()
    for (const mounted of this.models.values()) {
      this.root.remove(mounted.model)
      disposeModel(mounted.model)
    }
    this.models.clear()
    this.bus = bus
    this.busModel = buildBus(bus, this.finishes)
    this.root.add(this.busModel)
    const edge = Math.min(...bus.dims)
    for (const slot of slots) {
      const material = new MeshBasicMaterial({ color: this.accent, transparent: true, depthTest: slot.kind !== 'bay', side: DoubleSide })
      const size = edge * (slot.kind === 'wing' ? 0.16 : 0.2)
      const mesh = slot.kind === 'bay'
        ? new Mesh(new BoxGeometry(edge * 0.5, bus.dims[1] / bus.bays * 0.7, edge * 0.5), material)
        : new Mesh(new RingGeometry(size * 0.55, size, 32), material)
      mesh.userData['slotId'] = slot.id
      const normal = new Vector3(...slot.normal)
      if (slot.kind !== 'bay') {
        // The ring is open in the middle; an undrawn disc makes the whole marker a pointer target.
        mesh.add(new Mesh(new CircleGeometry(size, 24), this.hitArea))
        mesh.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal))
        mesh.position.copy(new Vector3(...slot.position).addScaledVector(normal, edge * 0.012))
      } else {
        mesh.position.set(...slot.position)
      }
      this.root.add(mesh)
      this.markers.push({ slot, mesh })
    }
  }

  /** Apply the animation state to the camera, the bus, the markers, and the models. */
  private place(): void {
    const view = this.view
    if (view === undefined) return
    const distance = this.shownRadius * FIT_DISTANCE * this.zoomFactor
    this.camera.position.setFromSphericalCoords(distance, this.polar, this.azimuth)
    this.camera.lookAt(0, 0, 0)

    const edge = Math.max(...view.bus.dims)
    const bayInHand = view.heldKind === 'bay' || this.markers.some(marker => marker.slot.id === view.focus && marker.slot.kind === 'bay')
    const xray = Math.max(this.explode, bayInHand ? 1 : 0)
    this.finishes.foil.opacity = 1 - (1 - XRAY_OPACITY) * xray
    this.finishes.foil.depthWrite = xray < 0.5

    const pulse = 0.5 + 0.5 * Math.sin(this.time * 5)
    for (const { slot, mesh } of this.markers) {
      const focused = slot.id === view.focus
      const fits = view.heldKind === slot.kind
      const occupied = this.models.has(slot.id)
      mesh.material.color.copy(focused ? this.focusColor : this.accent)
      mesh.material.opacity = focused ? 0.75 + 0.25 * pulse : fits ? 0.45 + 0.4 * pulse : occupied ? 0 : slot.kind === 'bay' ? 0.16 * xray : 0.2
      mesh.scale.setScalar(focused || fits ? 1.15 + 0.1 * pulse : 1)
      if (slot.kind !== 'bay') {
        const lift = edge * (0.012 + EXPLODE_TRAVEL * 0.5 * this.explode)
        mesh.position.copy(new Vector3(...slot.position).addScaledVector(new Vector3(...slot.normal), lift))
      }
    }

    for (const { mount, model, age } of this.models.values()) {
      const arrived = easeOut(clamp(age / MOUNT_SECONDS, [0, 1]))
      const normal = new Vector3(...mount.slot.normal)
      const travel = edge * (EXPLODE_TRAVEL * this.explode + MOUNT_TRAVEL * (1 - arrived))
      model.position.copy(new Vector3(...mount.slot.position).addScaledVector(normal, travel))
      model.scale.setScalar(mount.slot.kind === 'bay' ? 0.2 + 0.8 * arrived : 1)
      model.visible = age >= 0
    }
  }
}
