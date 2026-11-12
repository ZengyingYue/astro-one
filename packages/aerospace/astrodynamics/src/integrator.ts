/**
 * Runge–Kutta–Fehlberg 7(8) integrator with local extrapolation (NASA TR R-287), the standard
 * fixed-order workhorse for precise orbit propagation, with adaptive step control that lands
 * exactly on every requested output time.
 * @module @astro-one/astrodynamics/integrator
 */

/** First-order system dy/dt = f(t, y) with t in seconds. */
export type Derivative = (t: number, y: readonly number[]) => number[]

/** Adaptive step-control settings. */
export interface IntegratorSettings {
  /** Relative error tolerance per component. */
  readonly relTol: number
  /** Absolute error tolerance per component (state units). */
  readonly absTol: number
  /** Maximum accepted plus rejected steps before failing. */
  readonly maxSteps: number
  /** Initial step magnitude, s. */
  readonly initialStep: number
}

const C = [0, 2 / 27, 1 / 9, 1 / 6, 5 / 12, 1 / 2, 5 / 6, 1 / 6, 2 / 3, 1 / 3, 1, 0, 1]

const A: readonly (readonly number[])[] = [
  [],
  [2 / 27],
  [1 / 36, 1 / 12],
  [1 / 24, 0, 1 / 8],
  [5 / 12, 0, -25 / 16, 25 / 16],
  [1 / 20, 0, 0, 1 / 4, 1 / 5],
  [-25 / 108, 0, 0, 125 / 108, -65 / 27, 125 / 54],
  [31 / 300, 0, 0, 0, 61 / 225, -2 / 9, 13 / 900],
  [2, 0, 0, -53 / 6, 704 / 45, -107 / 9, 67 / 90, 3],
  [-91 / 108, 0, 0, 23 / 108, -976 / 135, 311 / 54, -19 / 60, 17 / 6, -1 / 12],
  [2383 / 4100, 0, 0, -341 / 164, 4496 / 1025, -301 / 82, 2133 / 4100, 45 / 82, 45 / 164, 18 / 41],
  [3 / 205, 0, 0, 0, 0, -6 / 41, -3 / 205, -3 / 41, 3 / 41, 6 / 41, 0],
  [-1777 / 4100, 0, 0, -341 / 164, 4496 / 1025, -289 / 82, 2193 / 4100, 51 / 82, 33 / 164, 12 / 41, 0, 1],
]

/** Eighth-order weights (the propagated solution). */
const B8 = [0, 0, 0, 0, 0, 34 / 105, 9 / 35, 9 / 35, 9 / 280, 9 / 280, 0, 41 / 840, 41 / 840]

/** Butcher tableau used by the tests to check the order conditions. */
export const RKF78_TABLEAU = {
  c: C,
  a: A,
  b: B8,
  b7: [41 / 840, 0, 0, 0, 0, 34 / 105, 9 / 35, 9 / 35, 9 / 280, 9 / 280, 41 / 840, 0, 0],
} as const

/**
 * One RKF7(8) step.
 * @param f - derivative.
 * @param t - current time, s.
 * @param y - current state.
 * @param h - step, s.
 * @returns eighth-order state and the embedded error estimate per component.
 */
export function rkf78Step(f: Derivative, t: number, y: readonly number[], h: number): { y: number[]; err: number[] } {
  const n = y.length
  const k: number[][] = []
  for (let s = 0; s < 13; s++) {
    const row = A[s] as readonly number[]
    const ys = y.map((value, i) => {
      let acc = value
      for (let j = 0; j < row.length; j++) {
        const aij = row[j] as number
        if (aij !== 0) acc += h * aij * ((k[j] as number[])[i] as number)
      }
      return acc
    })
    k.push(f(t + (C[s] as number) * h, ys))
  }
  const out = new Array<number>(n)
  const err = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    let acc = y[i] as number
    for (let s = 0; s < 13; s++) acc += h * (B8[s] as number) * ((k[s] as number[])[i] as number)
    out[i] = acc
    const k1 = (k[0] as number[])[i] as number
    const k11 = (k[10] as number[])[i] as number
    const k12 = (k[11] as number[])[i] as number
    const k13 = (k[12] as number[])[i] as number
    err[i] = (h * 41 / 840) * (k1 + k11 - k12 - k13)
  }
  return { y: out, err }
}

/**
 * Integrate to each output time in order, adapting the step between them.
 * @param f - derivative.
 * @param t0 - initial time, s.
 * @param y0 - initial state.
 * @param outputs - output times, s, monotonic in the direction of integration.
 * @param settings - tolerances and step budget.
 * @returns the state at every output time.
 * @throws When the step budget is exhausted or the step underflows.
 */
export function integrate(
  f: Derivative, t0: number, y0: readonly number[], outputs: readonly number[], settings: IntegratorSettings,
): number[][] {
  const results: number[][] = []
  let t = t0
  let y = [...y0]
  let h = settings.initialStep
  let steps = 0
  for (const target of outputs) {
    const direction = Math.sign(target - t)
    while (Math.abs(target - t) > 1e-9) {
      if (++steps > settings.maxSteps) throw new Error(`integration exceeded ${String(settings.maxSteps)} steps`)
      const step = direction * Math.min(Math.abs(h), Math.abs(target - t))
      const { y: next, err } = rkf78Step(f, t, y, step)
      let ratio = 0
      for (let i = 0; i < y.length; i++) {
        const scaleI = settings.absTol + settings.relTol * Math.max(Math.abs(y[i] as number), Math.abs(next[i] as number))
        ratio = Math.max(ratio, Math.abs(err[i] as number) / scaleI)
      }
      const factor = ratio === 0 ? 4 : Math.min(4, Math.max(0.1, 0.9 * ratio ** (-1 / 8)))
      if (ratio <= 1) {
        t += step
        y = next
        if (Math.abs(step) >= Math.abs(h) * 0.999) h = Math.abs(step) * factor
      } else {
        h = Math.abs(step) * factor
        if (h < 1e-6) throw new Error('integration step underflow')
      }
    }
    t = target
    results.push([...y])
  }
  return results
}
