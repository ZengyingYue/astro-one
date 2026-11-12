/**
 * `orbit_determine`: initial orbit determination (Gibbs, Herrick–Gibbs, Gauss angles-only) and
 * precise orbit determination (batch weighted least squares, unscented Kalman filter) from
 * position, range, range-rate, right ascension/declination, and azimuth/elevation tracking.
 * @module @astro-one/tool-astrodynamics/determine
 */

import {
  batchLeastSquares, DEG, formatUtc, gaussAnglesOnly, gibbs, herrickGibbs, propagateNumerical, propagateTwoBody,
  siteGcrf, unscentedKalmanFilter,
} from '@astro-one/astrodynamics'
import type { AnglesObservation, Observation, Propagator, TimedState, Vec3 } from '@astro-one/astrodynamics'
import { defineTool } from '@astro-one/tools'
import type { ToolDefinition } from '@astro-one/tools'
import { elementsOutput, eopOf, finite, forceModel, instant, parseSource, positive, round, roundVec, station, vec3 } from './inputs.ts'
import type { StationArgs } from './inputs.ts'
import { ELEMENTS_OUTPUT, EOP, FORCES, INSTANT, SOURCE, STATION, VEC3 } from './schema.ts'
import type { ToolSettings } from './settings.ts'
import { initialState } from './trajectory.ts'

const DESCRIPTION = 'Determine an orbit from tracking observations. Initial methods: gibbs or herrick-gibbs (exactly three '
  + 'position observations; Herrick–Gibbs for arcs spanning only a few degrees), gauss (exactly three radec observations '
  + 'from ground stations, angles-only). Precise methods: batch (weighted least squares with outlier editing, gives a '
  + 'covariance) and ukf (unscented Kalman filter, state at the last observation). Observation types and units: position '
  + '[x,y,z] km GCRF; range km; range_rate km/s; radec [right ascension, declination] deg topocentric J2000; azel '
  + '[azimuth, elevation] deg. sigma uses the same units and is required for batch and ukf. Every type except position needs '
  + 'a station. batch and ukf use initial when given, otherwise an automatic Gibbs/Herrick–Gibbs or Gauss solution.'

/** Observation fields accepted from the model. */
interface ObservationArgs {
  readonly time: string
  readonly type: 'position' | 'range' | 'range_rate' | 'radec' | 'azel'
  readonly value: readonly number[]
  readonly sigma?: number
  readonly station?: StationArgs
}

function convert(o: ObservationArgs, index: number, needSigma: boolean): Observation {
  const field = `observations[${String(index)}]`
  const t = instant(o.time, `${field}.time`)
  const sigmaRaw = needSigma ? positive(o.sigma, `${field}.sigma`) : o.sigma ?? 1
  const need = (n: number): number[] => {
    if (o.value.length !== n || !o.value.every(Number.isFinite)) throw new Error(`${field}.value must hold ${String(n)} finite number(s) for type ${o.type}`)
    return [...o.value]
  }
  if (o.type === 'position') return { kind: 'position', t, value: vec3(need(3), `${field}.value`), sigma: sigmaRaw }
  if (o.station === undefined) throw new Error(`${field}.station is required for type ${o.type}`)
  const site = station(o.station, `${field}.station`)
  if (o.type === 'range') return { kind: 'range', t, site, value: need(1)[0] as number, sigma: sigmaRaw }
  if (o.type === 'range_rate') return { kind: 'range-rate', t, site, value: need(1)[0] as number, sigma: sigmaRaw }
  const [a, b] = need(2).map(x => x * DEG) as [number, number]
  return o.type === 'radec'
    ? { kind: 'radec', t, site, value: [a, b], sigma: sigmaRaw * DEG }
    : { kind: 'azel', t, site, value: [a, b], sigma: sigmaRaw * DEG }
}

function angular(kind: Observation['kind']): boolean {
  return kind === 'radec' || kind === 'azel'
}

function outputType(kind: Observation['kind']): string {
  return kind === 'range-rate' ? 'range_rate' : kind
}

function threeOf<T>(items: readonly T[], label: string): [T, T, T] {
  if (items.length < 3) throw new Error(`${label} needs three observations`)
  return [items[0] as T, items[Math.floor(items.length / 2)] as T, items[items.length - 1] as T]
}

interface Solution {
  readonly state: TimedState
  readonly notes: string[]
}

function positionIod(obs: readonly Observation[], method: 'gibbs' | 'herrick-gibbs' | 'auto'): Solution {
  const positions = obs.filter((o): o is Extract<Observation, { kind: 'position' }> => o.kind === 'position')
  const [o1, o2, o3] = threeOf(positions, 'position IOD')
  const r = (o: typeof o1): Vec3 => [o.value[0], o.value[1], o.value[2]]
  const g = gibbs(r(o1), r(o2), r(o3))
  const small = Math.max(...g.separations) < 3 * DEG
  const useHg = method === 'herrick-gibbs' || (method === 'auto' && small)
  const result = useHg ? herrickGibbs(r(o1), r(o2), r(o3), [o1.t / 1000, o2.t / 1000, o3.t / 1000]) : g
  const notes = [
    `${useHg ? 'Herrick–Gibbs' : 'Gibbs'}: coplanarity ${round(result.coplanarity / DEG, 6)} deg, separations ${round(result.separations[0] / DEG, 4)} and ${round(result.separations[1] / DEG, 4)} deg.`,
  ]
  if (!useHg && small) notes.push('Separations are below 3 deg; herrick-gibbs is usually more accurate for such short arcs.')
  return { state: { t: o2.t, r: r(o2), v: result.v2 }, notes }
}

function gaussIod(obs: readonly Observation[]): { best: Solution; alternatives: Solution[] } {
  const angles = obs.filter((o): o is Extract<Observation, { kind: 'radec' }> => o.kind === 'radec')
  const [a, b, c] = threeOf(angles, 'Gauss angles-only IOD')
  const t0 = b.t
  const toAngles = (o: typeof a): AnglesObservation => ({
    t: (o.t - t0) / 1000,
    los: [Math.cos(o.value[1]) * Math.cos(o.value[0]), Math.cos(o.value[1]) * Math.sin(o.value[0]), Math.sin(o.value[1])],
    site: siteGcrf(o.site, o.t).r,
  })
  const solutions = gaussAnglesOnly([toAngles(a), toAngles(b), toAngles(c)])
  const mapped = solutions.map(s => ({
    state: { t: t0, r: s.state.r, v: s.state.v },
    notes: [`Gauss root ${round(s.polynomialRoot, 3)} km, slant ranges ${s.ranges.map(x => round(x, 3)).join(', ')} km, refinement converged: ${String(s.converged)} after ${String(s.iterations)} iteration(s).`],
  }))
  return { best: mapped[0] as Solution, alternatives: mapped.slice(1) }
}

/**
 * Output view of a secondary Gauss root.
 * @param a - alternative solution.
 * @returns position, velocity, and the root note.
 */
export function alternativeView(
  a: { readonly state: TimedState; readonly notes: readonly string[] },
): { position_km: number[]; velocity_km_s: number[]; note: string } {
  return { position_km: roundVec(a.state.r, 6), velocity_km_s: roundVec(a.state.v, 9), note: a.notes[0] as string }
}

/**
 * Build the `orbit_determine` tool.
 * @param settings - deployment bounds and integrator settings.
 * @returns the tool definition.
 */
export function determineTool(settings: ToolSettings): ToolDefinition {
  return defineTool({
    name: 'orbit_determine',
    description: DESCRIPTION,
    parameters: {
      method: { type: 'string', enum: ['gibbs', 'herrick-gibbs', 'gauss', 'batch', 'ukf'], required: true },
      observations: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            time: { ...INSTANT, required: true },
            type: { type: 'string', enum: ['position', 'range', 'range_rate', 'radec', 'azel'], required: true },
            value: { type: 'array', items: { type: 'number' }, required: true },
            sigma: { type: 'number' },
            station: STATION,
          },
        },
      },
      initial: { ...SOURCE, description: 'A priori orbit for batch/ukf (any source kind).' },
      dynamics: { type: 'string', enum: ['numerical', 'two-body'], description: 'Dynamics for batch/ukf (default numerical).' },
      forces: FORCES,
      max_iterations: { type: 'integer', description: 'Batch differential-correction iterations (default 20).' },
      edit_sigma: { type: 'number', description: 'Batch outlier threshold in normalized residuals (default 3; 0 disables editing).' },
      process_noise_km_s2: { type: 'number', description: 'UKF white-noise acceleration sigma (default 1e-9 km/s²).' },
      initial_sigma_km: { type: 'number', description: 'UKF a priori position sigma (default 1 km).' },
      initial_sigma_km_s: { type: 'number', description: 'UKF a priori velocity sigma (default 0.001 km/s).' },
      eop: EOP,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          method: { type: 'string', required: true },
          epoch: { type: 'string', required: true },
          position_km: { ...VEC3, required: true },
          velocity_km_s: { ...VEC3, required: true },
          elements: { ...ELEMENTS_OUTPUT, required: true },
          sigma_position_km: { oneOf: [VEC3, { type: 'null' }], required: true },
          sigma_velocity_km_s: { oneOf: [VEC3, { type: 'null' }], required: true },
          covariance: { oneOf: [{ type: 'array', items: { type: 'array', items: { type: 'number' } } }, { type: 'null' }], required: true },
          rms: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
          iterations: { oneOf: [{ type: 'integer' }, { type: 'null' }], required: true },
          converged: { oneOf: [{ type: 'boolean' }, { type: 'null' }], required: true },
          residuals: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                time: { type: 'string', required: true },
                type: { type: 'string', required: true },
                residual: { type: 'array', items: { type: 'number' }, required: true },
                normalized: { type: 'array', items: { type: 'number' }, required: true },
                rejected: { type: 'boolean', required: true },
              },
            },
          },
          alternatives: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                position_km: { ...VEC3, required: true },
                velocity_km_s: { ...VEC3, required: true },
                note: { type: 'string', required: true },
              },
            },
          },
          notes: { type: 'array', items: { type: 'string' }, required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    presentCall: args => ({ card: 'generic', title: `Determine orbit (${args.method}, ${String(args.observations.length)} observations)`, kind: 'other' }),
    // oxlint-disable-next-line typescript/require-await -- async turns synchronous validation throws into rejected tool calls
    async execute(args) {
      if (args.observations.length > settings.maxObservations) {
        throw new Error(`at most ${String(settings.maxObservations)} observations are allowed; got ${String(args.observations.length)}`)
      }
      const precise = args.method === 'batch' || args.method === 'ukf'
      const obs = args.observations.map((o, i) => convert(o, i, precise)).sort((a, b) => a.t - b.t)
      const eop = eopOf(args.eop)
      const base = {
        sigma_position_km: null, sigma_velocity_km_s: null, covariance: null, rms: null, iterations: null, converged: null,
        residuals: [], alternatives: [],
      }
      type Described = { epoch: string; position_km: number[]; velocity_km_s: number[]; elements: ReturnType<typeof elementsOutput> }
      const describe = (s: TimedState): Described => ({
        epoch: formatUtc(s.t), position_km: roundVec(s.r, 6), velocity_km_s: roundVec(s.v, 9), elements: elementsOutput(s),
      })
      if (args.method === 'gibbs' || args.method === 'herrick-gibbs') {
        if (obs.length !== 3) throw new Error(`${args.method} needs exactly three position observations`)
        const solution = positionIod(obs, args.method)
        return { method: args.method, ...describe(solution.state), ...base, notes: solution.notes }
      }
      if (args.method === 'gauss') {
        if (obs.length !== 3) throw new Error('gauss needs exactly three radec observations')
        const { best, alternatives } = gaussIod(obs)
        return {
          method: args.method,
          ...describe(best.state),
          ...base,
          alternatives: alternatives.map(alternativeView),
          notes: best.notes,
        }
      }
      const notes: string[] = []
      let initial: TimedState
      if (args.initial !== undefined) initial = initialState(parseSource(args.initial, eop))
      else if (obs.filter(o => o.kind === 'position').length >= 3) {
        const iod = positionIod(obs, 'auto')
        initial = iod.state
        notes.push(`A priori from automatic ${iod.notes[0] as string}`)
      } else if (obs.filter(o => o.kind === 'radec').length >= 3) {
        const iod = gaussIod(obs).best
        initial = iod.state
        notes.push(`A priori from automatic ${iod.notes[0] as string}`)
      } else {
        throw new Error('batch and ukf need initial, or at least three position or three radec observations for automatic initial orbit determination')
      }
      const forces = forceModel(args.forces)
      const propagate: Propagator = (args.dynamics ?? 'numerical') === 'two-body'
        ? (s, times) => propagateTwoBody(s, times)
        : (s, times) => propagateNumerical(s, times, forces, settings.integrator)
      const residualRows = (rows: { t: number; kind: Observation['kind']; residual: number[]; normalized: number[]; rejected: boolean }[]) => rows.map(r => ({
        time: formatUtc(r.t),
        type: outputType(r.kind),
        residual: r.residual.map(x => round(angular(r.kind) ? x / DEG : x, 9)),
        normalized: r.normalized.map(x => round(x, 4)),
        rejected: r.rejected,
      }))
      const sigmas = (cov: number[][]): { sigma_position_km: number[]; sigma_velocity_km_s: number[]; covariance: number[][] } => ({
        sigma_position_km: [0, 1, 2].map(i => round(Math.sqrt((cov[i] as number[])[i] as number), 9)),
        sigma_velocity_km_s: [3, 4, 5].map(i => round(Math.sqrt((cov[i] as number[])[i] as number), 12)),
        covariance: cov.map(row => row.map(x => Number(x.toPrecision(10)))),
      })
      if (args.method === 'batch') {
        const maxIterations = args.max_iterations ?? 20
        if (!Number.isInteger(maxIterations) || maxIterations < 1) throw new Error('max_iterations must be a positive integer')
        const edit = finite(args.edit_sigma ?? 3, 'edit_sigma')
        const out = batchLeastSquares(initial, obs, propagate, {
          maxIterations,
          tolerance: 1e-8,
          editSigma: edit === 0 ? Infinity : edit,
          perturbation: { position: 1e-3, velocity: 1e-6 },
        })
        if (!out.converged) notes.push('The batch did not converge within max_iterations; the estimate is the last iterate.')
        return {
          method: args.method,
          ...describe(out.state),
          ...sigmas(out.covariance),
          rms: round(out.rms, 6),
          iterations: out.iterations,
          converged: out.converged,
          residuals: residualRows(out.residuals.map(r => ({ ...r }))),
          alternatives: [],
          notes,
        }
      }
      const ps = positive(args.initial_sigma_km ?? 1, 'initial_sigma_km') ** 2
      const vs = positive(args.initial_sigma_km_s ?? 0.001, 'initial_sigma_km_s') ** 2
      const p0 = [0, 1, 2, 3, 4, 5].map(i => [0, 1, 2, 3, 4, 5].map(j => (i === j ? (i < 3 ? ps : vs) : 0)))
      const out = unscentedKalmanFilter(initial, p0, obs, propagate, {
        processNoise: finite(args.process_noise_km_s2 ?? 1e-9, 'process_noise_km_s2'),
        alpha: 1e-3,
        beta: 2,
        kappa: 0,
      })
      return {
        method: args.method,
        ...describe(out.state),
        ...sigmas(out.covariance),
        residuals: residualRows(out.steps.map((s, i) => ({
          t: s.t, kind: (obs[i] as Observation).kind, residual: s.innovation, normalized: s.normalized, rejected: false,
        }))),
        rms: null,
        iterations: null,
        converged: null,
        alternatives: [],
        notes: [...notes, 'UKF residuals are pre-fit innovations; the state is at the last observation time.'],
      }
    },
  })
}
