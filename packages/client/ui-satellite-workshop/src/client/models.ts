/**
 * Procedural 3D models of the bus and every catalog part. A part model is
 * built around its mount point: the origin sits on the mount and local +Y
 * points away from the bus, so the bench orients a model by rotating +Y onto
 * the slot normal. Bay parts are centred on their origin.
 */

import {
  BoxGeometry, ConeGeometry, CylinderGeometry, DoubleSide, EdgesGeometry, Group, LatheGeometry, LineBasicMaterial,
  LineSegments, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector2,
  type BufferGeometry, type Material, type Object3D,
} from 'three'
import type { Bus, Part, PartShape } from './catalog.ts'

/** The surface finishes the models are painted with. */
export interface Finishes {
  /** Gold multilayer insulation on the bus body. */
  readonly foil: MeshStandardMaterial
  /** Bare machined aluminium. */
  readonly metal: MeshStandardMaterial
  /** Dark anodized housings. */
  readonly dark: MeshStandardMaterial
  /** White thermal paint. */
  readonly white: MeshStandardMaterial
  /** Solar cells. */
  readonly cell: MeshStandardMaterial
  /** Optical glass. */
  readonly glass: MeshStandardMaterial
  /** Copper-coloured radio elements. */
  readonly copper: MeshStandardMaterial
  /** Glowing thruster and beacon surfaces. */
  readonly glow: MeshStandardMaterial
  /** Panel seams and frames. */
  readonly seam: LineBasicMaterial
}

/**
 * Create the finishes one bench shares across its models.
 * @returns the materials; the bench disposes them with {@link disposeFinishes}.
 */
export function createFinishes(): Finishes {
  // Reflectors, horns, baffles, and nozzles are open shells seen from both sides.
  const standard = (color: number, metalness: number, roughness: number): MeshStandardMaterial =>
    new MeshStandardMaterial({ color, metalness, roughness, side: DoubleSide })
  return {
    foil: new MeshStandardMaterial({ color: 0xc9992e, metalness: 0.85, roughness: 0.38, transparent: true }),
    metal: standard(0xb9c2cc, 0.9, 0.35),
    dark: standard(0x2a3038, 0.6, 0.55),
    white: standard(0xe9edf2, 0.1, 0.7),
    cell: new MeshStandardMaterial({ color: 0x14306e, metalness: 0.55, roughness: 0.3, side: DoubleSide }),
    glass: standard(0x0b1830, 0.9, 0.08),
    copper: standard(0xb46a3c, 0.85, 0.4),
    glow: new MeshStandardMaterial({ color: 0x66e6ff, emissive: 0x2fd0ff, emissiveIntensity: 1.6, roughness: 0.4 }),
    seam: new LineBasicMaterial({ color: 0x6f7c8c }),
  }
}

/**
 * Release the finishes' GPU resources.
 * @param finishes - the materials a bench created.
 */
export function disposeFinishes(finishes: Finishes): void {
  for (const material of Object.values(finishes) as Material[]) material.dispose()
}

/**
 * Release the geometries of a model the bench removes.
 * @param model - the model root.
 */
export function disposeModel(model: Object3D): void {
  model.traverse((node) => {
    const geometry = (node as Partial<Mesh>).geometry
    if (geometry !== undefined) geometry.dispose()
  })
}

/** Add a mesh at a position, optionally rotated, and return it. */
function put(
  group: Group, geometry: BufferGeometry, material: Material,
  at: readonly [number, number, number], turn: readonly [number, number, number] = [0, 0, 0],
): Mesh {
  const mesh = new Mesh(geometry, material)
  mesh.position.set(...at)
  mesh.rotation.set(...turn)
  group.add(mesh)
  return mesh
}

/** Outline a mesh's hard edges with seam lines. */
function outline(mesh: Mesh, finishes: Finishes): void {
  mesh.add(new LineSegments(new EdgesGeometry(mesh.geometry), finishes.seam))
}

/** A parabolic reflector opening toward local +Y with its rim at the given radius. */
function reflector(radius: number, depth: number): LatheGeometry {
  const steps = 10
  const profile = Array.from({ length: steps + 1 }, (_, index) => {
    const r = radius * index / steps
    return new Vector2(r, depth * (r / radius) ** 2)
  })
  return new LatheGeometry(profile, 28)
}

/** A bell nozzle opening toward local +Y. */
function nozzle(throat: number, exit: number, length: number): LatheGeometry {
  const steps = 8
  const profile = Array.from({ length: steps + 1 }, (_, index) => {
    const u = index / steps
    return new Vector2(throat + (exit - throat) * Math.sqrt(u), length * u)
  })
  return new LatheGeometry(profile, 24)
}

const HALF_PI = Math.PI / 2

/** One builder per shape: adds the meshes of a part of size `s` to `g`. */
const BUILDERS: Record<PartShape, (g: Group, s: number, f: Finishes) => void> = {
  wing: (g, s, f) => {
    const yoke = s * 0.14
    put(g, new CylinderGeometry(s * 0.012, s * 0.012, yoke, 8), f.metal, [0, yoke / 2, 0])
    const panels = 3
    const length = (s - yoke) / panels
    for (let index = 0; index < panels; index++) {
      const panel = put(g, new BoxGeometry(s * 0.4, length * 0.96, s * 0.01), f.cell, [0, yoke + length * (index + 0.5), 0])
      outline(panel, f)
      for (const x of [-0.1, 0.1]) {
        put(g, new BoxGeometry(s * 0.004, length * 0.96, s * 0.012), f.metal, [s * x, yoke + length * (index + 0.5), 0])
      }
    }
  },
  bodyPanel: (g, s, f) => {
    outline(put(g, new BoxGeometry(s * 0.5, s * 0.012, s * 0.5), f.cell, [0, s * 0.01, 0]), f)
  },
  battery: (g, s, f) => {
    outline(put(g, new BoxGeometry(s, s * 0.55, s * 0.7), f.dark, [0, 0, 0]), f)
    for (const x of [-0.3, -0.1, 0.1, 0.3]) put(g, new BoxGeometry(s * 0.12, s * 0.58, s * 0.5), f.copper, [s * x, 0, 0])
  },
  camera: (g, s, f) => {
    put(g, new CylinderGeometry(s * 0.26, s * 0.3, s * 0.75, 24), f.white, [0, s * 0.375, 0])
    put(g, new CylinderGeometry(s * 0.31, s * 0.31, s * 0.08, 24), f.dark, [0, s * 0.79, 0])
    put(g, new CylinderGeometry(s * 0.22, s * 0.22, s * 0.02, 24), f.glass, [0, s * 0.835, 0])
  },
  telescope: (g, s, f) => {
    put(g, new CylinderGeometry(s * 0.3, s * 0.3, s * 0.85, 28), f.white, [0, s * 0.425, 0])
    put(g, new CylinderGeometry(s * 0.33, s * 0.33, s * 0.06, 28), f.metal, [0, s * 0.2, 0])
    put(g, new CylinderGeometry(s * 0.34, s * 0.3, s * 0.15, 28, 1, true), f.dark, [0, s * 0.925, 0])
    put(g, new CylinderGeometry(s * 0.27, s * 0.27, s * 0.02, 28), f.glass, [0, s * 0.86, 0])
  },
  sar: (g, s, f) => {
    put(g, new BoxGeometry(s * 0.06, s * 0.12, s * 0.06), f.metal, [0, s * 0.06, 0])
    outline(put(g, new BoxGeometry(s, s * 0.03, s * 0.3), f.white, [0, s * 0.135, 0]), f)
    for (let index = 0; index < 6; index++) {
      put(g, new BoxGeometry(s * 0.14, s * 0.006, s * 0.26), f.copper, [s * (index - 2.5) / 6, s * 0.152, 0])
    }
  },
  reflector: (g, s, f) => {
    put(g, new CylinderGeometry(s * 0.03, s * 0.03, s * 0.3, 10), f.metal, [0, s * 0.15, 0])
    put(g, reflector(s * 0.45, s * 0.16), f.white, [0, s * 0.3, 0])
    put(g, new BoxGeometry(s * 0.14, s * 0.1, s * 0.14), f.copper, [0, s * 0.62, 0])
    for (const turn of [0, HALF_PI * 4 / 3, HALF_PI * 8 / 3]) {
      const at = [Math.cos(turn) * s * 0.2, s * 0.47, Math.sin(turn) * s * 0.2] as const
      put(g, new CylinderGeometry(s * 0.006, s * 0.006, s * 0.5, 6), f.metal, at, [Math.sin(turn) * 0.75, 0, -Math.cos(turn) * 0.75])
    }
  },
  whipArray: (g, s, f) => {
    outline(put(g, new BoxGeometry(s * 0.4, s * 0.12, s * 0.4), f.dark, [0, s * 0.06, 0]), f)
    for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
      put(g, new CylinderGeometry(s * 0.008, s * 0.008, s * 0.85, 6), f.copper, [s * 0.15 * x, s * 0.54, s * 0.15 * z])
    }
  },
  helixArray: (g, s, f) => {
    outline(put(g, new BoxGeometry(s, s * 0.06, s), f.metal, [0, s * 0.03, 0]), f)
    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 1; z++) {
        put(g, new CylinderGeometry(s * 0.05, s * 0.08, s * 0.32, 12), f.copper, [s * 0.3 * x, s * 0.22, s * 0.3 * z])
      }
    }
  },
  spectrometer: (g, s, f) => {
    outline(put(g, new BoxGeometry(s * 0.7, s * 0.5, s * 0.6), f.dark, [0, s * 0.25, 0]), f)
    put(g, new CylinderGeometry(s * 0.16, s * 0.16, s * 0.4, 20), f.metal, [s * 0.1, s * 0.7, 0])
    put(g, new CylinderGeometry(s * 0.13, s * 0.13, s * 0.02, 20), f.glass, [s * 0.1, s * 0.905, 0])
    put(g, new BoxGeometry(s * 0.02, s * 0.5, s * 0.6), f.white, [-s * 0.42, s * 0.3, 0])
  },
  whip: (g, s, f) => {
    put(g, new CylinderGeometry(s * 0.04, s * 0.05, s * 0.08, 10), f.dark, [0, s * 0.04, 0])
    put(g, new CylinderGeometry(s * 0.006, s * 0.01, s * 0.92, 6), f.copper, [0, s * 0.54, 0])
  },
  patch: (g, s, f) => {
    outline(put(g, new BoxGeometry(s, s * 0.08, s), f.white, [0, s * 0.04, 0]), f)
    put(g, new BoxGeometry(s * 0.6, s * 0.02, s * 0.6), f.copper, [0, s * 0.09, 0])
  },
  horn: (g, s, f) => {
    put(g, new CylinderGeometry(s * 0.12, s * 0.12, s * 0.3, 16), f.metal, [0, s * 0.15, 0])
    put(g, new CylinderGeometry(s * 0.42, s * 0.12, s * 0.7, 20, 1, true), f.copper, [0, s * 0.65, 0])
  },
  dish: (g, s, f) => {
    put(g, new CylinderGeometry(s * 0.04, s * 0.05, s * 0.25, 10), f.metal, [0, s * 0.125, 0])
    put(g, new SphereGeometry(s * 0.07, 14, 10), f.dark, [0, s * 0.25, 0])
    put(g, reflector(s * 0.5, s * 0.17), f.white, [0, s * 0.27, 0])
    put(g, new ConeGeometry(s * 0.05, s * 0.1, 12), f.copper, [0, s * 0.72, 0], [Math.PI, 0, 0])
    for (const turn of [0, HALF_PI, HALF_PI * 2, HALF_PI * 3]) {
      const at = [Math.cos(turn) * s * 0.2, s * 0.52, Math.sin(turn) * s * 0.2] as const
      put(g, new CylinderGeometry(s * 0.005, s * 0.005, s * 0.55, 6), f.metal, at, [Math.sin(turn) * 0.72, 0, -Math.cos(turn) * 0.72])
    }
  },
  laser: (g, s, f) => {
    put(g, new CylinderGeometry(s * 0.3, s * 0.34, s * 0.3, 20), f.dark, [0, s * 0.15, 0])
    put(g, new SphereGeometry(s * 0.3, 20, 14), f.white, [0, s * 0.55, 0])
    put(g, new CylinderGeometry(s * 0.14, s * 0.14, s * 0.2, 16), f.metal, [s * 0.24, s * 0.62, 0], [0, 0, -HALF_PI])
    put(g, new CylinderGeometry(s * 0.11, s * 0.11, s * 0.02, 16), f.glow, [s * 0.35, s * 0.62, 0], [0, 0, -HALF_PI])
  },
  rods: (g, s, f) => {
    put(g, new CylinderGeometry(s * 0.06, s * 0.06, s, 10), f.copper, [0, 0, 0])
    put(g, new CylinderGeometry(s * 0.06, s * 0.06, s, 10), f.copper, [0, 0, 0], [0, 0, HALF_PI])
    put(g, new CylinderGeometry(s * 0.06, s * 0.06, s, 10), f.copper, [0, 0, 0], [HALF_PI, 0, 0])
    put(g, new BoxGeometry(s * 0.22, s * 0.22, s * 0.22), f.dark, [0, 0, 0])
  },
  wheels: (g, s, f) => {
    for (const turn of [0, HALF_PI, HALF_PI * 2, HALF_PI * 3]) {
      const x = Math.cos(turn) * s * 0.3
      const z = Math.sin(turn) * s * 0.3
      put(g, new CylinderGeometry(s * 0.22, s * 0.22, s * 0.12, 20), f.metal, [x, 0, z], [Math.sin(turn) * 0.6, 0, -Math.cos(turn) * 0.6])
      put(g, new CylinderGeometry(s * 0.08, s * 0.08, s * 0.14, 12), f.dark, [x, 0, z], [Math.sin(turn) * 0.6, 0, -Math.cos(turn) * 0.6])
    }
  },
  cmg: (g, s, f) => {
    for (const x of [-0.27, 0.27]) {
      put(g, new SphereGeometry(s * 0.2, 18, 12), f.metal, [s * x, 0, 0])
      put(g, new TorusGeometry(s * 0.24, s * 0.02, 8, 28), f.dark, [s * x, 0, 0])
      put(g, new TorusGeometry(s * 0.24, s * 0.02, 8, 28), f.copper, [s * x, 0, 0], [HALF_PI, 0, 0])
    }
  },
  tracker: (g, s, f) => {
    outline(put(g, new BoxGeometry(s * 0.5, s * 0.4, s * 0.5), f.dark, [0, s * 0.2, 0]), f)
    put(g, new CylinderGeometry(s * 0.3, s * 0.18, s * 0.6, 18, 1, true), f.metal, [0, s * 0.7, 0])
    put(g, new CylinderGeometry(s * 0.17, s * 0.17, s * 0.02, 18), f.glass, [0, s * 0.41, 0])
  },
  coldGas: (g, s, f) => {
    put(g, new SphereGeometry(s * 0.32, 20, 14), f.white, [0, -s * 0.3, 0])
    outline(put(g, new BoxGeometry(s * 0.8, s * 0.05, s * 0.8), f.metal, [0, s * 0.025, 0]), f)
    for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
      put(g, nozzle(s * 0.02, s * 0.06, s * 0.14), f.dark, [s * 0.3 * x, s * 0.05, s * 0.3 * z])
    }
  },
  monoprop: (g, s, f) => {
    put(g, new SphereGeometry(s * 0.36, 22, 16), f.metal, [0, -s * 0.34, 0])
    put(g, new CylinderGeometry(s * 0.1, s * 0.14, s * 0.12, 14), f.dark, [0, s * 0.06, 0])
    put(g, nozzle(s * 0.05, s * 0.2, s * 0.4), f.dark, [0, s * 0.12, 0])
  },
  hall: (g, s, f) => {
    put(g, new CylinderGeometry(s * 0.24, s * 0.24, s * 0.5, 20), f.white, [0, -s * 0.3, 0])
    put(g, new CylinderGeometry(s * 0.38, s * 0.38, s * 0.2, 28), f.metal, [0, s * 0.1, 0])
    put(g, new TorusGeometry(s * 0.24, s * 0.05, 10, 32), f.glow, [0, s * 0.2, 0], [HALF_PI, 0, 0])
    put(g, new CylinderGeometry(s * 0.1, s * 0.1, s * 0.06, 14), f.dark, [0, s * 0.22, 0])
  },
  biprop: (g, s, f) => {
    for (const z of [-0.27, 0.27]) put(g, new SphereGeometry(s * 0.25, 22, 16), f.metal, [0, -s * 0.28, s * z])
    put(g, new CylinderGeometry(s * 0.12, s * 0.18, s * 0.16, 16), f.dark, [0, s * 0.08, 0])
    put(g, nozzle(s * 0.07, s * 0.3, s * 0.6), f.copper, [0, s * 0.16, 0])
  },
  radiator: (g, s, f) => {
    put(g, new CylinderGeometry(s * 0.015, s * 0.015, s * 0.12, 8), f.metal, [0, s * 0.06, 0])
    outline(put(g, new BoxGeometry(s * 0.7, s * 0.88, s * 0.02), f.white, [0, s * 0.56, 0]), f)
    for (const x of [-0.2, 0, 0.2]) put(g, new CylinderGeometry(s * 0.012, s * 0.012, s * 0.86, 6), f.metal, [s * x, s * 0.56, s * 0.016])
  },
}

/**
 * Build a part's model.
 * @param part - the catalog part.
 * @param finishes - the bench's shared materials.
 * @returns the model root, origin on the mount point and +Y away from the bus.
 */
export function buildPart(part: Part, finishes: Finishes): Group {
  const group = new Group()
  BUILDERS[part.shape](group, part.size, finishes)
  return group
}

/**
 * Build a bus body: the foil-wrapped box with its frame and panel seams.
 * @param bus - the catalog bus.
 * @param finishes - the bench's shared materials.
 * @returns the model root centred on the bus centre; the box mesh is its first child.
 */
export function buildBus(bus: Bus, finishes: Finishes): Group {
  const [dx, dy, dz] = bus.dims
  const group = new Group()
  const body = put(group, new BoxGeometry(dx, dy, dz), finishes.foil, [0, 0, 0])
  outline(body, finishes)
  const rail = Math.min(dx, dy, dz) * 0.035
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      put(group, new BoxGeometry(rail, dy * 1.01, rail), finishes.metal, [x * (dx - rail) / 2, 0, z * (dz - rail) / 2])
    }
  }
  for (const y of [-1, 1]) {
    put(group, new BoxGeometry(dx * 1.005, rail, dz * 1.005), finishes.metal, [0, y * (dy - rail) / 2, 0])
  }
  return group
}
