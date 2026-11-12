import { Context } from '@astro-one/cordis'
import Sandbox from '@astro-one/sandbox-local'
import SandboxPolicy from '@astro-one/sandbox-policy'
import SessionProjections from '@astro-one/session-projection'
import { onTestFinished } from 'vitest'
import type { SandboxMode } from '@astro-one/sandbox'

/** Mount the Python runtime's policy and confinement providers with owned teardown. */
export async function createRuntimeContext(policy: { mode?: SandboxMode; workspaceRoot?: string } = {}): Promise<Context> {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(Sandbox, {})
  await ctx.plugin(SessionProjections)
  await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access', ...policy })
  return ctx
}
