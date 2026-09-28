# Agent Note: Aerospace tools as an optional in-process bundle

Status: implemented

English | [中文](2026-09-28-aerospace-tool-family.zh.md)

## Problem

Astro One targets spaceflight work, but its models had no numerical tools for it. Answering where a satellite is, when it passes a station, what orbit fits tracking data, where a GNSS receiver is, or what changed between two satellite images required the model to write and run ad hoc code through `bash` or `run_code`. That code had to reinstall libraries, reimplement frames and time scales, and was not reviewed or tested. General-purpose deployments, however, should not pay schema tokens or install-time surprises for tools they never use.

## Decision

Three model-facing tool packages share one algorithm library under [`packages/aerospace/`](../../../../packages/aerospace/README.md). [`@astro-one/astrodynamics`](../../../../packages/aerospace/astrodynamics/README.md) implements time scales, frames, SGP4 (through satellite.js), RKF7(8) special perturbations, Lambert, initial and precise orbit determination, conjunction probability, and attitude determination in TypeScript. `tool-astrodynamics`, `tool-gnss`, and `tool-remote-sensing` add the model-facing tools. Each tool validates arguments at the model boundary, reads files through `ctx.fs`, and renders compact text or JSON.

[`@astro-one/aerospace`](../../../../packages/bundle/aerospace/README.md) inserts the three tool rows with explicit bounds and is listed in `OPTIONAL_BUNDLES`, so the Plugins page offers it switched off. Every numeric bound is a required `Config` field whose values live in the bundle patch.

Object detection runs a user-supplied Ultralytics YOLO-OBB model through ONNX Runtime. The package ships no weights; `rs_detect_objects` registers only when `detector` names an existing absolute model path, and the ONNX session is a plugin effect released on unload.

## Alternatives considered

**Wrap an external engine such as Orekit, GMAT, or RTKLIB.** These are more complete, but they need a JVM, native builds, or a subprocess protocol. They also move failure handling and cancellation outside the tool runtime. A TypeScript port of the needed algorithms keeps every tool in-process, cancellable, and covered at 100%. The algorithms follow published sources, and the subsystem page lists each one.

**Add the tools to `@astro-one/base`.** Every session would then carry ten more schemas, and all users would see aerospace tools. An optional bundle keeps the default product unchanged and uses the existing plugin-manager path for opt-in.

**Ship detection weights.** Pretrained DOTA weights carry their own licences and add tens of megabytes. Their class sets also fit only some imagery. A configured model path lets each deployment choose weights and classes, and the tool description lists the configured class names.

**Python or GDAL-based raster processing.** GDAL would add reprojection and windowed reads but requires a native installation. geotiff.js and sharp cover GeoTIFF, COG, and common image formats inside Node. The missing warping and windowed reads are listed as known limitations.

## Consequences

- Models get validated, tested orbit, GNSS, and Earth-observation tools without writing numerical code; results use fixed units and rounding.
- Accuracy is planning-grade rather than precision-grade: truncated nutation, zonal gravity, exponential atmosphere, broadcast ephemerides, and short-baseline RTK. The package READMEs state each limit.
- Installing the CLI installs `satellite.js`, `geotiff`, `sharp`, and `onnxruntime-node` even while the bundle is disabled.
- The generated tool catalog shows the detector-free schemas; a deployment with a detector also exposes `rs_detect_objects`, whose description varies with its class list.
