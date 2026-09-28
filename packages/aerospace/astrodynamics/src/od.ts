/**
 * Precise orbit determination: batch weighted least squares (differential correction) with
 * Levenberg–Marquardt damping, central-difference partials through any propagator, and
 * sigma-based outlier editing; and a sequential unscented Kalman filter with state-noise
 * compensation for non-linear measurement and dynamics models.
 * @module @astro-one/astrodynamics/od
 */

import { at, cholesky, cholInverse, cholSolve, matAdd, matMul, matT, symmetrize, zeros } from './linalg.ts'
import { observationSize, predictObservation, residuals } from './measurements.ts'
import type { Observation } from './measurements.ts'
import { vec3At } from './propagate.ts'
import type { Matrix, TimedState, UtcMs } from './types.ts'

/** Maps an initial state to states at output instants (same inertial frame). */
export type Propagator = (initial: TimedState, times: readonly UtcMs[]) => TimedState[]

/** Per-observation residual report. */
export interface ObservationResidual {
  /** Observation time. */
  readonly t: UtcMs
  /** Observation kind. */
  readonly kind: Observation['kind']
  /** Observed-minus-computed components in observation units. */
  readonly residual: number[]
  /** Residuals divided by the observation sigma. */
  readonly normalized: number[]
  /** Whether the observation was excluded by outlier editing. */
  readonly rejected: boolean
}

/** Batch least-squares controls. */
export interface BatchOptions {
  /** Differential-correction iteration cap. */
  readonly maxIterations: number
  /** Relative change of the weighted cost that declares convergence. */
  readonly tolerance: number
  /** Normalized residual above which an observation is rejected after the first iteration; `Infinity` disables editing. */
  readonly editSigma: number
  /** Central-difference steps for position (km) and velocity (km/s). */
  readonly perturbation: { readonly position: number; readonly velocity: number }
}

/** Batch least-squares estimate. */
export interface BatchResult {
  /** Estimated state at the initial epoch. */
  readonly state: TimedState
  /** Formal 6×6 covariance (km², km²/s, km²/s²). */
  readonly covariance: Matrix
  /** Weighted RMS of the accepted normalized residuals. */
  readonly rms: number
  /** Differential-correction iterations performed. */
  readonly iterations: number
  /** Whether the cost change met the tolerance. */
  readonly converged: boolean
  /** Residuals at the estimate. */
  readonly residuals: ObservationResidual[]
}

function toState(t: UtcMs, x: readonly number[]): TimedState {
  return { t, r: vec3At(x, 0), v: vec3At(x, 3) }
}

function stateArray(s: TimedState): number[] {
  return [...s.r, ...s.v]
}

interface Evaluation {
  readonly predictions: number[][]
  readonly residualSets: number[][]
}

function evaluate(x: readonly number[], epoch: UtcMs, obs: readonly Observation[], propagate: Propagator): Evaluation {
  const states = propagate(toState(epoch, x), obs.map(o => o.t))
  const predictions = obs.map((o, i) => predictObservation(o, states[i] as TimedState))
  return { predictions, residualSets: obs.map((o, i) => residuals(o, predictions[i] as number[])) }
}

function cost(evaluation: Evaluation, obs: readonly Observation[], used: readonly boolean[]): { sum: number; count: number } {
  let sum = 0
  let count = 0
  evaluation.residualSets.forEach((set, i) => {
    if (!used[i]) return
    const sigma = (obs[i] as Observation).sigma
    for (const r of set) {
      sum += (r / sigma) ** 2
      count++
    }
  })
  return { sum, count }
}

/**
 * Batch weighted least-squares orbit determination.
 * @param initial - a priori state (for example from Gibbs, Gauss, or SGP4).
 * @param obs - observations; at least six scalar components must survive editing.
 * @param propagate - dynamics model.
 * @param options - iteration, convergence, editing, and partial-derivative controls.
 * @returns estimate, covariance, and residuals.
 * @throws When the normal equations are singular or too few observations remain.
 */
export function batchLeastSquares(
  initial: TimedState, obs: readonly Observation[], propagate: Propagator, options: BatchOptions,
): BatchResult {
  const epoch = initial.t
  let x = stateArray(initial)
  const used = obs.map(() => true)
  let evaluation = evaluate(x, epoch, obs, propagate)
  let lambda = 1e-3
  let iterations = 0
  let converged = false
  let normal: Matrix = zeros(6, 6)
  for (; iterations < options.maxIterations; iterations++) {
    if (iterations > 0 && Number.isFinite(options.editSigma)) {
      evaluation.residualSets.forEach((set, i) => {
        const sigma = (obs[i] as Observation).sigma
        used[i] = set.every(r => Math.abs(r / sigma) <= options.editSigma)
      })
    }
    const current = cost(evaluation, obs, used)
    if (current.count < 6) throw new Error(`only ${String(current.count)} measurement components remain; at least 6 are required`)
    const h = partials(x, epoch, obs, used, propagate, options)
    const rows = h.rows
    const w = h.weights
    const y = h.indices.map(([i, k]) => ((evaluation.residualSets[i] as number[])[k] as number))
    const ht = matT(rows)
    const wh = rows.map((row, r) => row.map(value => value * (w[r] as number)))
    normal = symmetrize(matMul(ht, wh))
    const b = ht.map(col => col.reduce((sum, value, r) => sum + value * (w[r] as number) * (y[r] as number), 0))
    let accepted = false
    for (let attempt = 0; attempt < 12 && !accepted; attempt++) {
      const damped = normal.map((row, i) => row.map((value, j) => (i === j ? value * (1 + lambda) : value)))
      const dx = cholSolve(damped, b)
      const trial = x.map((value, i) => value + (dx[i] as number))
      const trialEval = evaluate(trial, epoch, obs, propagate)
      const trialCost = cost(trialEval, obs, used)
      if (trialCost.sum <= current.sum) {
        const change = Math.abs(current.sum - trialCost.sum) / Math.max(current.sum, 1e-300)
        x = trial
        evaluation = trialEval
        lambda = Math.max(lambda / 10, 1e-12)
        accepted = true
        if (change < options.tolerance) converged = true
      } else {
        lambda *= 10
      }
    }
    if (!accepted) {
      converged = true
      iterations++
      break
    }
    if (converged) {
      iterations++
      break
    }
  }
  const final = cost(evaluation, obs, used)
  return {
    state: toState(epoch, x),
    covariance: cholInverse(normal),
    rms: Math.sqrt(final.sum / final.count),
    iterations,
    converged,
    residuals: report(evaluation, obs, used),
  }
}

function report(evaluation: Evaluation, obs: readonly Observation[], used: readonly boolean[]): ObservationResidual[] {
  return obs.map((o, i) => {
    const residual = evaluation.residualSets[i] as number[]
    return { t: o.t, kind: o.kind, residual, normalized: residual.map(r => r / o.sigma), rejected: !used[i] }
  })
}

function partials(
  x: readonly number[], epoch: UtcMs, obs: readonly Observation[], used: readonly boolean[], propagate: Propagator, options: BatchOptions,
): { rows: Matrix; weights: number[]; indices: [number, number][] } {
  const indices: [number, number][] = []
  obs.forEach((o, i) => {
    if (!used[i]) return
    for (let k = 0; k < observationSize(o); k++) indices.push([i, k])
  })
  const rows = zeros(indices.length, 6)
  for (let j = 0; j < 6; j++) {
    const delta = j < 3 ? options.perturbation.position : options.perturbation.velocity
    const plus = x.map((value, i) => (i === j ? value + delta : value))
    const minus = x.map((value, i) => (i === j ? value - delta : value))
    const ep = evaluate(plus, epoch, obs, propagate)
    const em = evaluate(minus, epoch, obs, propagate)
    indices.forEach(([i, k], r) => {
      // Residual differences wrap angles, so (r− − r+) is the wrapped prediction difference.
      const diff = ((em.residualSets[i] as number[])[k] as number) - ((ep.residualSets[i] as number[])[k] as number)
      ;(rows[r] as number[])[j] = diff / (2 * delta)
    })
  }
  const weights = indices.map(([i]) => 1 / (obs[i] as Observation).sigma ** 2)
  return { rows, weights, indices }
}

/** Unscented Kalman filter controls. */
export interface UkfOptions {
  /** White-noise acceleration standard deviation for state-noise compensation, km/s². */
  readonly processNoise: number
  /** Sigma-point spread α. */
  readonly alpha: number
  /** Prior-distribution parameter β (2 is optimal for Gaussian priors). */
  readonly beta: number
  /** Secondary scaling κ. */
  readonly kappa: number
}

/** One filter update. */
export interface UkfStep {
  /** Observation time. */
  readonly t: UtcMs
  /** Pre-fit innovation (observed minus predicted mean). */
  readonly innovation: number[]
  /** Innovation divided by √(innovation variance) per component. */
  readonly normalized: number[]
}

/** Filter result at the last observation. */
export interface UkfResult {
  /** Posterior state at the last observation time. */
  readonly state: TimedState
  /** Posterior 6×6 covariance. */
  readonly covariance: Matrix
  /** Per-observation innovations. */
  readonly steps: UkfStep[]
}

/**
 * Sequential unscented Kalman filter.
 * @param initial - a priori state.
 * @param initialCovariance - a priori 6×6 covariance.
 * @param obs - observations in non-decreasing time order.
 * @param propagate - dynamics model.
 * @param options - sigma-point and process-noise controls.
 * @returns posterior at the last observation with innovation history.
 */
export function unscentedKalmanFilter(
  initial: TimedState, initialCovariance: Matrix, obs: readonly Observation[], propagate: Propagator, options: UkfOptions,
): UkfResult {
  const n = 6
  const lambda = options.alpha ** 2 * (n + options.kappa) - n
  const wm0 = lambda / (n + lambda)
  const wc0 = wm0 + (1 - options.alpha ** 2 + options.beta)
  const wi = 1 / (2 * (n + lambda))
  let x = stateArray(initial)
  let p = initialCovariance.map(row => [...row])
  let t = initial.t
  const steps: UkfStep[] = []
  const sigmaPoints = (mean: readonly number[], cov: Matrix): number[][] => {
    const l = cholesky(cov.map(row => row.map(value => value * (n + lambda))))
    const pts = [[...mean]]
    for (let j = 0; j < n; j++) {
      pts.push(mean.map((value, i) => value + at(l, i, j)))
      pts.push(mean.map((value, i) => value - at(l, i, j)))
    }
    return pts
  }
  const weight = (k: number, covariance: boolean): number => (k === 0 ? (covariance ? wc0 : wm0) : wi)
  for (const o of obs) {
    const dt = (o.t - t) / 1000
    let pts = sigmaPoints(x, p)
    if (dt !== 0) pts = pts.map(pt => stateArray(propagate(toState(t, pt), [o.t])[0] as TimedState))
    // Mean relative to the central point keeps the large-magnitude weights well conditioned.
    const x0 = pts[0] as number[]
    const xMean = x0.map((value, i) => value + pts.reduce((sum, pt, k) => sum + weight(k, false) * ((pt[i] as number) - value), 0))
    let pBar = zeros(n, n)
    for (let k = 0; k < pts.length; k++) {
      const d = (pts[k] as number[]).map((value, i) => value - (xMean[i] as number))
      pBar = matAdd(pBar, d.map(a => d.map(b => a * b)), weight(k, true))
    }
    const q = options.processNoise ** 2
    const a3 = (q * Math.abs(dt) ** 3) / 3
    const a2 = (q * dt * dt) / 2
    const a1 = q * Math.abs(dt)
    for (let i = 0; i < 3; i++) {
      ;(pBar[i] as number[])[i] = at(pBar, i, i) + a3
      ;(pBar[i] as number[])[i + 3] = at(pBar, i, i + 3) + a2
      ;(pBar[i + 3] as number[])[i] = at(pBar, i + 3, i) + a2
      ;(pBar[i + 3] as number[])[i + 3] = at(pBar, i + 3, i + 3) + a1
    }
    const zPts = pts.map(pt => predictObservation(o, toState(o.t, pt)))
    const z0 = zPts[0] as number[]
    const dz = zPts.map(z => residuals(o, z).map(r => -r))
    // dz holds predicted-minus-observed; re-centre on the central prediction.
    const centre = residuals(o, z0).map(r => -r)
    const zMeanDelta = centre.map((c, i) => zPts.reduce(
      (sum, _z, k) => sum + weight(k, false) * (((dz[k] as number[])[i] as number) - c),
      0,
    ))
    const m = centre.length
    let pzz = zeros(m, m)
    let pxz = zeros(n, m)
    for (let k = 0; k < pts.length; k++) {
      const ez = (dz[k] as number[]).map((value, i) => value - (centre[i] as number) - (zMeanDelta[i] as number))
      const ex = (pts[k] as number[]).map((value, i) => value - (xMean[i] as number))
      pzz = matAdd(pzz, ez.map(a => ez.map(b => a * b)), weight(k, true))
      pxz = matAdd(pxz, ex.map(a => ez.map(b => a * b)), weight(k, true))
    }
    for (let i = 0; i < m; i++) (pzz[i] as number[])[i] = at(pzz, i, i) + o.sigma ** 2
    // Innovation = observed − predicted mean = −(centre + mean delta).
    const innovation = centre.map((value, i) => -(value + (zMeanDelta[i] as number)))
    const pzzInv = cholInverse(pzz)
    const gain = matMul(pxz, pzzInv)
    x = xMean.map((value, i) => value + (gain[i] as number[]).reduce((sum, g, j) => sum + g * (innovation[j] as number), 0))
    p = symmetrize(matAdd(pBar, matMul(matMul(gain, pzz), matT(gain)), -1))
    t = o.t
    steps.push({ t: o.t, innovation, normalized: innovation.map((value, i) => value / Math.sqrt(at(pzz, i, i))) })
  }
  return { state: toState(t, x), covariance: p, steps }
}
