/**
 * Text the page and the evaluation prompt share: catalog names, slot labels,
 * part figures, budget lines, and rule messages, all resolved through the
 * workshop dictionary.
 */

import { formatFigure, type Budgets, type Finding } from './budgets.ts'
import type { Mount, Slot } from './assembly.ts'
import type { Bus, Category, Mission, Part } from './catalog.ts'
import type { WorkshopLocaleKey } from './locales.ts'

/** The workshop dictionary's translate function. */
export type Translate = (key: WorkshopLocaleKey, params?: Record<string, string>) => string

/**
 * Name a part.
 * @param t - translate.
 * @param part - the part.
 * @returns its localized name.
 */
export function partName(t: Translate, part: Pick<Part, 'id'>): string {
  return t(`part.${part.id}` as WorkshopLocaleKey)
}

/**
 * Name a bus.
 * @param t - translate.
 * @param bus - the bus.
 * @returns its localized name.
 */
export function busName(t: Translate, bus: Bus): string {
  return t(`bus.${bus.id}` as WorkshopLocaleKey)
}

/**
 * Name a mission.
 * @param t - translate.
 * @param mission - the mission.
 * @returns its localized name.
 */
export function missionName(t: Translate, mission: Mission): string {
  return t(`mission.${mission.id}` as WorkshopLocaleKey)
}

/**
 * Describe a mission.
 * @param t - translate.
 * @param mission - the mission.
 * @returns its localized one-line description.
 */
export function missionDescription(t: Translate, mission: Mission): string {
  return t(`missionDesc.${mission.id}` as WorkshopLocaleKey)
}

/**
 * Name a part family.
 * @param t - translate.
 * @param category - the family.
 * @returns its localized name.
 */
export function categoryName(t: Translate, category: Category): string {
  return t(`category.${category}`)
}

/**
 * Label a slot.
 * @param t - translate.
 * @param slot - the slot.
 * @param slots - every slot of the bus, deciding whether the label needs its ordinal.
 * @returns the face name, numbered when the bus has several slots on that face.
 */
export function slotLabel(t: Translate, slot: Slot, slots: readonly Slot[]): string {
  const name = t(`slot.${slot.face}`)
  return slots.filter(other => other.face === slot.face).length > 1 ? `${name} ${slot.ordinal}` : name
}

/**
 * List a part's figures.
 * @param t - translate.
 * @param part - the part.
 * @returns mass first, then each figure the part carries.
 */
export function partFigures(t: Translate, part: Part): readonly string[] {
  const rates = part.rateMbps === undefined ? 0 : Math.max(part.rateMbps.leo, part.rateMbps.high, part.rateMbps.deep)
  return [
    t('unit.mass', { mass: formatFigure(part.massKg) }),
    ...part.powerW > 0 ? [t('unit.power', { power: formatFigure(part.powerW) })] : [],
    ...part.generationW !== undefined ? [t('unit.generation', { power: formatFigure(part.generationW) })] : [],
    ...part.capacityWh !== undefined ? [t('unit.capacity', { capacity: formatFigure(part.capacityWh) })] : [],
    ...part.propellantKg !== undefined && part.ispS !== undefined
      ? [t('unit.propellant', { mass: formatFigure(part.propellantKg), isp: formatFigure(part.ispS) })]
      : [],
    ...part.rateMbps !== undefined ? [t('unit.rate', { rate: formatFigure(rates) })] : [],
    ...part.rejectionW !== undefined ? [t('unit.rejection', { power: formatFigure(part.rejectionW) })] : [],
  ]
}

/** One budget line: its label, its figures, and whether a rule on it failed. */
export interface BudgetLine {
  readonly id: string
  readonly label: string
  readonly value: string
  /** Budget fill from 0 to 1 for the meter; over 1 is clamped by the meter. */
  readonly ratio: number
  readonly severity: Finding['severity'] | null
}

/** The rule-code prefix of each budget line. */
const BUDGET_RULES = ['mass', 'power', 'battery', 'deltav', 'pointing', 'link', 'thermal'] as const

/**
 * Describe the budgets as labelled lines.
 * @param t - translate.
 * @param budgets - the figures.
 * @param findings - the broken rules, marking the lines they concern.
 * @returns the seven budget lines in panel order.
 */
export function budgetLines(t: Translate, budgets: Budgets, findings: readonly Finding[]): readonly BudgetLine[] {
  const f = formatFigure
  const b = budgets
  const share = (used: number, limit: number): number => limit <= 0 ? (used > 0 ? 1 : 0) : used / limit
  const pointing = b.pointingDeg === null
    ? t('budget.pointingNone')
    : b.neededPointingDeg === null
      ? t('budget.pointingFree', { pointing: f(b.pointingDeg) })
      : t('budget.pointingValue', { pointing: f(b.pointingDeg), needed: f(b.neededPointingDeg) })
  const rows: readonly (readonly [typeof BUDGET_RULES[number], WorkshopLocaleKey, string, number])[] = [
    ['mass', 'budget.mass', t('budget.massValue', { wet: f(b.wetKg), max: f(b.maxKg), dry: f(b.dryKg) }), share(b.wetKg, b.maxKg)],
    ['power', 'budget.power', t('budget.powerValue', { generation: f(b.generationW), load: f(b.loadW) }), share(b.loadW, b.generationW)],
    ['battery', 'budget.battery', t('budget.batteryValue', { capacity: f(b.capacityWh), needed: f(b.neededWh) }), share(b.neededWh, b.capacityWh)],
    ['deltav', 'budget.deltaV', t('budget.deltaVValue', { deltaV: f(b.deltaVMs), needed: f(b.neededDeltaVMs) }), share(b.neededDeltaVMs, b.deltaVMs)],
    ['pointing', 'budget.pointing', pointing, b.pointingDeg === null ? 1 : share(b.pointingDeg, b.neededPointingDeg ?? Infinity)],
    ['link', 'budget.link', t('budget.linkValue', { downlink: f(b.downlinkMbps), data: f(b.dataMbps) }), share(b.dataMbps, b.downlinkMbps)],
    ['thermal', 'budget.thermal', t('budget.thermalValue', { heat: f(b.heatW), rejection: f(b.rejectionW) }), share(b.heatW, b.rejectionW)],
  ]
  return rows.map(([id, label, value, ratio]) => {
    const hits = findings.filter(finding => finding.code.startsWith(`${id}.`))
    const severity = hits.some(hit => hit.severity === 'error') ? 'error' : hits.length > 0 ? 'warning' : null
    return { id, label: t(label), value, ratio, severity }
  })
}

/**
 * Word a broken rule.
 * @param t - translate.
 * @param finding - the finding.
 * @returns its localized message with the figures filled in.
 */
export function findingText(t: Translate, finding: Finding): string {
  const { part, ...figures } = finding.params
  return t(`finding.${finding.code}`, part === undefined ? figures : { ...figures, part: partName(t, { id: part }) })
}

/** Everything the evaluation prompt describes. */
export interface PromptInput {
  readonly bus: Bus
  readonly mission: Mission
  readonly mounts: readonly Mount[]
  readonly slots: readonly Slot[]
  readonly budgets: Budgets
  readonly findings: readonly Finding[]
}

/**
 * Write the evaluation request sent to the model: the mission, the bus, every
 * mounted part with its slot and figures, the budgets, and the rule findings,
 * followed by the five answers asked for.
 * @param t - translate; the prompt is written in the interface language.
 * @param input - the build and its computed budgets.
 * @returns the prompt as Markdown.
 */
export function evaluationPrompt(t: Translate, input: PromptInput): string {
  const { bus, mission, mounts, slots, budgets, findings } = input
  const parts = mounts.length === 0
    ? [t('prompt.partsNone')]
    : mounts.map(({ slot, part }) => `- ${slotLabel(t, slot, slots)}: ${partName(t, part)} (${partFigures(t, part).join(', ')})`)
  const rules = findings.length === 0
    ? [t('prompt.findingsNone')]
    : findings.map(finding => `- [${t(`severity.${finding.severity}`)}] ${findingText(t, finding)}`)
  return [
    t('prompt.lead'),
    '',
    `## ${t('prompt.mission')}`,
    `${missionName(t, mission)}: ${missionDescription(t, mission)}`,
    '',
    `## ${t('prompt.bus')}`,
    t('prompt.busValue', {
      name: busName(t, bus), mass: formatFigure(bus.massKg), max: formatFigure(bus.maxMassKg), power: formatFigure(bus.housekeepingW),
    }),
    '',
    `## ${t('prompt.parts')}`,
    ...parts,
    '',
    `## ${t('prompt.budgets')}`,
    ...budgetLines(t, budgets, findings).map(line => `- ${line.label}: ${line.value}`),
    '',
    `## ${t('prompt.findings')}`,
    ...rules,
    '',
    t('prompt.ask'),
  ].join('\n')
}
