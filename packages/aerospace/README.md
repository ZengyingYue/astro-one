---
description: "Package map for the aerospace family: the astrodynamics algorithm library and the model-facing orbit, GNSS, and remote-sensing tools."
kind: "package-group"
---

# aerospace/ — aerospace algorithm family

English | [中文](README.zh.md)

## Summary

The `aerospace/` packages give models numerical tools for spaceflight work: orbit propagation and determination, transfer design, ground-station passes, conjunction screening, attitude determination, GNSS positioning from RINEX files, and Earth-observation image analysis. The algorithms run in-process in TypeScript, apart from ONNX Runtime for the optional object detector, and need no network access or external service. The [`@astro-one/aerospace`](../bundle/aerospace/README.md) bundle mounts all three tool packages; shipped profiles leave it disabled.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

Four packages play the aerospace roles; the subsystem reference owns the shared units, frames, and algorithm sources.

| Package | Role | ctx key |
|---|---|---|
| [`astrodynamics/`](astrodynamics/README.md) | Algorithm library: time scales, reference frames, SGP4 and numerical propagation, Lambert, orbit determination, conjunction probability, attitude | none (library) |
| [`tool-astrodynamics/`](tool-astrodynamics/README.md) | Exposes the `orbit_*` tools and `attitude_determine` to the model | registers on `ctx.tools` |
| [`tool-gnss/`](tool-gnss/README.md) | Exposes `gnss_position` (SPP and RTK) and `gnss_visibility` over RINEX 3 files | registers on `ctx.tools` |
| [`tool-remote-sensing/`](tool-remote-sensing/README.md) | Exposes spectral indices, change detection, and optional ONNX oriented-object detection | registers on `ctx.tools` |

-----

<a id="related-documentation"></a>
## Related documentation

- [Aerospace subsystem](../../docs/subsystems/aerospace.md) — units, time scales, reference frames, and the published algorithm behind each tool.
- [Generated tool catalog](../../docs/tool-catalog.md#astro-onetool-astrodynamics) — the exact model-facing schemas.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
