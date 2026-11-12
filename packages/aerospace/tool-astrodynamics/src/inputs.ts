/**
 * Validation and conversion of model-supplied arguments into astrodynamics library values.
 * Every failure throws an Error whose message names the offending field.
 * @module @astro-one/tool-astrodynamics/inputs
 */

import {
  DEG, elementsToState, itrfToGcrf, MU_EARTH, ommFromRecord, parseOmm, parseTle, parseUtc, R_EARTH, stateToElements, temeToGcrf,
  trueFromMean,
} from '@astro-one/astrodynamics'
import type {
  EarthOrientationParameters, ForceModel, Geodetic, Sgp4Elements, StateVector, TimedState, UtcMs, Vec3,
} from '@astro-one/astrodynamics'
import type { JsonValue } from '@astro-one/util-values'

/** Model-facing orbit source after schema validation. */
export interface SourceArgs {
  readonly kind: 'tle' | 'omm' | 'state' | 'elements'
  readonly line1?: string
  readonly line2?: string
  readonly omm?: JsonValue
  readonly epoch?: string
  readonly frame?: 'gcrf' | 'itrf' | 'teme'
  readonly position_km?: readonly number[]
  readonly velocity_km_s?: readonly number[]
  readonly a_km?: number
  readonly e?: number
  readonly i_deg?: number
  readonly raan_deg?: number
  readonly argp_deg?: number
  readonly true_anomaly_deg?: number
  readonly mean_anomaly_deg?: number
}

/** A parsed orbit: SGP4 element set or GCRF state. */
export type ParsedSource =
  | { readonly kind: 'sgp4'; readonly elements: Sgp4Elements }
  | { readonly kind: 'state'; readonly state: TimedState }

/**
 * Require a finite number.
 * @param value - candidate.
 * @param field - field name for the error message.
 * @returns the number.
 */
export function finite(value: number | undefined, field: string): number {
  if (value === undefined || !Number.isFinite(value)) throw new Error(`${field} must be a finite number`)
  return value
}

/**
 * Require a positive finite number.
 * @param value - candidate.
 * @param field - field name.
 * @returns the number.
 */
export function positive(value: number | undefined, field: string): number {
  const v = finite(value, field)
  if (!(v > 0)) throw new Error(`${field} must be positive`)
  return v
}

/**
 * Require a three-component finite vector.
 * @param value - candidate.
 * @param field - field name.
 * @returns the vector.
 */
export function vec3(value: readonly number[] | undefined, field: string): Vec3 {
  if (value === undefined || value.length !== 3 || !value.every(Number.isFinite)) {
    throw new Error(`${field} must be an array of three finite numbers`)
  }
  return [value[0] as number, value[1] as number, value[2] as number]
}

/**
 * Parse a required ISO instant.
 * @param value - candidate text.
 * @param field - field name.
 * @returns UTC milliseconds.
 */
export function instant(value: string | undefined, field: string): UtcMs {
  if (value === undefined) throw new Error(`${field} is required`)
  try {
    return parseUtc(value)
  } catch (error) {
    throw new Error(`${field}: ${(error as Error).message}`)
  }
}

/**
 * Convert an orbit source.
 * @param source - schema-validated source.
 * @param eop - Earth orientation parameters for Earth-fixed input states.
 * @returns element set or GCRF state.
 */
export function parseSource(source: SourceArgs, eop: EarthOrientationParameters): ParsedSource {
  switch (source.kind) {
    case 'tle': {
      if (source.line1 === undefined || source.line2 === undefined) throw new Error('source.line1 and source.line2 are required for kind=tle')
      return { kind: 'sgp4', elements: parseTle(source.line1, source.line2) }
    }
    case 'omm': {
      const omm = source.omm
      if (omm === undefined || omm === null || typeof omm !== 'object' || Array.isArray(omm)) {
        throw new Error('source.omm must be an object of CCSDS OMM keywords for kind=omm')
      }
      return { kind: 'sgp4', elements: parseOmm(ommFromRecord(omm)) }
    }
    case 'state': {
      const t = instant(source.epoch, 'source.epoch')
      const raw: StateVector = { r: vec3(source.position_km, 'source.position_km'), v: vec3(source.velocity_km_s, 'source.velocity_km_s') }
      const frame = source.frame ?? 'gcrf'
      const gcrf = frame === 'gcrf' ? raw : frame === 'itrf' ? itrfToGcrf(raw, t, eop) : temeToGcrf(raw, t)
      return { kind: 'state', state: { t, ...gcrf } }
    }
    case 'elements': {
      const t = instant(source.epoch, 'source.epoch')
      const a = finite(source.a_km, 'source.a_km')
      const e = finite(source.e, 'source.e')
      if (e < 0 || e === 1) throw new Error('source.e must be non-negative and not exactly 1')
      if ((e < 1 && !(a > 0)) || (e > 1 && !(a < 0))) throw new Error('source.a_km must be positive for ellipses and negative for hyperbolas')
      const hasTrue = source.true_anomaly_deg !== undefined
      if (hasTrue === (source.mean_anomaly_deg !== undefined)) throw new Error('give exactly one of source.true_anomaly_deg or source.mean_anomaly_deg')
      const nu = hasTrue ? finite(source.true_anomaly_deg, 'source.true_anomaly_deg') * DEG : trueFromMean(finite(source.mean_anomaly_deg, 'source.mean_anomaly_deg') * DEG, e)
      const state = elementsToState({
        p: a * (1 - e * e),
        e,
        i: finite(source.i_deg, 'source.i_deg') * DEG,
        raan: finite(source.raan_deg, 'source.raan_deg') * DEG,
        argp: finite(source.argp_deg, 'source.argp_deg') * DEG,
        nu,
      })
      return { kind: 'state', state: { t, ...state } }
    }
  }
}

/** Model-facing station fields. */
export interface StationArgs {
  readonly lat_deg: number
  readonly lon_deg: number
  readonly alt_km: number
}

/**
 * Convert a station.
 * @param s - schema-validated station.
 * @param field - field name.
 * @returns geodetic coordinates.
 */
export function station(s: StationArgs, field: string): Geodetic {
  if (!(Math.abs(s.lat_deg) <= 90)) throw new Error(`${field}.lat_deg must lie in [-90, 90]`)
  return { lat: s.lat_deg * DEG, lon: finite(s.lon_deg, `${field}.lon_deg`) * DEG, h: finite(s.alt_km, `${field}.alt_km`) }
}

/** Model-facing force fields. */
export interface ForcesArgs {
  readonly zonal_degree?: number
  readonly drag?: { readonly cd: number; readonly area_m2: number; readonly mass_kg: number }
  readonly srp?: { readonly cr: number; readonly area_m2: number; readonly mass_kg: number }
  readonly sun?: boolean
  readonly moon?: boolean
}

/**
 * Resolve a force model; omitted fields take their documented defaults.
 * @param f - schema-validated forces, or undefined for the default.
 * @returns the force model.
 */
export function forceModel(f: ForcesArgs | undefined): ForceModel {
  const degree = f?.zonal_degree ?? 2
  if (!Number.isInteger(degree) || degree < 0 || degree > 6) throw new Error('forces.zonal_degree must be an integer from 0 to 6')
  const drag = f?.drag
  const srp = f?.srp
  return {
    zonalDegree: degree as ForceModel['zonalDegree'],
    ...drag ? { drag: { cd: positive(drag.cd, 'forces.drag.cd'), areaM2: positive(drag.area_m2, 'forces.drag.area_m2'), massKg: positive(drag.mass_kg, 'forces.drag.mass_kg') } } : {},
    ...srp ? { srp: { cr: positive(srp.cr, 'forces.srp.cr'), areaM2: positive(srp.area_m2, 'forces.srp.area_m2'), massKg: positive(srp.mass_kg, 'forces.srp.mass_kg') } } : {},
    sun: f?.sun ?? false,
    moon: f?.moon ?? false,
  }
}

/** Model-facing EOP fields. */
export interface EopArgs {
  readonly dut1_s?: number
  readonly xp_arcsec?: number
  readonly yp_arcsec?: number
}

/**
 * Convert Earth orientation parameters.
 * @param e - schema-validated EOP, or undefined.
 * @returns library parameters.
 */
export function eopOf(e: EopArgs | undefined): EarthOrientationParameters {
  return {
    ...e?.dut1_s !== undefined ? { dut1: e.dut1_s } : {},
    ...e?.xp_arcsec !== undefined ? { xp: e.xp_arcsec } : {},
    ...e?.yp_arcsec !== undefined ? { yp: e.yp_arcsec } : {},
  }
}

/**
 * Expand an output time grid.
 * @param args - explicit times, or start/end/step.
 * @param args.times - explicit ISO instants.
 * @param args.start - grid start.
 * @param args.end - grid end.
 * @param args.step_s - grid step, s.
 * @param max - largest accepted sample count.
 * @returns UTC instants.
 */
export function timeGrid(args: { times?: readonly string[]; start?: string; end?: string; step_s?: number }, max: number): UtcMs[] {
  if (args.times !== undefined) {
    if (args.start !== undefined || args.end !== undefined || args.step_s !== undefined) throw new Error('give either times or start/end/step_s, not both')
    if (args.times.length === 0) throw new Error('times must not be empty')
    if (args.times.length > max) throw new Error(`at most ${String(max)} output times are allowed; got ${String(args.times.length)}`)
    return args.times.map((t, i) => instant(t, `times[${String(i)}]`))
  }
  const start = instant(args.start, 'start')
  const end = instant(args.end, 'end')
  const step = positive(args.step_s, 'step_s') * 1000
  if (end < start) throw new Error('end must not precede start')
  const count = Math.floor((end - start) / step + 1e-9) + 1
  if (count > max) throw new Error(`the grid has ${String(count)} samples; at most ${String(max)} are allowed (increase step_s or shorten the window)`)
  return Array.from({ length: count }, (_, i) => start + i * step)
}

/** Osculating-element output fields. */
export interface ElementsOutput {
  a_km: number | null
  e: number
  i_deg: number
  raan_deg: number
  argp_deg: number
  true_anomaly_deg: number
  mean_anomaly_deg: number
  period_s: number | null
  perigee_alt_km: number
  apogee_alt_km: number | null
}

/**
 * Osculating elements for output.
 * @param state - GCRF state.
 * @returns rounded element fields.
 */
export function elementsOutput(state: StateVector): ElementsOutput {
  const el = stateToElements(state, MU_EARTH)
  const rp = el.p / (1 + el.e)
  return {
    a_km: Number.isFinite(el.a) ? round(el.a, 6) : null,
    e: round(el.e, 10),
    i_deg: round(el.i / DEG, 8),
    raan_deg: round(el.raan / DEG, 8),
    argp_deg: round(el.argp / DEG, 8),
    true_anomaly_deg: round(el.nu / DEG, 8),
    mean_anomaly_deg: round(el.m / DEG, 8),
    period_s: el.period === undefined ? null : round(el.period, 6),
    perigee_alt_km: round(rp - R_EARTH, 6),
    apogee_alt_km: el.e < 1 ? round(el.a * (1 + el.e) - R_EARTH, 6) : null,
  }
}

/**
 * Round to a number of decimal places for stable, compact output.
 * @param x - value.
 * @param digits - decimal places.
 * @returns rounded value.
 */
export function round(x: number, digits: number): number {
  const k = 10 ** digits
  // Adding 0 turns −0 into 0, which lossless JSON output requires.
  return Math.round(x * k) / k + 0
}

/**
 * Round each component of a vector.
 * @param v - vector.
 * @param digits - decimal places.
 * @returns rounded components.
 */
export function roundVec(v: readonly number[], digits: number): number[] {
  return v.map(x => round(x, digits))
}
