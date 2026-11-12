import { describe, expect, it } from 'vitest'
import { PRESETS, createWorkshopStore, freeSlotFor, mountsOf, slotsOf } from '../src/client/assembly.ts'
import { computeBudgets, findIssues, formatFigure, type FindingCode } from '../src/client/budgets.ts'
import { BUSES, CATEGORIES, MISSIONS, PARTS, busOf, findPart, missionOf } from '../src/client/catalog.ts'
import { en, zh } from '../src/client/locales.ts'
import {
  budgetLines, busName, categoryName, evaluationPrompt, findingText, missionDescription, missionName, partFigures,
  partName, slotLabel, type PromptInput,
} from '../src/client/presentation.ts'
import { tEn, tZh } from './locale.client.ts'

/** Mount parts on a bus by slot id and report the codes of the rules the build breaks. */
function check(busId: string, missionId: string, mounts: Record<string, string>) {
  const bus = busOf(busId)
  const mission = missionOf(missionId)
  const mounted = mountsOf({ busId, mounts })
  const budgets = computeBudgets(bus, mounted, mission)
  const findings = findIssues(mounted, mission, budgets)
  return { bus, mission, mounted, budgets, findings, codes: findings.map(finding => finding.code) }
}

/** The prompt input of a checked build. */
function inputOf(build: ReturnType<typeof check>): PromptInput {
  const { bus, mission, mounted, budgets, findings } = build
  return { bus, mission, mounts: mounted, slots: slotsOf(bus), budgets, findings }
}

const EO = PRESETS[0]!.mounts

describe('catalog', () => {
  it('resolves ids and falls back for ids an older stored build may carry', () => {
    expect(findPart('sar')?.massKg).toBe(160)
    expect(findPart('gone')).toBeUndefined()
    expect(busOf('bus-large').bays).toBe(6)
    expect(busOf('gone').id).toBe('bus-small')
    expect(missionOf('geo-comms').deltaVMs).toBe(1800)
    expect(missionOf('gone').id).toBe('leo-eo')
  })

  it('names every bus, mission, part, family, and rule in both dictionaries', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    for (const t of [tEn, tZh]) {
      for (const bus of BUSES) expect(busName(t, bus)).toBeTruthy()
      for (const mission of MISSIONS) {
        expect(missionName(t, mission)).toBeTruthy()
        expect(missionDescription(t, mission)).toBeTruthy()
      }
      for (const part of PARTS) expect(partName(t, part)).toBeTruthy()
      for (const category of CATEGORIES) expect(categoryName(t, category)).toBeTruthy()
    }
    expect(new Set(PARTS.map(part => part.category))).toEqual(new Set(CATEGORIES))
  })
})

describe('mount slots', () => {
  it('gives larger buses more face slots and bays, each on its face', () => {
    expect(slotsOf(busOf('bus-micro')).map(slot => slot.id)).toEqual(
      ['wing-l', 'wing-r', 'nadir-1', 'zenith-1', 'ram-1', 'aft-1', 'bay-1', 'bay-2', 'bay-3'])
    expect(slotsOf(busOf('bus-small')).filter(slot => slot.kind === 'face').map(slot => slot.id)).toEqual(
      ['nadir-1', 'zenith-1', 'zenith-2', 'ram-1'])
    const large = slotsOf(busOf('bus-large'))
    expect(large.filter(slot => slot.kind === 'face')).toHaveLength(6)
    expect(large.find(slot => slot.id === 'nadir-2')).toMatchObject({ position: [0.4, -1.1, 0], normal: [0, -1, 0], ordinal: 2 })
    expect(large.find(slot => slot.id === 'ram-1')).toMatchObject({ position: [0.8, -0.55, 0], normal: [1, 0, 0] })
    expect(large.find(slot => slot.id === 'aft-1')).toMatchObject({ position: [-0.8, 0, 0], kind: 'aft' })
    expect(large.find(slot => slot.id === 'bay-1')?.normal).toEqual([0, 0, 0])
  })

  it('reads only the mounts the bus and the catalog still support', () => {
    const mounts = mountsOf({ busId: 'bus-micro', mounts: { 'wing-l': 'solar-wing-s', 'nadir-1': 'gone', 'zenith-2': 'ant-s', 'bay-1': 'cam-wide' } })
    expect(mounts.map(mount => [mount.slot.id, mount.part.id])).toEqual([['wing-l', 'solar-wing-s']])
  })

  it('finds the first free slot a part fits', () => {
    const state = { busId: 'bus-micro', mounts: { 'nadir-1': 'cam-wide', 'zenith-1': 'ant-s', 'ram-1': 'ant-x' } }
    expect(freeSlotFor(state, findPart('wheels')!)?.id).toBe('bay-1')
    expect(freeSlotFor(state, findPart('star-tracker')!)).toBeUndefined()
  })
})

describe('workshop store', () => {
  const open = () => createWorkshopStore().create(`test-${Math.random()}`)

  it('starts from the Earth-observation preset', () => {
    const store = open()
    expect(store.getSnapshot()).toMatchObject({ busId: 'bus-small', missionId: 'leo-eo', held: null, focus: null, exploded: false })
    expect(store.getSnapshot().mounts).toEqual(EO)
  })

  it('holds, mounts, moves, swaps, and removes parts', () => {
    const store = open()
    const { actions } = store
    actions.hold('gone')
    expect(store.getSnapshot().held).toBeNull()
    actions.hold('radiator')
    expect(store.getSnapshot().held).toBe('radiator')
    // A part is refused by a slot of another kind, an unknown slot, and an unknown part id.
    actions.install('bay-1', 'radiator')
    actions.install('nowhere', 'radiator')
    actions.install('ram-1', 'gone')
    expect(store.getSnapshot().mounts).toEqual(EO)
    actions.install('ram-1', 'radiator')
    expect(store.getSnapshot()).toMatchObject({ held: null, focus: 'ram-1' })
    expect(store.getSnapshot().mounts['ram-1']).toBe('radiator')

    actions.move('zenith-1', 'zenith-2')
    expect(store.getSnapshot().mounts).toMatchObject({ 'zenith-1': 'ant-s', 'zenith-2': 'star-tracker' })
    actions.remove('zenith-1')
    actions.move('zenith-2', 'zenith-1')
    expect(store.getSnapshot().mounts['zenith-1']).toBe('star-tracker')
    expect(store.getSnapshot().mounts['zenith-2']).toBeUndefined()
    expect(store.getSnapshot().focus).toBe('zenith-1')
    // Moves across kinds, from an empty slot, onto itself, or between unknown slots change nothing.
    const before = store.getSnapshot().mounts
    actions.move('zenith-1', 'bay-4')
    actions.move('zenith-2', 'nadir-1')
    actions.move('zenith-1', 'zenith-1')
    actions.move('nowhere', 'zenith-1')
    actions.move('zenith-1', 'nowhere')
    expect(store.getSnapshot().mounts).toEqual(before)
  })

  it('keeps fitting parts across a bus change and selects only known missions', () => {
    const store = open()
    store.actions.focus('zenith-2')
    store.actions.selectBus('bus-micro')
    expect(store.getSnapshot().busId).toBe('bus-micro')
    expect(store.getSnapshot().focus).toBeNull()
    expect(Object.keys(store.getSnapshot().mounts)).not.toContain('zenith-2')
    expect(store.getSnapshot().mounts['nadir-1']).toBe('cam-wide')
    store.actions.selectMission('gone')
    expect(store.getSnapshot().missionId).toBe('leo-eo')
    store.actions.selectMission('deep-space')
    expect(store.getSnapshot().missionId).toBe('deep-space')
  })

  it('steps the slot cursor around every slot, or around the slots the held part fits', () => {
    const store = open()
    store.actions.stepFocus(-1)
    expect(store.getSnapshot().focus).toBe('bay-4')
    store.actions.stepFocus(1)
    expect(store.getSnapshot().focus).toBe('wing-l')
    store.actions.focus(null)
    store.actions.stepFocus(1)
    expect(store.getSnapshot().focus).toBe('wing-l')
    store.actions.hold('battery-s')
    store.actions.stepFocus(1)
    expect(store.getSnapshot().focus).toBe('bay-1')
    store.actions.stepFocus(-1)
    expect(store.getSnapshot().focus).toBe('bay-4')
  })

  it('toggles the exploded view, loads presets, and clears the bus', () => {
    const store = open()
    store.actions.toggleExploded()
    expect(store.getSnapshot().exploded).toBe(true)
    store.actions.hold('sar')
    store.actions.loadPreset('meo-nav')
    expect(store.getSnapshot().missionId).toBe('leo-eo')
    store.actions.loadPreset('geo-comms')
    expect(store.getSnapshot()).toMatchObject({ busId: 'bus-large', missionId: 'geo-comms', held: null, focus: null })
    store.actions.focus('aft-1')
    store.actions.hold('sar')
    store.actions.clear()
    expect(store.getSnapshot()).toMatchObject({ mounts: {}, held: null, focus: null })
  })
})

describe('budgets', () => {
  it('passes every preset against its own mission', () => {
    for (const preset of PRESETS) {
      expect(check(preset.busId, preset.missionId, preset.mounts).codes, preset.missionId).toEqual([])
    }
  })

  it('computes the Earth-observation preset from the catalog figures', () => {
    const { budgets } = check('bus-small', 'leo-eo', EO)
    expect(budgets).toMatchObject({
      dryKg: 134, wetKg: 174, maxKg: 240, loadW: 192, capacityWh: 800, neededDeltaVMs: 120,
      pointingDeg: 0.05, neededPointingDeg: 0.1, dataMbps: 8, heatW: 192, rejectionW: 320,
    })
    expect(budgets.generationW).toBeCloseTo(1300 * 0.64, 6)
    expect(budgets.neededWh).toBeCloseTo(192 * 0.58 / 0.6, 6)
    expect(budgets.deltaVMs).toBeCloseTo(225 * 9.80665 * Math.log(174 / 134), 6)
    expect(budgets.downlinkMbps).toBeCloseTo(402 * 0.08, 6)
  })

  it('reports an empty bus as lacking every subsystem', () => {
    const { budgets, codes, findings } = check('bus-small', 'leo-eo', {})
    expect(budgets).toMatchObject({ deltaVMs: 0, pointingDeg: null, neededPointingDeg: null, generationW: 0 })
    expect(codes).toEqual(['payload.missing', 'power.none', 'battery.short', 'deltav.none', 'pointing.none', 'link.none'])
    expect(findings.every(finding => finding.severity === 'error')).toBe(true)
  })

  const cases: readonly (readonly [FindingCode, string, string, Record<string, string>])[] = [
    ['mass.over', 'bus-micro', 'leo-eo', { ...EO, 'nadir-1': 'sar' }],
    ['mass.tight', 'bus-small', 'leo-eo', { ...EO, 'bay-4': 'battery-l' }],
    ['power.deficit', 'bus-small', 'leo-eo', { ...EO, 'wing-l': 'solar-wing-s', 'wing-r': 'solar-wing-s' }],
    ['power.tight', 'bus-large', 'deep-space', { ...PRESETS[3]!.mounts, 'wing-l': 'solar-wing-m', 'wing-r': 'solar-wing-m' }],
    ['battery.short', 'bus-small', 'leo-eo', { ...EO, 'bay-1': 'battery-s' }],
    ['deltav.short', 'bus-small', 'leo-eo', { ...EO, 'aft-1': 'prop-coldgas' }],
    ['pointing.coarse', 'bus-small', 'leo-eo', { ...EO, 'zenith-1': 'radiator' }],
    ['pointing.noDump', 'bus-large', 'geo-comms', { ...PRESETS[2]!.mounts, 'aft-1': '' }],
    ['pointing.magnetic', 'bus-large', 'geo-comms', { ...PRESETS[2]!.mounts, 'bay-3': 'magnetorquer' }],
    ['link.range', 'bus-large', 'deep-space', { ...PRESETS[3]!.mounts, 'ram-1': 'ant-uhf', 'ram-2': 'ant-s' }],
    ['link.short', 'bus-small', 'leo-eo', { ...EO, 'ram-1': 'radiator' }],
    ['thermal.over', 'bus-large', 'geo-comms', { ...PRESETS[2]!.mounts, 'zenith-2': 'ant-x' }],
    ['payload.offNadir', 'bus-small', 'leo-eo', { ...EO, 'nadir-1': 'ant-x', 'ram-1': 'cam-wide' }],
    ['tracker.nadir', 'bus-large', 'deep-space', { ...PRESETS[3]!.mounts, 'nadir-2': 'star-tracker' }],
    ['wing.single', 'bus-large', 'geo-comms', { ...PRESETS[2]!.mounts, 'wing-r': '' }],
  ]
  it.each(cases)('reports %s', (code, busId, missionId, mounts) => {
    expect(check(busId, missionId, mounts).codes).toContain(code)
  })

  it('grades pointing by actuator and star tracker, and lists errors before warnings', () => {
    const pointing = (mounts: Record<string, string>, missionId = 'leo-eo') => check('bus-large', missionId, mounts).budgets.pointingDeg
    expect(pointing({ 'bay-1': 'cmg' })).toBe(0.1)
    expect(pointing({ 'bay-1': 'cmg', 'zenith-1': 'star-tracker' })).toBe(0.005)
    expect(pointing({ 'bay-1': 'wheels' })).toBe(0.5)
    expect(pointing({ 'bay-1': 'magnetorquer' })).toBe(5)
    expect(pointing({ 'bay-1': 'magnetorquer' }, 'geo-comms')).toBeNull()
    const { findings } = check('bus-large', 'geo-comms', { ...PRESETS[2]!.mounts, 'wing-r': '', 'aft-1': '' })
    const severities = findings.map(finding => finding.severity)
    expect(severities).toEqual([...severities].sort())
    expect(severities).toContain('warning')
  })

  it('formats figures to three significant digits', () => {
    expect([1404.5, 174, 32.16, 0.005, 0.0096, 2165.4, 0].map(formatFigure)).toEqual(['1405', '174', '32.2', '0.005', '0.0096', '2165', '0'])
  })
})

describe('presentation', () => {
  it('numbers a slot label only where the bus has several slots on the face', () => {
    const slots = slotsOf(busOf('bus-small'))
    expect(slots.map(slot => slotLabel(tEn, slot, slots))).toEqual([
      'Left wing hinge', 'Right wing hinge', 'Nadir face', 'Zenith face 1', 'Zenith face 2', 'Ram face', 'Aft thrust plate',
      'Internal bay 1', 'Internal bay 2', 'Internal bay 3', 'Internal bay 4',
    ])
  })

  it('lists the figures each part carries', () => {
    const figures = (id: string) => partFigures(tEn, findPart(id)!)
    expect(figures('solar-wing-m')).toEqual(['14 kg', 'generates 650 W'])
    expect(figures('battery-m')).toEqual(['12 kg', '800 Wh'])
    expect(figures('prop-hall')).toEqual(['14 kg', '450 W', '20 kg propellant · Isp 1500 s'])
    expect(figures('ant-x')).toEqual(['3 kg', '60 W', 'downlink 400 Mbps'])
    expect(figures('radiator')).toEqual(['6 kg', 'rejects 800 W'])
  })

  it('marks the budget lines a broken rule concerns', () => {
    const empty = check('bus-small', 'leo-eo', {})
    const lines = budgetLines(tEn, empty.budgets, empty.findings)
    expect(lines.map(line => [line.id, line.severity])).toEqual([
      ['mass', null], ['power', 'error'], ['battery', 'error'], ['deltav', 'error'], ['pointing', 'error'], ['link', 'error'], ['thermal', null],
    ])
    expect(lines.find(line => line.id === 'pointing')).toMatchObject({ value: 'no attitude control', ratio: 1 })
    // Nothing is generated or stored, so a positive need fills its meter and a zero need leaves it empty.
    expect(lines.find(line => line.id === 'power')?.ratio).toBe(1)
    expect(lines.find(line => line.id === 'link')?.ratio).toBe(0)

    const free = check('bus-large', 'geo-comms', { 'bay-1': 'cmg', 'wing-l': 'solar-wing-l' })
    const freeLines = budgetLines(tEn, free.budgets, free.findings)
    expect(freeLines.find(line => line.id === 'pointing')).toMatchObject({ value: '0.1° (no part states a need)', ratio: 0, severity: 'warning' })

    const preset = check('bus-small', 'leo-eo', EO)
    expect(budgetLines(tZh, preset.budgets, preset.findings).find(line => line.id === 'pointing')?.value).toBe('0.05° / 需求 0.1°')
  })

  it('words a finding with its figures and the part it names', () => {
    const { findings } = check('bus-small', 'leo-eo', { ...EO, 'nadir-1': 'ant-x', 'ram-1': 'cam-wide', 'bay-1': 'battery-s' })
    expect(findings.map(finding => findingText(tEn, finding))).toEqual([
      'Battery capacity 160 Wh is below the 186 Wh the eclipse needs',
      'Wide-swath multispectral camera must face the Earth and belongs on the nadir face',
    ])
  })

  it('writes the evaluation prompt from the build, its budgets, and its findings', () => {
    const build = check('bus-small', 'leo-eo', EO)
    const input = inputOf(build)
    expect(evaluationPrompt(tEn, input)).toMatchInlineSnapshot(`
      "Act as a satellite systems engineer and evaluate the satellite configuration below. Figures are typical values for each part class, and the budgets are first-order estimates.

      ## Mission
      LEO Earth observation: 500 km sun-synchronous orbit; needs an Earth-imaging payload and 120 m/s of delta-v.

      ## Bus
      Small satellite bus (200 kg class): structure mass 55 kg, launch mass limit 240 kg, bus load 45 W

      ## Mounted parts
      - Left wing hinge: Medium deployable solar wing (14 kg, generates 650 W)
      - Right wing hinge: Medium deployable solar wing (14 kg, generates 650 W)
      - Nadir face: Wide-swath multispectral camera (12 kg, 35 W)
      - Zenith face 1: Star tracker (1 kg, 5 W)
      - Zenith face 2: S-band patch antenna (0.5 kg, 10 W, downlink 2 Mbps)
      - Ram face: X-band downlink antenna (3 kg, 60 W, downlink 400 Mbps)
      - Aft thrust plate: Hydrazine monopropellant propulsion (18 kg, 20 W, 40 kg propellant · Isp 225 s)
      - Internal bay 1: Li-ion battery (800 Wh) (12 kg, 800 Wh)
      - Internal bay 2: Reaction wheel set (4 kg, 15 W)
      - Internal bay 3: Magnetorquers (0.5 kg, 2 W)

      ## Budgets
      - Mass: wet 174 / limit 240 kg (dry 134 kg)
      - Power: generation 832 / load 192 W
      - Battery: capacity 800 / needed 186 Wh
      - Delta-v: 576 / needed 120 m/s
      - Pointing: 0.05° / needed 0.1°
      - Downlink: downlink 32.2 / data 8 Mbps
      - Thermal: heat 192 / rejection 320 W

      ## Rule checks
      Every rule passes.

      Answer in this order:
      1. Soundness: whether the subsystems match, with any excess or shortfall.
      2. Suitability: whether this configuration can fly the mission above.
      3. Main risks, most severe first.
      4. Improvements: name the specific parts to replace, add, or remove.
      5. An overall score (0–100) and a one-sentence verdict."
    `)
    const bare = check('bus-micro', 'leo-iot', {})
    const text = evaluationPrompt(tZh, inputOf(bare))
    expect(text).toContain('## 已安装部件\n（无）')
    expect(text).toContain('- [错误] 缺少该任务所需的有效载荷')
  })
})
