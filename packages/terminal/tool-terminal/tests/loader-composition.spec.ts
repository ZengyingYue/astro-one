import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@astro-one/cordis'
import Loader from '@astro-one/cordis-plugin-loader'
import Include from '@astro-one/cordis-plugin-include'
import { ToolCallId } from '@astro-one/llm'
import { Session, SessionId } from '@astro-one/session'
import AgentRegistry from '@astro-one/agent'
import type { Agent } from '@astro-one/agent'
import SystemPrompt from '@astro-one/system-prompt'
import ToolRuntime from '@astro-one/tools'
import TerminalSessionService from '@astro-one/terminal'
import SandboxProvider from '@astro-one/sandbox'
import type { ConfinedArgv, SandboxPolicy } from '@astro-one/sandbox'
import SandboxPolicyService from '@astro-one/sandbox-policy'
import SessionProjectionRegistry from '@astro-one/session-projection'
import LocalSubprocessRuntime from '@astro-one/subprocess-local'
import * as TerminalLocal from '@astro-one/terminal-bash'
import * as ToolPty from '@astro-one/tool-terminal'
import { unsupportedInbox } from '@astro-one/agent-loop-testkit'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

class PassthroughSandbox extends SandboxProvider {
  async confine(argv: readonly string[], _policy: SandboxPolicy): Promise<ConfinedArgv> {
    return { argv: [...argv], enforcement: 'full', denialSignatures: [], runnerFailureRules: [] }
  }
}

async function agent(ctx: Context): Promise<Agent> {
  const scope = ctx.plugin(() => {})
  const id = SessionId('pty-loader-agent')
  const session = Session.create(id)
  const value: Agent = {
    id, options: {}, session, inbox: unsupportedInbox(),
    status: 'idle',
    ctx: scope.ctx,
    send: () => {},
    followup: () => {}, steer: () => {}, inject: () => {}, cancel() {},
    runMaintenance: job => job(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  await ctx.agents.register(value)
  return value
}

function resultText(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

const suite = process.platform === 'linux' || process.platform === 'darwin' ? describe : describe.skip

suite('terminal real Loader composition through cordis.yml', () => {
  it('boots cordis.yml and preserves shell state across real tool calls', async () => {
    root = await mkdtemp(join(tmpdir(), 'astro-one-pty-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@astro-one/agent'",
      "- name: '@astro-one/system-prompt'",
      "- name: '@astro-one/tools'",
      "- name: '@astro-one/terminal'",
      "- name: '@astro-one/test-sandbox'",
      "- name: '@astro-one/session-projection'",
      "- name: '@astro-one/sandbox-policy'",
      '  config:',
      '    mode: danger-full-access',
      `    workspaceRoot: ${JSON.stringify(root)}`,
      "- name: '@astro-one/subprocess-local'",
      "- name: '@astro-one/terminal-bash'",
      '  config:',
      '    pollIntervalMs: 10',
      '    exactProbeAfterMs: 20',
      '    idleSilenceMs: 250',
      '    handoffGraceMs: 250',
      '    timeoutMs: 2000',
      '    disposeGraceMs: 500',
      "- name: '@astro-one/tool-terminal'",
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@astro-one/agent', AgentRegistry],
      ['@astro-one/system-prompt', SystemPrompt],
      ['@astro-one/tools', ToolRuntime],
      ['@astro-one/terminal', TerminalSessionService],
      ['@astro-one/test-sandbox', PassthroughSandbox],
      ['@astro-one/session-projection', SessionProjectionRegistry],
      ['@astro-one/sandbox-policy', SandboxPolicyService],
      ['@astro-one/subprocess-local', LocalSubprocessRuntime],
      ['@astro-one/terminal-bash', TerminalLocal],
      ['@astro-one/tool-terminal', ToolPty],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await context.loader.await()

    const owner = await agent(context)
    const signal = new AbortController().signal
    const spawn = await context.tools.execute({
      signal, callId: ToolCallId('spawn'), name: 'terminal_open', arguments: { type: 'shell', name: 'main', cwd: root }, agent: owner,
    })
    expect(resultText(spawn)).toContain('started terminal session pty-1 (main)')

    await context.tools.execute({
      signal, callId: ToolCallId('state'), name: 'terminal_send', arguments: { sessionId: 'pty-1', text: 'export KEEP=loader; cd /' }, agent: owner,
    })
    const read = await context.tools.execute({
      signal, callId: ToolCallId('read'), name: 'terminal_send', arguments: { sessionId: 'pty-1', text: 'printf "cwd=%s keep=%s\\n" "$PWD" "$KEEP"' }, agent: owner,
    })
    expect(resultText(read)).toContain('cwd=/ keep=loader')
    expect(context.terminals.list(owner)).toHaveLength(1)
  }, 15_000)
})
