---
description: "面向模型的对地观测工具：GeoTIFF 与图像光谱指数、基于 Otsu 阈值和连通区域的变化检测，以及带分块推理的可选 ONNX 旋转目标检测。"
kind: "package-reference"
---

# @astro-one/tool-remote-sensing

[English](README.md) | 中文

## 概述

`astro-one-tool-remote-sensing` 让模型分析工作区中的卫星与航空影像。`rs_spectral_index` 计算 NDVI、NDWI、MNDWI、NDBI、NBR、NDRE、NDSI、EVI 或 SAVI，并给出统计量、直方图与分类面积比例。`rs_change_detect` 以变化矢量模或指数差比较两幅已配准影像，用 Otsu 方法取阈值，并报告最大的变化区域。当部署配置了导出为 ONNX 的 YOLO 旋转边界框模型时，`rs_detect_objects` 还会通过重叠分块在大幅影像中查找船只、飞机、车辆或其他已训练类别。栅格可以是带地理参考的 GeoTIFF 或云优化 GeoTIFF，也可以是 PNG、JPEG 与 WebP；文件通过 `ctx.fs` 读取。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

启用 [`@astro-one/aerospace`](../../bundle/aerospace/README.zh.md) bundle，或在提供 `ctx.tools` 与 `ctx.fs` 的组合中挂载本包。

### 何时选择

需要基于 Sentinel-2、Landsat 等多光谱产品进行植被、水体、建成区、火烧或积雪制图，需要前后时相变化评估，或在配置检测模型后需要在高分辨率影像中统计和定位目标时，选择本包。

### 最小配置

```yaml
- name: '@astro-one/tool-remote-sensing'
  config:
    maxFileBytes: 268435456
    maxPixels: 25000000
    maxResults: 100
```

| 字段 | Bundle 取值 | 含义 |
|---|---|---|
| `maxFileBytes` | `268435456` | 读取的栅格文件大小上限 |
| `maxPixels` | `25000000` | 解码的宽 × 高上限 |
| `maxResults` | `100` | 返回的变化区域或检测结果数量上限 |
| `detector` | 未设置 | 可选的 `{ modelPath, inputSize, classNames }`；设置后注册 `rs_detect_objects` |

生成的[配置目录](../../../docs/config-catalog.zh.md#astro-onetool-remote-sensing)列出了各项声明。

<a id="enable-object-detection"></a>
### 启用目标检测

把 YOLO OBB 模型导出为 ONNX（例如在 DOTA 上训练的模型，执行 `yolo export model=yolo11n-obb.pt format=onnx`），并在 `$ASTRO_ONE_HOME/profiles/<profile>/cordis.patch.yml` 中覆盖 bundle 行。覆盖会替换整个条目配置，因此需要重复写出各项上限：

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

`modelPath` 为相对路径或不存在、或 `classNames` 为空时，插件加载失败。ONNX 会话在第一次调用时加载，并在插件卸载时释放。本包不附带任何模型权重。

### 工具

```text
rs_spectral_index({ index: 'ndvi', path: 'S2_L2A.tif', bands: { red: 4, nir: 8 }, scale: 0.0001, offset: -0.1, class_breaks: [0.2, 0.5] })
rs_change_detect({ method: 'index', index: 'nbr', before_path: 'pre.tif', after_path: 'post.tif', bands: { nir: 1, swir2: 2 } })
rs_detect_objects({ path: 'harbor.tif', classes: ['ship'], confidence: 0.3 })
```

### 失败与恢复

缺失波段、影像尺寸不一致、格式不受支持、影像过大与未知类别名会变成 `Error: <message>` 结果，例如 `Error: bands.nir is required (one-based band number)` 或 `Error: the images differ in size (…); co-register them first`。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

每个波段都解码为 `Float32Array`；反射率为 `DN × scale + offset`，无数据像素与分母为零处变为 NaN 并从统计中排除。检测把每个分块 letterbox 到模型输入尺寸，解码 Ultralytics OBB 输出（`[1, 4 + classes + 1, anchors]`），过滤请求的类别，把边界框映射回影像像素，并用精确的旋转矩形 IoU（Sutherland–Hodgman 多边形裁剪）进行按类别非极大值抑制来合并分块。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口、配置、工具定义、检测器生命周期 |
| [`src/raster.ts`](src/raster.ts) | 通过 geotiff.js 解码 GeoTIFF，通过 sharp 解码图像 |
| [`src/analysis.ts`](src/analysis.ts) | 光谱指数、统计量、直方图、Otsu 阈值、8 连通区域 |
| [`src/detect.ts`](src/detect.ts) | 分块、letterbox、OBB 解码、旋转 IoU、非极大值抑制 |
| [`src/onnx.ts`](src/onnx.ts) | 检测器接口背后的 ONNX Runtime CPU 会话 |
| — | 不发布运行时不变式伴生入口；唯一的状态是检测器会话，其释放是插件 effect。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [航天子系统](../../../docs/subsystems/aerospace.zh.md)——指数公式与算法来源。
- [生成的工具目录](../../../docs/tool-catalog.zh.md#astro-onetool-remote-sensing)——始终注册的工具的精确 schema。
- [文件系统子系统](../../../docs/subsystems/filesystem.zh.md)——这些工具读取文件所经过的 `ctx.fs` seam。

-----

<a id="model-experience"></a>
## 模型体验

### 工具 schema

#### 模型看到的内容

模型看到生成的 [`rs_spectral_index` 与 `rs_change_detect` schema](../../../docs/tool-catalog.zh.md#astro-onetool-remote-sensing)。配置检测器后，模型还会看到 `rs_detect_objects`，其描述列出配置的类别名称与默认分块尺寸。

#### Token 影响

两个 schema 增加固定开销；检测器增加第三个 schema，其长度随类别列表增长。

#### KV Cache 影响

插件配置与定义不变时前缀稳定；添加或更改检测器，或加载、卸载插件，都会从第一个变化的 schema token 起使复用失效。

### 分析与检测结果

#### 模型看到的内容

每个结果是一个 JSON 对象，包含影像尺寸、统计量或检测结果，以及值为 `{ epsg, units, pixel_size, bbox }` 或 `null` 的 `georeference`。当找到的条目多于 `maxResults` 时，`regions_truncated` 与 `detections_truncated` 会报告截断。失败为 `Error: <message>`。

#### Token 影响

`maxResults` 限制区域与检测结果数量；直方图大小取决于 `histogram_bins`。

#### KV Cache 影响

仅追加；新可见内容位于可复用请求前缀之后，不会使已有 KV-cache 条目失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **整幅影像解码到内存**——不使用 COG 金字塔与窗口读取，因此 `maxPixels` 必须符合 Host 内存预算（每个波段每像素 4 字节）。
- **不做重投影或重采样**——多文件输入与前后时相输入必须位于同一网格；工具报告尺寸不一致，而不会进行几何变换。
- **仅 CPU 推理**——ONNX Runtime 使用 CPU 执行提供方；全分辨率大场景需要数秒到数分钟。
- **不输出栅格**——结果包含数值、边界框与坐标；工具不写出指数影像、变化掩膜或标注影像。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
