import { executeToolFixture } from '@astro-one/tool-testkit'
import * as NativeToolExecutor from '@astro-one/tool-executor-native'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@astro-one/cordis'
import Loader from '@astro-one/cordis-plugin-loader'
import Include from '@astro-one/cordis-plugin-include'
import AgentRegistry from '@astro-one/agent'
import AgentLoop from '@astro-one/agent-loop'
import LocalFileSystem from '@astro-one/fs-local'
import LlmRuntime, { ToolCallId } from '@astro-one/llm'
import LocalSandbox from '@astro-one/sandbox-local'
import SandboxPolicyService from '@astro-one/sandbox-policy'
import SessionStore, { SessionId } from '@astro-one/session'
import SessionProjectionRegistry from '@astro-one/session-projection'
import LocalSubprocessRuntime from '@astro-one/subprocess-local'
import SystemPrompt from '@astro-one/system-prompt'
import ToolRuntime from '@astro-one/tools'
import WorkingDirectoryService from '@astro-one/working-directory'
import WorktreeService from '@astro-one/experimental-worktree'
import * as ToolWorktree from '../src/index.ts'

const exec = promisify(execFile)
let context: Context | undefined
let root: string | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('worktree tool through real Loader composition', () => {
  it('creates and enters a new checkout, reports canonical fields, and unregisters on disposal', async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'astro-one-worktree-loader-')))
    const repository = join(root, 'repo')
    await mkdir(repository)
    const git = (...args: string[]) => exec('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: repository,
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '', GIT_CONFIG_PARAMETERS: '', GIT_CONFIG_COUNT: '0', GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined },
    })
    await git('init', '-b', 'main')
    await git('config', 'core.autocrlf', 'false')
    await writeFile(join(repository, 'file.txt'), 'committed\n')
    await git('add', 'file.txt')
    await git('-c', 'user.name=Worktree fixture', '-c', 'user.email=worktree@example.invalid', '-c', 'commit.gpgSign=false', 'commit', '-m', 'initial')
    const baseCommit = (await git('rev-parse', 'HEAD')).stdout.trim()

    const modules = new Map<string, unknown>([
      ['@astro-one/agent', AgentRegistry],
      ['@astro-one/session', SessionStore],
      ['@astro-one/session-projection', SessionProjectionRegistry],

      ['@astro-one/system-prompt', SystemPrompt],
      ['@astro-one/llm', LlmRuntime],
      ['@astro-one/tools', ToolRuntime],
      ['@astro-one/tool-executor-native', NativeToolExecutor],
      ['@astro-one/fs-local', LocalFileSystem],
      ['@astro-one/subprocess-local', LocalSubprocessRuntime],
      ['@astro-one/sandbox-local', LocalSandbox],
      ['@astro-one/sandbox-policy', SandboxPolicyService],
      ['@astro-one/working-directory', WorkingDirectoryService],
      ['@astro-one/experimental-worktree', WorktreeService],
      ['@astro-one/experimental-tool-worktree', ToolWorktree],
      ['@astro-one/agent-loop', AgentLoop],
    ])
    const config = [...modules.keys()].flatMap(name => [
      `- name: 'cordis:${name}'`,
      ...name === '@astro-one/sandbox-policy' ? ['  config:', '    mode: danger-full-access'] : [],
      ...name === '@astro-one/agent-loop' ? ['  config:', '    agents: []'] : [],
    ]).join('\n') + '\n'
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, config)
    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    for (const [specifier, plugin] of modules) context.loader.builtins[specifier] = plugin
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await context.loader.await()

    const agent = await context.agentLoop.create(SessionId('worktree-loader'), {}, { cwd: repository })
    const invoke = (name: string, agentValue = agent) => executeToolFixture(context!, {
      name: 'create_worktree', callId: ToolCallId(name), arguments: { name }, agent: agentValue, signal: new AbortController().signal,
    })
    const result = await invoke('new-checkout')
    const path = join(repository, '.agents/worktrees/new-checkout')
    expect(result.isError).not.toBe(true)
    expect(result.value).toEqual({ path, branch: 'new-checkout', baseCommit, repositoryRoot: repository })
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.value) }])
    expect(context.workingDirectory.get(agent.session)).toBe(path)
    expect(await readFile(join(path, 'file.txt'), 'utf8')).toBe('committed\n')

    const failure = await executeToolFixture(context, {
      name: 'create_worktree', callId: ToolCallId('no-agent'), arguments: {}, signal: new AbortController().signal,
    })
    expect(failure.isError).toBe(true)
    expect(failure.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')).toContain('requires a calling agent')
    expect(context.tools.get('create_worktree')!.presentCall!({ name: 'named' })).toEqual({ card: 'generic', title: 'create_worktree', rawInput: { name: 'named' } })
    const entry = [...context.loader.entries()].find(candidate => candidate.options.name === 'cordis:@astro-one/experimental-tool-worktree')
    await entry!.fiber!.dispose()
    expect(context.tools.schemas().some(tool => tool.name === 'create_worktree')).toBe(false)
  })
})
