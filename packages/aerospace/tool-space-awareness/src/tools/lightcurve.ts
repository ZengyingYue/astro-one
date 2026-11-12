/**
 * `ssa_lightcurve`: estimate the photometric period of a tumbling or spinning object.
 * @module @astro-one/tool-space-awareness/tools/lightcurve
 */

import { parseUtc } from '@astro-one/astrodynamics'
import type { Context } from '@astro-one/cordis'
import { defineTool } from '@astro-one/tools'
import type { ToolDefinition, ToolRunContext } from '@astro-one/tools'
import { falseAlarmProbability, lombScargle, phaseDispersion, refinePeak, strongestPeaks } from '../lightcurve.ts'
import type { Photometry } from '../lightcurve.ts'
import { positiveOf, roundTo, withinBudget } from '../inputs.ts'
import type { Bounds } from '../settings.ts'

const DESCRIPTION = 'Estimate the photometric period of an object from its light curve with the generalized Lomb–Scargle '
  + 'periodogram (weighted by sigma when given). Give points inline (t_s seconds on any origin, magnitude, optional sigma) '
  + 'or path, a workspace CSV whose rows are time,magnitude[,sigma] with time in seconds or as ISO 8601 instants (a header '
  + 'row is skipped). The search runs from min_period_s (default twice the median sampling interval) to max_period_s '
  + '(default half the time span) at oversampling (default 10) frequencies per periodogram resolution, and each peak is '
  + 'refined between its grid neighbours. Each peak reports period, power, false-alarm probability, sinusoid '
  + 'semi-amplitude, and the phase-dispersion statistic theta at the period and at its double (with twice the phase bins): '
  + 'elongated tumbling bodies show two maxima per rotation, so a lower theta at the double period indicates that the '
  + 'rotation period is twice the photometric one.'

/** Inline point fields. */
interface PointArgs {
  readonly t_s: number
  readonly magnitude: number
  readonly sigma?: number
}

function pointsFromCsv(text: string): PointArgs[] {
  const rows = text.split('\n').map(line => line.trim()).filter(line => line !== '' && !line.startsWith('#'))
  let origin: number | undefined
  const points: PointArgs[] = []
  rows.forEach((line, k) => {
    const cells = line.split(',').map(cell => cell.trim())
    const magnitude = Number(cells[1])
    const numericTime = Number(cells[0])
    if (k === 0 && Number.isNaN(magnitude)) return
    let t = numericTime
    if (Number.isNaN(numericTime)) {
      const ms = parseUtc(cells[0] as string)
      origin ??= ms
      t = (ms - origin) / 1000
    }
    if (!Number.isFinite(t) || !Number.isFinite(magnitude)) throw new Error(`row ${String(k + 1)} must hold a time and a magnitude`)
    points.push({ t_s: t, magnitude, ...cells[2] !== undefined && cells[2] !== '' ? { sigma: Number(cells[2]) } : {} })
  })
  return points
}

async function readPoints(ctx: Context, exec: ToolRunContext, path: string, maxBytes: number): Promise<PointArgs[]> {
  const cwd = exec.agent?.session.header.cwd
  const target = await ctx.fs.resolve(path, { ...cwd !== undefined ? { cwd } : {}, signal: exec.signal })
  if ((await ctx.fs.stat(target, exec.signal))?.type !== 'file') throw new Error(`cannot read "${target.displayPath}": not a regular file`)
  try {
    return pointsFromCsv(new TextDecoder().decode(await ctx.fs.readBytes(target, exec.signal, maxBytes)))
  } catch (error) {
    throw new Error(`${target.displayPath}: ${(error as Error).message}`)
  }
}

function photometry(points: readonly PointArgs[]): Photometry[] {
  const withSigma = points.filter(p => p.sigma !== undefined).length
  if (withSigma !== 0 && withSigma !== points.length) throw new Error('give sigma for every point or for none')
  return points
    .map((p, k) => ({ t: p.t_s, mag: p.magnitude, sigma: p.sigma === undefined ? 1 : positiveOf(p.sigma, `points[${String(k)}].sigma`) }))
    .sort((a, b) => a.t - b.t)
}

/**
 * Build the `ssa_lightcurve` tool.
 * @param ctx - context carrying the filesystem.
 * @param bounds - deployment bounds.
 * @returns the tool definition.
 */
export function lightcurveTool(ctx: Context, bounds: Bounds): ToolDefinition {
  return defineTool({
    name: 'ssa_lightcurve',
    description: DESCRIPTION,
    parameters: {
      points: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: { t_s: { type: 'number', required: true }, magnitude: { type: 'number', required: true }, sigma: { type: 'number' } },
        },
      },
      path: { type: 'string' },
      min_period_s: { type: 'number' },
      max_period_s: { type: 'number' },
      oversampling: { type: 'number' },
      peaks: { type: 'integer', description: 'Peaks to report (default 5).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          points: { type: 'integer', required: true },
          span_s: { type: 'number', required: true },
          frequencies_searched: { type: 'integer', required: true },
          peaks: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                period_s: { type: 'number', required: true },
                frequency_hz: { type: 'number', required: true },
                power: { type: 'number', required: true },
                false_alarm_probability: { type: 'number', required: true },
                amplitude_mag: { type: 'number', required: true },
                pdm_theta: { type: 'number', required: true },
                pdm_theta_double_period: { type: 'number', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    presentCall: args => ({
      card: 'generic',
      title: 'Light-curve period',
      kind: 'read',
      ...args.path !== undefined ? { locations: [{ path: args.path }] } : {},
    }),
    async execute(args, exec) {
      if ((args.points === undefined) === (args.path === undefined)) throw new Error('give exactly one of points or path')
      const raw = args.path !== undefined
        ? await readPoints(ctx, exec, args.path, bounds.maxFileBytes)
        : args.points as readonly PointArgs[]
      const points = photometry(raw)
      if (points.length < 10) throw new Error(`a period search needs at least 10 points; got ${String(points.length)}`)
      if (points.length > bounds.maxObservations) throw new Error(`at most ${String(bounds.maxObservations)} points are allowed`)
      const span = (points[points.length - 1] as Photometry).t - (points[0] as Photometry).t
      const gaps = points.slice(1).map((p, k) => p.t - (points[k] as Photometry).t).sort((a, b) => a - b)
      const minPeriod = positiveOf(args.min_period_s ?? 2 * Math.max(gaps[gaps.length >> 1] as number, Number.MIN_VALUE), 'min_period_s')
      const maxPeriod = positiveOf(args.max_period_s ?? span / 2, 'max_period_s')
      if (!(maxPeriod > minPeriod)) throw new Error('max_period_s must exceed min_period_s')
      const oversampling = positiveOf(args.oversampling ?? 10, 'oversampling')
      const count = args.peaks ?? 5
      if (!(Number.isInteger(count) && count >= 1 && count <= bounds.maxResults)) {
        throw new Error(`peaks must be an integer from 1 to ${String(bounds.maxResults)}`)
      }
      const fMin = 1 / maxPeriod
      const fMax = 1 / minPeriod
      const df = 1 / (oversampling * span)
      const steps = Math.floor((fMax - fMin) / df) + 1
      // Each refined peak evaluates 81 more frequencies.
      withinBudget((steps + count * 81) * points.length, bounds.maxEvaluations, 'narrow the period range, lower oversampling, or use fewer points')
      const periodogram = Array.from({ length: steps }, (_, k) => lombScargle(points, fMin + k * df))
      const independent = span * (fMax - fMin)
      // The double period uses twice the bins, so both statistics bin the same span of seconds.
      const bins = Math.max(5, Math.min(20, Math.floor(points.length / 10)))
      return {
        points: points.length,
        span_s: roundTo(span, 3),
        frequencies_searched: steps,
        peaks: strongestPeaks(periodogram, count).map(peak => refinePeak(points, peak, df)).map(p => ({
          period_s: roundTo(1 / p.frequency, 6),
          frequency_hz: Number(p.frequency.toPrecision(8)),
          power: roundTo(p.power, 6),
          false_alarm_probability: Number(falseAlarmProbability(p.power, points.length, independent).toPrecision(4)),
          amplitude_mag: roundTo(p.amplitude, 4),
          pdm_theta: roundTo(phaseDispersion(points, 1 / p.frequency, bins), 4),
          pdm_theta_double_period: roundTo(phaseDispersion(points, 2 / p.frequency, 2 * bins), 4),
        })),
      }
    },
  })
}
