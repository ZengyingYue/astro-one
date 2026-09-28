import { describe, expect, it } from 'vitest'
import {
  add, apply3, at, cholesky, cholInverse, cholSolve, cross, dot, identity, matAdd, matMul, matT, matVec, mul3, norm,
  rot1, rot2, rot3, scale, sub, symmetricEigen, symmetrize, transpose3, unit, wrap2pi, wrapPi, zeros,
} from '../src/linalg.ts'
import type { Matrix, Vec3 } from '../src/types.ts'

describe('vector algebra', () => {
  it('combines vectors', () => {
    const a: Vec3 = [1, 2, 3]
    const b: Vec3 = [4, -5, 6]
    expect(add(a, b)).toEqual([5, -3, 9])
    expect(sub(a, b)).toEqual([-3, 7, -3])
    expect(scale(a, 2)).toEqual([2, 4, 6])
    expect(dot(a, b)).toBe(12)
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1])
    expect(norm([3, 4, 12])).toBe(13)
    expect(unit([0, 0, 5])).toEqual([0, 0, 1])
  })

  it('refuses to normalize the zero vector', () => {
    expect(() => unit([0, 0, 0])).toThrow('zero vector')
  })

  it('builds orthonormal frame rotations', () => {
    for (const r of [rot1(0.3), rot2(-1.1), rot3(2.5)]) {
      const i = mul3(r, transpose3(r))
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) expect(i[a as 0][b as 0]).toBeCloseTo(a === b ? 1 : 0, 14)
    }
    // A frame rotated +90° about z sees the old x axis at −y.
    const v = apply3(rot3(Math.PI / 2), [1, 0, 0])
    expect(v[0]).toBeCloseTo(0, 15)
    expect(v[1]).toBeCloseTo(-1, 15)
  })

  it('wraps angles', () => {
    expect(wrap2pi(-0.5)).toBeCloseTo(2 * Math.PI - 0.5, 15)
    expect(wrap2pi(7)).toBeCloseTo(7 - 2 * Math.PI, 15)
    expect(wrapPi(3.5)).toBeCloseTo(3.5 - 2 * Math.PI, 15)
    expect(wrapPi(-3.5)).toBeCloseTo(2 * Math.PI - 3.5, 15)
    expect(wrapPi(1)).toBe(1)
  })
})

describe('dense matrices', () => {
  const spd: Matrix = [[4, 12, -16], [12, 37, -43], [-16, -43, 98]]

  it('multiplies, transposes, adds, and applies', () => {
    expect(matMul([[1, 2], [3, 4]], [[0, 1], [1, 0]])).toEqual([[2, 1], [4, 3]])
    expect(matMul([[0, 1]], [[5], [7]])).toEqual([[7]])
    expect(matT([[1, 2, 3]])).toEqual([[1], [2], [3]])
    expect(matAdd([[1, 1]], [[2, 3]], -1)).toEqual([[-1, -2]])
    expect(matAdd([[1, 1]], [[2, 3]])).toEqual([[3, 4]])
    expect(matVec([[1, 2], [3, 4]], [1, 1])).toEqual([3, 7])
    expect(identity(2)).toEqual([[1, 0], [0, 1]])
    expect(zeros(1, 2)).toEqual([[0, 0]])
    expect(at(spd, 2, 1)).toBe(-43)
    expect(symmetrize([[1, 2], [4, 1]])).toEqual([[1, 3], [3, 1]])
  })

  it('factors, solves, and inverts a positive-definite matrix', () => {
    expect(cholesky(spd)).toEqual([[2, 0, 0], [6, 1, 0], [-8, 5, 3]])
    const x = cholSolve(spd, [1, 2, 3])
    const back = matVec(spd, x)
    back.forEach((value, i) => {
      expect(value).toBeCloseTo([1, 2, 3][i] as number, 10)
    })
    const product = matMul(spd, cholInverse(spd))
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(at(product, i, j)).toBeCloseTo(i === j ? 1 : 0, 9)
  })

  it('rejects matrices that are not positive definite', () => {
    expect(() => cholesky([[1, 2], [2, 1]])).toThrow('not positive definite')
    expect(() => cholesky([[Number.NaN]])).toThrow('not positive definite')
  })

  it('diagonalizes symmetric matrices', () => {
    const m: Matrix = [[4, 1, 0, 2], [1, 3, 0, 0], [0, 0, 5, 1], [2, 0, 1, 1]]
    const { values, vectors } = symmetricEigen(m)
    expect(values).toEqual([...values].sort((a, b) => b - a))
    values.forEach((lambda, k) => {
      const v = vectors.map(row => row[k] as number)
      const mv = matVec(m, v)
      mv.forEach((value, i) => {
        expect(value).toBeCloseTo(lambda * (v[i] as number), 10)
      })
    })
    // Equal diagonal entries exercise the θ = 0 rotation.
    const equal = symmetricEigen([[2, 1], [1, 2]])
    expect(equal.values[0]).toBeCloseTo(3, 12)
    expect(equal.values[1]).toBeCloseTo(1, 12)
    // Already diagonal input converges without rotating.
    expect(symmetricEigen([[1, 0], [0, 7]]).values).toEqual([7, 1])
  })
})
