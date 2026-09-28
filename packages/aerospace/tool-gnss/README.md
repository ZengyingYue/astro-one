---
description: "Model-facing GNSS tools over RINEX 3 files: single-point positioning with RAIM, RTK with LAMBDA ambiguity resolution, and satellite visibility and DOP planning for GPS, Galileo, and BeiDou."
kind: "package-reference"
---

# @astro-one/tool-gnss

English | [中文](README.zh.md)

## Summary

`astro-one-tool-gnss` lets models compute receiver positions from RINEX 3 observation and navigation files in the workspace. `gnss_position` runs single-point positioning (SPP) with Klobuchar ionosphere and Saastamoinen troposphere corrections and RAIM fault exclusion, or short-baseline carrier-phase RTK with LAMBDA integer ambiguity resolution against a base station. `gnss_visibility` plans observations by listing visible satellites and dilution of precision for a station and time window. The tools support GPS, Galileo, and BeiDou broadcast ephemerides and read files through `ctx.fs`, so sandbox and workspace rules apply.

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

Choose this package when a user has raw GNSS receiver data and wants a position solution, a quality assessment (fix rate, scatter, DOP, excluded satellites), or a visibility forecast from a broadcast navigation file.

### Minimal configuration

```yaml
- name: '@astro-one/tool-gnss'
  config:
    maxFileBytes: 268435456
    maxEpochs: 86400
    maxReportedEpochs: 50
```

| Field | Bundle value | Meaning |
|---|---|---|
| `maxFileBytes` | `268435456` | Largest RINEX file read; a larger file fails with `FS_TOO_LARGE` |
| `maxEpochs` | `86400` | Observation epochs processed per file, and visibility steps per call |
| `maxReportedEpochs` | `50` | Per-epoch rows returned to the model; summaries still cover every processed epoch |

The generated [configuration catalog](../../../docs/config-catalog.md#astro-onetool-gnss) lists the declarations.

### Tools

```text
gnss_position({ rover_obs_path: 'data/rover.25o', nav_path: 'data/brdc.25p' })
gnss_position({ mode: 'rtk', rover_obs_path: 'rover.25o', base_obs_path: 'base.25o', nav_path: 'brdc.25p',
  base_position_m: [-2148744.3, 4426641.2, 4044655.9] })
gnss_visibility({ nav_path: 'brdc.25p', station: { lat_deg: 30.5, lon_deg: 114.3, alt_km: 0.03 },
  start: '2025-03-01T00:00:00Z', end: '2025-03-01T06:00:00Z' })
```

`gnss_position` returns the mean position (ECEF, latitude, longitude, ellipsoidal height), east/north/up standard deviations, fix rate and baseline length for RTK, mean PDOP, RAIM exclusions, and the first `maxReportedEpochs` epoch rows. `gnss_visibility` returns satellite azimuth/elevation and GDOP/PDOP/HDOP/VDOP per step.

### Failures and recovery

Missing files, non-RINEX-3 content, and unsolvable data become `Error: <message>` results, for example `Error: no epoch had enough satellites with usable code and ephemeris for a solution` or `Error: mode=rtk needs base_obs_path and base_position_m`. The model can pick other files, constellations, or an elevation mask and call again.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

SPP solves weighted least squares for position and one receiver clock per constellation, weighting by elevation, and applies RAIM chi-square fault detection with single-satellite exclusion. RTK forms double differences against a reference satellite per constellation, estimates baseline and float ambiguities with an extended Kalman filter, and fixes integers with MLAMBDA; a fix is accepted when the ratio of the second-best to best residual norm reaches `ratio_threshold`.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry, tool definitions, and result summaries |
| [`src/rinex.ts`](src/rinex.ts) | RINEX 3 navigation and observation parsing |
| [`src/broadcast.ts`](src/broadcast.ts) | GPS, Galileo, and BeiDou (including GEO) broadcast orbit and clock evaluation |
| [`src/spp.ts`](src/spp.ts) | Klobuchar, Saastamoinen, SPP least squares, RAIM, DOP |
| [`src/lambda.ts`](src/lambda.ts) | LAMBDA decorrelation and MLAMBDA integer search |
| [`src/rtk.ts`](src/rtk.ts) | Double-difference RTK filter and ratio-test validation |
| [`src/files.ts`](src/files.ts) | Bounded workspace reads through `ctx.fs` |
| — | No runtime invariant companion is published; these stateless tools own no event stream or shared mutable state. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Aerospace subsystem](../../../docs/subsystems/aerospace.md) — algorithm sources and conventions.
- [Generated tool catalog](../../../docs/tool-catalog.md#astro-onetool-gnss) — the exact `gnss_position` and `gnss_visibility` schemas.
- [Filesystem subsystem](../../../docs/subsystems/filesystem.md) — the `ctx.fs` seam these tools read through.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schemas

#### What the model sees

The model sees the generated [`gnss_position` and `gnss_visibility` schemas](../../../docs/tool-catalog.md#astro-onetool-gnss). File-size and epoch bounds are deployment settings, not model arguments.

#### Token effect

Two schemas add a fixed cost to every request while the plugin is loaded.

#### KV Cache effect

Prefix-stable while the plugin stays loaded and the definitions are unchanged; loading or unloading the plugin invalidates reuse from the first changed schema token.

### Positioning and visibility results

#### What the model sees

Each result is one JSON object; `gnss_position` sets `epochs_truncated` to `true` when more epochs were solved than `maxReportedEpochs` rows returned. Failures are `Error: <message>`.

#### Token effect

`maxReportedEpochs` bounds position rows; visibility results grow with the step count and the visible satellites per step.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Broadcast ephemerides and single-frequency code only** — there is no precise-orbit (SP3/CLK) support, no GLONASS, and no dual-frequency ionosphere-free combination, so SPP accuracy is metre-level.
- **Short-baseline RTK** — double differences ignore residual ionosphere and troposphere, so fixing degrades beyond about 10 km. Cycle slips are detected only from the receiver loss-of-lock indicator, which resets the affected ambiguity; there is no geometry-free or Doppler slip detection.
- **Epoch bound is silent per file** — an observation file with more than `maxEpochs` epochs is processed up to that count; `epochs_processed` reports how many were used.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
