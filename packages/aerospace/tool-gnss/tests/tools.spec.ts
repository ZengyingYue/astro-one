import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@astro-one/cordis'
import LocalFileSystem from '@astro-one/fs-local'
import { ToolCallId } from '@astro-one/llm'
import SystemPrompt from '@astro-one/system-prompt'
import ToolRuntime from '@astro-one/tools'
import type { JsonValue } from '@astro-one/util-values'
import type { Agent } from '@astro-one/agent'
import { unsupportedInbox } from '@astro-one/agent-loop-testkit'
import { Session, SESSION_FORMAT_VERSION, SessionId } from '@astro-one/session'
import type { ToolDefinition } from '@astro-one/tools'
import * as Plugin from '../src/index.ts'
import { GPS_EPOCH_MS } from '../src/rinex.ts'
import { constellation, lla, navigationText, observationText, T0 } from './sim.ts'

const CONFIG: Plugin.Config = { maxFileBytes: 5_000_000, maxEpochs: 100, maxReportedEpochs: 2 }
const ephs = constellation()
const basePos = lla(39.9, 116.4, 50)
const roverPos = lla(39.905, 116.41, 60)
const times = [0, 30, 60].map(dt => T0 + dt)
const amb = (sat: string): number => 500 + Number(sat.slice(1)) * 11

let dir: string | undefined
afterEach(async () => {
  if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  dir = undefined
})

async function setup(config: Plugin.Config = CONFIG): Promise<{ ctx: Context; fiber: Awaited<ReturnType<Context['plugin']>> }> {
  dir = await mkdtemp(join(tmpdir(), 'astro-one-gnss-'))
  await writeFile(join(dir, 'brdc.rnx'), navigationText(ephs))
  await writeFile(join(dir, 'base.rnx'), observationText(ephs, { position: basePos, times, ambiguity: amb, clockBias: { G: 10, E: 10, C: 10 } }))
  await writeFile(join(dir, 'rover.rnx'), observationText(ephs, { position: roverPos, times: [...times, T0 + 90], ambiguity: s => amb(s) + 3, clockBias: { G: -5, E: -5, C: -5 } }))
  await writeFile(join(dir, 'empty.rnx'), observationText([], { position: roverPos, times }))
  await writeFile(join(dir, 'sparse.rnx'), observationText(['G', 'E', 'C'].map(sys => ephs.find(e => e.system === sys && e.prn > 2)!), { position: basePos, times }))
  await writeFile(join(dir, 'gps.rnx'), navigationText(ephs.filter(e => e.system !== 'C')))
  await writeFile(join(dir, 'noapprox.rnx'), observationText(ephs, { position: roverPos, times, withApprox: false, codeError: s => (s === 'G03' ? 150 : 0) }))
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  const fiber = await ctx.plugin(Plugin, config)
  return { ctx, fiber }
}

function sessionAgent(cwd: string): Agent {
  const id = SessionId('gnss-agent')
  const session = Session.create(id, [], { version: SESSION_FORMAT_VERSION, id, createdAt: 0, cwd, isSeeded: false })
  return {
    ctx: new Context(), id, options: {}, session, inbox: unsupportedInbox(), status: 'idle',
    followup: () => {}, steer: () => {}, inject: () => {}, send: () => {}, cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

let n = 0
type CallResult = { isError: boolean; value: Record<string, JsonValue>; text: string }
async function call(ctx: Context, name: string, args: Record<string, JsonValue>): Promise<CallResult> {
  const result = await ctx.tools.execute({ signal: new AbortController().signal, callId: ToolCallId(`g${String(++n)}`), name, arguments: args })
  const text = result.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
  return { isError: result.isError, value: (result.isError ? {} : result.value) as Record<string, JsonValue>, text }
}

describe('gnss_position', () => {
  it('computes a single-point solution with bounded per-epoch rows', async () => {
    const { ctx } = await setup()
    const out = await call(ctx, 'gnss_position', { rover_obs_path: 'rover.rnx', nav_path: 'brdc.rnx' })
    expect(out.isError).toBe(false)
    const ecef = (out.value.mean_position as { ecef_m: number[] }).ecef_m
    expect(Math.hypot(ecef[0]! - roverPos[0], ecef[1]! - roverPos[1], ecef[2]! - roverPos[2])).toBeLessThan(0.1)
    expect(out.value.epochs_solved).toBe(4)
    expect(out.value.epochs).toHaveLength(2)
    expect(out.value.epochs_truncated).toBe(true)
    expect(out.value.mean_pdop as number).toBeGreaterThan(0)
  })

  it('fixes an RTK baseline', async () => {
    const { ctx } = await setup()
    const out = await call(ctx, 'gnss_position', {
      rover_obs_path: 'rover.rnx', nav_path: 'brdc.rnx', mode: 'rtk', base_obs_path: 'base.rnx', base_position_m: [...basePos], rtk_mode: 'static',
      systems: ['gps', 'galileo', 'beidou'], elevation_mask_deg: 10, code_sigma_m: 0.3, phase_sigma_m: 0.003, ratio_threshold: 2, raim: true,
    })
    expect(out.isError).toBe(false)
    expect(out.value.fix_rate as number).toBeGreaterThan(0)
    const truth = Math.hypot(roverPos[0] - basePos[0], roverPos[1] - basePos[1], roverPos[2] - basePos[2])
    expect(out.value.baseline_m as number).toBeCloseTo(truth, 1)
    const float = await call(ctx, 'gnss_position', { rover_obs_path: 'rover.rnx', nav_path: 'brdc.rnx', mode: 'rtk', base_obs_path: 'base.rnx', base_position_m: [...basePos], ratio_threshold: 1e12 })
    expect(float.value.fix_rate).toBe(0)
  })

  it('reports unusable inputs', async () => {
    const { ctx } = await setup()
    const cases: [Record<string, JsonValue>, string][] = [
      [{ rover_obs_path: 'rover.rnx', nav_path: 'brdc.rnx', mode: 'rtk' }, 'needs base_obs_path'],
      [{ rover_obs_path: 'rover.rnx', nav_path: 'brdc.rnx', mode: 'rtk', base_obs_path: 'base.rnx', base_position_m: [1, 2] }, 'base_position_m must be'],
      [{ rover_obs_path: 'rover.rnx', nav_path: 'brdc.rnx', systems: [] }, 'at least one constellation'],
      [{ rover_obs_path: 'rover.rnx', nav_path: 'brdc.rnx', code_sigma_m: 0 }, 'code_sigma_m must be positive'],
      [{ rover_obs_path: 'empty.rnx', nav_path: 'brdc.rnx' }, 'no epoch had enough satellites'],
      [{ rover_obs_path: 'empty.rnx', nav_path: 'brdc.rnx', mode: 'rtk', base_obs_path: 'base.rnx', base_position_m: [...basePos] }, 'no rover epoch matched'],
      [{ rover_obs_path: '.', nav_path: 'brdc.rnx' }, 'not a regular file'],
    ]
    for (const [args, message] of cases) {
      const out = await call(ctx, 'gnss_position', args)
      expect(out.isError).toBe(true)
      expect(out.text).toContain(message)
    }
    const small = await setup({ maxFileBytes: 10, maxEpochs: CONFIG.maxEpochs, maxReportedEpochs: CONFIG.maxReportedEpochs })
    expect((await call(small.ctx, 'gnss_position', { rover_obs_path: 'rover.rnx', nav_path: 'brdc.rnx' })).isError).toBe(true)
  })

  it('titles pending calls and unregisters on disposal', async () => {
    const { ctx, fiber } = await setup()
    expect(ctx.tools.schemas().map(s => s.name)).toEqual(expect.arrayContaining(['gnss_position', 'gnss_visibility']))
    await fiber.dispose()
    expect(ctx.tools.schemas().map(s => s.name)).not.toContain('gnss_position')
  })
})

describe('gnss tool details', () => {
  it('reports RAIM exclusions without a header position and titles calls', async () => {
    const { ctx } = await setup()
    const out = await call(ctx, 'gnss_position', { rover_obs_path: 'noapprox.rnx', nav_path: 'brdc.rnx' })
    expect((out.value.raim_exclusions as unknown[]).length).toBeGreaterThan(0)
    const title = (t: ToolDefinition, args: Record<string, JsonValue>): string => (t.presentCall?.(args) as { title: string }).title
    expect(title(Plugin.positionTool(ctx, CONFIG), { rover_obs_path: 'a', nav_path: 'b' })).toBe('GNSS positioning (spp)')
    expect(title(Plugin.visibilityTool(ctx, CONFIG), { nav_path: 'b', station: { lat_deg: 0, lon_deg: 0, alt_m: 0 }, start: 's', end: 'e' })).toBe('GNSS visibility')
  })

  it('reports code-only RTK epochs when no double difference exists', async () => {
    const { ctx } = await setup()
    const out = await call(ctx, 'gnss_position', { rover_obs_path: 'rover.rnx', nav_path: 'brdc.rnx', mode: 'rtk', base_obs_path: 'sparse.rnx', base_position_m: [...basePos] })
    expect(out.isError).toBe(false)
    expect((out.value.epochs as { ratio: null }[]).every(e => e.ratio === null)).toBe(true)
  })

  it('reads files relative to the calling session workspace', async () => {
    const { ctx } = await setup()
    const agent = sessionAgent(dir as string)
    const result = await ctx.tools.execute({
      signal: new AbortController().signal, callId: ToolCallId('with-agent'), name: 'gnss_position',
      arguments: { rover_obs_path: 'rover.rnx', nav_path: 'brdc.rnx' }, agent,
    })
    expect(result.isError).toBe(false)
  })

  it('computes DOP only for constellations with visible satellites', async () => {
    const { ctx } = await setup()
    const start = new Date(GPS_EPOCH_MS + (T0 - 18) * 1000).toISOString()
    const out = await call(ctx, 'gnss_visibility', { nav_path: 'gps.rnx', station: { lat_deg: 39.9, lon_deg: 116.4, alt_m: 50 }, start, end: start })
    expect((out.value.samples as { pdop: number }[])[0]!.pdop).toBeGreaterThan(0)
  })
})

describe('gnss_visibility', () => {
  it('lists visible satellites and DOP over a window', async () => {
    const { ctx } = await setup()
    const start = new Date(GPS_EPOCH_MS + (T0 - 18) * 1000).toISOString()
    const end = new Date(GPS_EPOCH_MS + (T0 - 18 + 1200) * 1000).toISOString()
    const out = await call(ctx, 'gnss_visibility', { nav_path: 'brdc.rnx', station: { lat_deg: 39.9, lon_deg: 116.4, alt_m: 50 }, start, end })
    const samples = out.value.samples as { visible: unknown[]; pdop: number | null }[]
    expect(samples).toHaveLength(3)
    expect(samples[0]!.visible.length).toBeGreaterThan(5)
    expect(samples[0]!.pdop).toBeGreaterThan(0)
    const gpsOnly = await call(ctx, 'gnss_visibility', { nav_path: 'brdc.rnx', station: { lat_deg: 39.9, lon_deg: 116.4, alt_m: 50 }, start, end: start, systems: ['gps'], elevation_mask_deg: 85, step_s: 60 })
    expect((gpsOnly.value.samples as { pdop: null }[])[0]!.pdop).toBeNull()
    const far = await call(ctx, 'gnss_visibility', { nav_path: 'brdc.rnx', station: { lat_deg: 0, lon_deg: 0, alt_m: 0 }, start: '2030-01-01T00:00:00Z', end: '2030-01-01T00:00:00Z' })
    expect((far.value.samples as { visible: unknown[] }[])[0]!.visible).toEqual([])
    expect((await call(ctx, 'gnss_visibility', { nav_path: 'brdc.rnx', station: { lat_deg: 0, lon_deg: 0, alt_m: 0 }, start: 'x', end: start })).text).toContain('ISO instants')
    expect((await call(ctx, 'gnss_visibility', { nav_path: 'brdc.rnx', station: { lat_deg: 0, lon_deg: 0, alt_m: 0 }, start, end: '2031-01-01T00:00:00Z' })).text).toContain('at most 100')
  })
})
