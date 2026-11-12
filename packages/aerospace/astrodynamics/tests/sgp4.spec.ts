import { describe, expect, it } from 'vitest'
import { norm, sub } from '../src/linalg.ts'
import { elementEpoch, formatTle, ommFromRecord, parseOmm, parseTle, propagateSgp4, sgp4MeanElements, tleChecksum } from '../src/sgp4.ts'
import type { Vec3 } from '../src/types.ts'

// Vallado SGP4 verification case 00005 (tcppver.out, tsince = 0 and 360 min).
const L1 = '1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753'
const L2 = '2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667'

function close(actual: Vec3, expected: Vec3, tol: number): void {
  expect(norm(sub(actual, expected))).toBeLessThan(tol)
}

describe('SGP4', () => {
  it('reproduces the verification ephemeris', () => {
    const el = parseTle(L1, L2)
    expect(el.catalogNumber).toBe('00005')
    const [s0, s360] = propagateSgp4(el, [el.epoch, el.epoch + 360 * 60000])
    close(s0!.r, [7022.46529266, -1400.08296755, 0.03995155], 1e-6)
    close(s0!.v, [1.893841015, 6.405893759, 4.53480725], 1e-9)
    close(s360!.r, [-7154.03120202, -3783.17682504, -3536.19412294], 1e-5)
    close(s360!.v, [4.741887409, -4.151817765, -2.093935425], 1e-8)
  })

  it('validates TLE format and checksums', () => {
    expect(tleChecksum(L1)).toBe(3)
    expect(tleChecksum(L2)).toBe(7)
    expect(() => parseTle(L2, L1)).toThrow('start with')
    expect(() => parseTle(L1.slice(0, 60), L2)).toThrow('69 columns')
    expect(() => parseTle(`${L1.slice(0, 68)}9`, L2)).toThrow('checksum mismatch on line 1')
    expect(() => parseTle(L1, `${L2.slice(0, 68)}0`)).toThrow('checksum mismatch on line 2')
    expect(parseTle(`${L1}  `, `${L2}\r`).catalogNumber).toBe('00005')
  })

  it('parses CCSDS OMM keywords and reports invalid elements', () => {
    const omm = {
      OBJECT_NAME: 'ISS (ZARYA)',
      OBJECT_ID: '1998-067A',
      EPOCH: '2024-01-01T12:00:00.000000',
      MEAN_MOTION: 15.5,
      ECCENTRICITY: 0.0005,
      INCLINATION: 51.64,
      RA_OF_ASC_NODE: 100,
      ARG_OF_PERICENTER: 90,
      MEAN_ANOMALY: 270,
      EPHEMERIS_TYPE: 0,
      CLASSIFICATION_TYPE: 'U',
      NORAD_CAT_ID: 25544,
      ELEMENT_SET_NO: 999,
      REV_AT_EPOCH: 1,
      BSTAR: 0.0001,
      MEAN_MOTION_DOT: 0.0001,
      MEAN_MOTION_DDOT: 0,
    } as const
    const el = parseOmm(omm)
    expect(el.epoch).toBe(Date.UTC(2024, 0, 1, 12))
    const [s] = propagateSgp4(el, [el.epoch])
    expect(norm(s!.r)).toBeGreaterThan(6600)
    expect(() => parseOmm({ ...omm, ECCENTRICITY: 1.5 })).toThrow('invalid element set: mean eccentricity')
  })

  it('fails loudly when the orbit decays', () => {
    const el = parseOmm({
      OBJECT_NAME: 'REENTRY', OBJECT_ID: '2024-000A', EPOCH: '2024-01-01T00:00:00.000000', MEAN_MOTION: 16.4,
      ECCENTRICITY: 0.001, INCLINATION: 51, RA_OF_ASC_NODE: 0, ARG_OF_PERICENTER: 0, MEAN_ANOMALY: 0,
      EPHEMERIS_TYPE: 0, CLASSIFICATION_TYPE: 'U', NORAD_CAT_ID: 99999, ELEMENT_SET_NO: 1, REV_AT_EPOCH: 1,
      BSTAR: 0.05, MEAN_MOTION_DOT: 0.01, MEAN_MOTION_DDOT: 0,
    })
    expect(() => propagateSgp4(el, [el.epoch + 60 * 86400000])).toThrow('SGP4 failed')
  })

  it('maps two-digit TLE years across the 1957 pivot', () => {
    expect(elementEpoch(58, 1.5)).toBe(Date.UTC(1958, 0, 1, 12))
    expect(elementEpoch(0, 1)).toBe(Date.UTC(2000, 0, 1))
  })

  it('validates untyped OMM keyword records', () => {
    const record = {
      OBJECT_NAME: 'SAT', OBJECT_ID: '2024-001A', EPOCH: '2024-01-01T00:00:00', MEAN_MOTION: '15.5', ECCENTRICITY: 0.001,
      INCLINATION: 51.6, RA_OF_ASC_NODE: 10, ARG_OF_PERICENTER: 20, MEAN_ANOMALY: 30, NORAD_CAT_ID: 12345,
      BSTAR: 0.0001, MEAN_MOTION_DOT: 0, MEAN_MOTION_DDOT: 0,
    }
    const omm = ommFromRecord(record)
    expect(omm.MEAN_MOTION).toBe(15.5)
    expect(omm.ELEMENT_SET_NO).toBe(999)
    expect(omm.CLASSIFICATION_TYPE).toBe('U')
    expect(ommFromRecord({ ...record, CLASSIFICATION_TYPE: 'C', ELEMENT_SET_NO: 7 }).CLASSIFICATION_TYPE).toBe('C')
    expect(() => ommFromRecord({ ...record, OBJECT_NAME: '' })).toThrow('OBJECT_NAME must be a non-empty string')
    expect(() => ommFromRecord({ ...record, INCLINATION: 'steep' })).toThrow('INCLINATION must be a number')
    expect(() => ommFromRecord({ ...record, BSTAR: '' })).toThrow('BSTAR must be a number')
    expect(parseOmm(omm).catalogNumber).toBe('12345')
  })
})

describe('SGP4 mean elements and TLE encoding', () => {
  it('reports the mean elements SGP4 initialized', () => {
    const el = parseTle(L1, L2)
    const mean = sgp4MeanElements(el)
    expect(mean.e).toBeCloseTo(0.1859667, 10)
    expect(mean.i).toBeCloseTo((34.2682 * Math.PI) / 180, 10)
    expect(mean.raan).toBeCloseTo((348.7242 * Math.PI) / 180, 10)
    expect(mean.bstar).toBeCloseTo(0.28098e-4, 12)
    // Brouwer mean motion is slightly below the Kozai value 10.82419157 rev/day.
    const revPerDay = (mean.meanMotion * 86400) / (2 * Math.PI)
    expect(revPerDay).toBeLessThan(10.82419157)
    expect(revPerDay).toBeGreaterThan(10.81)
    expect(mean.a).toBeCloseTo(Math.cbrt(398600.8 / mean.meanMotion ** 2), 0)
    // J2 regresses the node of a prograde orbit and advances perigee below the critical inclination.
    expect(mean.raanRate).toBeLessThan(0)
    expect(mean.argpRate).toBeGreaterThan(0)
    expect(mean.meanAnomalyRate).toBeGreaterThan(mean.meanMotion * 0.99)
  })

  it('reproduces published element sets column for column', () => {
    const el = parseTle(L1, L2)
    const fields = {
      catalogNumber: '5', classification: 'U', designator: '58002B', epoch: el.epoch, meanMotionDot: 0.00000023,
      meanMotionDdot: 0, bstar: 0.28098e-4, elementSetNumber: 475, inclinationDeg: 34.2682, raanDeg: 348.7242,
      eccentricity: 0.1859667, argpDeg: 331.7664, meanAnomalyDeg: 19.3264, meanMotion: 10.82419157, revolution: 41366,
    } as const
    expect(formatTle(fields)).toEqual([L1, L2])
    const [n1, n2] = formatTle({
      ...fields, meanMotionDot: -0.00002182, meanMotionDdot: -1.2345e-12, bstar: -0.99999999, raanDeg: -0.00001, argpDeg: 719.99999,
    })
    expect(n1.slice(33, 61)).toBe('-.00002182  00000-0 -10000+1')
    expect(n2.slice(17, 25)).toBe('  0.0000')
    expect(n2.slice(34, 42)).toBe('  0.0000')
    expect(parseTle(n1, n2).catalogNumber).toBe('00005')
    expect(formatTle({ ...fields, bstar: 1.5e-3, eccentricity: 0.99999999 })[1].slice(26, 33)).toBe('9999999')
    expect(formatTle({ ...fields, bstar: 1.5e-3 })[0].slice(53, 61)).toBe(' 15000-2')
    expect(formatTle({ ...fields, catalogNumber: 'A1234' })[0].slice(2, 7)).toBe('A1234')
  })

  it('rejects fields that do not fit their columns', () => {
    const base = {
      catalogNumber: '25544', classification: 'U', designator: '98067A', epoch: Date.UTC(2024, 0, 1), meanMotionDot: 0,
      meanMotionDdot: 0, bstar: 0, elementSetNumber: 1, inclinationDeg: 51.6, raanDeg: 0, eccentricity: 0.001,
      argpDeg: 0, meanAnomalyDeg: 0, meanMotion: 15.5, revolution: 1,
    } as const
    expect(() => formatTle({ ...base, catalogNumber: '123456' })).toThrow('catalog number')
    expect(() => formatTle({ ...base, designator: '1998-067AB' })).toThrow('8 characters')
    expect(() => formatTle({ ...base, eccentricity: 1 })).toThrow('eccentricity')
    expect(() => formatTle({ ...base, meanMotion: 0 })).toThrow('mean motion must')
    expect(() => formatTle({ ...base, meanMotionDot: 1 })).toThrow('derivative')
    expect(() => formatTle({ ...base, epoch: Date.UTC(2060, 0, 1) })).toThrow('1957–2056')
    expect(() => formatTle({ ...base, bstar: 2e9 })).toThrow('exponential field')
  })
})
