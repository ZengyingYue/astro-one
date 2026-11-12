/**
 * The build a user assembles: which bus, which part on which mount slot, and
 * the bench's viewing state. Slot positions derive from the bus dimensions, and
 * every write goes through the store actions declared here.
 */

import { defineStore, type EngineStoreHandle } from '@astro-one/client-store'
import { BUSES, MISSIONS, busOf, findPart, type Bus, type MountKind, type Part } from './catalog.ts'

/** The bus location a slot sits on. */
export type SlotFace = 'wingL' | 'wingR' | 'nadir' | 'zenith' | 'ram' | 'aft' | 'bay'

/** A three-component vector in bus coordinates: ram, zenith, left wing. */
export type Vec3 = readonly [number, number, number]

/** One mount slot of a bus. */
export interface Slot {
  readonly id: string
  readonly kind: MountKind
  readonly face: SlotFace
  /** One-based position among the slots of the same face. */
  readonly ordinal: number
  /** Mount point in m from the bus centre. */
  readonly position: Vec3
  /** Outward unit normal; zero for an internal bay. */
  readonly normal: Vec3
}

/** One part mounted on one slot. */
export interface Mount {
  readonly slot: Slot
  readonly part: Part
}

/** The stored build and bench state. */
export interface WorkshopState {
  busId: string
  missionId: string
  /** Part id by slot id. */
  mounts: Record<string, string>
  /** The part picked from the bin and waiting for a slot. */
  held: string | null
  /** The slot the keyboard cursor is on. */
  focus: string | null
  /** Whether the bench shows the exploded view. */
  exploded: boolean
}

/** A ready-made build for one mission. */
export interface Preset {
  readonly missionId: string
  readonly busId: string
  readonly mounts: Readonly<Record<string, string>>
}

/** The Earth-observation build a first visit starts from. */
const STARTING_PRESET: Preset = {
  missionId: 'leo-eo',
  busId: 'bus-small',
  mounts: {
    'wing-l': 'solar-wing-m', 'wing-r': 'solar-wing-m', 'nadir-1': 'cam-wide', 'zenith-1': 'star-tracker',
    'zenith-2': 'ant-s', 'ram-1': 'ant-x', 'aft-1': 'prop-mono', 'bay-1': 'battery-m', 'bay-2': 'wheels',
    'bay-3': 'magnetorquer',
  },
}

/** One ready-made build per mission that has one, in mission order. */
export const PRESETS: readonly Preset[] = [
  STARTING_PRESET,
  {
    missionId: 'leo-iot',
    busId: 'bus-micro',
    mounts: {
      'wing-l': 'solar-wing-s', 'wing-r': 'solar-wing-s', 'nadir-1': 'iot-rx', 'zenith-1': 'ant-uhf',
      'ram-1': 'ant-s', 'aft-1': 'prop-coldgas', 'bay-1': 'battery-s', 'bay-2': 'magnetorquer',
    },
  },
  {
    missionId: 'geo-comms',
    busId: 'bus-large',
    mounts: {
      'wing-l': 'solar-wing-l', 'wing-r': 'solar-wing-l', 'nadir-1': 'transponder-ku', 'nadir-2': 'ant-ka',
      'zenith-1': 'star-tracker', 'zenith-2': 'radiator', 'ram-1': 'ant-s', 'aft-1': 'prop-biprop',
      'bay-1': 'battery-l', 'bay-2': 'cmg',
    },
  },
  {
    missionId: 'deep-space',
    busId: 'bus-large',
    mounts: {
      'wing-l': 'solar-wing-l', 'wing-r': 'solar-wing-l', 'nadir-1': 'spectrometer', 'zenith-1': 'star-tracker',
      'ram-1': 'ant-ka', 'ram-2': 'ant-x', 'aft-1': 'prop-biprop', 'bay-1': 'battery-m', 'bay-2': 'cmg',
    },
  },
]

/** Face slots per bus face: one on the smallest bus, two where the face is large enough. */
function faceCount(bus: Bus, face: 'nadir' | 'zenith' | 'ram'): number {
  const index = BUSES.indexOf(bus)
  if (index >= 2) return 2
  return index === 1 && face === 'zenith' ? 2 : 1
}

/**
 * Lay out the mount slots of a bus.
 * @param bus - the bus.
 * @returns its slots: wings, nadir, zenith, and ram faces, the aft plate, then the bays.
 */
export function slotsOf(bus: Bus): readonly Slot[] {
  const [dx, dy, dz] = bus.dims
  const slots: Slot[] = [
    { id: 'wing-l', kind: 'wing', face: 'wingL', ordinal: 1, position: [0, 0, dz / 2], normal: [0, 0, 1] },
    { id: 'wing-r', kind: 'wing', face: 'wingR', ordinal: 1, position: [0, 0, -dz / 2], normal: [0, 0, -1] },
  ]
  const spread = (count: number, index: number, extent: number): number =>
    count === 1 ? 0 : (index === 0 ? -1 : 1) * extent / 4
  for (const face of ['nadir', 'zenith', 'ram'] as const) {
    const count = faceCount(bus, face)
    for (let index = 0; index < count; index++) {
      const position: Vec3 = face === 'ram'
        ? [dx / 2, spread(count, index, dy), 0]
        : [spread(count, index, dx), face === 'nadir' ? -dy / 2 : dy / 2, 0]
      const normal: Vec3 = face === 'ram' ? [1, 0, 0] : [0, face === 'nadir' ? -1 : 1, 0]
      slots.push({ id: `${face}-${index + 1}`, kind: 'face', face, ordinal: index + 1, position, normal })
    }
  }
  slots.push({ id: 'aft-1', kind: 'aft', face: 'aft', ordinal: 1, position: [-dx / 2, 0, 0], normal: [-1, 0, 0] })
  for (let index = 0; index < bus.bays; index++) {
    const y = dy * ((index + 0.5) / bus.bays - 0.5)
    slots.push({ id: `bay-${index + 1}`, kind: 'bay', face: 'bay', ordinal: index + 1, position: [0, y, 0], normal: [0, 0, 0] })
  }
  return slots
}

/**
 * Read the mounts a stored build still supports. A stored build can name a
 * part the catalog dropped or a slot another bus had; those entries are left out.
 * @param state - the stored build.
 * @returns the valid mounts in slot order.
 */
export function mountsOf(state: Pick<WorkshopState, 'busId' | 'mounts'>): readonly Mount[] {
  return slotsOf(busOf(state.busId)).flatMap((slot) => {
    const id = state.mounts[slot.id]
    const part = id === undefined ? undefined : findPart(id)
    return part !== undefined && part.mount === slot.kind ? [{ slot, part }] : []
  })
}

/**
 * Find the first free slot a part fits.
 * @param state - the build.
 * @param part - the part to place.
 * @returns the slot, or undefined when every fitting slot is taken.
 */
export function freeSlotFor(state: Pick<WorkshopState, 'busId' | 'mounts'>, part: Part): Slot | undefined {
  const taken = new Set(mountsOf(state).map(mount => mount.slot.id))
  return slotsOf(busOf(state.busId)).find(slot => slot.kind === part.mount && !taken.has(slot.id))
}

function slotById(state: WorkshopState, slotId: string): Slot | undefined {
  return slotsOf(busOf(state.busId)).find(slot => slot.id === slotId)
}

function initialState(): WorkshopState {
  const preset = STARTING_PRESET
  return { busId: preset.busId, missionId: preset.missionId, mounts: { ...preset.mounts }, held: null, focus: null, exploded: false }
}

/** The complete write set of the workshop store. */
type WorkshopActions = {
  selectBus: (draft: WorkshopState, busId: string) => void
  selectMission: (draft: WorkshopState, missionId: string) => void
  hold: (draft: WorkshopState, partId: string | null) => void
  install: (draft: WorkshopState, slotId: string, partId: string) => void
  remove: (draft: WorkshopState, slotId: string) => void
  move: (draft: WorkshopState, fromSlotId: string, toSlotId: string) => void
  focus: (draft: WorkshopState, slotId: string | null) => void
  stepFocus: (draft: WorkshopState, step: 1 | -1) => void
  toggleExploded: (draft: WorkshopState) => void
  loadPreset: (draft: WorkshopState, missionId: string) => void
  clear: (draft: WorkshopState) => void
}

/** The workshop store handle type components read. */
export type WorkshopStore = EngineStoreHandle<WorkshopState, WorkshopActions>

/**
 * Declare the workshop store. The build persists in browser storage so it
 * survives a reload; the first visit starts from the Earth-observation preset.
 * @returns the store handle.
 */
export function createWorkshopStore(): WorkshopStore {
  return defineStore({
    init: initialState,
    persist: 'astro-one.satelliteWorkshop',
    actions: {
      /**
       * Change the bus, keeping the parts whose slots the new bus also has.
       * @param d - draft state.
       * @param busId - the bus to build on.
       */
      selectBus: (d, busId: string) => {
        d.busId = busOf(busId).id
        d.mounts = Object.fromEntries(mountsOf(d).map(mount => [mount.slot.id, mount.part.id]))
        d.focus = null
      },
      /**
       * Change the mission the build is judged against.
       * @param d - draft state.
       * @param missionId - a catalog mission id.
       */
      selectMission: (d, missionId: string) => {
        if (MISSIONS.some(mission => mission.id === missionId)) d.missionId = missionId
      },
      /**
       * Pick a part from the bin, or put the held part down.
       * @param d - draft state.
       * @param partId - the part to hold; null or an unknown id holds nothing.
       */
      hold: (d, partId: string | null) => {
        d.held = partId !== null && findPart(partId) !== undefined ? partId : null
      },
      /**
       * Mount a part on a slot it fits, replacing the slot's part, and put the held part down.
       * @param d - draft state.
       * @param slotId - the target slot.
       * @param partId - the part to mount.
       */
      install: (d, slotId: string, partId: string) => {
        const slot = slotById(d, slotId)
        const part = findPart(partId)
        if (slot === undefined || part === undefined || part.mount !== slot.kind) return
        d.mounts[slot.id] = part.id
        d.held = null
        d.focus = slot.id
      },
      /**
       * Take the part off a slot.
       * @param d - draft state.
       * @param slotId - the slot to empty.
       */
      remove: (d, slotId: string) => {
        d.mounts = Object.fromEntries(Object.entries(d.mounts).filter(([id]) => id !== slotId))
      },
      /**
       * Move a part to another slot of the same kind; an occupied target swaps parts.
       * @param d - draft state.
       * @param fromSlotId - the slot holding the part.
       * @param toSlotId - the slot to move it to.
       */
      move: (d, fromSlotId: string, toSlotId: string) => {
        const from = slotById(d, fromSlotId)
        const to = slotById(d, toSlotId)
        const moving = d.mounts[fromSlotId]
        if (from === undefined || to === undefined || moving === undefined || from.kind !== to.kind || from.id === to.id) return
        const displaced = d.mounts[to.id]
        const rest = Object.entries(d.mounts).filter(([id]) => id !== from.id && id !== to.id)
        const swapped: [string, string][] = displaced === undefined ? [] : [[from.id, displaced]]
        d.mounts = Object.fromEntries([...rest, [to.id, moving], ...swapped])
        d.focus = to.id
      },
      /**
       * Put the keyboard cursor on a slot.
       * @param d - draft state.
       * @param slotId - the slot, or null for none.
       */
      focus: (d, slotId: string | null) => {
        d.focus = slotId
      },
      /**
       * Step the keyboard cursor through the slots, wrapping at either end.
       * While a part is held, the cursor visits only the slots that part fits.
       * @param d - draft state.
       * @param step - forward or backward.
       */
      stepFocus: (d, step: 1 | -1) => {
        const held = d.held === null ? undefined : findPart(d.held)
        const slots = slotsOf(busOf(d.busId)).filter(slot => held === undefined || slot.kind === held.mount)
        const current = slots.findIndex(slot => slot.id === d.focus)
        const next = current === -1 ? (step === 1 ? 0 : slots.length - 1) : (current + step + slots.length) % slots.length
        const target = slots[next]
        /* v8 ignore next -- every bus has a slot of every mount kind, so the list is never empty. */
        if (target === undefined) return
        d.focus = target.id
      },
      /**
       * Switch between the assembled and the exploded view.
       * @param d - draft state.
       */
      toggleExploded: (d) => {
        d.exploded = !d.exploded
      },
      /**
       * Replace the build with a mission's preset and select that mission.
       * @param d - draft state.
       * @param missionId - the preset's mission.
       */
      loadPreset: (d, missionId: string) => {
        const preset = PRESETS.find(candidate => candidate.missionId === missionId)
        if (preset === undefined) return
        d.busId = preset.busId
        d.missionId = preset.missionId
        d.mounts = { ...preset.mounts }
        d.held = null
        d.focus = null
      },
      /**
       * Strip every part off the bus.
       * @param d - draft state.
       */
      clear: (d) => {
        d.mounts = {}
        d.held = null
        d.focus = null
      },
    },
  })
}
