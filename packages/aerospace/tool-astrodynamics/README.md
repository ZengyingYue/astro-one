---
description: "Model-facing astrodynamics tools over astro-one-astrodynamics: orbit propagation, orbit determination, transfer design, ground-station passes, conjunction assessment, frame conversion, and attitude determination."
kind: "package-reference"
---

# @astro-one/tool-astrodynamics

English | [中文](README.zh.md)

## Summary

`astro-one-tool-astrodynamics` gives models seven orbit-mechanics tools: `orbit_propagate`, `orbit_determine`, `orbit_transfer`, `orbit_passes`, `orbit_conjunction`, `orbit_convert`, and `attitude_determine`. Models pass TLEs, CCSDS OMM records, state vectors, or Keplerian elements with ISO 8601 instants; results use km, km/s, and degrees. All computation runs in-process through [`astro-one-astrodynamics`](../astrodynamics/README.md), so the tools need no network access. Deployment configuration bounds the sample count, observation count, and numerical-integrator effort of each call.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Enable the [`@astro-one/aerospace`](../../bundle/aerospace/README.md) bundle, or mount the package directly in a composition that has the tool runtime.

### When to choose it

Choose this package when a model must answer quantitative spaceflight questions: where a satellite is, when it passes over a site, how much Δv a transfer costs, what orbit fits a set of observations, how close two objects come, or which attitude best fits sensor vectors.

### Minimal configuration

```yaml
- name: '@astro-one/tool-astrodynamics'
  config:
    maxSamples: 20000
    maxObservations: 5000
    relativeTolerance: 1.e-11
    absoluteTolerance: 1.e-9
    maxIntegratorSteps: 2000000
```

| Field | Bundle value | Meaning |
|---|---|---|
| `maxSamples` | `20000` | Largest ephemeris, pass-search, or conjunction-search sample count per call |
| `maxObservations` | `5000` | Largest observation count accepted by `orbit_determine` |
| `relativeTolerance` | `1e-11` | RKF7(8) relative error tolerance |
| `absoluteTolerance` | `1e-9` | RKF7(8) absolute error tolerance in km and km/s |
| `maxIntegratorSteps` | `2000000` | RKF7(8) step budget per propagation |

Every field is required; the generated [configuration catalog](../../../docs/config-catalog.md#astro-onetool-astrodynamics) lists the declarations. A non-positive tolerance fails plugin load.

### Tools

| Tool | Computes |
|---|---|
| `orbit_propagate` | SGP4, numerical (J2–J6, drag, solar radiation pressure, Sun/Moon), or two-body ephemeris in GCRF, ITRF, TEME, or geodetic coordinates |
| `orbit_determine` | Gibbs, Herrick–Gibbs, or Gauss initial orbits; batch least squares with covariance or an unscented Kalman filter from position, range, range-rate, RA/Dec, or Az/El observations |
| `orbit_transfer` | Izzo Lambert arcs with multi-revolution branches, Hohmann and bi-elliptic budgets, plane-change Δv |
| `orbit_passes` | Rise, culmination, and set times with look angles and illumination for a ground station |
| `orbit_conjunction` | Closest approaches, RTN miss vectors, Foster 2D collision probability, and the Alfano maximum probability |
| `orbit_convert` | State, element, and geodetic conversions; UTC, TT, GPS time, and sidereal time |
| `attitude_determine` | TRIAD, Davenport q-method, or QUEST attitude with Euler angles and 1-sigma errors |

```text
orbit_passes({ source: { kind: 'tle', line1: '1 25544U …', line2: '2 25544 …' }, method: 'sgp4',
  station: { lat_deg: 39.9, lon_deg: 116.4, alt_km: 0.05 }, start: '2025-03-01T00:00:00Z', end: '2025-03-02T00:00:00Z' })
```

### Failures and recovery

Argument, geometry, and convergence problems become `Error: <message>` results, for example `Error: TLE checksum mismatch on line 1`, an SGP4 decay report, or a request whose sample count exceeds `maxSamples`. The model can correct the arguments or narrow the time window and call again.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Each tool validates snake_case arguments, converts them to library units (radians, UTC milliseconds), calls [`astro-one-astrodynamics`](../astrodynamics/README.md), and rounds results to lossless JSON numbers. Numerical propagation integrates once across the requested window and evaluates samples from a cubic Hermite interpolant of the accepted steps.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: config schema, tolerance validation, tool registration |
| [`src/schema.ts`](src/schema.ts), [`src/inputs.ts`](src/inputs.ts) | Shared schema fragments and conversion of orbit sources, force models, stations, and time grids |
| [`src/trajectory.ts`](src/trajectory.ts) | Dense trajectories for pass and conjunction searches |
| [`src/propagate.ts`](src/propagate.ts) | `orbit_propagate` and the CSV ephemeris rendering |
| [`src/determine.ts`](src/determine.ts) | `orbit_determine` |
| [`src/transfer.ts`](src/transfer.ts) | `orbit_transfer` |
| [`src/passes.ts`](src/passes.ts) | `orbit_passes` |
| [`src/conjunction.ts`](src/conjunction.ts) | `orbit_conjunction` |
| [`src/convert.ts`](src/convert.ts) | `orbit_convert` |
| [`src/attitude.ts`](src/attitude.ts) | `attitude_determine` |
| — | No runtime invariant companion is published; these stateless tools own no event stream or shared mutable state. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Aerospace subsystem](../../../docs/subsystems/aerospace.md) — units, frames, and the algorithm sources.
- [Generated tool catalog](../../../docs/tool-catalog.md#astro-onetool-astrodynamics) — the exact schemas of the seven tools.
- [Generated configuration catalog](../../../docs/config-catalog.md#astro-onetool-astrodynamics) — every config field and its declaration.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schemas

#### What the model sees

The model sees the generated [`orbit_*` and `attitude_determine` schemas](../../../docs/tool-catalog.md#astro-onetool-astrodynamics). Each description states the method choices, units, and defaults; configuration bounds are not model arguments.

#### Token effect

Seven schemas add a fixed cost to every request while the plugin is loaded; the shared orbit-source fragment repeats in each tool that accepts an orbit.

#### KV Cache effect

Prefix-stable while the plugin stays loaded and the definitions are unchanged; loading or unloading the plugin invalidates reuse from the first changed schema token.

### Ephemeris result

#### What the model sees

`orbit_propagate` returns one summary line such as `sgp4 ephemeris, 3 samples, frame gcrf. Epoch <iso>: a=<km> km, e=<e>, i=<deg> deg, perigee alt=<km> km, apogee alt=<km> km, period=<s> s.`, then a CSV header (`time,x_km,y_km,z_km,vx_km_s,vy_km_s,vz_km_s`, or `time,lat_deg,lon_deg,alt_km` for geodetic output) and one row per sample.

#### Token effect

Cost grows linearly with the sample count, which `maxSamples` bounds; results are resent until compaction.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

### Analysis results

#### What the model sees

The other tools return compact JSON objects. `orbit_passes` returns `No passes above the elevation mask in the window.` and `orbit_conjunction` returns `No close approach inside the screening distance.` when nothing qualifies. Failures are `Error: <message>`.

#### Token effect

Result size follows the number of passes, approaches, or Lambert branches; `orbit_determine` returns one residual row per observation, so its result grows with the observation count that `maxObservations` bounds.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Library accuracy bounds apply** — Earth orientation and force-model simplifications are listed in [`astro-one-astrodynamics`](../astrodynamics/README.md#known-limitations-and-deferred-work); models can pass IERS EOP values through the `eop` argument to remove the UT1 and polar-motion errors.
- **Observations are inline arguments** — `orbit_determine` reads observations from the call arguments, not from tracking-data files such as CCSDS TDM, so large campaigns are limited by argument size as well as `maxObservations`.
- **Conjunction probability assumes a short encounter** — the 2D Foster method is invalid for slow, long-duration encounters such as co-located GEO satellites.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
