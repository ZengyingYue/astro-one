/**
 * The workshop's part catalog: satellite buses, the parts that mount on them,
 * and the missions a build is judged against. Every figure is a representative
 * engineering value for its class, stated in SI-derived units, and is the only
 * input of the budgets in `budgets.ts`.
 */

/** Where a part mounts: a deployable wing hinge, an outer face, the aft thrust plate, or an internal bay. */
export type MountKind = 'wing' | 'face' | 'aft' | 'bay'

/** Part families, in the order the bin lists them. */
export const CATEGORIES = ['power', 'payload', 'comms', 'adcs', 'propulsion', 'thermal'] as const

/** One part family. */
export type Category = typeof CATEGORIES[number]

/** How far a link reaches: low orbit, high orbit (MEO and GEO), or interplanetary range. */
export type RangeClass = 'leo' | 'high' | 'deep'

/** The procedural 3D model a part is drawn with. */
export type PartShape =
  | 'wing' | 'bodyPanel' | 'battery' | 'camera' | 'telescope' | 'sar' | 'reflector' | 'whipArray'
  | 'helixArray' | 'spectrometer' | 'whip' | 'patch' | 'horn' | 'dish' | 'laser' | 'rods' | 'wheels'
  | 'cmg' | 'tracker' | 'coldGas' | 'monoprop' | 'hall' | 'biprop' | 'radiator'

/** One mountable part. Optional figures apply only to the families that carry them. */
export interface Part {
  readonly id: string
  readonly category: Category
  readonly mount: MountKind
  readonly shape: PartShape
  /** Largest drawn dimension in m. */
  readonly size: number
  /** Dry mass in kg. */
  readonly massKg: number
  /** Orbit-average electrical load in W. */
  readonly powerW: number
  /** Sunlit generation in W at 1 AU. */
  readonly generationW?: number
  /** Usable battery capacity in Wh. */
  readonly capacityWh?: number
  /** Orbit-average payload data production in Mbit/s. */
  readonly dataMbps?: number
  /** Pointing accuracy the part needs, in degrees. */
  readonly pointingDeg?: number
  /** Whether the part must look at the Earth from the nadir face. */
  readonly nadir?: boolean
  /** Downlink rate in Mbit/s by range class; zero where the link does not close. */
  readonly rateMbps?: Readonly<Record<RangeClass, number>>
  /** Propellant load in kg. */
  readonly propellantKg?: number
  /** Specific impulse in s. */
  readonly ispS?: number
  /** Heat rejected to space in W. */
  readonly rejectionW?: number
}

/** One satellite bus: the structure every other part mounts on. */
export interface Bus {
  readonly id: string
  /** Structure, harness, and avionics mass in kg. */
  readonly massKg: number
  /** Largest launch mass the structure carries, in kg. */
  readonly maxMassKg: number
  /** Avionics load in W. */
  readonly housekeepingW: number
  /** Heat the body faces reject without a radiator, in W. */
  readonly rejectionW: number
  /** Body dimensions in m: ram axis, nadir axis, wing axis. */
  readonly dims: readonly [number, number, number]
  /** Internal bay count. */
  readonly bays: number
}

/** One mission a build is judged against. */
export interface Mission {
  readonly id: string
  readonly range: RangeClass
  /** Fraction of each orbit spent in the Earth's shadow. */
  readonly eclipseFraction: number
  /** Longest eclipse in hours, sizing the battery. */
  readonly eclipseHours: number
  /** Solar flux relative to 1 AU. */
  readonly solarFactor: number
  /** Fraction of time a ground station is in view. */
  readonly contactFraction: number
  /** Velocity change the mission needs over its life, in m/s. */
  readonly deltaVMs: number
  /** Whether the geomagnetic field is strong enough for magnetic torquing. */
  readonly magneticField: boolean
  /** Payload ids of which the mission needs at least one. */
  readonly payloads: readonly string[]
}

/** The bus a new build starts on, and the fallback for an unknown bus id. */
const DEFAULT_BUS: Bus = { id: 'bus-small', massKg: 55, maxMassKg: 240, housekeepingW: 45, rejectionW: 320, dims: [0.8, 1.0, 0.8], bays: 4 }

/** The buses, smallest first. */
export const BUSES: readonly Bus[] = [
  { id: 'bus-micro', massKg: 18, maxMassKg: 60, housekeepingW: 15, rejectionW: 90, dims: [0.5, 0.6, 0.5], bays: 3 },
  DEFAULT_BUS,
  { id: 'bus-large', massKg: 320, maxMassKg: 2200, housekeepingW: 180, rejectionW: 1300, dims: [1.6, 2.2, 1.6], bays: 6 },
]

/** The mountable parts, grouped by family in bin order. */
export const PARTS: readonly Part[] = [
  { id: 'solar-body', category: 'power', mount: 'face', shape: 'bodyPanel', size: 0.8, massKg: 2, powerW: 0, generationW: 45 },
  { id: 'solar-wing-s', category: 'power', mount: 'wing', shape: 'wing', size: 1.2, massKg: 4, powerW: 0, generationW: 130 },
  { id: 'solar-wing-m', category: 'power', mount: 'wing', shape: 'wing', size: 2.2, massKg: 14, powerW: 0, generationW: 650 },
  { id: 'solar-wing-l', category: 'power', mount: 'wing', shape: 'wing', size: 3.6, massKg: 55, powerW: 0, generationW: 3300 },
  { id: 'battery-s', category: 'power', mount: 'bay', shape: 'battery', size: 0.22, massKg: 3, powerW: 0, capacityWh: 160 },
  { id: 'battery-m', category: 'power', mount: 'bay', shape: 'battery', size: 0.3, massKg: 12, powerW: 0, capacityWh: 800 },
  { id: 'battery-l', category: 'power', mount: 'bay', shape: 'battery', size: 0.38, massKg: 45, powerW: 0, capacityWh: 4000 },

  { id: 'cam-wide', category: 'payload', mount: 'face', shape: 'camera', size: 0.45, massKg: 12, powerW: 35, dataMbps: 8, pointingDeg: 0.1, nadir: true },
  { id: 'cam-hires', category: 'payload', mount: 'face', shape: 'telescope', size: 0.8, massKg: 85, powerW: 180, dataMbps: 40, pointingDeg: 0.01, nadir: true },
  { id: 'sar', category: 'payload', mount: 'face', shape: 'sar', size: 1.5, massKg: 160, powerW: 420, dataMbps: 60, pointingDeg: 0.05, nadir: true },
  { id: 'transponder-ku', category: 'payload', mount: 'face', shape: 'reflector', size: 1.1, massKg: 110, powerW: 1500, dataMbps: 0, pointingDeg: 0.1, nadir: true },
  { id: 'iot-rx', category: 'payload', mount: 'face', shape: 'whipArray', size: 0.5, massKg: 3, powerW: 12, dataMbps: 0.01, pointingDeg: 5 },
  { id: 'gnss-payload', category: 'payload', mount: 'face', shape: 'helixArray', size: 0.9, massKg: 60, powerW: 500, dataMbps: 0, pointingDeg: 0.5, nadir: true },
  { id: 'spectrometer', category: 'payload', mount: 'face', shape: 'spectrometer', size: 0.5, massKg: 25, powerW: 60, dataMbps: 0.5, pointingDeg: 0.02 },

  { id: 'ant-uhf', category: 'comms', mount: 'face', shape: 'whip', size: 0.6, massKg: 0.3, powerW: 4, rateMbps: { leo: 0.01, high: 0, deep: 0 } },
  { id: 'ant-s', category: 'comms', mount: 'face', shape: 'patch', size: 0.3, massKg: 0.5, powerW: 10, rateMbps: { leo: 2, high: 0.1, deep: 0 } },
  { id: 'ant-x', category: 'comms', mount: 'face', shape: 'horn', size: 0.35, massKg: 3, powerW: 60, rateMbps: { leo: 400, high: 150, deep: 2 } },
  { id: 'ant-ka', category: 'comms', mount: 'face', shape: 'dish', size: 0.9, massKg: 12, powerW: 120, pointingDeg: 0.1, rateMbps: { leo: 1500, high: 800, deep: 20 } },
  { id: 'laser', category: 'comms', mount: 'face', shape: 'laser', size: 0.35, massKg: 8, powerW: 50, pointingDeg: 0.005, rateMbps: { leo: 5000, high: 2000, deep: 100 } },

  { id: 'magnetorquer', category: 'adcs', mount: 'bay', shape: 'rods', size: 0.26, massKg: 0.5, powerW: 2 },
  { id: 'wheels', category: 'adcs', mount: 'bay', shape: 'wheels', size: 0.28, massKg: 4, powerW: 15 },
  { id: 'cmg', category: 'adcs', mount: 'bay', shape: 'cmg', size: 0.36, massKg: 30, powerW: 80 },
  { id: 'star-tracker', category: 'adcs', mount: 'face', shape: 'tracker', size: 0.22, massKg: 1, powerW: 5 },

  { id: 'prop-coldgas', category: 'propulsion', mount: 'aft', shape: 'coldGas', size: 0.35, massKg: 6, powerW: 5, propellantKg: 4, ispS: 65 },
  { id: 'prop-mono', category: 'propulsion', mount: 'aft', shape: 'monoprop', size: 0.5, massKg: 18, powerW: 20, propellantKg: 40, ispS: 225 },
  { id: 'prop-hall', category: 'propulsion', mount: 'aft', shape: 'hall', size: 0.45, massKg: 14, powerW: 450, propellantKg: 20, ispS: 1500 },
  { id: 'prop-biprop', category: 'propulsion', mount: 'aft', shape: 'biprop', size: 0.8, massKg: 70, powerW: 40, propellantKg: 700, ispS: 320 },

  { id: 'radiator', category: 'thermal', mount: 'face', shape: 'radiator', size: 0.9, massKg: 6, powerW: 0, rejectionW: 800 },
]

/** The mission a new build is judged against, and the fallback for an unknown mission id. */
const DEFAULT_MISSION: Mission = {
  id: 'leo-eo', range: 'leo', eclipseFraction: 0.36, eclipseHours: 0.58, solarFactor: 1, contactFraction: 0.08, deltaVMs: 120,
  magneticField: true, payloads: ['cam-wide', 'cam-hires', 'sar'],
}

/** The missions, nearest orbit first. */
export const MISSIONS: readonly Mission[] = [
  DEFAULT_MISSION,
  { id: 'leo-iot', range: 'leo', eclipseFraction: 0.36, eclipseHours: 0.58, solarFactor: 1, contactFraction: 0.08, deltaVMs: 50, magneticField: true, payloads: ['iot-rx'] },
  { id: 'meo-nav', range: 'high', eclipseFraction: 0.04, eclipseHours: 0.95, solarFactor: 1, contactFraction: 0.6, deltaVMs: 200, magneticField: false, payloads: ['gnss-payload'] },
  { id: 'geo-comms', range: 'high', eclipseFraction: 0.05, eclipseHours: 1.2, solarFactor: 1, contactFraction: 1, deltaVMs: 1800, magneticField: false, payloads: ['transponder-ku'] },
  { id: 'deep-space', range: 'deep', eclipseFraction: 0, eclipseHours: 0, solarFactor: 0.43, contactFraction: 0.3, deltaVMs: 1000, magneticField: false, payloads: ['spectrometer'] },
]

const PART_BY_ID = new Map(PARTS.map(part => [part.id, part]))
const BUS_BY_ID = new Map(BUSES.map(bus => [bus.id, bus]))
const MISSION_BY_ID = new Map(MISSIONS.map(mission => [mission.id, mission]))

/**
 * Look a part up.
 * @param id - a part id, possibly from an older stored build.
 * @returns the part, or undefined when the catalog has none by that id.
 */
export function findPart(id: string): Part | undefined {
  return PART_BY_ID.get(id)
}

/**
 * Look a bus up.
 * @param id - a bus id, possibly from an older stored build.
 * @returns the bus, or the mid-size bus when the catalog has none by that id.
 */
export function busOf(id: string): Bus {
  return BUS_BY_ID.get(id) ?? DEFAULT_BUS
}

/**
 * Look a mission up.
 * @param id - a mission id, possibly from an older stored build.
 * @returns the mission, or the first mission when the catalog has none by that id.
 */
export function missionOf(id: string): Mission {
  return MISSION_BY_ID.get(id) ?? DEFAULT_MISSION
}
