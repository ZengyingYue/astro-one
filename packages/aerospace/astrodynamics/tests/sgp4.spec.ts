import { describe, expect, it } from 'vitest'
import { norm, sub } from '../src/linalg.ts'
import { elementEpoch, ommFromRecord, parseOmm, parseTle, propagateSgp4, tleChecksum } from '../src/sgp4.ts'
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
