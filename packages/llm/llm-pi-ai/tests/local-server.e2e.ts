/** Opt-in real local-server smoke through the production LLM adapter. */
import { Context } from '@astro-one/cordis'
import LlmRuntime, { createUserMessage } from '@astro-one/llm'
import * as LlmPiAi from '@astro-one/llm-pi-ai'
import { describe, expect, it } from 'vitest'
import { assemble } from './assemble.ts'

const baseURL = process.env.LOCAL_LLM_BASE_URL
const model = process.env.LOCAL_LLM_MODEL

describe.skipIf(!baseURL || !model)('local OpenAI-compatible server', () => {
  it('streams a response without a cloud credential', async () => {
    if (!baseURL || !model) throw new Error('Set LOCAL_LLM_BASE_URL and LOCAL_LLM_MODEL.')
    const ctx = new Context()
    try {
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(LlmPiAi, { providers: { local: {
        authentication: 'none', api: 'openai-completions', baseURL,
        models: [{ id: model, contextWindow: 32768, maxTokens: 4096 }],
      } } })
      const result = await assemble(ctx, {
        provider: 'local', model, maxTokens: 256,
        messages: [createUserMessage({
          content: [{ type: 'text', text: 'Reply with only: ASTRO_ONE_OK /no_think' }],
          source: { kind: 'model', provider: 'local', model },
        })],
      })
      expect(result.finish.kind).toBe('stop')
      expect(result.message.content.filter(block => block.type === 'text').map(block => block.text).join(''))
        .toContain('ASTRO_ONE_OK')
    } finally { await ctx.fiber.dispose() }
  })
})
