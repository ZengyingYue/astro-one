---
description: "Astrodynamics and spacecraft-attitude algorithm library: time scales, reference frames, SGP4 and numerical propagation, Lambert, orbit determination, conjunction probability, and attitude determination."
kind: "package-reference"
---

# @astro-one/astrodynamics

English | [中文](README.zh.md)

## Summary

`astro-one-astrodynamics` is the pure-TypeScript algorithm library behind the aerospace tools. It converts between UTC, TAI, TT, and GPS time; transforms states between GCRF, TEME, ITRF, and geodetic coordinates; propagates orbits with SGP4, Kepler, or an RKF7(8) special-perturbation integrator; solves Lambert problems; determines orbits from tracking data; computes conjunction probability; and solves Wahba's attitude problem. Distances are km, velocities km/s, angles radians, and instants UTC milliseconds since the Unix epoch. The library registers nothing into a composition.

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

### When to use it

Use the library from Host code that needs orbit mechanics without the model-facing validation and rendering of [`astro-one-tool-astrodynamics`](../tool-astrodynamics/README.md). Every function is synchronous and deterministic; invalid geometry, SGP4 decay, and non-convergence throw an `Error` with a readable message.

### Entry point

Propagate a TLE with SGP4, convert the result to GCRF, and solve a Lambert arc:

```ts
import { parseTle, parseUtc, propagateSgp4, solveLambert, temeToGcrf } from '@astro-one/astrodynamics'

const elements = parseTle(
  '1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753',
  '2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667',
)
const [teme] = propagateSgp4(elements, [parseUtc('2000-06-28T00:00:00Z')])
if (teme !== undefined) console.log(temeToGcrf(teme, teme.t).r)

const [arc] = solveLambert([15945.34, 0, 0], [12214.83899, 10249.46731, 0], 76 * 60)
console.log(arc?.v1)
```

See [`src/index.ts`](src/index.ts) for the complete export list.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [aerospace subsystem page](../../../docs/subsystems/aerospace.md) lists the published source of every algorithm and the frame conventions.

### Source map

| File | Role |
|---|---|
| [`src/time.ts`](src/time.ts) | UTC parsing and formatting, leap seconds, TT, Julian dates, IAU-82 sidereal time |
| [`src/frames.ts`](src/frames.ts) | IAU-76 precession, IAU-80 nutation, polar motion, TEME/GCRF/ITRF, geodetic, ENU, look angles, RTN |
| [`src/kepler.ts`](src/kepler.ts) | Classical elements, Kepler's equation, universal-variable propagation |
| [`src/sgp4.ts`](src/sgp4.ts) | TLE and CCSDS OMM parsing and SGP4/SDP4 through satellite.js |
| [`src/forces.ts`](src/forces.ts), [`src/ephemeris.ts`](src/ephemeris.ts) | J2–J6 zonals, exponential drag, solar radiation pressure with conical shadow, Sun/Moon gravity and low-precision ephemerides |
| [`src/integrator.ts`](src/integrator.ts), [`src/propagate.ts`](src/propagate.ts) | RKF7(8) adaptive integrator with dense output and numerical/two-body propagation |
| [`src/lambert.ts`](src/lambert.ts) | Izzo Lambert solver with multi-revolution branches |
| [`src/iod.ts`](src/iod.ts) | Gibbs, Herrick–Gibbs, and Gauss angles-only initial orbit determination |
| [`src/measurements.ts`](src/measurements.ts), [`src/od.ts`](src/od.ts) | Measurement models, batch least squares with outlier editing, unscented Kalman filter |
| [`src/conjunction.ts`](src/conjunction.ts) | Close-approach search, RTN covariance, Foster 2D collision probability, Alfano maximum |
| [`src/passes.ts`](src/passes.ts) | Ground-station rise/culmination/set search with Sun illumination |
| [`src/attitude.ts`](src/attitude.ts) | TRIAD, Davenport q-method, and QUEST with attitude error covariance |
| [`src/maneuver.ts`](src/maneuver.ts) | Hohmann, bi-elliptic, and plane-change Δv |
| — | No runtime invariant companion is published because this pure library owns no event stream or shared mutable state; unit tests cover each algorithm against published reference cases. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Aerospace package map](../README.md) — the tool packages that consume this library.
- [Aerospace subsystem](../../../docs/subsystems/aerospace.md) — units, frames, and algorithm sources.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `@astro-one/tool-astrodynamics`, which validates model arguments and renders library results.

#### KV Cache effect

None; the library adds no prompt, schema, or result text of its own.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Reduced-precision Earth orientation** — nutation keeps the leading IAU-1980 terms (truncation below 0.02″) and GCRF is treated as the J2000 mean equator without the frame bias of about 0.02″. Without supplied EOP, UT1 equals UTC, which can misplace Earth-fixed positions by up to about 400 m at the equator, and polar motion is zero, about 15 m at the surface.
- **Zonal gravity and exponential atmosphere only** — the force model has no tesseral harmonics, no NRLMSISE-00 or Jacchia atmosphere, and no solid tides, so numerical propagation over days is suitable for planning, not precision orbit determination.
- **The leap-second table is compiled in** — instants after the last table entry use the final TAI−UTC value until the table is updated.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
