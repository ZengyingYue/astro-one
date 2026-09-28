/**
 * Registry tests for `@astro-one/shell-env`: built-in facts, contributor
 * ownership and validation, collection ordering, effect-scoped disposal, and
 * the explicit disposer contract.
 */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@astro-one/cordis'
import { ToolCallId } from '@astro-one/llm'
import type { Agent } from '@astro-one/agent'
import { SESSION_FORMAT_VERSION } from '@astro-one/session'
import type { ToolExecution } from '@astro-one/tools'
import { ShellEnvRegistry } from '@astro-one/shell-env'
import * as BashEnvPlugin from '@astro-one/shell-env'

const testToolSignal = new AbortController().signal

afterEach(() => vi.unstubAllEnvs())

function execution(sessionId?: string): ToolExecution {
  return {
    signal: testToolSignal,
    token: Symbol('bash-env-test') as ToolExecution['token'],
    callId: ToolCallId('bash-env-call'),
    rootCallId: ToolCallId('bash-env-call'),
    name: 'bash',
    arguments: { command: 'true' },
    ...(sessionId === undefined
      ? {}
      : {
        agent: {
          session: {
            header: { version: SESSION_FORMAT_VERSION, id: sessionId, createdAt: 0, isSeeded: false },
          },
        } as unknown as Agent,
      }),
  }
}

describe('ShellEnvRegistry', () => {
  it('collects unconditional shell facts and the current agent session id', () => {
    const ctx = new Context()
    const registry = new ShellEnvRegistry(ctx, { astroOneHome: './test-astro-one-home' })

    expect(registry.collect(execution())).toEqual({
      ASTRO_ONE_HOME: resolve('./test-astro-one-home'),
      ASTRO_ONE_SHELL: '1',
    })
    expect(registry.collect(execution('session-a'))).toEqual({
      ASTRO_ONE_HOME: resolve('./test-astro-one-home'),
      ASTRO_ONE_SESSION_ID: 'session-a',
      ASTRO_ONE_SHELL: '1',
    })
  })

  it('collects the launcher-provided profile name and directory when a profile context exists', () => {
    const ctx = new Context()
    ctx.provide('profileContext', {
      name: 'web', dir: '/profiles/web', patchPath: '/profiles/web/cordis.patch.yml', installAnchor: '/astro-one/package.json',
      cwd: '/work', home: '/home', startedBundles: [], overlays: [], telemetryDisabledEnv: undefined,
    })
    const registry = new ShellEnvRegistry(ctx, { astroOneHome: './test-astro-one-home' })
    expect(registry.collect(execution())).toMatchObject({ ASTRO_ONE_PROFILE: 'web', ASTRO_ONE_PROFILE_DIR: '/profiles/web' })
    expect(() => registry.register({
      name: 'profile-claimer',
      variables: { ASTRO_ONE_PROFILE: { description: 'Reserved key.' } },
      resolve: () => ({}),
    })).toThrow(/reserved key "ASTRO_ONE_PROFILE"/)
  })

  it('resolves ASTRO_ONE_HOME from the ambient override or the user-home default', () => {
    vi.stubEnv('ASTRO_ONE_HOME', './ambient-astro-one-home')
    const fromEnvironment = new ShellEnvRegistry(new Context())
    expect(fromEnvironment.collect(execution()).ASTRO_ONE_HOME).toBe(resolve('./ambient-astro-one-home'))

    vi.stubEnv('ASTRO_ONE_HOME', undefined)
    const fromDefault = new ShellEnvRegistry(new Context())
    expect(fromDefault.collect(execution()).ASTRO_ONE_HOME).toBe(join(homedir(), '.astro-one'))
  })

  it('collects declared contributor variables and omits unavailable values', () => {
    const ctx = new Context()
    const registry = new ShellEnvRegistry(ctx, { astroOneHome: './test-astro-one-home' })
    registry.register({
      name: 'optional-session-fact',
      variables: {
        ASTRO_ONE_SESSION_OPTIONAL: { description: 'Optional session-scoped test fact.' },
      },
      resolve: exec => exec.agent === undefined ? {} : { ASTRO_ONE_SESSION_OPTIONAL: exec.agent.session.header.id },
    })
    registry.register({
      name: 'always-available-fact',
      variables: {
        ASTRO_ONE_ALWAYS_AVAILABLE: { description: 'Always-available test fact.' },
      },
      resolve: () => ({ ASTRO_ONE_ALWAYS_AVAILABLE: 'yes' }),
    })

    expect(registry.collect(execution())).not.toHaveProperty('ASTRO_ONE_SESSION_OPTIONAL')
    expect(registry.collect(execution()).ASTRO_ONE_ALWAYS_AVAILABLE).toBe('yes')
    expect(registry.collect(execution('session-b')).ASTRO_ONE_SESSION_OPTIONAL).toBe('session-b')
    expect(registry.list()).toEqual([
      {
        contributor: 'always-available-fact',
        description: 'Always-available test fact.',
        key: 'ASTRO_ONE_ALWAYS_AVAILABLE',
      },
      {
        contributor: 'optional-session-fact',
        description: 'Optional session-scoped test fact.',
        key: 'ASTRO_ONE_SESSION_OPTIONAL',
      },
    ])
  })

  it('rejects duplicate variable ownership at registration time', () => {
    const ctx = new Context()
    const registry = new ShellEnvRegistry(ctx, { astroOneHome: './test-astro-one-home' })
    registry.register({
      name: 'first',
      variables: { ASTRO_ONE_SHARED: { description: 'First owner.' } },
      resolve: () => ({ ASTRO_ONE_SHARED: 'first' }),
    })

    expect(() => registry.register({
      name: 'second',
      variables: { ASTRO_ONE_SHARED: { description: 'Second owner.' } },
      resolve: () => ({ ASTRO_ONE_SHARED: 'second' }),
    })).toThrow(/ASTRO_ONE_SHARED.*first.*second|ASTRO_ONE_SHARED.*second.*first/)
  })

  it('rejects duplicate contributor names and malformed declarations', () => {
    const registry = new ShellEnvRegistry(new Context(), { astroOneHome: './test-astro-one-home' })
    registry.register({
      name: 'declared',
      variables: { ASTRO_ONE_DECLARED: { description: 'Declared fact.' } },
      resolve: () => ({}),
    })

    expect(() => registry.register({
      name: 'declared',
      variables: { ASTRO_ONE_ANOTHER: { description: 'Another fact.' } },
      resolve: () => ({}),
    })).toThrow(/already registered/)
    expect(() => registry.register({
      name: ' ',
      variables: { ASTRO_ONE_BLANK_NAME: { description: 'Blank owner.' } },
      resolve: () => ({}),
    })).toThrow(/name must be non-empty/)
    expect(() => registry.register({
      name: 'invalid-key',
      variables: { astro_one_invalid: { description: 'Invalid key.' } } as unknown as Record<'ASTRO_ONE_INVALID', { description: string }>,
      resolve: () => ({}),
    })).toThrow(/invalid key/)
    expect(() => registry.register({
      name: 'reserved-key',
      variables: { ASTRO_ONE_HOME: { description: 'Reserved key.' } },
      resolve: () => ({}),
    })).toThrow(/reserved key/)
    expect(() => registry.register({
      name: 'blank-description',
      variables: { ASTRO_ONE_BLANK_DESCRIPTION: { description: ' ' } },
      resolve: () => ({}),
    })).toThrow(/must describe/)
  })

  it('rejects undeclared variables returned by a contributor', () => {
    const ctx = new Context()
    const registry = new ShellEnvRegistry(ctx, { astroOneHome: './test-astro-one-home' })
    registry.register({
      name: 'drifted-provider',
      variables: { ASTRO_ONE_DECLARED: { description: 'Declared fact.' } },
      resolve: () => ({ ASTRO_ONE_UNDECLARED: 'bad' }),
    })

    expect(() => registry.collect(execution())).toThrow(/drifted-provider.*ASTRO_ONE_UNDECLARED/)
  })

  it('rejects non-string values returned by a contributor', () => {
    const registry = new ShellEnvRegistry(new Context(), { astroOneHome: './test-astro-one-home' })
    registry.register({
      name: 'wrong-value-type',
      variables: { ASTRO_ONE_STRING: { description: 'String fact.' } },
      resolve: () => ({ ASTRO_ONE_STRING: 42 }) as unknown as Record<'ASTRO_ONE_STRING', string>,
    })

    expect(() => registry.collect(execution())).toThrow(/wrong-value-type.*non-string.*ASTRO_ONE_STRING/)
  })

  it('removes an effect-scoped contributor when its plugin is disposed', async () => {
    const ctx = new Context()
    const registry = new ShellEnvRegistry(ctx, { astroOneHome: './test-astro-one-home' })
    const fiber = await ctx.plugin({
      inject: ['shellEnv'],
      apply(inner: Context) {
        inner.shellEnv.register({
          name: 'temporary',
          variables: { ASTRO_ONE_TEMPORARY: { description: 'Temporary fact.' } },
          resolve: () => ({ ASTRO_ONE_TEMPORARY: 'present' }),
        })
      },
    })

    expect(registry.collect(execution()).ASTRO_ONE_TEMPORARY).toBe('present')
    await fiber.dispose()
    expect(registry.collect(execution())).not.toHaveProperty('ASTRO_ONE_TEMPORARY')
  })

  it('returns an explicit contributor disposer', () => {
    const registry = new ShellEnvRegistry(new Context(), { astroOneHome: './test-astro-one-home' })
    const dispose = registry.register({
      name: 'explicit-disposal',
      variables: { ASTRO_ONE_EXPLICIT_DISPOSAL: { description: 'Explicitly disposed fact.' } },
      resolve: () => ({ ASTRO_ONE_EXPLICIT_DISPOSAL: 'present' }),
    })

    expect(registry.collect(execution()).ASTRO_ONE_EXPLICIT_DISPOSAL).toBe('present')
    dispose()
    expect(registry.collect(execution())).not.toHaveProperty('ASTRO_ONE_EXPLICIT_DISPOSAL')
  })

  it('the plugin registers the service with no contributors on load', async () => {
    const ctx = new Context()
    await ctx.plugin(BashEnvPlugin)
    expect(ctx.shellEnv).toBeInstanceOf(ShellEnvRegistry)
    expect(ctx.shellEnv.list()).toEqual([])
  })
})
