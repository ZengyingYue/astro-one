// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { OrbitalScene } from '../src/client/skeleton/OrbitalScene.tsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('pauses the scene while hidden and removes its visibility listener on unmount', () => {
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  const view = render(<div><OrbitalScene /></div>)
  const scene = view.container.querySelector<HTMLElement>('[data-orbital-scene]')!
  expect(scene.getAttribute('aria-hidden')).toBe('true')
  expect(scene.dataset.paused).toBe('false')
  hidden.mockReturnValue(true)
  fireEvent(document, new Event('visibilitychange'))
  expect(scene.dataset.paused).toBe('true')
  view.unmount()
  hidden.mockReturnValue(false)
  fireEvent(document, new Event('visibilitychange'))
  expect(scene.dataset.paused).toBe('true')
})

it('keeps pointer displacement bounded and resets it when the pointer leaves', () => {
  const view = render(<div><OrbitalScene /></div>)
  const scene = view.container.querySelector<HTMLElement>('[data-orbital-scene]')!
  const host = scene.parentElement!
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 800))
  // jsdom has no PointerEvent constructor; the browser-owned pointer fields
  // are supplied on the dispatched event without changing global APIs.
  const move = Object.assign(new Event('pointermove'), { clientX: 2000, clientY: -800, pointerType: 'mouse' })
  fireEvent(host, move)
  expect(scene.style.getPropertyValue('--orbit-x')).toBe('12px')
  expect(scene.style.getPropertyValue('--orbit-y')).toBe('-9px')
  fireEvent.pointerLeave(host)
  expect(scene.style.getPropertyValue('--orbit-x')).toBe('0px')
  expect(scene.style.getPropertyValue('--orbit-y')).toBe('0px')
  view.unmount()
  fireEvent(host, move)
  expect(scene.style.getPropertyValue('--orbit-x')).toBe('0px')
})
