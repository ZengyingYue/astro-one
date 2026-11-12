/**
 * Short-baseline real-time-kinematic positioning on single-frequency carrier phase: an
 * extended Kalman filter over rover position and single-difference ambiguities, double
 * differences against the highest-elevation satellite of each constellation, loss-of-lock
 * cycle-slip handling, and LAMBDA integer fixing accepted by the ratio test.
 * @module @astro-one/tool-gnss/rtk
 */

import { cholInverse, matAdd, matMul, matT, symmetrize, zeros } from '@astro-one/astrodynamics'
import type { Matrix, Vec3 } from '@astro-one/astrodynamics'
import { selectEphemeris, WAVELENGTH } from './broadcast.ts'
import { lambda } from './lambda.ts'
import type { GnssSystem, NavigationData, ObservationData, ObservationEpoch } from './rinex.ts'
import { CODE_PRIORITY, geometry, PHASE_PRIORITY, pick, solveEpoch } from './spp.ts'
import type { SatelliteGeometry, SppOptions } from './spp.ts'

/** RTK controls. */
export interface RtkOptions extends SppOptions {
  /** `static` keeps one position across epochs; `kinematic` re-estimates it every epoch. */
  readonly mode: 'static' | 'kinematic'
  /** Zenith carrier-phase standard deviation, m. */
  readonly phaseSigma: number
  /** Minimum second-best/best distance ratio for accepting integers. */
  readonly ratioThreshold: number
}

/** One epoch result. */
export interface RtkEpoch {
  /** GPS seconds. */
  readonly time: number
  /** `fixed` (integers accepted), `float`, or `single` (code-only fallback). */
  readonly status: 'fixed' | 'float' | 'single'
  /** Rover ECEF position, m. */
  readonly position: Vec3
  /** LAMBDA ratio (capped at 10⁶), or null in `single` epochs. */
  readonly ratio: number | null
  /** Satellites common to rover and base. */
  readonly satellites: number
}

interface Pair {
  readonly sat: string
  readonly system: GnssSystem
  readonly rover: SatelliteGeometry
  readonly base: SatelliteGeometry
  readonly phaseRover: number
  readonly phaseBase: number
  readonly codeRover: number
  readonly codeBase: number
  readonly slip: boolean
}

function pairs(
  rover: ObservationEpoch, base: ObservationEpoch, nav: NavigationData, roverPos: Vec3, basePos: Vec3, options: RtkOptions,
): Pair[] {
  const out: Pair[] = []
  for (const [sat, ro] of rover.satellites) {
    const system = sat[0] as GnssSystem
    const bo = base.satellites.get(sat)
    if (!options.systems.includes(system) || bo === undefined) continue
    const rc = pick(ro, CODE_PRIORITY[system])
    const bc = pick(bo, CODE_PRIORITY[system])
    const rp = pick(ro, PHASE_PRIORITY[system])
    const bp = pick(bo, PHASE_PRIORITY[system])
    const eph = selectEphemeris(nav.ephemerides.filter(e => e.sat === sat), rover.time)
    if (rc === undefined || bc === undefined || rp === undefined || bp === undefined || eph === undefined) continue
    const rg = geometry(eph, rover.time, rc.value, roverPos)
    const bg = geometry(eph, base.time, bc.value, basePos)
    if (bg.elevation < options.elevationMask) continue
    // Every present value carries a parsed indicator (blank reads as 0).
    const slip = ((ro.lli[rp.code] as number) & 1) === 1 || ((bo.lli[bp.code] as number) & 1) === 1
    out.push({ sat, system, rover: rg, base: bg, phaseRover: rp.value, phaseBase: bp.value, codeRover: rc.value, codeBase: bc.value, slip })
  }
  return out
}

function variance(sigma: number, el: number): number {
  const s = Math.max(Math.sin(el), 0.1)
  return 2 * (sigma * sigma + (sigma * sigma) / (s * s))
}

/**
 * Process matched rover and base epochs.
 * @param rover - rover observations.
 * @param base - base observations at the same epochs.
 * @param basePosition - surveyed base ECEF, m.
 * @param nav - navigation data.
 * @param options - RTK controls.
 * @returns one result per rover epoch with a matching base epoch and a code solution.
 */
export function solveRtk(
  rover: ObservationData, base: ObservationData, basePosition: Vec3, nav: NavigationData, options: RtkOptions,
): RtkEpoch[] {
  const baseByTime = new Map(base.epochs.map(e => [Math.round(e.time * 1000), e]))
  const index = new Map<string, number>()
  let x: number[] = []
  let p: Matrix = []
  const results: RtkEpoch[] = []
  let previous: Vec3 | undefined
  for (const epoch of rover.epochs) {
    const baseEpoch = baseByTime.get(Math.round(epoch.time * 1000))
    const spp = solveEpoch(epoch, nav, options, previous ?? rover.approxPosition ?? [0, 0, 0])
    if (baseEpoch === undefined || spp === undefined) continue
    previous = spp.position
    if (x.length === 0 || options.mode === 'kinematic') {
      // Seed or reset the position states from the code solution with a 30 m prior.
      if (x.length === 0) {
        x = [...spp.position]
        p = zeros(3, 3)
      } else x.splice(0, 3, ...spp.position)
      for (let i = 0; i < p.length; i++) {
        for (let j = 0; j < 3; j++) {
          ;(p[i] as number[])[j] = 0
          ;(p[j] as number[])[i] = 0
        }
      }
      for (let i = 0; i < 3; i++) (p[i] as number[])[i] = 900
    }
    const roverPos: Vec3 = [x[0] as number, x[1] as number, x[2] as number]
    const list = pairs(epoch, baseEpoch, nav, roverPos, basePosition, options)
    // Drop ambiguity states of satellites no longer tracked, then add or reset slipped ones.
    const tracked = new Set(list.map(q => q.sat))
    for (const [sat] of [...index]) if (!tracked.has(sat)) removeState(sat)
    for (const q of list) {
      const lam = WAVELENGTH[q.system]
      const init = (lam * (q.phaseRover - q.phaseBase) - (q.codeRover - q.codeBase)) / lam
      let k = index.get(q.sat)
      if (k === undefined) {
        k = x.length
        index.set(q.sat, k)
        x.push(init)
        p = p.map(row => [...row, 0])
        p.push(new Array<number>(k + 1).fill(0))
      }
      if (q.slip || (p[k] as number[])[k] === 0) {
        x[k] = init
        for (let i = 0; i < x.length; i++) {
          ;(p[i] as number[])[k] = 0
          ;(p[k] as number[])[i] = 0
        }
        ;(p[k] as number[])[k] = (30 / lam) ** 2
      }
    }
    const refs = new Map<GnssSystem, Pair>()
    for (const q of list) {
      const r = refs.get(q.system)
      if (r === undefined || q.base.elevation > r.base.elevation) refs.set(q.system, q)
    }
    const others = list.filter(q => refs.get(q.system) !== q)
    if (others.length === 0) {
      results.push({ time: epoch.time, status: 'single', position: spp.position, ratio: null, satellites: list.length })
      continue
    }
    const n = x.length
    const rows: number[][] = []
    const resid: number[] = []
    const nObs = others.length
    const r = zeros(2 * nObs, 2 * nObs)
    others.forEach((q, i) => {
      const ref = refs.get(q.system) as Pair
      const lam = WAVELENGTH[q.system]
      const range = (s: Pair): number => s.rover.range - s.base.range
      const geo = [0, 1, 2].map(c => -((q.rover.los[c] as number) - (ref.rover.los[c] as number)))
      const kj = index.get(q.sat) as number
      const kr = index.get(ref.sat) as number
      const phaseRow = new Array<number>(n).fill(0)
      geo.forEach((g, c) => { phaseRow[c] = g })
      phaseRow[kj] = lam
      phaseRow[kr] = -lam
      const ddPhase = lam * (q.phaseRover - q.phaseBase - ref.phaseRover + ref.phaseBase)
      const ddRange = range(q) - range(ref)
      rows.push(phaseRow)
      resid.push(ddPhase - (ddRange + lam * ((x[kj] as number) - (x[kr] as number))))
      const codeRow = new Array<number>(n).fill(0)
      geo.forEach((g, c) => { codeRow[c] = g })
      rows.push(codeRow)
      resid.push((q.codeRover - q.codeBase - ref.codeRover + ref.codeBase) - ddRange)
      const vp = variance(options.phaseSigma, q.base.elevation)
      const vc = variance(options.codeSigma, q.base.elevation)
      const vpr = variance(options.phaseSigma, ref.base.elevation)
      const vcr = variance(options.codeSigma, ref.base.elevation)
      ;(r[2 * i] as number[])[2 * i] = vp + vpr
      ;(r[2 * i + 1] as number[])[2 * i + 1] = vc + vcr
      others.forEach((o, j) => {
        if (j === i || o.system !== q.system) return
        ;(r[2 * i] as number[])[2 * j] = vpr
        ;(r[2 * i + 1] as number[])[2 * j + 1] = vcr
      })
    })
    const ht = matT(rows)
    const s = matAdd(matMul(matMul(rows, p), ht), r)
    const gain = matMul(matMul(p, ht), cholInverse(s))
    x = x.map((value, i) => value + (gain[i] as number[]).reduce((sum, g, j) => sum + g * (resid[j] as number), 0))
    p = symmetrize(matAdd(p, matMul(matMul(gain, rows), p), -1))
    // Integer resolution on the double-differenced ambiguities.
    const d = others.map((q) => {
      const row = new Array<number>(n).fill(0)
      row[index.get(q.sat) as number] = 1
      row[index.get((refs.get(q.system) as Pair).sat) as number] = -1
      return row
    })
    const aFloat = d.map(row => row.reduce((sum, v, i) => sum + v * (x[i] as number), 0))
    const qaa = symmetrize(matMul(matMul(d, p), matT(d)))
    const float: Vec3 = [x[0] as number, x[1] as number, x[2] as number]
    let status: RtkEpoch['status'] = 'float'
    let position = float
    // With at least one ambiguity the search always returns two candidates.
    const res = lambda(aFloat, qaa, 2)
    const [best, second] = res.distances as [number, number]
    const ratio = second / Math.max(best, 1e-12)
    if (ratio >= options.ratioThreshold) {
      const fixed = res.candidates[0] as number[]
      const qpa = matMul(p.slice(0, 3), matT(d))
      const delta = matMul(qpa, cholInverse(qaa))
      const diff = aFloat.map((a, i) => a - (fixed[i] as number))
      const shift = (c: number): number => (delta[c] as number[]).reduce((sum, v, j) => sum + v * (diff[j] as number), 0)
      position = [float[0] - shift(0), float[1] - shift(1), float[2] - shift(2)]
      status = 'fixed'
    }
    results.push({ time: epoch.time, status, position, ratio: Math.min(ratio, 1e6), satellites: list.length })
  }
  return results

  function removeState(sat: string): void {
    const k = index.get(sat) as number
    x.splice(k, 1)
    p = p.filter((_, i) => i !== k).map(row => row.filter((_, j) => j !== k))
    index.delete(sat)
    for (const [s, i] of index) if (i > k) index.set(s, i - 1)
  }
}
