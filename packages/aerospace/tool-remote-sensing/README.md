---
description: "Model-facing Earth-observation tools: GeoTIFF and image spectral indices, change detection with Otsu thresholding and connected regions, and optional ONNX oriented-object detection with tiled inference."
kind: "package-reference"
---

# @astro-one/tool-remote-sensing

English | [中文](README.zh.md)

## Summary

`astro-one-tool-remote-sensing` lets models analyse satellite and aerial imagery in the workspace. `rs_spectral_index` computes NDVI, NDWI, MNDWI, NDBI, NBR, NDRE, NDSI, EVI, or SAVI with statistics, a histogram, and class-area fractions. `rs_change_detect` compares two co-registered images by change-vector magnitude or index difference, thresholds them with Otsu's method, and reports the largest changed regions. When a deployment configures a YOLO oriented-bounding-box model exported to ONNX, `rs_detect_objects` also finds ships, planes, vehicles, or other trained classes in large images through overlapping tiles. Rasters are GeoTIFF or Cloud-Optimized GeoTIFF with georeferencing, or PNG, JPEG, and WebP; files are read through `ctx.fs`.

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

Choose this package for vegetation, water, built-up, burn, or snow mapping from multispectral products such as Sentinel-2 and Landsat; for before/after change assessment; and, with a detector model, for counting and locating objects in high-resolution imagery.

### Minimal configuration

```yaml
- name: '@astro-one/tool-remote-sensing'
  config:
    maxFileBytes: 268435456
    maxPixels: 25000000
    maxResults: 100
```

| Field | Bundle value | Meaning |
|---|---|---|
| `maxFileBytes` | `268435456` | Largest raster file read |
| `maxPixels` | `25000000` | Largest width × height decoded |
| `maxResults` | `100` | Largest number of change regions or detections returned |
| `detector` | unset | Optional `{ modelPath, inputSize, classNames }`; registers `rs_detect_objects` |

The generated [configuration catalog](../../../docs/config-catalog.md#astro-onetool-remote-sensing) lists the declarations.

<a id="enable-object-detection"></a>
### Enable object detection

Export a YOLO OBB model to ONNX (for example `yolo export model=yolo11n-obb.pt format=onnx`, trained on DOTA) and override the bundle row in `$ASTRO_ONE_HOME/profiles/<profile>/cordis.patch.yml`. The override replaces the complete entry config, so repeat the bounds:

```yaml
- id: tool-remote-sensing
  config:
    maxFileBytes: 268435456
    maxPixels: 25000000
    maxResults: 100
    detector:
      modelPath: /opt/models/yolo11n-obb.onnx
      inputSize: 1024
      classNames: [plane, ship, storage tank, baseball diamond, tennis court, basketball court, ground track field, harbor, bridge, large vehicle, small vehicle, helicopter, roundabout, soccer ball field, swimming pool]
```

A relative or missing `modelPath` or an empty `classNames` fails plugin load. The ONNX session loads on the first call and is released when the plugin unloads. No model weights ship with the package.

### Tools

```text
rs_spectral_index({ index: 'ndvi', path: 'S2_L2A.tif', bands: { red: 4, nir: 8 }, scale: 0.0001, offset: -0.1, class_breaks: [0.2, 0.5] })
rs_change_detect({ method: 'index', index: 'nbr', before_path: 'pre.tif', after_path: 'post.tif', bands: { nir: 1, swir2: 2 } })
rs_detect_objects({ path: 'harbor.tif', classes: ['ship'], confidence: 0.3 })
```

### Failures and recovery

Missing bands, mismatched image sizes, unsupported formats, oversize images, and unknown class names become `Error: <message>` results such as `Error: bands.nir is required (one-based band number)` or `Error: the images differ in size (…); co-register them first`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Every band decodes to a `Float32Array`; reflectance is `DN × scale + offset`, and no-data pixels and vanishing denominators become NaN and are excluded from statistics. Detection letterboxes each tile to the model input, decodes Ultralytics OBB outputs (`[1, 4 + classes + 1, anchors]`), filters requested classes, maps boxes back to image pixels, and merges tiles with class-wise non-maximum suppression using exact rotated-rectangle IoU (Sutherland–Hodgman polygon clipping).

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry, config, tool definitions, detector lifecycle |
| [`src/raster.ts`](src/raster.ts) | GeoTIFF decoding through geotiff.js and image decoding through sharp |
| [`src/analysis.ts`](src/analysis.ts) | Spectral indices, statistics, histogram, Otsu threshold, 8-connected regions |
| [`src/detect.ts`](src/detect.ts) | Tiling, letterbox, OBB decoding, rotated IoU, non-maximum suppression |
| [`src/onnx.ts`](src/onnx.ts) | ONNX Runtime CPU session behind the detector interface |
| — | No runtime invariant companion is published; the only state is the detector session, whose release is a plugin effect. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Aerospace subsystem](../../../docs/subsystems/aerospace.md) — index formulas and algorithm sources.
- [Generated tool catalog](../../../docs/tool-catalog.md#astro-onetool-remote-sensing) — the exact schemas of the always-registered tools.
- [Filesystem subsystem](../../../docs/subsystems/filesystem.md) — the `ctx.fs` seam these tools read through.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schemas

#### What the model sees

The model sees the generated [`rs_spectral_index` and `rs_change_detect` schemas](../../../docs/tool-catalog.md#astro-onetool-remote-sensing). With a configured detector it also sees `rs_detect_objects`, whose description lists the configured class names and default tile size.

#### Token effect

Two schemas add a fixed cost; the detector adds a third whose length grows with the class list.

#### KV Cache effect

Prefix-stable while the plugin config and definitions are unchanged; adding or changing the detector, or loading or unloading the plugin, invalidates reuse from the first changed schema token.

### Analysis and detection results

#### What the model sees

Each result is one JSON object with the image size, statistics or detections, and a `georeference` of `{ epsg, units, pixel_size, bbox }` or `null`. `regions_truncated` and `detections_truncated` report when more than `maxResults` items were found. Failures are `Error: <message>`.

#### Token effect

`maxResults` bounds regions and detections; histogram size follows `histogram_bins`.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Whole images decode into memory** — COG overviews and windowed reads are not used, so `maxPixels` must fit the Host memory budget (4 bytes per pixel per band).
- **No reprojection or resampling** — multi-file and before/after inputs must share one grid; the tools report a size mismatch instead of warping.
- **CPU inference only** — ONNX Runtime runs on the CPU execution provider; large scenes at full resolution take seconds to minutes.
- **No raster outputs** — results carry numbers, bounding boxes, and coordinates; the tools write no index image, change mask, or annotated image.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
