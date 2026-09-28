import { fileURLToPath } from 'node:url'
import { agentEvents, type Agent } from '@astro-one/agent'
import { ToolCallId } from '@astro-one/llm'
import { boot, loadOverlayPatches } from '@astro-one/app-boot'
import { SessionId } from '@astro-one/session'
import type {} from '@astro-one/skill'
import type {} from '@astro-one/tools'
import { unsupportedInbox } from '@astro-one/agent-loop-testkit'

const overlayPath = process.argv[2]
if (overlayPath === undefined) throw new Error('astro-one-badge snapshot requires an overlay path')
const rootConfigPath = fileURLToPath(new URL('../../../../../packages/bundle/base/tests/fixtures/root.cordis.yml', import.meta.url))
const basePatchPath = fileURLToPath(new URL('../../../../../packages/bundle/base/cordis.patch.yml', import.meta.url))
const ctx = await boot('astro-one-badge-snapshot', rootConfigPath, [
  ...loadOverlayPatches('astro-one-badge-snapshot', basePatchPath),
  ...loadOverlayPatches('astro-one-badge-snapshot', overlayPath),
])

try {
  const agentId = SessionId('astro-one-badge-snapshot')
  const session = ctx.sessions.create(agentId, { meta: { cwd: process.cwd() } })
  const agent: Agent = {
    ctx,
    id: agentId,
    options: {},
    session,
    inbox: unsupportedInbox(),
    status: 'idle',
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject: () => { throw new Error('astro-one-badge snapshot must receive the catalog at the step boundary') },
    cancel: () => {},
    runMaintenance: job => job(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  const decision = await agentEvents(ctx, agent).waterfall(
    'agent/pre-step',
    { messages: [], turn: 1, step: 1, signal: new AbortController().signal },
    () => Promise.resolve({ kind: 'enter' as const, messages: [] }),
  )
  const catalog = decision.kind === 'enter'
    ? decision.messages.find(message => message.role === 'user'
      && message.source.kind === 'skill-catalog')?.content
    : undefined
  const summary = (await ctx.skills.list()).find(skill => skill.name === 'astro-one-badge')
  const result = await ctx.tools.execute({
    callId: ToolCallId('astro-one-badge-snapshot'),
    name: 'skill',
    arguments: { name: 'astro-one-badge' },
    signal: new AbortController().signal,
  })
  process.stdout.write(`${JSON.stringify({ catalog: catalog ?? null, summary: summary ?? null, result })}\n`)
} finally {
  await ctx.fiber.dispose()
}
