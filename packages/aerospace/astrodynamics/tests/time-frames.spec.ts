import { describe, expect, it } from 'vitest'
import { DEG } from '../src/constants.ts'
import {
  earthOrientation, enuMatrix, gcrfToGeodetic, gcrfToItrf, gcrfToTeme, geodeticToItrf, itrfToGcrf, itrfToGeodetic,
  lookAngles, rtnMatrix, siteGcrf, temeToGcrf, temeToItrf,
} from '../src/frames.ts'
import { cross, dot, norm, sub } from '../src/linalg.ts'
import { centuriesTT, formatUtc, gmst, julianDate, parseUtc, taiMinusUtc, ttMinusUtc } from '../src/time.ts'
import type { Vec3 } from '../src/types.ts'

function close(actual: Vec3, expected: Vec3, tol: number): void {
  expect(norm(sub(actual, expected))).toBeLessThan(tol)
}

describe('time scales', () => {
  it('parses only zoned ISO 8601 instants', () => {
    expect(parseUtc('2024-03-01T12:00:00Z')).toBe(Date.UTC(2024, 2, 1, 12))
    expect(parseUtc('2024-03-01T12:00:00.250+08:00')).toBe(Date.UTC(2024, 2, 1, 4, 0, 0, 250))
    expect(parseUtc('2024-03-01T12:00Z')).toBe(Date.UTC(2024, 2, 1, 12))
    expect(() => parseUtc('2024-03-01 12:00:00')).toThrow('ISO 8601')
    expect(() => parseUtc('2024-03-01T12:00:00')).toThrow('ISO 8601')
    expect(() => parseUtc('2024-13-45T99:00:00Z')).toThrow('invalid date-time')
    expect(formatUtc(0)).toBe('1970-01-01T00:00:00.000Z')
    expect(julianDate(Date.UTC(2000, 0, 1, 12))).toBe(2451545)
  })

  it('follows the leap-second table', () => {
    expect(taiMinusUtc(Date.UTC(1972, 0, 1))).toBe(10)
    expect(taiMinusUtc(Date.UTC(2016, 11, 31, 23, 59, 59))).toBe(36)
    expect(taiMinusUtc(Date.UTC(2026, 8, 28))).toBe(37)
    expect(ttMinusUtc(Date.UTC(2026, 8, 28))).toBeCloseTo(69.184, 12)
    expect(() => taiMinusUtc(Date.UTC(1971, 11, 31))).toThrow('before 1972')
    expect(centuriesTT(Date.UTC(2000, 0, 1, 11, 58, 55, 816))).toBeCloseTo(0, 12)
  })

  it('computes IAU-1982 GMST (Vallado Example 3-5)', () => {
    expect(gmst(Date.UTC(1992, 7, 20, 12, 14)) / DEG).toBeCloseTo(152.57878781, 7)
    expect(gmst(Date.UTC(1992, 7, 20, 12, 14), 0.5) / DEG).toBeCloseTo(152.57878781 + 0.5 * 360.98564736629 / 86400, 6)
  })
})

describe('reference frames (Vallado Example 3-15)', () => {
  const t = parseUtc('2004-04-06T07:51:28.386Z') + 0.009
  const eop = { dut1: -0.4399619, xp: -0.140682, yp: 0.333309 }
  const itrf = { r: [-1033.479383, 7901.2952754, 6380.3565958] as Vec3, v: [-3.22563652, -2.87245145, 5.531924446] as Vec3 }
  const gcrf = { r: [5102.508958, 6123.011401, 6378.136928] as Vec3, v: [-4.74322016, 0.7905365, 5.53375528] as Vec3 }
  const teme = { r: [5094.1801621, 6127.6446595, 6380.3445327] as Vec3, v: [-4.746131487, 0.785818041, 5.531931288] as Vec3 }

  it('rotates ITRF to GCRF within the truncated-nutation budget', () => {
    const out = itrfToGcrf(itrf, t, eop)
    close(out.r, gcrf.r, 0.002)
    close(out.v, gcrf.v, 2e-6)
    const back = gcrfToItrf(out, t, eop)
    close(back.r, itrf.r, 1e-8)
    close(back.v, itrf.v, 1e-11)
  })

  it('rotates TEME to ITRF and GCRF', () => {
    const fixed = temeToItrf(teme, t, eop)
    close(fixed.r, itrf.r, 1e-5)
    close(fixed.v, itrf.v, 1e-7)
    const inertial = temeToGcrf(teme, t)
    close(inertial.r, gcrf.r, 0.002)
    const again = gcrfToTeme(inertial, t)
    close(again.r, teme.r, 1e-7)
    close(again.v, teme.v, 1e-10)
  })

  it('defaults Earth orientation parameters to zero', () => {
    const o = earthOrientation(t)
    o.polarMotion.forEach((row, i) => {
      row.forEach((value, j) => {
        expect(value).toBeCloseTo(i === j ? 1 : 0, 15)
      })
    })
    // Without polar motion the pseudo-Earth-fixed frame is ~16 m from ITRF at this radius.
    const offset = norm(sub(gcrfToItrf(gcrf, t, { dut1: eop.dut1 }).r, itrf.r))
    expect(offset).toBeGreaterThan(0.005)
    expect(offset).toBeLessThan(0.03)
    expect(norm(sub(temeToItrf(teme, t, { dut1: eop.dut1 }).r, itrf.r))).toBeLessThan(0.05)
  })
})

describe('geodetic coordinates', () => {
  it('converts Earth-fixed positions (Vallado Example 3-3)', () => {
    const g = itrfToGeodetic([6524.834, 6862.875, 6448.296])
    expect(g.lat / DEG).toBeCloseTo(34.352496, 5)
    expect(g.lon / DEG).toBeCloseTo(46.4464, 4)
    expect(g.h).toBeCloseTo(5085.22, 2)
  })

  it('round-trips from pole to pole and below the surface', () => {
    for (const lat of [-90, -60, -10, 0, 30, 44.9, 45.1, 89.999, 90]) {
      for (const h of [-3, 0, 400, 36000]) {
        const g = { lat: lat * DEG, lon: 1.2, h }
        const back = itrfToGeodetic(geodeticToItrf(g))
        expect(back.lat).toBeCloseTo(g.lat, 11)
        expect(back.h).toBeCloseTo(h, 7)
      }
    }
  })

  it('computes look angles and range rate', () => {
    const site = { lat: 40 * DEG, lon: -105 * DEG, h: 1.6 }
    const up = geodeticToItrf({ ...site, h: 501.6 })
    const overhead = lookAngles(site, { r: up, v: [0, 0, 0] })
    expect(overhead.el / DEG).toBeCloseTo(90, 5)
    expect(overhead.range).toBeCloseTo(500, 6)
    const enu = enuMatrix(site.lat, site.lon)
    const north: Vec3 = [enu[1][0], enu[1][1], enu[1][2]]
    const east: Vec3 = [enu[0][0], enu[0][1], enu[0][2]]
    const base = geodeticToItrf(site)
    const target = { r: [base[0] + 100 * east[0], base[1] + 100 * east[1], base[2] + 100 * east[2]] as Vec3, v: north }
    const angles = lookAngles(site, target)
    expect(angles.az / DEG).toBeCloseTo(90, 6)
    expect(angles.el).toBeCloseTo(0, 6)
    expect(angles.rangeRate).toBeCloseTo(0, 12)
    const receding = lookAngles(site, { r: target.r, v: east })
    expect(receding.rangeRate).toBeCloseTo(1, 12)
    const west: Vec3 = [base[0] - 100 * east[0], base[1] - 100 * east[1], base[2] - 100 * east[2]]
    expect(lookAngles(site, { r: west, v: [0, 0, 0] }).az / DEG).toBeCloseTo(270, 6)
  })

  it('places a ground site and a sub-satellite point in GCRF', () => {
    const t = Date.UTC(2025, 0, 1)
    const site = { lat: 0.3, lon: -1, h: 0.1 }
    const s = siteGcrf(site, t)
    expect(norm(s.r)).toBeCloseTo(norm(geodeticToItrf(site)), 9)
    // A co-rotating site moves at ω·ρ.
    expect(norm(s.v)).toBeCloseTo(7.292115146706979e-5 * Math.hypot(geodeticToItrf(site)[0], geodeticToItrf(site)[1]), 9)
    const sub = gcrfToGeodetic(s.r, t)
    expect(sub.lat).toBeCloseTo(0.3, 10)
    expect(sub.lon).toBeCloseTo(-1, 10)
  })

  it('builds the radial/transverse/normal frame', () => {
    const m = rtnMatrix({ r: [7000, 0, 0], v: [0, 7.5, 0.2] })
    expect(m[0]).toEqual([1, 0, 0])
    expect(dot(m[1], m[2])).toBeCloseTo(0, 15)
    const n = cross(m[0], m[1])
    expect(norm(sub(n, m[2]))).toBeLessThan(1e-15)
  })
})
