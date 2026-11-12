// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  COSMOS_IDLE_ATTRIBUTE, createCosmos, createRandom, drawCosmos, readPalette, satellitePoint, startCosmos, stepCosmos,
} from '../src/client/cosmos.ts'
import type { CosmosPalette, CosmosState } from '../src/client/cosmos.ts'

const PALETTE: CosmosPalette = {
  star: '1, 2, 3', ion: '4, 5, 6', solar: '7, 8, 9', alpha: 1, nebula: ['red', 'green', 'blue'], hud: 'teal',
}

/** Records every canvas method call by name; property writes are stored and read back. */
function fakeContext() {
  const calls: string[] = []
  const gradient = { addColorStop: vi.fn() }
  const hooks: Record<string, (...args: number[]) => void> = {}
  const props: Record<string, unknown> = {}
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_target, key) {
      if (typeof key !== 'string') return undefined
      if (key in props) return props[key]
      if (key === 'createLinearGradient' || key === 'createRadialGradient') {
        return () => { calls.push(key); return gradient }
      }
      return (...args: number[]) => { calls.push(key); hooks[key]?.(...args) }
    },
    set(_target, key, value) {
      props[String(key)] = value
      return true
    },
  })
  return { ctx, calls, gradient, hooks }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.removeAttribute('style')
  document.body.removeAttribute('data-ds-dark-theme')
})

describe('createRandom', () => {
  it('repeats the same sequence for the same seed and stays in [0, 1)', () => {
    const a = createRandom(7)
    const b = createRandom(7)
    const values = Array.from({ length: 50 }, () => a())
    expect(values).toEqual(Array.from({ length: 50 }, () => b()))
    expect(values.every(value => value >= 0 && value < 1)).toBe(true)
    expect(createRandom(8)()).not.toBe(values[0])
  })
})

describe('createCosmos', () => {
  it('scales the star count with area inside the density bounds', () => {
    expect(createCosmos(10, 10, createRandom(1)).stars).toHaveLength(90)
    expect(createCosmos(1000, 800, createRandom(1)).stars).toHaveLength(154)
    expect(createCosmos(10000, 10000, createRandom(1)).stars).toHaveLength(520)
  })

  it('places stars inside the canvas with depth-sized radii and all three tints', () => {
    const state = createCosmos(2000, 1500, createRandom(3))
    for (const star of state.stars) {
      expect(star.x).toBeGreaterThanOrEqual(0)
      expect(star.x).toBeLessThan(2000)
      expect(star.y).toBeLessThan(1500)
      expect(star.radius).toBeCloseTo(0.35 + star.depth * star.depth * 1.45)
    }
    expect(new Set(state.stars.map(star => star.tint))).toEqual(new Set([0, 1, 2]))
    expect(state.satellites).toEqual([])
    expect(state.meteors).toEqual([])
  })
})

describe('stepCosmos', () => {
  it('drifts stars left and wraps them to the right edge', () => {
    const state = createCosmos(100, 100, createRandom(2))
    const star = state.stars[0]!
    star.x = -1.9
    star.depth = 1
    stepCosmos(state, 0.1)
    expect(star.x).toBeCloseTo(-1.9 - 0.65 + 104)
  })

  it('spawns satellites and meteors on schedule and retires them when finished', () => {
    const state = createCosmos(800, 600, createRandom(4))
    stepCosmos(state, 2)
    expect(state.satellites).toHaveLength(0)
    stepCosmos(state, 0.5)
    expect(state.satellites).toHaveLength(1)
    expect(state.nextSatellite).toBeGreaterThanOrEqual(2.5 + 9)
    stepCosmos(state, 1.5)
    expect(state.meteors).toHaveLength(1)
    const meteor = state.meteors[0]!
    const x = meteor.x
    stepCosmos(state, 0.1)
    expect(meteor.x).toBeLessThan(x)
    stepCosmos(state, 1.5)
    expect(state.meteors).toHaveLength(0)
    const satellite = state.satellites[0]!
    satellite.progress = 0.999
    stepCosmos(state, 0.1)
    expect(state.satellites).not.toContain(satellite)
  })

  it('launches satellites from either edge', () => {
    const starts = new Set<number>()
    for (let seed = 0; seed < 12; seed++) {
      const state = createCosmos(500, 400, createRandom(seed))
      stepCosmos(state, 2.5)
      starts.add(Math.sign(state.satellites[0]!.start[0]))
    }
    expect(starts).toEqual(new Set([-1, 1]))
  })
})

describe('satellitePoint', () => {
  it('follows the quadratic curve from start through control to end', () => {
    const satellite = { progress: 0, duration: 10, start: [0, 0], control: [50, -50], end: [100, 0], beacon: 1 } as const
    expect(satellitePoint(satellite, 0)).toEqual([0, 0])
    expect(satellitePoint(satellite, 0.5)).toEqual([50, -25])
    expect(satellitePoint(satellite, 1)).toEqual([100, 0])
  })
})

describe('drawCosmos', () => {
  function sky(): CosmosState {
    const state = createCosmos(400, 300, createRandom(5))
    state.stars = [
      { x: 10, y: 10, depth: 1, radius: 1.8, phase: Math.PI / 2, twinkle: 1, tint: 1 },
      { x: 20, y: 20, depth: 0.2, radius: 0.4, phase: 0, twinkle: 1, tint: 2 },
      { x: 30, y: 30, depth: 1, radius: 1.8, phase: -Math.PI / 2, twinkle: 1, tint: 0 },
    ]
    return state
  }

  it('paints stars with parallax, glints only bright near stars, and tints by kind', () => {
    const { ctx, calls, hooks } = fakeContext()
    const state = sky()
    state.parallax = { x: 10, y: -4 }
    const fills: unknown[] = []
    hooks.arc = (x, y, radius) => { if (radius === 1.8 || radius === 0.4) fills.push([x, y, ctx.fillStyle]) }
    drawCosmos(ctx, state, PALETTE)
    expect(calls[0]).toBe('clearRect')
    expect(fills).toEqual([
      [20, 6, 'rgba(4, 5, 6, 1)'],
      [22, 19.2, 'rgba(7, 8, 9, 0.3)'],
      [40, 26, 'rgba(1, 2, 3, 0.25)'],
    ])
    expect(calls.filter(call => call === 'stroke')).toHaveLength(6)
  })

  it('paints drifting nebulae in the theme colours and the instrument rings with a moving tick dash and orbit body', () => {
    const { ctx, calls, gradient, hooks } = fakeContext()
    const state = sky()
    state.stars = []
    const bodies: number[][] = []
    hooks.arc = (x, y, radius) => { if (radius === 4.3) bodies.push([x, y]) }
    drawCosmos(ctx, state, PALETTE)
    for (const colour of PALETTE.nebula) expect(gradient.addColorStop).toHaveBeenCalledWith(0, colour)
    expect(calls).toContain('ellipse')
    expect(calls).toContain('setLineDash')
    expect(ctx.lineDashOffset).toBeCloseTo(0)
    expect(bodies).toEqual([[305, 0]])
    state.time = 10
    drawCosmos(ctx, state, PALETTE)
    expect(ctx.lineDashOffset).toBeCloseTo(-(10 / 160) * Math.PI * 2 * 286)
    expect(bodies[1]![0]).toBeCloseTo(305 * Math.cos(Math.PI / 2))
    expect(bodies[1]![1]).toBeCloseTo(102)
  })

  it('draws meteors, satellite trails, and the blinking beacon only during its flash', () => {
    const { ctx, calls, gradient } = fakeContext()
    const state = sky()
    state.stars = []
    state.meteors = [{ x: 100, y: 50, vx: -300, vy: 200, life: 0.3, maxLife: 0.6 }]
    state.satellites = [
      { progress: 0.5, duration: 20, start: [0, 100], control: [200, 0], end: [400, 100], beacon: 1 },
      { progress: 0.02, duration: 20, start: [400, 100], control: [200, 0], end: [0, 100], beacon: 2 },
    ]
    state.time = 0.1
    drawCosmos(ctx, state, PALETTE)
    expect(calls.filter(call => call === 'createLinearGradient')).toHaveLength(3)
    expect(calls.filter(call => call === 'createRadialGradient')).toHaveLength(5)
    expect(gradient.addColorStop).toHaveBeenCalledWith(0, 'rgba(4, 5, 6, 1)')
    expect(gradient.addColorStop).toHaveBeenCalledWith(0, 'rgba(7, 8, 9, 0.16)')

    const dark = fakeContext()
    state.time = 0.5
    drawCosmos(dark.ctx, state, PALETTE)
    expect(dark.calls.filter(call => call === 'createRadialGradient')).toHaveLength(3)
  })
})

describe('readPalette', () => {
  it('reads the theme tokens from the body and falls back when they are absent', () => {
    expect(readPalette(window)).toEqual({
      star: '226, 240, 255', ion: '120, 240, 225', solar: '255, 200, 130', alpha: 1,
      nebula: ['rgba(28, 160, 170, .16)', 'rgba(255, 150, 60, .07)', 'rgba(60, 90, 200, .12)'],
      hud: 'rgba(75, 227, 208, .6)',
    })
    document.body.style.setProperty('--lh-star', '9, 9, 9')
    document.body.style.setProperty('--lh-star-ion', '8, 8, 8')
    document.body.style.setProperty('--lh-star-solar', '7, 7, 7')
    document.body.style.setProperty('--lh-star-alpha', '.5')
    document.body.style.setProperty('--lh-nebula-a', 'red')
    document.body.style.setProperty('--lh-nebula-b', 'lime')
    document.body.style.setProperty('--lh-nebula-c', 'blue')
    document.body.style.setProperty('--lh-hud', 'teal')
    expect(readPalette(window)).toEqual({
      star: '9, 9, 9', ion: '8, 8, 8', solar: '7, 7, 7', alpha: 0.5, nebula: ['red', 'lime', 'blue'], hud: 'teal',
    })
    document.body.style.setProperty('--lh-star-alpha', 'bright')
    expect(readPalette(window).alpha).toBe(1)
  })
})

describe('startCosmos', () => {
  function harness(options: { reduced?: boolean; context?: boolean; hidden?: boolean; focused?: boolean } = {}) {
    const { ctx, calls } = fakeContext()
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 480 })
    vi.spyOn(canvas, 'getContext').mockImplementation(() => (options.context === false ? null : ctx))
    const frames = new Map<number, FrameRequestCallback>()
    let nextFrame = 1
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(nextFrame, callback)
      return nextFrame++
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id) })
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: options.reduced ?? false }))
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(options.hidden ?? false)
    vi.spyOn(document, 'hasFocus').mockReturnValue(options.focused ?? true)
    const run = (now: number) => {
      const pending = [...frames.entries()]
      frames.clear()
      for (const [, callback] of pending) callback(now)
    }
    return { calls, canvas, frames, run, hidden }
  }

  it('does nothing without a 2D context', () => {
    const h = harness({ context: false })
    const stop = startCosmos(h.canvas, window)
    expect(h.frames.size).toBe(0)
    stop()
  })

  it('sizes the canvas to its box at up to 1.5x density and paints the first frame', () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2)
    const h = harness()
    const stop = startCosmos(h.canvas, window)
    expect(h.canvas.width).toBe(960)
    expect(h.canvas.height).toBe(720)
    expect(h.calls).toContain('setTransform')
    expect(h.calls).toContain('clearRect')
    stop()
  })

  it('advances at the frame budget, pauses while hidden, and resumes when shown', () => {
    const h = harness()
    const stop = startCosmos(h.canvas, window)
    h.calls.length = 0
    h.run(1000)
    expect(h.calls).toContain('clearRect')
    h.calls.length = 0
    h.run(1010)
    expect(h.calls).toEqual([])
    h.run(1100)
    expect(h.calls).toContain('clearRect')
    h.hidden.mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(h.frames.size).toBe(0)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(h.frames.size).toBe(0)
    h.hidden.mockReturnValue(false)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(h.frames.size).toBe(1)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(h.frames.size).toBe(1)
    stop()
    expect(h.frames.size).toBe(0)
  })

  it('slows to the idle budget and rests ambient motion while the window is in the background', () => {
    const h = harness()
    const stop = startCosmos(h.canvas, window)
    const root = document.documentElement
    expect(root.hasAttribute(COSMOS_IDLE_ATTRIBUTE)).toBe(false)
    h.run(1000)
    window.dispatchEvent(new Event('blur'))
    expect(root.hasAttribute(COSMOS_IDLE_ATTRIBUTE)).toBe(true)
    h.calls.length = 0
    h.run(1050)
    expect(h.calls).toEqual([])
    h.run(1100)
    expect(h.calls).toContain('clearRect')
    window.dispatchEvent(new Event('focus'))
    expect(root.hasAttribute(COSMOS_IDLE_ATTRIBUTE)).toBe(false)
    h.calls.length = 0
    h.run(1140)
    expect(h.calls).toContain('clearRect')
    window.dispatchEvent(new Event('blur'))
    stop()
    expect(root.hasAttribute(COSMOS_IDLE_ATTRIBUTE)).toBe(false)
  })

  it('starts idle when the window opens without focus', () => {
    const h = harness({ focused: false })
    const stop = startCosmos(h.canvas, window)
    expect(document.documentElement.hasAttribute(COSMOS_IDLE_ATTRIBUTE)).toBe(true)
    stop()
  })

  it('waits for visibility before starting a hidden document', () => {
    const h = harness({ hidden: true })
    const stop = startCosmos(h.canvas, window)
    expect(h.frames.size).toBe(0)
    stop()
  })

  it('paints one still frame for reduced motion and ignores the pointer', () => {
    const h = harness({ reduced: true })
    const add = vi.spyOn(window, 'addEventListener')
    const stop = startCosmos(h.canvas, window)
    expect(h.frames.size).toBe(0)
    expect(h.calls).toContain('clearRect')
    expect(add.mock.calls.map(call => call[0])).not.toContain('pointermove')
    stop()
  })

  it('repaints on resize and theme changes, follows the pointer, and detaches on stop', async () => {
    const h = harness()
    const stop = startCosmos(h.canvas, window)
    Object.defineProperty(h.canvas, 'clientWidth', { configurable: true, value: 320 })
    window.dispatchEvent(new Event('resize'))
    expect(h.canvas.width).toBe(320)
    window.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 0, clientY: window.innerHeight }))
    h.calls.length = 0
    document.body.setAttribute('data-ds-dark-theme', '')
    await Promise.resolve()
    expect(h.calls).toContain('clearRect')
    stop()
    h.calls.length = 0
    window.dispatchEvent(new Event('resize'))
    document.body.removeAttribute('data-ds-dark-theme')
    await Promise.resolve()
    expect(h.calls).toEqual([])
  })
})
