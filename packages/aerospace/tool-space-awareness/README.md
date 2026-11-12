---
description: "Model-facing space-object awareness tools: catalog queries and conjunction screening, observation-to-object correlation, maneuver detection, optical observing windows and brightness, light-curve periods, orbital decay, and TLE fitting."
kind: "package-reference"
---

# @astro-one/tool-space-awareness

English | [中文](README.zh.md)

## Summary

`astro-one-tool-space-awareness` gives models the space-object awareness workflow over SGP4 element-set catalogs: find and classify objects, screen one object against a whole catalog for close approaches, identify which catalog object a tracklet belongs to, detect maneuvers in an element-set history, plan optical observations with predicted brightness, estimate spin periods from light curves, predict orbital decay and re-entry, and fit a TLE to a determined orbit so it can enter a catalog. Catalogs are TLE text or CCSDS OMM JSON read through `ctx.fs`, so sandbox and workspace rules apply.

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

Enable the [`@astro-one/aerospace`](../../bundle/aerospace/README.md) bundle, or mount the package in a composition that provides `ctx.tools` and `ctx.fs`.

### When to choose it

Choose this package when a user works with a satellite catalog rather than a single orbit: conjunction screening against all tracked objects, uncorrelated-track processing, maneuver or anomaly monitoring, optical sensor tasking, object characterization, or re-entry prediction. [`astro-one-tool-astrodynamics`](../tool-astrodynamics/README.md) covers single-orbit propagation, determination, and pairwise conjunctions.

### Minimal configuration

```yaml
- name: '@astro-one/tool-space-awareness'
  config:
    maxFileBytes: 268435456
    maxCatalogObjects: 100000
    maxEvaluations: 50000000
    maxObservations: 100000
    maxResults: 100
```

| Field | Bundle value | Meaning |
|---|---|---|
| `maxFileBytes` | `268435456` | Largest catalog or light-curve file read; a larger file fails with `FS_TOO_LARGE` |
| `maxCatalogObjects` | `100000` | Entries parsed from one catalog file |
| `maxEvaluations` | `50000000` | SGP4, photometric, or drag-model evaluations one call may plan; a larger request fails before computing |
| `maxObservations` | `100000` | Observations, light-curve points, ephemeris rows, or element sets per call |
| `maxResults` | `100` | Result rows returned to the model; `more_*` fields count the rest |

The generated [configuration catalog](../../../docs/config-catalog.md#astro-onetool-space-awareness) lists the declarations.

### Tools

```text
ssa_catalog_query({ catalog_path: 'active.txt', regimes: ['GEO'], sort_by: 'perigee_alt_km' })
ssa_catalog_screen({ catalog_path: 'active.txt', primary: { catalog_number: '25544' },
  start: '2025-03-01T00:00:00Z', end: '2025-03-02T00:00:00Z' })
ssa_correlate({ catalog_path: 'active.txt', observations: [...], max_time_bias_s: 120 })
ssa_maneuver_detect({ history_path: 'sat-history.txt' })
ssa_optical_windows({ object: { line1, line2 }, station: { lat_deg: 40, lon_deg: 116, alt_km: 0.05 },
  start: '2025-03-01T00:00:00Z', end: '2025-03-03T00:00:00Z', standard_magnitude: -1.8 })
ssa_lightcurve({ path: 'photometry.csv' })
ssa_decay({ object: { line1, line2 } })
ssa_tle_fit({ ephemeris: [...], catalog_number: '99001' })
```

| Tool | Answers |
|---|---|
| `ssa_catalog_query` | Which objects match a regime, name, number, or altitude/inclination band; per-class counts; GEO longitude and drift |
| `ssa_catalog_screen` | Which catalog objects pass within a distance of one primary, when, how fast, and with what maximum collision probability |
| `ssa_correlate` | Which catalog object explains a tracklet, with residual RMS and along-track timing bias, or that the track is uncorrelated |
| `ssa_maneuver_detect` | When an object changed its semi-major axis or orbit plane, and the Δv that implies |
| `ssa_optical_windows` | When a telescope can see an object, where to point, how bright it is, and how fast it moves |
| `ssa_lightcurve` | The photometric period, its significance, and whether the rotation period is its double |
| `ssa_decay` | When drag brings the perigee to re-entry altitude, with an early/late band for density uncertainty |
| `ssa_tle_fit` | A TLE and OMM that reproduce an ephemeris under SGP4, with the fit error |

### Failures and recovery

Missing or malformed files, invalid arguments, and requests over a bound become `Error: <message>` results, for example `Error: primary.catalog_number 25544 is not in the catalog` or `Error: this request needs about 61000000 model evaluations; at most 50000000 are allowed (increase step_s, shorten the window, or lower filter_pad_km)`. Catalog entries that fail to parse are skipped (`ssa_catalog_query` counts them in `rejected_entries`), and secondaries that decay during a screening window are listed in `propagation_failures`; neither fails the call.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Every tool evaluates element sets with SGP4 from [`astro-one-astrodynamics`](../astrodynamics/README.md). Catalog screening applies the Hoots apogee/perigee filter, samples each remaining pair on a uniform grid, skips grid steps whose separation lower bound (endpoint distance minus relative travel) exceeds the screening distance, and refines time of closest approach by bisection on the range rate. Correlation scores each element set by chi-square over the tracklet; the optional timing bias is a 21-point scan for every object followed by golden-section refinement for the ranked candidates. Maneuver detection removes the median semi-major axis decay rate and flags robust z-score outliers. Decay integrates orbit-averaged drag equations with fourth-order Runge–Kutta steps that bound the perigee change. TLE fitting runs Levenberg–Marquardt on equinoctial mean elements with finite-difference partials through SGP4.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry and Config |
| [`src/catalog.ts`](src/catalog.ts) | TLE and OMM catalog parsing, bounded reads, ESA orbit classes, GEO longitude and drift |
| [`src/screening.ts`](src/screening.ts) | Apogee/perigee filter, grid time filter, TCA refinement |
| [`src/correlation.ts`](src/correlation.ts) | Tracklet residuals, chi-square, timing-bias scan and refinement |
| [`src/maneuvers.ts`](src/maneuvers.ts) | Interval element changes, robust statistics, Δv estimates |
| [`src/photometry.ts`](src/photometry.ts) | Diffuse-sphere magnitude, air mass, observing constraints, window search |
| [`src/lightcurve.ts`](src/lightcurve.ts) | Generalized Lomb–Scargle, false-alarm probability, phase dispersion minimization |
| [`src/decay.ts`](src/decay.ts) | Orbit-averaged drag rates and lifetime integration |
| [`src/tle-fit.ts`](src/tle-fit.ts) | Equinoctial elements and SGP4 differential correction |
| [`src/tools/`](src/tools) | One tool definition per file: arguments, bounds, and result rows |
| — | No runtime invariant companion is published; these stateless tools own no event stream or shared mutable state. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Aerospace subsystem](../../../docs/subsystems/aerospace.md) — units, frames, and the published algorithm behind each tool.
- [Generated tool catalog](../../../docs/tool-catalog.md#astro-onetool-space-awareness) — the exact model-facing schemas.
- [Filesystem subsystem](../../../docs/subsystems/filesystem.md) — the `ctx.fs` seam the catalog and light-curve reads go through.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schemas

#### What the model sees

The model sees the eight generated [`ssa_*` schemas](../../../docs/tool-catalog.md#astro-onetool-space-awareness). File, catalog, evaluation, and row bounds are deployment settings, not model arguments.

#### Token effect

Eight schemas add a fixed cost to every request while the plugin is loaded.

#### KV Cache effect

Prefix-stable while the plugin stays loaded and the definitions are unchanged; loading or unloading the plugin invalidates reuse from the first changed schema token.

### Analysis results

#### What the model sees

Each result is one JSON object. Row lists stop at `maxResults` and report the remainder in `more_approaches`, `more_events`, or `more_windows`; `ssa_catalog_screen` and `ssa_optical_windows` report an empty result as one sentence. Failures are `Error: <message>`.

#### Token effect

`maxResults` bounds every row list, so results stay a few kilobytes even for full catalogs.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **SGP4 accuracy bounds every result** — catalog element sets carry kilometre-level errors that grow with age, so screening reports candidates for refinement, not collision decisions, and collision probability needs user-supplied covariance.
- **Static atmosphere** — decay uses a solar-activity-independent exponential atmosphere; the early/late band, not the nominal date, is the meaningful output for long lifetimes.
- **Diffuse-sphere brightness** — specular glints, attitude-dependent shapes, and Earth-shine are not modeled.
- **One primary per screen** — all-against-all catalog screening is a loop of calls.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
