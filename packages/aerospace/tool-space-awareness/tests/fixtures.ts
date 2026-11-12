import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { formatTle, ommFromRecord, parseOmm, parseTle, sgp4MeanElements } from '@astro-one/astrodynamics'
import type { Sgp4Elements } from '@astro-one/astrodynamics'
import type { Agent } from '@astro-one/agent'
import { unsupportedInbox, unsupportedModel } from '@astro-one/agent-loop-testkit'
import { Context } from '@astro-one/cordis'
import LocalFileSystem from '@astro-one/fs-local'
import { ToolCallId } from '@astro-one/llm'
import { Session, SESSION_FORMAT_VERSION, SessionId } from '@astro-one/session'
import SystemPrompt from '@astro-one/system-prompt'
import ToolRuntime from '@astro-one/tools'
import type { JsonValue } from '@astro-one/util-values'
import { executeToolFixture } from '@astro-one/tool-testkit'
import * as Plugin from '../src/index.ts'

/**
 * Test bounds with optional overrides.
 * @param o - fields to override.
 * @returns the plugin config.
 */
export function config(o: Partial<Plugin.Config> = {}): Plugin.Config {
  return {
    maxFileBytes: o.maxFileBytes ?? 5_000_000,
    maxCatalogObjects: o.maxCatalogObjects ?? 1000,
    maxEvaluations: o.maxEvaluations ?? 5_000_000,
    maxObservations: o.maxObservations ?? 1000,
    maxResults: o.maxResults ?? 20,
  }
}

export const CONFIG: Plugin.Config = config()

/** 2025-03-01T00:00:00Z. */
export const EPOCH = Date.UTC(2025, 2, 1)

/** Mean elements of a synthetic element set; angles in degrees. */
export interface SetSpec {
  readonly name?: string
  readonly number: number
  readonly epoch?: number
  readonly n: number
  readonly e?: number
  readonly i: number
  readonly raan?: number
  readonly argp?: number
  readonly m?: number
  readonly bstar?: number
}

/**
 * OMM keywords of a synthetic set.
 * @param s - set fields.
 * @returns the OMM record.
 */
export function omm(s: SetSpec): Record<string, string | number> {
  return {
    OBJECT_NAME: s.name ?? `OBJECT ${String(s.number)}`,
    OBJECT_ID: '2025-001A',
    EPOCH: new Date(s.epoch ?? EPOCH).toISOString().replace('Z', ''),
    MEAN_MOTION: s.n,
    ECCENTRICITY: s.e ?? 0.0005,
    INCLINATION: s.i,
    RA_OF_ASC_NODE: s.raan ?? 0,
    ARG_OF_PERICENTER: s.argp ?? 0,
    MEAN_ANOMALY: s.m ?? 0,
    NORAD_CAT_ID: s.number,
    BSTAR: s.bstar ?? 0,
    MEAN_MOTION_DOT: 0,
    MEAN_MOTION_DDOT: 0,
  }
}

/**
 * TLE lines of a synthetic set.
 * @param s - set fields.
 * @returns line 1 and line 2.
 */
export function tle(s: SetSpec): [string, string] {
  return formatTle({
    catalogNumber: String(s.number), classification: 'U', designator: '25001A', epoch: s.epoch ?? EPOCH, meanMotionDot: 0, meanMotionDdot: 0,
    bstar: s.bstar ?? 0, elementSetNumber: 1, inclinationDeg: s.i, raanDeg: s.raan ?? 0, eccentricity: s.e ?? 0.0005, argpDeg: s.argp ?? 0,
    meanAnomalyDeg: s.m ?? 0, meanMotion: s.n, revolution: 1,
  })
}

/**
 * Parsed SGP4 elements of a synthetic set.
 * @param s - set fields.
 * @returns the elements.
 */
export function elements(s: SetSpec): Sgp4Elements {
  return parseOmm(ommFromRecord(omm(s)))
}

/**
 * Three-line catalog text.
 * @param sets - set fields.
 * @returns the text.
 */
export function catalogText(sets: readonly SetSpec[]): string {
  return sets.map(s => [s.name ?? `OBJECT ${String(s.number)}`, ...tle(s)].join('\n')).join('\n') + '\n'
}

/**
 * Element-set history of one object: each set advances the previous one along its SGP4 secular
 * rates, then applies the epoch's field overrides.
 * @param base - set fields at the first epoch.
 * @param days - ascending epochs in days after the first.
 * @param change - per-epoch field overrides.
 * @returns the sets.
 */
export function history(base: SetSpec, days: readonly number[], change: (k: number) => Partial<SetSpec> = () => ({})): SetSpec[] {
  const deg = 180 / Math.PI
  const sets: SetSpec[] = []
  let current: SetSpec = { ...base, epoch: EPOCH + (days[0] as number) * 86_400_000, ...change(0) }
  sets.push(current)
  for (let k = 1; k < days.length; k++) {
    const rates = sgp4MeanElements(elements(current))
    const dt = ((days[k] as number) - (days[k - 1] as number)) * 86400
    current = {
      ...current,
      epoch: EPOCH + (days[k] as number) * 86_400_000,
      raan: ((current.raan ?? 0) + rates.raanRate * dt * deg) % 360,
      argp: ((current.argp ?? 0) + rates.argpRate * dt * deg) % 360,
      m: ((current.m ?? 0) + rates.meanAnomalyRate * dt * deg) % 360,
      ...change(k),
    }
    sets.push(current)
  }
  return sets
}

let dir: string | undefined
let counter = 0

/**
 * Mount the plugin beside a local filesystem rooted at a fresh directory holding the files.
 * @param files - file names and contents.
 * @param config - plugin config.
 * @returns the context and its workspace directory.
 */
export async function setup(files: Record<string, string> = {}, config: Plugin.Config = CONFIG): Promise<{ ctx: Context; dir: string }> {
  dir = await mkdtemp(join(tmpdir(), 'astro-one-ssa-'))
  for (const [file, text] of Object.entries(files)) await writeFile(join(dir, file), text)
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(Plugin, config)
  return { ctx, dir }
}

/** Remove the workspace of the last {@link setup}. */
export async function cleanup(): Promise<void> {
  if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  dir = undefined
}

/**
 * A session-bound agent whose workspace is the given directory.
 * @param cwd - session workspace.
 * @returns the agent.
 */
export function sessionAgent(cwd: string): Agent {
  const id = SessionId('ssa-agent')
  const session = Session.create(id, [], { version: SESSION_FORMAT_VERSION, id, createdAt: 0, cwd, isSeeded: false })
  return {
    ctx: new Context(), id, options: {}, session, model: unsupportedModel(), inbox: unsupportedInbox(), status: 'idle',
    followup: () => {}, steer: () => {}, inject: () => {}, send: () => {}, cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

/** Normalized result of one call. */
export interface CallResult {
  readonly isError: boolean
  readonly value: Record<string, JsonValue>
  readonly text: string
}

/**
 * Execute one tool call through the registry.
 * @param ctx - context with the plugin mounted.
 * @param name - tool name.
 * @param args - tool arguments.
 * @param agent - optional calling agent.
 * @returns the result.
 */
export async function call(ctx: Context, name: string, args: Record<string, JsonValue>, agent?: Agent): Promise<CallResult> {
  const result = await executeToolFixture(ctx, {
    signal: new AbortController().signal,
    callId: ToolCallId(`call-${String(++counter)}`),
    name,
    arguments: args,
    ...agent !== undefined ? { agent } : {},
  })
  const text = result.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
  return { isError: result.isError, value: (result.isError ? {} : result.value) as Record<string, JsonValue>, text }
}

/**
 * Execute a call that must succeed.
 * @param ctx - context.
 * @param name - tool name.
 * @param args - arguments.
 * @returns the canonical value.
 */
export async function ok(ctx: Context, name: string, args: Record<string, JsonValue>): Promise<Record<string, JsonValue>> {
  const result = await call(ctx, name, args)
  if (result.isError) throw new Error(`expected success, got: ${result.text}`)
  return result.value
}

/**
 * Execute a call that must fail.
 * @param ctx - context.
 * @param name - tool name.
 * @param args - arguments.
 * @returns the error text.
 */
export async function fail(ctx: Context, name: string, args: Record<string, JsonValue>): Promise<string> {
  const result = await call(ctx, name, args)
  if (!result.isError) throw new Error(`expected failure, got: ${result.text}`)
  return result.text
}

/**
 * Parse TLE lines (for assertions).
 * @param lines - line 1 and line 2.
 * @returns the elements.
 */
export function parse(lines: readonly [string, string]): Sgp4Elements {
  return parseTle(lines[0], lines[1])
}
