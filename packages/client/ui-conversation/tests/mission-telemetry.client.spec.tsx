// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { makeTranslate } from '@astro-one/client-test-runtime'
import { en as commonEn } from '@astro-one/client-locale/src/locales/en.ts'
import { zh as commonZh } from '@astro-one/client-locale/src/locales/zh.ts'
import { en, zh } from '../src/client/locales.ts'
import { MissionTelemetry, utcClock } from '../src/client/skeleton/MissionTelemetry.tsx'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('formats the station clock as zero-padded UTC', () => {
  expect(utcClock(new Date('2026-09-27T03:04:05.678Z'))).toBe('03:04:05')
})

it('advances the UTC clock every second until unmounted and stays out of the accessibility tree', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-27T23:59:58Z'))
  const view = render(<MissionTelemetry t={makeTranslate(en, commonEn)} />)
  const readout = view.container.querySelector<HTMLElement>('[data-mission-telemetry]')!
  expect(readout.getAttribute('aria-hidden')).toBe('true')
  expect(readout.textContent).toBe('UTC23:59:58StationLH-01 Deep OrbitSignal')
  act(() => { vi.advanceTimersByTime(1000) })
  expect(view.getByText('23:59:59')).toBeTruthy()
  act(() => { vi.advanceTimersByTime(1000) })
  expect(view.getByText('00:00:00')).toBeTruthy()
  expect(readout.querySelectorAll('i')).toHaveLength(5)
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('labels the readout through the locale seat', () => {
  const view = render(<MissionTelemetry t={makeTranslate(zh, commonZh)} />)
  expect(view.getByText('站点')).toBeTruthy()
  expect(view.getByText('LH-01 深轨')).toBeTruthy()
  expect(view.getByText('信号')).toBeTruthy()
})
