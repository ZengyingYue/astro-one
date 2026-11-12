/**
 * Engineering budgets and rule findings for a build. Each budget is a
 * first-order sizing relation over the catalog figures: mass against the bus
 * limit, orbit-average power, eclipse energy, the rocket equation, attitude
 * control accuracy, downlink volume, and heat rejection. The findings name
 * what a budget or a mounting rule refuses; the model's evaluation starts from them.
 */

import type { Bus, Mission } from './catalog.ts'
import type { Mount } from './assembly.ts'

/** Standard gravity in m/s², the rocket equation's impulse constant. */
const G0 = 9.80665

/** Deepest battery discharge the eclipse budget allows. */
const DEPTH_OF_DISCHARGE = 0.6

/** Mass margin under which the build is reported as tight. */
const MASS_MARGIN = 0.1

/** Power margin under which the build is reported as tight. */
const POWER_MARGIN = 0.2

/** The computed budgets of a build against a mission. */
export interface Budgets {
  readonly dryKg: number
  readonly wetKg: number
  readonly maxKg: number
  /** Orbit-average generation in W after eclipse and solar distance. */
  readonly generationW: number
  readonly loadW: number
  readonly capacityWh: number
  /** Capacity the longest eclipse needs at the allowed depth of discharge. */
  readonly neededWh: number
  readonly deltaVMs: number
  readonly neededDeltaVMs: number
  /** Achieved pointing accuracy in degrees; null without an attitude actuator. */
  readonly pointingDeg: number | null
  /** Tightest pointing a mounted part needs; null when no part states one. */
  readonly neededPointingDeg: number | null
  /** Orbit-average downlink in Mbit/s after ground contact time. */
  readonly downlinkMbps: number
  readonly dataMbps: number
  readonly heatW: number
  readonly rejectionW: number
}

/** A rule's verdict: `error` fails the mission, `warning` is a risk to justify. */
export type Severity = 'error' | 'warning'

/** Every rule a build can break. */
export type FindingCode =
  | 'mass.over' | 'mass.tight' | 'power.none' | 'power.deficit' | 'power.tight' | 'battery.short'
  | 'deltav.none' | 'deltav.short' | 'pointing.none' | 'pointing.coarse' | 'pointing.noDump'
  | 'pointing.magnetic' | 'link.none' | 'link.range' | 'link.short' | 'thermal.over'
  | 'payload.missing' | 'payload.offNadir' | 'tracker.nadir' | 'wing.single'

/** One broken rule with the figures its message quotes. */
export interface Finding {
  readonly severity: Severity
  readonly code: FindingCode
  /** Message parameters: formatted figures, or a part id under `part`. */
  readonly params: Readonly<Record<string, string>>
}

/**
 * Format a figure with at most three significant digits and no trailing zeros.
 * @param value - the figure.
 * @returns the text the panel and the evaluation prompt quote.
 */
export function formatFigure(value: number): string {
  if (Math.abs(value) >= 100) return String(Math.round(value))
  return String(Number(value.toPrecision(3)))
}

/** Accuracy an actuator set reaches, with and without a star tracker. */
function pointing(ids: ReadonlySet<string>, mission: Mission): number | null {
  const tracked = ids.has('star-tracker')
  if (ids.has('cmg')) return tracked ? 0.005 : 0.1
  if (ids.has('wheels')) return tracked ? 0.05 : 0.5
  if (ids.has('magnetorquer') && mission.magneticField) return 5
  return null
}

/**
 * Compute the budgets of a build.
 * @param bus - the bus.
 * @param mounts - the mounted parts.
 * @param mission - the mission the build flies.
 * @returns every budget figure.
 */
export function computeBudgets(bus: Bus, mounts: readonly Mount[], mission: Mission): Budgets {
  const parts = mounts.map(mount => mount.part)
  const sum = (pick: (part: typeof parts[number]) => number | undefined): number =>
    parts.reduce((total, part) => total + (pick(part) ?? 0), 0)
  const dryKg = bus.massKg + sum(part => part.massKg)
  const wetKg = dryKg + sum(part => part.propellantKg)
  const loadW = bus.housekeepingW + sum(part => part.powerW)
  const engine = parts.find(part => part.ispS !== undefined)
  const needs = parts.flatMap(part => part.pointingDeg === undefined ? [] : [part.pointingDeg])
  return {
    dryKg,
    wetKg,
    maxKg: bus.maxMassKg,
    generationW: sum(part => part.generationW) * (1 - mission.eclipseFraction) * mission.solarFactor,
    loadW,
    capacityWh: sum(part => part.capacityWh),
    neededWh: loadW * mission.eclipseHours / DEPTH_OF_DISCHARGE,
    deltaVMs: engine?.ispS === undefined ? 0 : engine.ispS * G0 * Math.log(wetKg / dryKg),
    neededDeltaVMs: mission.deltaVMs,
    pointingDeg: pointing(new Set(parts.map(part => part.id)), mission),
    neededPointingDeg: needs.length === 0 ? null : Math.min(...needs),
    downlinkMbps: sum(part => part.rateMbps?.[mission.range]) * mission.contactFraction,
    dataMbps: sum(part => part.dataMbps),
    heatW: loadW,
    rejectionW: bus.rejectionW + sum(part => part.rejectionW),
  }
}

/**
 * Check a build against its budgets and the mounting rules.
 * @param mounts - the mounted parts.
 * @param mission - the mission the build flies.
 * @param budgets - the build's budgets from {@link computeBudgets}.
 * @returns the broken rules, errors first; empty when the build passes every rule.
 */
export function findIssues(mounts: readonly Mount[], mission: Mission, budgets: Budgets): readonly Finding[] {
  const findings: Finding[] = []
  const add = (severity: Severity, code: FindingCode, params: Record<string, number | string> = {}): void => {
    findings.push({
      severity,
      code,
      params: Object.fromEntries(Object.entries(params).map(([key, value]) =>
        [key, typeof value === 'number' ? formatFigure(value) : value])),
    })
  }
  const ids = new Set(mounts.map(mount => mount.part.id))
  const b = budgets

  if (!mission.payloads.some(id => ids.has(id))) add('error', 'payload.missing')

  if (b.wetKg > b.maxKg) add('error', 'mass.over', { wet: b.wetKg, max: b.maxKg })
  else if (b.wetKg > b.maxKg * (1 - MASS_MARGIN)) add('warning', 'mass.tight', { wet: b.wetKg, max: b.maxKg })

  if (b.generationW === 0) add('error', 'power.none')
  else if (b.generationW < b.loadW) add('error', 'power.deficit', { generation: b.generationW, load: b.loadW })
  else if (b.generationW < b.loadW * (1 + POWER_MARGIN)) add('warning', 'power.tight', { generation: b.generationW, load: b.loadW })

  if (b.capacityWh < b.neededWh) add('error', 'battery.short', { capacity: b.capacityWh, needed: b.neededWh })

  const propelled = mounts.some(mount => mount.part.category === 'propulsion')
  if (!propelled) add('error', 'deltav.none', { needed: b.neededDeltaVMs })
  else if (b.deltaVMs < b.neededDeltaVMs) add('error', 'deltav.short', { deltaV: b.deltaVMs, needed: b.neededDeltaVMs })

  if (b.pointingDeg === null) add('error', 'pointing.none')
  else if (b.neededPointingDeg !== null && b.pointingDeg > b.neededPointingDeg) {
    add('error', 'pointing.coarse', { pointing: b.pointingDeg, needed: b.neededPointingDeg })
  }
  const magnetic = ids.has('magnetorquer') && mission.magneticField
  if ((ids.has('wheels') || ids.has('cmg')) && !magnetic && !propelled) add('warning', 'pointing.noDump')
  if (ids.has('magnetorquer') && !mission.magneticField) add('warning', 'pointing.magnetic')

  const antennas = mounts.filter(mount => mount.part.rateMbps !== undefined)
  if (antennas.length === 0) add('error', 'link.none')
  else if (b.downlinkMbps === 0) add('error', 'link.range')
  else if (b.downlinkMbps < b.dataMbps) add('error', 'link.short', { downlink: b.downlinkMbps, data: b.dataMbps })

  if (b.heatW > b.rejectionW) add('warning', 'thermal.over', { heat: b.heatW, rejection: b.rejectionW })

  for (const { part, slot } of mounts) {
    if (part.nadir === true && slot.face !== 'nadir') add('warning', 'payload.offNadir', { part: part.id })
    if (part.id === 'star-tracker' && slot.face === 'nadir') add('warning', 'tracker.nadir')
  }
  if (mounts.filter(mount => mount.slot.kind === 'wing').length === 1) add('warning', 'wing.single')

  return [...findings.filter(finding => finding.severity === 'error'), ...findings.filter(finding => finding.severity === 'warning')]
}
