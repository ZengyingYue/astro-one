import { executeToolFixture } from '@astro-one/tool-testkit'
import { fileURLToPath } from 'node:url'
import { agentEvents, type Agent } from '@astro-one/agent'
import { ToolCallId } from '@astro-one/llm'
import { boot, loadOverlayPatches } from '@astro-one/app-boot'
import { SessionId } from '@astro-one/session'
import type {} from '@astro-one/skill'
import type {} from '@astro-one/tools'
import { unsupportedModel, unsupportedInbox } from '@astro-one/agent-loop-testkit'

const overlayPath = process.argv[2]
if (overlayPath === undefined) throw new Error('astro-one-badge snapshot requires an overlay path')
const rootConfigPath = fileURLToPath(new URL('../../../../../packages/bundle/base/tests/fixtures/root.cordis.yml', import.meta.url))
const basePatchPath = fileURLToPath(new URL('../../../../../packages/bundle/base/cordis.patch.yml', import.meta.url))
// The fixture owns the optional provider; the base bundle has no dependency on it.
const overlays = loadOverlayPatches('astro-one-badge-snapshot', overlayPath).map(patch => patch.insert === undefined ? patch : {
  ...patch,
  insert: patch.insert.map(row => row.name === '@astro-one/skill-badge'
    ? { ...row, name: import.meta.resolve('@astro-one/skill-badge') }
    : row),
})
const ctx = await boot('astro-one-badge-snapshot', rootConfigPath, [
  ...loadOverlayPatches('astro-one-badge-snapshot', basePatchPath),
  ...overlays,
])

try {
  const agentId = SessionId('astro-one-badge-snapshot')
  const session = ctx.sessions.create(agentId, { meta: { cwd: process.cwd() } })
  const agent: Agent = {
    ctx,
    id: agentId,
    options: {},
    session,
    model: unsupportedModel(),
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
    { modelSelection: { provider: 'mock', model: 'mock' }, messages: [], turn: 1, step: 1, signal: new AbortController().signal },
    () => Promise.resolve({ kind: 'enter' as const, messages: [] }),
  )
  const catalog = decision.kind === 'enter'
    ? decision.messages.find(message => message.role === 'user'
      && message.source.kind === 'skill-catalog')?.content
    : undefined
  const summary = (await ctx.skills.list()).find(skill => skill.name === 'astro-one-badge')
  const result = await executeToolFixture(ctx, {
    callId: ToolCallId('astro-one-badge-snapshot'),
    name: 'skill',
    arguments: { name: 'astro-one-badge' },
    signal: new AbortController().signal,
  })
  process.stdout.write(`${JSON.stringify({ catalog: catalog ?? null, summary: summary ?? null, result })}\n`)
} finally {
  await ctx.fiber.dispose()
}
