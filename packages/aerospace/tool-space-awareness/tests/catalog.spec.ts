import { describe, expect, it } from 'vitest'
import { R_EARTH } from '@astro-one/astrodynamics'
import type { Sgp4MeanElements } from '@astro-one/astrodynamics'
import { catalogObject, geoView, orbitRegime, parseCatalog } from '../src/catalog.ts'
import { elements, omm, tle } from './fixtures.ts'

const iss = { name: 'ISS (ZARYA)', number: 25544, n: 15.5, i: 51.6 }
const sat = { number: 7, n: 14.2, i: 98 }

describe('catalog parsing', () => {
  it('reads two- and three-line TLE text with optional "0 " name lines', () => {
    const [a1, a2] = tle(iss)
    const [b1, b2] = tle(sat)
    const text = `0 ISS (ZARYA)\r\n${a1}\r\n${a2}\r\n\r\n${b1}\n${b2}\n`
    const catalog = parseCatalog(text, 10)
    expect(catalog.rejected).toEqual([])
    expect(catalog.objects.map(o => [o.name, o.catalogNumber])).toEqual([['ISS (ZARYA)', '25544'], ['00007', '00007']])
    expect(catalog.objects[0]!.mean.i).toBeCloseTo((51.6 * Math.PI) / 180, 10)
  })

  it('rejects orphan and malformed TLE lines without losing the rest', () => {
    const [a1, a2] = tle(iss)
    const [b1, b2] = tle(sat)
    const text = ['LONELY', a1, 'SECOND', b2, 'BROKEN', `${b1.slice(0, 68)}${String((Number(b1[68]) + 1) % 10)}`, b2, 'GOOD', a1, a2].join('\n')
    const catalog = parseCatalog(text, 10)
    expect(catalog.objects.map(o => o.name)).toEqual(['GOOD'])
    expect(catalog.rejected).toEqual([
      { entry: 1, name: 'LONELY', reason: 'line 2 is a TLE line 1 without its partner' },
      { entry: 2, name: 'SECOND', reason: 'line 4 is a TLE line 2 without its partner' },
      { entry: 3, name: 'BROKEN', reason: 'TLE checksum mismatch on line 1' },
    ])
  })

  it('reads CCSDS OMM JSON arrays and single records', () => {
    const catalog = parseCatalog(JSON.stringify([omm(iss), omm({ ...sat, n: 15 }), 42, { ...omm(sat), ECCENTRICITY: 1.5 }]), 10)
    expect(catalog.objects.map(o => [o.name, o.catalogNumber])).toEqual([['ISS (ZARYA)', '25544'], ['OBJECT 7', '00007']])
    expect(catalog.rejected).toEqual([
      { entry: 3, name: '', reason: 'OMM record must be a JSON object' },
      { entry: 4, name: 'OBJECT 7', reason: 'invalid element set: mean eccentricity is outside [0, 1)' },
    ])
    expect(parseCatalog(`  ${JSON.stringify(omm(iss))}`, 1).objects).toHaveLength(1)
  })

  it('enforces the entry bound and refuses empty or malformed files', () => {
    const [a1, a2] = tle(iss)
    expect(() => parseCatalog([a1, a2, a1, a2].join('\n'), 1)).toThrow('more than 1 entries')
    expect(() => parseCatalog('\n\n', 10)).toThrow('no element sets')
    expect(() => parseCatalog('NAME ONLY\n', 10)).toThrow('no element sets')
    expect(parseCatalog([a1, a2, 'TRAILING NAME'].join('\n'), 10).objects).toHaveLength(1)
    expect(() => parseCatalog('[{"OBJECT_NAME": ', 10)).toThrow(SyntaxError)
  })
})

function mean(a: number, e: number, iDeg: number): Sgp4MeanElements {
  const meanMotion = Math.sqrt(398600.4418 / a ** 3)
  return { a, e, i: (iDeg * Math.PI) / 180, raan: 0, argp: 0, m: 0, meanMotion, meanAnomalyRate: 0, raanRate: 0, argpRate: 0, bstar: 0 }
}

function fromAltitudes(perigee: number, apogee: number, iDeg: number): Sgp4MeanElements {
  const rp = R_EARTH + perigee
  const ra = R_EARTH + apogee
  return mean((rp + ra) / 2, (ra - rp) / (ra + rp), iDeg)
}

describe('ESA orbit classes', () => {
  it('assigns every class in definition order', () => {
    expect([
      fromAltitudes(35780, 35790, 0.1),
      mean(42164, 0.01, 30),
      mean(42164, 0.1, 5),
      fromAltitudes(19900, 20300, 55),
      fromAltitudes(200, 35786, 27),
      fromAltitudes(19900, 20300, 30),
      fromAltitudes(35000, 50000, 10),
      fromAltitudes(400, 420, 51.6),
      fromAltitudes(45000, 60000, 10),
      fromAltitudes(20000, 35000, 10),
      fromAltitudes(500, 45000, 63.4),
      fromAltitudes(500, 5000, 63.4),
      fromAltitudes(200, 35786, 120),
    ].map(orbitRegime)).toEqual(['GEO', 'IGO', 'EGO', 'NSO', 'GTO', 'MEO', 'GHO', 'LEO', 'HAO', 'MGO', 'HEO', 'LMO', 'UFO'])
  })

  it('keeps near-GEO objects out of NSO and GEO when one bound fails', () => {
    expect(orbitRegime(fromAltitudes(35780, 35790, 30))).toBe('IGO')
    expect(orbitRegime(fromAltitudes(19900, 26000, 55))).toBe('MEO')
    expect(orbitRegime(fromAltitudes(17000, 20300, 55))).toBe('MEO')
    expect(orbitRegime(fromAltitudes(19900, 20300, 40))).toBe('MEO')
    expect(orbitRegime(fromAltitudes(19900, 20300, 75))).toBe('MEO')
  })
})

describe('geosynchronous view', () => {
  it('reports a stationary longitude for a geostationary set and drift for an offset one', () => {
    const still = geoView(catalogObject('GEO', elements({ number: 1, n: 1.0027, i: 0.05, m: 100 })))
    expect(Math.abs(still.driftDegPerDay)).toBeLessThan(0.01)
    expect(still.longitudeDeg).toBeGreaterThan(-180)
    expect(still.longitudeDeg).toBeLessThanOrEqual(180)
    // A higher orbit (lower mean motion) drifts west by about 360·Δn/n deg per day.
    const drifting = geoView(catalogObject('GEO', elements({ number: 2, n: 0.9927, i: 0.05 })))
    expect(drifting.driftDegPerDay).toBeCloseTo(-3.6, 1)
  })
})
