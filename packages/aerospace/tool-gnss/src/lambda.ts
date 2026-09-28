/**
 * Integer ambiguity resolution by the LAMBDA method with the MLAMBDA search (Teunissen 1995;
 * Chang, Yang & Zhou 2005): LᵀDL factorization, integer Gauss decorrelation with
 * permutations, and depth-first search for the best candidates.
 * @module @astro-one/tool-gnss/lambda
 */

import { at, identity, zeros } from '@astro-one/astrodynamics'
import type { Matrix } from '@astro-one/astrodynamics'

const round = (x: number): number => Math.floor(x + 0.5)
const sgn = (x: number): number => (x <= 0 ? -1 : 1)

/** LAMBDA candidates. */
export interface LambdaResult {
  /** Integer candidates, best first; each has the float vector's length. */
  readonly candidates: number[][]
  /** Squared weighted distances of the candidates, ascending. */
  readonly distances: number[]
}

function ld(q: Matrix): { l: Matrix; d: number[] } {
  const n = q.length
  const a = q.map(row => [...row])
  const l = zeros(n, n)
  const d = new Array<number>(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    d[i] = at(a, i, i)
    if (!((d[i] as number) > 0)) throw new Error('ambiguity covariance is not positive definite')
    const s = Math.sqrt(d[i] as number)
    for (let j = 0; j <= i; j++) (l[i] as number[])[j] = at(a, i, j) / s
    for (let j = 0; j <= i - 1; j++) for (let k = 0; k <= j; k++) (a[j] as number[])[k] = at(a, j, k) - at(l, i, k) * at(l, i, j)
    const lii = at(l, i, i)
    for (let j = 0; j <= i; j++) (l[i] as number[])[j] = at(l, i, j) / lii
  }
  return { l, d }
}

function gauss(l: Matrix, z: Matrix, i: number, j: number): void {
  const mu = round(at(l, i, j))
  if (mu === 0) return
  const n = l.length
  for (let k = i; k < n; k++) (l[k] as number[])[j] = at(l, k, j) - mu * at(l, k, i)
  for (let k = 0; k < n; k++) (z[k] as number[])[j] = at(z, k, j) - mu * at(z, k, i)
}

function perm(l: Matrix, d: number[], j: number, del: number, z: Matrix): void {
  const n = l.length
  const eta = (d[j] as number) / del
  const lam = ((d[j + 1] as number) * at(l, j + 1, j)) / del
  d[j] = eta * (d[j + 1] as number)
  d[j + 1] = del
  for (let k = 0; k <= j - 1; k++) {
    const a0 = at(l, j, k)
    const a1 = at(l, j + 1, k)
    ;(l[j] as number[])[k] = -at(l, j + 1, j) * a0 + a1
    ;(l[j + 1] as number[])[k] = eta * a0 + lam * a1
  }
  ;(l[j + 1] as number[])[j] = lam
  for (let k = j + 2; k < n; k++) {
    const t = at(l, k, j)
    ;(l[k] as number[])[j] = at(l, k, j + 1)
    ;(l[k] as number[])[j + 1] = t
  }
  for (let k = 0; k < n; k++) {
    const t = at(z, k, j)
    ;(z[k] as number[])[j] = at(z, k, j + 1)
    ;(z[k] as number[])[j + 1] = t
  }
}

function reduction(l: Matrix, d: number[], z: Matrix): void {
  const n = l.length
  let j = n - 2
  let k = n - 2
  while (j >= 0) {
    if (j <= k) for (let i = j + 1; i < n; i++) gauss(l, z, i, j)
    const del = (d[j] as number) + at(l, j + 1, j) ** 2 * (d[j + 1] as number)
    if (del + 1e-6 < (d[j + 1] as number)) {
      perm(l, d, j, del, z)
      k = j
      j = n - 2
    } else {
      j--
    }
  }
}

function search(l: Matrix, d: readonly number[], zs: readonly number[], m: number): LambdaResult {
  const n = zs.length
  const s = zeros(n, n)
  const dist = new Array<number>(n).fill(0)
  const zb = new Array<number>(n).fill(0)
  const z = new Array<number>(n).fill(0)
  const step = new Array<number>(n).fill(0)
  const found: { z: number[]; dist: number }[] = []
  let maxdist = Infinity
  let k = n - 1
  zb[k] = zs[k] as number
  z[k] = round(zb[k] as number)
  let y = (zb[k] as number) - (z[k] as number)
  step[k] = sgn(y)
  for (let c = 0; c < 100000; c++) {
    const newdist = (dist[k] as number) + (y * y) / (d[k] as number)
    if (newdist < maxdist) {
      if (k !== 0) {
        k--
        dist[k] = newdist
        const dz = (z[k + 1] as number) - (zb[k + 1] as number)
        for (let i = 0; i <= k; i++) (s[k] as number[])[i] = at(s, k + 1, i) + dz * at(l, k + 1, i)
        zb[k] = (zs[k] as number) + at(s, k, k)
        z[k] = round(zb[k] as number)
        y = (zb[k] as number) - (z[k] as number)
        step[k] = sgn(y)
      } else {
        if (found.length < m) found.push({ z: [...z], dist: newdist })
        else {
          let worst = 0
          const distOf = (i: number): number => (found[i] as { dist: number }).dist
          for (let i = 1; i < found.length; i++) if (distOf(i) > distOf(worst)) worst = i
          found[worst] = { z: [...z], dist: newdist }
        }
        if (found.length === m) maxdist = Math.max(...found.map(f => f.dist))
        z[0] = (z[0] as number) + (step[0] as number)
        y = (zb[0] as number) - (z[0])
        step[0] = -(step[0] as number) - sgn(step[0] as number)
      }
    } else {
      if (k === n - 1) break
      k++
      z[k] = (z[k] as number) + (step[k] as number)
      y = (zb[k] as number) - (z[k] as number)
      step[k] = -(step[k] as number) - sgn(step[k] as number)
    }
  }
  found.sort((a, b) => a.dist - b.dist)
  return { candidates: found.map(f => f.z), distances: found.map(f => f.dist) }
}

/**
 * Solve Zᵀ·x = b for a unimodular Z by Gaussian elimination with partial pivoting.
 * @param zt - Zᵀ.
 * @param b - right-hand side.
 * @returns x.
 */
function solve(zt: Matrix, b: readonly number[]): number[] {
  const n = b.length
  const a = zt.map((row, i) => [...row, b[i] as number])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(at(a, r, c)) > Math.abs(at(a, p, c))) p = r
    const tmp = a[c] as number[]
    a[c] = a[p] as number[]
    a[p] = tmp
    for (let r = c + 1; r < n; r++) {
      const f = at(a, r, c) / at(a, c, c)
      for (let k = c; k <= n; k++) (a[r] as number[])[k] = at(a, r, k) - f * at(a, c, k)
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let sum = at(a, r, n)
    for (let k = r + 1; k < n; k++) sum -= at(a, r, k) * (x[k] as number)
    x[r] = Math.round(sum / at(a, r, r))
  }
  return x
}

/**
 * Integer least-squares ambiguity resolution.
 * @param a - float ambiguities.
 * @param q - their covariance.
 * @param m - number of candidates to return (2 for the ratio test).
 * @returns the best candidates with their distances.
 */
export function lambda(a: readonly number[], q: Matrix, m = 2): LambdaResult {
  const n = a.length
  const { l, d } = ld(q)
  const z = identity(n)
  reduction(l, d, z)
  const zs = a.map((_, j) => a.reduce((sum, ai, i) => sum + at(z, i, j) * ai, 0))
  const found = search(l, d, zs, m)
  const zt = z.map((_, i) => z.map(row => row[i] as number))
  return { candidates: found.candidates.map(c => solve(zt, c)), distances: found.distances }
}
