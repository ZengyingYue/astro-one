// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

const cosmos = vi.hoisted(() => ({ stop: vi.fn(), start: vi.fn() }))
vi.mock('../src/client/cosmos.ts', () => ({
  startCosmos: cosmos.start.mockImplementation(() => cosmos.stop),
}))

const { CosmosBackdrop } = await import('../src/client/CosmosBackdrop.tsx')

afterEach(() => {
  cleanup()
})

it('runs the cosmos on its canvas for the mounted lifetime and hides from assistive technology', () => {
  const view = render(<CosmosBackdrop />)
  const root = view.container.querySelector<HTMLElement>('[data-cosmos-backdrop]')!
  expect(root.getAttribute('aria-hidden')).toBe('true')
  const canvas = root.querySelector('canvas')
  expect(cosmos.start).toHaveBeenCalledWith(canvas, window)
  expect(root.hasAttribute('data-lh-ambient')).toBe(true)
  expect(cosmos.stop).not.toHaveBeenCalled()
  view.unmount()
  expect(cosmos.stop).toHaveBeenCalledOnce()
})
