/**
 * Small vector and dense-matrix routines for the astrodynamics algorithms: frame rotations,
 * Cholesky solves for the estimators, and a cyclic Jacobi eigen-solver for symmetric matrices.
 * @module @astro-one/astrodynamics/linalg
 */

import type { Mat3, Matrix, Vec3 } from './types.ts'

/**
 * Sum of two vectors.
 * @param a - left operand.
 * @param b - right operand.
 * @returns a + b.
 */
export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

/**
 * Difference of two vectors.
 * @param a - minuend.
 * @param b - subtrahend.
 * @returns a − b.
 */
export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

/**
 * Scalar multiple of a vector.
 * @param a - vector.
 * @param k - scale factor.
 * @returns k·a.
 */
export function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k]
}

/**
 * Dot product.
 * @param a - left operand.
 * @param b - right operand.
 * @returns a·b.
 */
export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/**
 * Cross product.
 * @param a - left operand.
 * @param b - right operand.
 * @returns a × b.
 */
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/**
 * Euclidean norm.
 * @param a - vector.
 * @returns |a|.
 */
export function norm(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2])
}

/**
 * Unit vector in the direction of `a`.
 * @param a - non-zero vector.
 * @returns a / |a|.
 * @throws When `a` is the zero vector.
 */
export function unit(a: Vec3): Vec3 {
  const n = norm(a)
  if (n === 0) throw new Error('cannot normalize the zero vector')
  return scale(a, 1 / n)
}

/**
 * Frame rotation about the first axis (Vallado ROT1).
 * @param angle - rotation angle, rad.
 * @returns the rotation matrix.
 */
export function rot1(angle: number): Mat3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [[1, 0, 0], [0, c, s], [0, -s, c]]
}

/**
 * Frame rotation about the second axis (Vallado ROT2).
 * @param angle - rotation angle, rad.
 * @returns the rotation matrix.
 */
export function rot2(angle: number): Mat3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [[c, 0, -s], [0, 1, 0], [s, 0, c]]
}

/**
 * Frame rotation about the third axis (Vallado ROT3).
 * @param angle - rotation angle, rad.
 * @returns the rotation matrix.
 */
export function rot3(angle: number): Mat3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [[c, s, 0], [-s, c, 0], [0, 0, 1]]
}

/**
 * Product of two 3×3 matrices.
 * @param a - left factor.
 * @param b - right factor.
 * @returns a·b.
 */
export function mul3(a: Mat3, b: Mat3): Mat3 {
  const row = (i: 0 | 1 | 2): Vec3 => [
    a[i][0] * b[0][0] + a[i][1] * b[1][0] + a[i][2] * b[2][0],
    a[i][0] * b[0][1] + a[i][1] * b[1][1] + a[i][2] * b[2][1],
    a[i][0] * b[0][2] + a[i][1] * b[1][2] + a[i][2] * b[2][2],
  ]
  return [row(0), row(1), row(2)]
}

/**
 * Apply a 3×3 matrix to a vector.
 * @param m - matrix.
 * @param v - vector.
 * @returns m·v.
 */
export function apply3(m: Mat3, v: Vec3): Vec3 {
  return [dot(m[0], v), dot(m[1], v), dot(m[2], v)]
}

/**
 * Transpose of a 3×3 matrix; the inverse of a rotation.
 * @param m - matrix.
 * @returns mᵀ.
 */
export function transpose3(m: Mat3): Mat3 {
  return [[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]]
}

/**
 * Zero-filled dense matrix.
 * @param rows - row count.
 * @param cols - column count.
 * @returns the matrix.
 */
export function zeros(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => new Array<number>(cols).fill(0))
}

/**
 * Dense identity matrix.
 * @param n - dimension.
 * @returns Iₙ.
 */
export function identity(n: number): Matrix {
  const m = zeros(n, n)
  for (let i = 0; i < n; i++) (m[i] as number[])[i] = 1
  return m
}

/**
 * Element of a dense matrix; the estimators index only inside the declared shape.
 * @param m - matrix.
 * @param i - row.
 * @param j - column.
 * @returns m[i][j].
 */
export function at(m: Matrix, i: number, j: number): number {
  return (m[i] as number[])[j] as number
}

/**
 * Dense matrix product.
 * @param a - left factor (n×k).
 * @param b - right factor (k×m).
 * @returns a·b (n×m).
 */
export function matMul(a: Matrix, b: Matrix): Matrix {
  const n = a.length
  const k = b.length
  const m = (b[0] as number[]).length
  const out = zeros(n, m)
  for (let i = 0; i < n; i++) {
    const row = out[i] as number[]
    for (let p = 0; p < k; p++) {
      const aip = at(a, i, p)
      if (aip === 0) continue
      const bp = b[p] as number[]
      for (let j = 0; j < m; j++) row[j] = (row[j] as number) + aip * (bp[j] as number)
    }
  }
  return out
}

/**
 * Dense transpose.
 * @param a - matrix.
 * @returns aᵀ.
 */
export function matT(a: Matrix): Matrix {
  const rows = a.length
  const cols = (a[0] as number[]).length
  const out = zeros(cols, rows)
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) (out[j] as number[])[i] = at(a, i, j)
  return out
}

/**
 * Element-wise sum of equally shaped matrices.
 * @param a - left operand.
 * @param b - right operand.
 * @param k - multiplier applied to `b`.
 * @returns a + k·b.
 */
export function matAdd(a: Matrix, b: Matrix, k = 1): Matrix {
  return a.map((row, i) => row.map((value, j) => value + k * at(b, i, j)))
}

/**
 * Dense matrix-vector product.
 * @param a - matrix (n×m).
 * @param x - vector (m).
 * @returns a·x (n).
 */
export function matVec(a: Matrix, x: readonly number[]): number[] {
  return a.map(row => row.reduce((sum, value, j) => sum + value * (x[j] as number), 0))
}

/**
 * Cholesky factor of a symmetric positive-definite matrix.
 * @param a - symmetric positive-definite matrix.
 * @returns lower-triangular L with L·Lᵀ = a.
 * @throws When `a` is not positive definite.
 */
export function cholesky(a: Matrix): Matrix {
  const n = a.length
  const l = zeros(n, n)
  for (let j = 0; j < n; j++) {
    let d = at(a, j, j)
    for (let k = 0; k < j; k++) d -= at(l, j, k) ** 2
    if (!(d > 0)) throw new Error('matrix is not positive definite')
    const ljj = Math.sqrt(d)
    ;(l[j] as number[])[j] = ljj
    for (let i = j + 1; i < n; i++) {
      let s = at(a, i, j)
      for (let k = 0; k < j; k++) s -= at(l, i, k) * at(l, j, k)
      ;(l[i] as number[])[j] = s / ljj
    }
  }
  return l
}

/**
 * Solve a·x = b for symmetric positive-definite `a`.
 * @param a - symmetric positive-definite matrix.
 * @param b - right-hand side.
 * @returns x.
 */
export function cholSolve(a: Matrix, b: readonly number[]): number[] {
  const l = cholesky(a)
  const n = b.length
  const y = new Array<number>(n).fill(0)
  for (let i = 0; i < n; i++) {
    let s = b[i] as number
    for (let k = 0; k < i; k++) s -= at(l, i, k) * (y[k] as number)
    y[i] = s / at(l, i, i)
  }
  const x = new Array<number>(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i] as number
    for (let k = i + 1; k < n; k++) s -= at(l, k, i) * (x[k] as number)
    x[i] = s / at(l, i, i)
  }
  return x
}

/**
 * Inverse of a symmetric positive-definite matrix.
 * @param a - symmetric positive-definite matrix.
 * @returns a⁻¹.
 */
export function cholInverse(a: Matrix): Matrix {
  const n = a.length
  const inv = zeros(n, n)
  for (let j = 0; j < n; j++) {
    const e = new Array<number>(n).fill(0)
    e[j] = 1
    const col = cholSolve(a, e)
    for (let i = 0; i < n; i++) (inv[i] as number[])[j] = col[i] as number
  }
  return symmetrize(inv)
}

/**
 * Average a matrix with its transpose to remove rounding asymmetry.
 * @param a - square matrix.
 * @returns (a + aᵀ)/2.
 */
export function symmetrize(a: Matrix): Matrix {
  return a.map((row, i) => row.map((value, j) => (value + at(a, j, i)) / 2))
}

/**
 * Eigen-decomposition of a real symmetric matrix by cyclic Jacobi rotations.
 * @param input - symmetric matrix.
 * @returns eigenvalues in descending order and the matching unit eigenvectors as columns.
 */
export function symmetricEigen(input: Matrix): { values: number[]; vectors: Matrix } {
  const n = input.length
  const a = input.map(row => [...row])
  const v = identity(n)
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += at(a, p, q) ** 2
    if (off < 1e-30) break
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = at(a, p, q)
        if (Math.abs(apq) < 1e-300) continue
        const theta = (at(a, q, q) - at(a, p, p)) / (2 * apq)
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < n; k++) {
          const akp = at(a, k, p)
          const akq = at(a, k, q)
          ;(a[k] as number[])[p] = c * akp - s * akq
          ;(a[k] as number[])[q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = at(a, p, k)
          const aqk = at(a, q, k)
          ;(a[p] as number[])[k] = c * apk - s * aqk
          ;(a[q] as number[])[k] = s * apk + c * aqk
        }
        for (let k = 0; k < n; k++) {
          const vkp = at(v, k, p)
          const vkq = at(v, k, q)
          ;(v[k] as number[])[p] = c * vkp - s * vkq
          ;(v[k] as number[])[q] = s * vkp + c * vkq
        }
      }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => at(a, j, j) - at(a, i, i))
  return {
    values: order.map(i => at(a, i, i)),
    vectors: v.map(row => order.map(i => row[i] as number)),
  }
}

/**
 * Wrap an angle into [0, 2π).
 * @param angle - angle, rad.
 * @returns the equivalent angle in [0, 2π).
 */
export function wrap2pi(angle: number): number {
  const twoPi = 2 * Math.PI
  const r = angle % twoPi
  return r < 0 ? r + twoPi : r
}

/**
 * Wrap an angle into (−π, π].
 * @param angle - angle, rad.
 * @returns the equivalent angle in (−π, π].
 */
export function wrapPi(angle: number): number {
  const r = wrap2pi(angle)
  return r > Math.PI ? r - 2 * Math.PI : r
}
