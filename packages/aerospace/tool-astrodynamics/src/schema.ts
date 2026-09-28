/**
 * Shared model-facing schema fragments for the astrodynamics tools. Every distance is in km,
 * velocity in km/s, angle in degrees, and instant an ISO 8601 date-time with `Z` or an offset.
 * @module @astro-one/tool-astrodynamics/schema
 */

/** A three-component number array. */
export const VEC3 = { type: 'array', items: { type: 'number' } } as const

/** ISO 8601 instant. */
export const INSTANT = { type: 'string', description: 'ISO 8601 date-time with Z or a UTC offset, for example 2025-03-01T12:00:00Z.' } as const

/** Orbit source accepted by propagation, passes, and conjunction tools. */
export const SOURCE = {
  type: 'object',
  additionalProperties: false,
  description: 'Orbit to use. kind=tle needs line1/line2; kind=omm needs omm (CCSDS OMM JSON keywords as served by CelesTrak); kind=state needs epoch, frame, position_km, velocity_km_s; kind=elements needs epoch, a_km, e, i_deg, raan_deg, argp_deg, and exactly one of true_anomaly_deg or mean_anomaly_deg (GCRF/J2000).',
  properties: {
    kind: { type: 'string', enum: ['tle', 'omm', 'state', 'elements'], required: true },
    line1: { type: 'string' },
    line2: { type: 'string' },
    omm: { type: 'json' },
    epoch: INSTANT,
    frame: { type: 'string', enum: ['gcrf', 'itrf', 'teme'], description: 'Frame of position_km/velocity_km_s.' },
    position_km: VEC3,
    velocity_km_s: VEC3,
    a_km: { type: 'number' },
    e: { type: 'number' },
    i_deg: { type: 'number' },
    raan_deg: { type: 'number' },
    argp_deg: { type: 'number' },
    true_anomaly_deg: { type: 'number' },
    mean_anomaly_deg: { type: 'number' },
  },
} as const

/** Propagation method selector. */
export const METHOD = {
  type: 'string',
  enum: ['sgp4', 'numerical', 'two-body'],
  description: 'sgp4 (TLE/OMM sources only; standard for catalog element sets), numerical (RKF7(8) special perturbations with the forces field), or two-body (Keplerian).',
} as const

/** Force-model selection for numerical propagation. */
export const FORCES = {
  type: 'object',
  additionalProperties: false,
  description: 'Numerical force model. Defaults: zonal_degree 2 (J2), no drag, no radiation pressure, no third bodies.',
  properties: {
    zonal_degree: { type: 'integer', description: 'Highest zonal harmonic, 0 (point mass) to 6 (J2–J6).' },
    drag: {
      type: 'object',
      additionalProperties: false,
      description: 'Exponential-atmosphere drag.',
      properties: {
        cd: { type: 'number', required: true },
        area_m2: { type: 'number', required: true },
        mass_kg: { type: 'number', required: true },
      },
    },
    srp: {
      type: 'object',
      additionalProperties: false,
      description: 'Cannonball solar radiation pressure with conical Earth shadow.',
      properties: {
        cr: { type: 'number', required: true },
        area_m2: { type: 'number', required: true },
        mass_kg: { type: 'number', required: true },
      },
    },
    sun: { type: 'boolean', description: 'Solar third-body gravity.' },
    moon: { type: 'boolean', description: 'Lunar third-body gravity.' },
  },
} as const

/** WGS-84 ground station. */
export const STATION = {
  type: 'object',
  additionalProperties: false,
  properties: {
    lat_deg: { type: 'number', required: true },
    lon_deg: { type: 'number', required: true },
    alt_km: { type: 'number', required: true },
  },
} as const

/** IERS Earth orientation parameters. */
export const EOP = {
  type: 'object',
  additionalProperties: false,
  description: 'Optional IERS Bulletin A values; omit for UT1=UTC and no polar motion (≈15 m and ≈0.4 km/s·ΔUT1 errors).',
  properties: {
    dut1_s: { type: 'number' },
    xp_arcsec: { type: 'number' },
    yp_arcsec: { type: 'number' },
  },
} as const

/** Classical elements output. */
export const ELEMENTS_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  description: 'Osculating two-body elements in GCRF; a_km is negative for hyperbolic and null for parabolic orbits.',
  properties: {
    a_km: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
    e: { type: 'number', required: true },
    i_deg: { type: 'number', required: true },
    raan_deg: { type: 'number', required: true },
    argp_deg: { type: 'number', required: true },
    true_anomaly_deg: { type: 'number', required: true },
    mean_anomaly_deg: { type: 'number', required: true },
    period_s: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
    perigee_alt_km: { type: 'number', required: true },
    apogee_alt_km: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
  },
} as const
