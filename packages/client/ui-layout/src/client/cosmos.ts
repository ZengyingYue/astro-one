/**
 * Deep-space simulation painted by the Astro One backdrop canvas: drifting
 * nebulae, orbital instrument rings, a three-depth starfield that drifts and
 * twinkles, satellites that cross the sky on bent orbits with blinking
 * beacons, and occasional meteors. Everything that moves in the backdrop is
 * drawn here, so the whole backdrop costs one canvas frame at the loop's
 * budget instead of per-frame CSS compositing and SVG repaints. The state is
 * plain data advanced by {@link stepCosmos} and painted by
 * {@link drawCosmos}; {@link startCosmos} owns the browser loop.
 */

/** RGB channel triples (`"r, g, b"`) read from the theme's `--lh-star*` tokens. */
export interface CosmosPalette {
  /** Neutral star colour. */
  star: string
  /** Ion-teal accent colour for tinted stars and beacons. */
  ion: string
  /** Solar-amber accent colour for tinted stars and beacons. */
  solar: string
  /** Global opacity multiplier; light themes dim the field. */
  alpha: number
  /** CSS colours of the three nebula clouds, from `--lh-nebula-a/b/c`. */
  nebula: readonly [string, string, string]
  /** CSS colour of the instrument rings, from `--lh-hud`. */
  hud: string
}

/** One star; `x`/`y` are CSS pixels, `depth` is 0 (far) to 1 (near). */
export interface Star {
  x: number
  y: number
  depth: number
  radius: number
  phase: number
  twinkle: number
  /** 0 neutral, 1 ion, 2 solar. */
  tint: 0 | 1 | 2
}

/** One satellite pass along a quadratic curve from `start` to `end`. */
export interface Satellite {
  progress: number
  duration: number
  start: readonly [number, number]
  control: readonly [number, number]
  end: readonly [number, number]
  beacon: 1 | 2
}

/** One meteor streak moving at a constant velocity until its life ends. */
export interface Meteor {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
}

/** Complete simulation state for one canvas. */
export interface CosmosState {
  width: number
  height: number
  time: number
  stars: Star[]
  satellites: Satellite[]
  meteors: Meteor[]
  nextSatellite: number
  nextMeteor: number
  /** Pointer parallax offset in CSS pixels, applied in proportion to depth. */
  parallax: { x: number; y: number }
  random: () => number
}

/** Stars per CSS pixel of canvas area. */
const STAR_DENSITY = 1 / 5200
const STAR_MIN = 90
const STAR_MAX = 520
/** Seconds between satellite passes: a fixed floor plus a random spread. */
const SATELLITE_INTERVAL = [9, 16] as const
const METEOR_INTERVAL = [5, 9] as const
/** Nebula clouds: centre and radii as fractions of the canvas, drift in radians per second. */
const NEBULAE = [
  { x: 0.72, y: 0.22, rx: 0.38, ry: 0.3, drift: 0.021 },
  { x: 0.18, y: 0.78, rx: 0.3, ry: 0.26, drift: 0.017 },
  { x: 0.42, y: 0.6, rx: 0.46, ry: 0.34, drift: 0.013 },
] as const
/** Instrument rings anchored off the lower-right corner (CSS pixels from that corner). */
const INSTRUMENT = { right: 140, bottom: 100, alpha: 0.32 } as const
/** Frame budget while the window has focus (30 frames per second). */
const FRAME_INTERVAL_MS = 33
/** Frame budget while the window is in the background (10 frames per second). */
const IDLE_FRAME_INTERVAL_MS = 100
/** Root attribute that rests ambient CSS motion while the window is in the background. */
export const COSMOS_IDLE_ATTRIBUTE = 'data-cosmos-idle'

/**
 * Seeded mulberry32 generator so a canvas lays out the same sky on every launch.
 * @param seed - integer seed.
 * @returns generator of floats in [0, 1).
 */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Lay out a starfield sized to the canvas area.
 * @param width - canvas width in CSS pixels.
 * @param height - canvas height in CSS pixels.
 * @param random - generator shared with later spawns.
 * @returns fresh state with no satellites or meteors in flight.
 */
export function createCosmos(width: number, height: number, random: () => number): CosmosState {
  const count = Math.max(STAR_MIN, Math.min(STAR_MAX, Math.round(width * height * STAR_DENSITY)))
  const stars: Star[] = []
  for (let i = 0; i < count; i++) {
    const depth = random()
    const roll = random()
    stars.push({
      x: random() * width,
      y: random() * height,
      depth,
      radius: 0.35 + depth * depth * 1.45,
      phase: random() * Math.PI * 2,
      twinkle: 0.6 + random() * 2.2,
      tint: roll < 0.08 ? 1 : roll < 0.13 ? 2 : 0,
    })
  }
  return {
    width,
    height,
    time: 0,
    stars,
    satellites: [],
    meteors: [],
    nextSatellite: 2.5,
    nextMeteor: 4,
    parallax: { x: 0, y: 0 },
    random,
  }
}

/**
 * Point on a satellite's curve.
 * @param satellite - the pass.
 * @param t - curve parameter in [0, 1].
 * @returns the CSS-pixel position.
 */
export function satellitePoint(satellite: Satellite, t: number): [number, number] {
  const u = 1 - t
  return [
    u * u * satellite.start[0] + 2 * u * t * satellite.control[0] + t * t * satellite.end[0],
    u * u * satellite.start[1] + 2 * u * t * satellite.control[1] + t * t * satellite.end[1],
  ]
}

function spawnSatellite(state: CosmosState): Satellite {
  const { width, height, random } = state
  const leftToRight = random() < 0.5
  const y0 = height * (0.08 + random() * 0.5)
  const y1 = height * (0.1 + random() * 0.55)
  const start: [number, number] = [leftToRight ? -40 : width + 40, y0]
  const end: [number, number] = [leftToRight ? width + 40 : -40, y1]
  return {
    progress: 0,
    duration: 16 + random() * 12,
    start,
    control: [width * (0.3 + random() * 0.4), Math.min(y0, y1) - height * (0.08 + random() * 0.12)],
    end,
    beacon: random() < 0.5 ? 1 : 2,
  }
}

function spawnMeteor(state: CosmosState): Meteor {
  const { width, height, random } = state
  const speed = 520 + random() * 380
  const angle = Math.PI * (0.78 + random() * 0.1)
  return {
    x: width * (0.35 + random() * 0.65),
    y: height * random() * 0.35,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 0,
    maxLife: 0.7 + random() * 0.5,
  }
}

function interval(range: readonly [number, number], random: () => number): number {
  return range[0] + random() * range[1]
}

/**
 * Advance the simulation.
 * @param state - state to mutate.
 * @param dt - elapsed seconds; callers clamp large gaps.
 */
export function stepCosmos(state: CosmosState, dt: number): void {
  state.time += dt
  for (const star of state.stars) {
    star.x -= dt * (1.5 + star.depth * 5)
    if (star.x < -2) star.x += state.width + 4
  }
  for (const satellite of state.satellites) satellite.progress += dt / satellite.duration
  state.satellites = state.satellites.filter(satellite => satellite.progress < 1)
  for (const meteor of state.meteors) {
    meteor.life += dt
    meteor.x += meteor.vx * dt
    meteor.y += meteor.vy * dt
  }
  state.meteors = state.meteors.filter(meteor => meteor.life < meteor.maxLife)
  if (state.time >= state.nextSatellite) {
    state.satellites.push(spawnSatellite(state))
    state.nextSatellite = state.time + interval(SATELLITE_INTERVAL, state.random)
  }
  if (state.time >= state.nextMeteor) {
    state.meteors.push(spawnMeteor(state))
    state.nextMeteor = state.time + interval(METEOR_INTERVAL, state.random)
  }
}

function tintOf(palette: CosmosPalette, tint: 0 | 1 | 2): string {
  return tint === 1 ? palette.ion : tint === 2 ? palette.solar : palette.star
}

function drawSatellite(ctx: CanvasRenderingContext2D, satellite: Satellite, palette: CosmosPalette, time: number): void {
  const t = satellite.progress
  const [x, y] = satellitePoint(satellite, t)
  const [ax, ay] = satellitePoint(satellite, Math.max(0, t - 0.06))
  const fade = Math.min(1, t * 8, (1 - t) * 8) * palette.alpha
  const trail = ctx.createLinearGradient(ax, ay, x, y)
  trail.addColorStop(0, `rgba(${palette.ion}, 0)`)
  trail.addColorStop(1, `rgba(${palette.ion}, ${0.32 * fade})`)
  ctx.strokeStyle = trail
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(x, y)
  ctx.stroke()

  // Bus in solar-foil gold, two gridded ion panels on booms, and a dish
  // antenna, drawn in the satellite's travel frame.
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(Math.atan2(y - ay, x - ax))
  ctx.globalAlpha = fade
  ctx.strokeStyle = `rgba(${palette.star}, .55)`
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.moveTo(0, -3)
  ctx.lineTo(0, -5)
  ctx.moveTo(0, 3)
  ctx.lineTo(0, 5)
  ctx.stroke()
  ctx.fillStyle = `rgba(${palette.ion}, .78)`
  ctx.fillRect(-3.5, -13, 7, 8)
  ctx.fillRect(-3.5, 5, 7, 8)
  ctx.strokeStyle = `rgba(${palette.star}, .35)`
  ctx.lineWidth = 0.4
  ctx.beginPath()
  for (const offset of [-10.3, -7.6, 7.6, 10.3]) {
    ctx.moveTo(-3.5, offset)
    ctx.lineTo(3.5, offset)
  }
  ctx.stroke()
  ctx.fillStyle = `rgba(${palette.solar}, .95)`
  ctx.fillRect(-3, -2.5, 6, 5)
  ctx.fillStyle = `rgba(${palette.star}, .9)`
  ctx.beginPath()
  ctx.arc(4.5, 0, 1.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  const blink = (time * 1.25) % 1
  if (blink < 0.18) {
    const colour = satellite.beacon === 1 ? palette.ion : palette.solar
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 9)
    glow.addColorStop(0, `rgba(${colour}, ${fade})`)
    glow.addColorStop(1, `rgba(${colour}, 0)`)
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(x, y, 9, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawMeteor(ctx: CanvasRenderingContext2D, meteor: Meteor, palette: CosmosPalette): void {
  const fade = Math.sin((meteor.life / meteor.maxLife) * Math.PI) * palette.alpha
  const tailX = meteor.x - meteor.vx * 0.16
  const tailY = meteor.y - meteor.vy * 0.16
  const streak = ctx.createLinearGradient(tailX, tailY, meteor.x, meteor.y)
  streak.addColorStop(0, `rgba(${palette.star}, 0)`)
  streak.addColorStop(1, `rgba(${palette.star}, ${0.85 * fade})`)
  ctx.strokeStyle = streak
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(tailX, tailY)
  ctx.lineTo(meteor.x, meteor.y)
  ctx.stroke()
}

function drawNebulae(ctx: CanvasRenderingContext2D, state: CosmosState, palette: CosmosPalette): void {
  const clouds = [[NEBULAE[0], palette.nebula[0]], [NEBULAE[1], palette.nebula[1]], [NEBULAE[2], palette.nebula[2]]] as const
  for (const [cloud, colour] of clouds) {
    const phase = state.time * cloud.drift
    const rx = cloud.rx * state.width
    const ry = cloud.ry * state.height
    const radius = Math.max(rx, ry)
    ctx.save()
    ctx.translate((cloud.x + 0.02 * Math.sin(phase)) * state.width, (cloud.y + 0.015 * Math.cos(phase * 1.3)) * state.height)
    ctx.scale(rx / radius, ry / radius)
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
    glow.addColorStop(0, colour)
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2)
    ctx.restore()
  }
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, from = 0, to = Math.PI * 2): void {
  ctx.beginPath()
  ctx.arc(x, y, radius, from, to)
  ctx.stroke()
}

/** Outer ring, slow tick ring, counter-rotating sweep, inner ring, and a tilted orbit carrying a body. */
function drawInstrument(ctx: CanvasRenderingContext2D, state: CosmosState, palette: CosmosPalette): void {
  const x = state.width - INSTRUMENT.right
  const y = state.height - INSTRUMENT.bottom
  const turn = Math.PI * 2
  ctx.save()
  ctx.strokeStyle = palette.hud
  ctx.globalAlpha = INSTRUMENT.alpha * 0.5
  ctx.lineWidth = 0.6
  ring(ctx, x, y, 305)
  ring(ctx, x, y, 203)
  ctx.globalAlpha = INSTRUMENT.alpha * 0.55
  ctx.lineWidth = 7
  ctx.setLineDash([1.75, 13.22])
  ctx.lineDashOffset = -(state.time / 160) * turn * 286
  ring(ctx, x, y, 286)
  ctx.setLineDash([])
  ctx.globalAlpha = INSTRUMENT.alpha
  ctx.lineWidth = 1.4
  ctx.lineCap = 'round'
  const sweep = -(state.time / 24) * turn
  ring(ctx, x, y, 247, sweep, sweep + 0.18 * turn)
  ctx.translate(x, y)
  ctx.rotate(-Math.PI / 10)
  ctx.strokeStyle = `rgba(${palette.solar}, 1)`
  ctx.globalAlpha = INSTRUMENT.alpha * 0.65
  ctx.lineWidth = 0.8
  ctx.setLineDash([3, 7])
  ctx.beginPath()
  ctx.ellipse(0, 0, 305, 102, 0, 0, turn)
  ctx.stroke()
  const orbit = (state.time / 40) * turn
  ctx.globalAlpha = Math.min(1, INSTRUMENT.alpha * 2.5)
  ctx.fillStyle = `rgba(${palette.solar}, 1)`
  ctx.beginPath()
  ctx.arc(305 * Math.cos(orbit), 102 * Math.sin(orbit), 4.3, 0, turn)
  ctx.fill()
  ctx.restore()
}

/**
 * Paint one frame.
 * @param ctx - 2D context already scaled to CSS pixels.
 * @param state - simulation to paint.
 * @param palette - current theme colours.
 */
export function drawCosmos(ctx: CanvasRenderingContext2D, state: CosmosState, palette: CosmosPalette): void {
  ctx.clearRect(0, 0, state.width, state.height)
  drawNebulae(ctx, state, palette)
  drawInstrument(ctx, state, palette)
  for (const star of state.stars) {
    const shimmer = 0.5 + 0.5 * Math.sin(state.time * star.twinkle + star.phase)
    const alpha = (0.25 + 0.75 * shimmer) * (0.35 + 0.65 * star.depth) * palette.alpha
    const x = star.x + state.parallax.x * star.depth
    const y = star.y + state.parallax.y * star.depth
    const colour = tintOf(palette, star.tint)
    ctx.fillStyle = `rgba(${colour}, ${alpha})`
    ctx.beginPath()
    ctx.arc(x, y, star.radius, 0, Math.PI * 2)
    ctx.fill()
    if (star.radius > 1.45 && shimmer > 0.72) {
      ctx.strokeStyle = `rgba(${colour}, ${alpha * 0.45})`
      ctx.lineWidth = 0.6
      ctx.beginPath()
      ctx.moveTo(x - star.radius * 4, y)
      ctx.lineTo(x + star.radius * 4, y)
      ctx.moveTo(x, y - star.radius * 4)
      ctx.lineTo(x, y + star.radius * 4)
      ctx.stroke()
    }
  }
  for (const meteor of state.meteors) drawMeteor(ctx, meteor, palette)
  for (const satellite of state.satellites) drawSatellite(ctx, satellite, palette, state.time)
}

/**
 * Read the palette from the theme tokens on `body`.
 * @param view - window whose document body carries the tokens.
 * @returns the palette; missing tokens fall back to white stars.
 */
export function readPalette(view: Window): CosmosPalette {
  const style = view.getComputedStyle(view.document.body)
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  const alpha = Number.parseFloat(token('--lh-star-alpha', '1'))
  return {
    star: token('--lh-star', '226, 240, 255'),
    ion: token('--lh-star-ion', '120, 240, 225'),
    solar: token('--lh-star-solar', '255, 200, 130'),
    alpha: Number.isFinite(alpha) ? alpha : 1,
    nebula: [
      token('--lh-nebula-a', 'rgba(28, 160, 170, .16)'),
      token('--lh-nebula-b', 'rgba(255, 150, 60, .07)'),
      token('--lh-nebula-c', 'rgba(60, 90, 200, .12)'),
    ],
    hud: token('--lh-hud', 'rgba(75, 227, 208, .6)'),
  }
}

/**
 * Run the backdrop on a canvas until the returned stop function is called.
 * The loop pauses while the document is hidden, slows to its idle budget and
 * sets {@link COSMOS_IDLE_ATTRIBUTE} on the root element while the window is
 * in the background, re-reads the palette when the body's theme attributes
 * change, follows window resizes, and paints a single still frame when the
 * user prefers reduced motion.
 * @param canvas - canvas filling the backdrop.
 * @param view - window supplying timing, events, and the theme.
 * @returns stop function that removes every listener and cancels the loop.
 */
export function startCosmos(canvas: HTMLCanvasElement, view: Window & typeof globalThis): () => void {
  const ctx = canvas.getContext('2d')
  if (ctx === null) return () => {}
  const still = view.matchMedia('(prefers-reduced-motion: reduce)').matches
  let palette = readPalette(view)
  let state = createCosmos(1, 1, createRandom(0x4c48))
  let frame: number | null = null
  let last = 0
  let budget = FRAME_INTERVAL_MS

  const paint = () => { drawCosmos(ctx, state, palette) }
  const resize = () => {
    const width = Math.max(1, canvas.clientWidth)
    const height = Math.max(1, canvas.clientHeight)
    const scale = Math.min(view.devicePixelRatio || 1, 1.5)
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    state = createCosmos(width, height, createRandom(0x4c48))
    paint()
  }
  const tick = (now: number) => {
    frame = view.requestAnimationFrame(tick)
    if (now - last < budget) return
    const dt = last === 0 ? 0 : Math.min(0.1, (now - last) / 1000)
    last = now
    stepCosmos(state, dt)
    paint()
  }
  const run = () => {
    if (still || frame !== null || view.document.hidden) return
    last = 0
    frame = view.requestAnimationFrame(tick)
  }
  const halt = () => {
    if (frame === null) return
    view.cancelAnimationFrame(frame)
    frame = null
  }
  const visibility = () => { if (view.document.hidden) halt(); else run() }
  const root = view.document.documentElement
  const focus = () => {
    budget = FRAME_INTERVAL_MS
    root.removeAttribute(COSMOS_IDLE_ATTRIBUTE)
  }
  const blur = () => {
    budget = IDLE_FRAME_INTERVAL_MS
    root.setAttribute(COSMOS_IDLE_ATTRIBUTE, '')
  }
  const pointer = (event: PointerEvent) => {
    state.parallax.x = (event.clientX / Math.max(1, view.innerWidth) - 0.5) * -14
    state.parallax.y = (event.clientY / Math.max(1, view.innerHeight) - 0.5) * -10
  }
  const theme = new view.MutationObserver(() => {
    palette = readPalette(view)
    paint()
  })

  resize()
  theme.observe(view.document.body, { attributes: true })
  view.addEventListener('resize', resize)
  view.addEventListener('focus', focus)
  view.addEventListener('blur', blur)
  if (!view.document.hasFocus()) blur()
  view.document.addEventListener('visibilitychange', visibility)
  if (!still) view.addEventListener('pointermove', pointer, { passive: true })
  run()
  return () => {
    halt()
    theme.disconnect()
    view.removeEventListener('resize', resize)
    view.removeEventListener('focus', focus)
    view.removeEventListener('blur', blur)
    root.removeAttribute(COSMOS_IDLE_ATTRIBUTE)
    view.removeEventListener('pointermove', pointer)
    view.document.removeEventListener('visibilitychange', visibility)
  }
}
