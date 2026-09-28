/** The standalone SDK-minimal bundle's complete declared Cordis tree. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { entryListSchema } from '@astro-one/cordis-plugin-include'

function packageName(specifier: string): string {
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]!
}

describe('astro-one-sdk-minimal bundle', () => {
  it('declares one standalone allowlisted tree with every row dependency', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      astroOne?: { bundle?: { patch?: string } }
    }
    expect(manifest.astroOne?.bundle?.patch).toBe('./cordis.patch.yml')
    const patches = yaml.load(
      readFileSync(resolve(root, manifest.astroOne!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    ) as Array<{ insert?: Array<{ id?: string; inject?: string[]; name?: string; config?: Record<string, unknown>; disabled?: unknown }> }>
    expect(patches).toHaveLength(1)
    const rows = patches[0]?.insert ?? []
    expect(rows.map(row => [row.id, row.name])).toEqual([
      ['sdk-app-startup', '@astro-one/sdk-app'],
      ['sdk-jsonrpc-server', '@astro-one/sdk-jsonrpc-server'],
      ['deepseek-llm-api-extensions', '@astro-one/deepseek-llm-api-extensions'],
      ['session-log-deepseek', '@astro-one/session-log-deepseek'],
      ['plugin-package-inventory-deepseek', '@astro-one/plugin-package-inventory-deepseek'],
      ['llm-deepseek', '@astro-one/llm-deepseek'],
      ['sandbox', '@astro-one/sandbox-local'],
      ['session-projection', '@astro-one/session-projection'],
      ['sandbox-policy', '@astro-one/sandbox-policy'],
      ['subprocess', '@astro-one/subprocess-local'],
      ['pty', '@astro-one/terminal'],
      ['terminal-bash', '@astro-one/terminal-bash'],
      ['terminal-pwsh', '@astro-one/terminal-bash'],
      ['timer', '@astro-one/cordis-plugin-timer'],
      ['llm', '@astro-one/llm'],
      ['session', '@astro-one/session'],
      ['session-title', '@astro-one/session-title'],
      ['system-prompt', '@astro-one/system-prompt'],
      ['tools', '@astro-one/tools'],
      ['mcp-resources', '@astro-one/mcp-resources'],
      ['agent', '@astro-one/agent'],
      ['llm-retry', '@astro-one/llm-retry'],
      ['jobs', '@astro-one/jobs-local'],
      ['invariants', '@astro-one/invariants'],
      ['session-invariant', '@astro-one/session/invariant'],
      ['agent-invariant', '@astro-one/agent/invariant'],
      ['scope-invariant', '@astro-one/scope/invariant'],
      ['agent-loop-invariant', '@astro-one/agent-loop/invariant'],
      ['agent-loop', '@astro-one/agent-loop'],
      ['persistent-bash', '@astro-one/tool-bash-persistent'],
      ['persistent-pwsh', '@astro-one/tool-pwsh-persistent'],
      ['sessions', '@astro-one/session-persistence-jsonl'],
    ])
    expect(rows.find(row => row.id === 'sdk-app-startup')?.config).toEqual({ profile: 'sdk-minimal' })
    expect(rows.find(row => row.id === 'sdk-jsonrpc-server')).toMatchObject({
      inject: ['sdkAppStartup', 'loader'],
      config: { maxTokensAsSuccess: false },
    })
    expect(rows.find(row => row.id === 'llm-deepseek')?.config).toEqual({
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      defaultContextWindow: { __jsExpr: 'Number(process.env.ASTRO_ONE_CONTEXT_WINDOW ?? 1000000)' },
      streamIdleTimeoutMs: 172800000,
    })
    expect(rows.find(row => row.id === 'system-prompt')?.config).toEqual({
      includeHarnessIdentity: false,
      includeRuntimeContext: false,
      personaPrefix: { __jsExpr: "process.env.ASTRO_ONE_SYSTEM_PROMPT ?? 'You are a helpful software engineer assistant.'" },
    })
    expect(rows.find(row => row.id === 'agent-loop')?.config).toEqual({ agents: [] })
    expect(rows.find(row => row.id === 'terminal-bash')).toMatchObject({
      disabled: { __jsExpr: "process.platform === 'win32'" },
    })
    expect(rows.find(row => row.id === 'terminal-pwsh')).toMatchObject({
      disabled: { __jsExpr: "process.platform !== 'win32'" },
      config: { shellDialect: 'pwsh', timeoutMs: 300000 },
    })
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(
      [...new Set(rows.map(row => row.name).filter((name): name is string => name !== undefined).map(packageName))].sort(),
    )
  })
})
