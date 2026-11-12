// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

vi.mock('three', async importOriginal => ({
  ...await importOriginal<typeof import('three')>(),
  WebGLRenderer: class {
    constructor(readonly options: { canvas: HTMLCanvasElement; antialias: boolean; alpha: boolean }) {
      if (options.canvas.dataset['webgl'] === 'off') throw new Error('WebGL context could not be created')
    }
  },
}))

describe('WebGL renderer factory', () => {
  it('creates a transparent antialiased renderer, or null where WebGL is unavailable', async () => {
    const { createWebGLRenderer } = await import('../src/client/Viewport.tsx')
    const canvas = document.createElement('canvas')
    expect(createWebGLRenderer(canvas)).toMatchObject({ options: { canvas, antialias: true, alpha: true } })
    canvas.dataset['webgl'] = 'off'
    expect(createWebGLRenderer(canvas)).toBeNull()
  })
})
