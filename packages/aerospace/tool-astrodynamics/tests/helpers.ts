import { Context } from '@astro-one/cordis'
import { ToolCallId } from '@astro-one/llm'
import SystemPrompt from '@astro-one/system-prompt'
import ToolRuntime from '@astro-one/tools'
import type { JsonValue } from '@astro-one/util-values'
import * as plugin from '../src/index.ts'

export const CONFIG: plugin.Config = {
  maxSamples: 2000,
  maxObservations: 200,
  relativeTolerance: 1e-11,
  absoluteTolerance: 1e-9,
  maxIntegratorSteps: 200000,
}

/** Vallado SGP4 verification case 00005. */
export const TLE = {
  kind: 'tle',
  line1: '1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753',
  line2: '2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667',
} as const

export const ISS_OMM = {
  OBJECT_NAME: 'ISS', OBJECT_ID: '1998-067A', EPOCH: '2025-03-01T00:00:00.000000', MEAN_MOTION: 15.49,
  ECCENTRICITY: 0.0006, INCLINATION: 51.64, RA_OF_ASC_NODE: 120, ARG_OF_PERICENTER: 80, MEAN_ANOMALY: 280,
  NORAD_CAT_ID: 25544, BSTAR: 0.0002, MEAN_MOTION_DOT: 0.0001, MEAN_MOTION_DDOT: 0,
}

let counter = 0

/**
 * Mount the plugin on a real tool runtime.
 * @param config - plugin config.
 * @returns the context.
 */
export async function setup(config: plugin.Config = CONFIG): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(plugin, config)
  return ctx
}

/** Normalized result of one call. */
export interface CallResult {
  readonly isError: boolean
  readonly value: JsonValue | undefined
  readonly text: string
}

/**
 * Execute one tool call through the registry.
 * @param ctx - context with the plugin mounted.
 * @param name - tool name.
 * @param args - tool arguments.
 * @returns the result.
 */
export async function call(ctx: Context, name: string, args: Record<string, JsonValue>): Promise<CallResult> {
  const result = await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId(`call-${String(++counter)}`),
    name,
    arguments: args,
  })
  const text = result.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
  return { isError: result.isError, value: result.isError ? undefined : result.value, text }
}

/**
 * Execute a call that must succeed and return its value.
 * @param ctx - context.
 * @param name - tool name.
 * @param args - arguments.
 * @returns the canonical value.
 */
export async function ok(ctx: Context, name: string, args: Record<string, JsonValue>): Promise<Record<string, JsonValue>> {
  const result = await call(ctx, name, args)
  if (result.isError) throw new Error(`expected success, got: ${result.text}`)
  return result.value as Record<string, JsonValue>
}

/**
 * Execute a call that must fail and return its error text.
 * @param ctx - context.
 * @param name - tool name.
 * @param args - arguments.
 * @returns error text.
 */
export async function fail(ctx: Context, name: string, args: Record<string, JsonValue>): Promise<string> {
  const result = await call(ctx, name, args)
  if (!result.isError) throw new Error(`expected failure, got: ${result.text}`)
  return result.text
}
