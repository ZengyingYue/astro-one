/**
 * `orbit_convert`: frame, element, geodetic, and time-scale conversions.
 * @module @astro-one/tool-astrodynamics/convert
 */

import {
  centuriesTT, DEG, formatUtc, gcrfToItrf, gcrfToTeme, geodeticToItrf, gmst, itrfToGeodetic, julianDate, taiMinusUtc,
  ttMinusUtc,
} from '@astro-one/astrodynamics'
import type { StateVector } from '@astro-one/astrodynamics'
import { defineTool } from '@astro-one/tools'
import type { ToolDefinition } from '@astro-one/tools'
import { elementsOutput, eopOf, instant, parseSource, round, roundVec, station } from './inputs.ts'
import { EOP, INSTANT, SOURCE, STATION } from './schema.ts'
import { initialState } from './trajectory.ts'

const DESCRIPTION = 'Convert orbit and time representations. operation=state converts a source (state in gcrf/itrf/teme, '
  + 'Keplerian elements, TLE, or OMM) at its epoch into GCRF, ITRF, and TEME position/velocity, osculating elements, and '
  + 'the geodetic sub-point. operation=geodetic converts a station (lat_deg, lon_deg, alt_km) to Earth-fixed coordinates. '
  + 'operation=time converts an instant to Julian dates (UTC and TT), TAI-UTC, GPS week/seconds, and Greenwich sidereal time.'

const GPS_EPOCH = Date.UTC(1980, 0, 6)

/**
 * Build the `orbit_convert` tool.
 * @returns the tool definition.
 */
export function convertTool(): ToolDefinition {
  return defineTool({
    name: 'orbit_convert',
    description: DESCRIPTION,
    parameters: {
      operation: { type: 'string', enum: ['state', 'geodetic', 'time'], required: true },
      source: SOURCE,
      station: STATION,
      time: INSTANT,
      eop: EOP,
    },
    output: {
      // The value's fields depend on the operation; each branch below documents its own keys.
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    presentCall: args => ({ card: 'generic', title: `Convert (${args.operation})`, kind: 'other' }),
    // oxlint-disable-next-line typescript/require-await -- async turns synchronous validation throws into rejected tool calls
    async execute(args) {
      const eop = eopOf(args.eop)
      if (args.operation === 'time') {
        const t = instant(args.time, 'time')
        const gpsSeconds = (t - GPS_EPOCH) / 1000 + taiMinusUtc(t) - 19
        const week = Math.floor(gpsSeconds / 604800)
        return {
          utc: formatUtc(t),
          jd_utc: julianDate(t),
          jd_tt: julianDate(t) + ttMinusUtc(t) / 86400,
          centuries_tt_j2000: centuriesTT(t),
          tai_minus_utc_s: taiMinusUtc(t),
          gps_week: week,
          gps_seconds_of_week: round(gpsSeconds - week * 604800, 6),
          gmst_deg: round(gmst(t, eop.dut1) / DEG, 9),
        }
      }
      if (args.operation === 'geodetic') {
        if (args.station === undefined) throw new Error('station is required for operation=geodetic')
        const r = geodeticToItrf(station(args.station, 'station'))
        return { itrf_position_km: roundVec(r, 6) }
      }
      if (args.source === undefined) throw new Error('source is required for operation=state')
      const state = initialState(parseSource(args.source, eop))
      const out = (s: StateVector) => ({ position_km: roundVec(s.r, 6), velocity_km_s: roundVec(s.v, 9) })
      const itrf = gcrfToItrf(state, state.t, eop)
      const g = itrfToGeodetic(itrf.r)
      return {
        epoch: formatUtc(state.t),
        gcrf: out(state),
        itrf: out(itrf),
        teme: out(gcrfToTeme(state, state.t)),
        elements: { ...elementsOutput(state) },
        subpoint: { lat_deg: round(g.lat / DEG, 8), lon_deg: round(g.lon / DEG, 8), alt_km: round(g.h, 6) },
      }
    },
  })
}
