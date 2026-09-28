---
description: "基于 RINEX 3 文件的面向模型 GNSS 工具：带 RAIM 的单点定位、带 LAMBDA 模糊度固定的 RTK，以及 GPS、Galileo 与北斗的卫星可见性与 DOP 规划。"
kind: "package-reference"
---

# @astro-one/tool-gnss

[English](README.md) | 中文

## 概述

`astro-one-tool-gnss` 让模型由工作区中的 RINEX 3 观测文件与导航文件计算接收机位置。`gnss_position` 运行带 Klobuchar 电离层与 Saastamoinen 对流层改正及 RAIM 故障排除的单点定位（SPP），或相对基准站运行带 LAMBDA 整周模糊度固定的短基线载波相位 RTK。`gnss_visibility` 为测站与时间窗口列出可见卫星与精度衰减因子，用于规划观测。工具支持 GPS、Galileo 与北斗广播星历，并通过 `ctx.fs` 读取文件，因此沙箱与工作区规则同样适用。

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

当用户持有原始 GNSS 接收机数据，并需要定位解、质量评估（固定率、离散度、DOP、被排除卫星）或基于广播导航文件的可见性预报时选择本包。

### 最小配置

```yaml
- name: '@astro-one/tool-gnss'
  config:
    maxFileBytes: 268435456
    maxEpochs: 86400
    maxReportedEpochs: 50
```

| 字段 | Bundle 取值 | 含义 |
|---|---|---|
| `maxFileBytes` | `268435456` | 读取的 RINEX 文件大小上限；更大的文件以 `FS_TOO_LARGE` 失败 |
| `maxEpochs` | `86400` | 每个文件处理的观测历元数，以及每次调用的可见性步数 |
| `maxReportedEpochs` | `50` | 返回给模型的逐历元行数；摘要仍覆盖每个已处理的历元 |

生成的[配置目录](../../../docs/config-catalog.zh.md#astro-onetool-gnss)列出了各项声明。

### 工具

```text
gnss_position({ rover_obs_path: 'data/rover.25o', nav_path: 'data/brdc.25p' })
gnss_position({ mode: 'rtk', rover_obs_path: 'rover.25o', base_obs_path: 'base.25o', nav_path: 'brdc.25p',
  base_position_m: [-2148744.3, 4426641.2, 4044655.9] })
gnss_visibility({ nav_path: 'brdc.25p', station: { lat_deg: 30.5, lon_deg: 114.3, alt_km: 0.03 },
  start: '2025-03-01T00:00:00Z', end: '2025-03-01T06:00:00Z' })
```

`gnss_position` 返回平均位置（ECEF、纬度、经度、椭球高）、东/北/天标准差、RTK 的固定率与基线长度、平均 PDOP、RAIM 排除项，以及前 `maxReportedEpochs` 个历元行。`gnss_visibility` 返回每一步的卫星方位角/仰角与 GDOP/PDOP/HDOP/VDOP。

### 失败与恢复

文件缺失、非 RINEX 3 内容与无法求解的数据会变成 `Error: <message>` 结果，例如 `Error: no epoch had enough satellites with usable code and ephemeris for a solution` 或 `Error: mode=rtk needs base_obs_path and base_position_m`。模型可以改选文件、星座或高度截止角后再次调用。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

SPP 以加权最小二乘求解位置与每个星座一个的接收机钟差，按高度角加权，并用卡方 RAIM 进行故障检测与单星排除。RTK 在每个星座内相对参考卫星构成双差，用扩展卡尔曼滤波估计基线与浮点模糊度，并用 MLAMBDA 固定整数；当次优与最优残差范数之比达到 `ratio_threshold` 时接受固定解。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口、工具定义与结果摘要 |
| [`src/rinex.ts`](src/rinex.ts) | RINEX 3 导航与观测文件解析 |
| [`src/broadcast.ts`](src/broadcast.ts) | GPS、Galileo 与北斗（含 GEO）广播轨道与钟差计算 |
| [`src/spp.ts`](src/spp.ts) | Klobuchar、Saastamoinen、SPP 最小二乘、RAIM、DOP |
| [`src/lambda.ts`](src/lambda.ts) | LAMBDA 降相关与 MLAMBDA 整数搜索 |
| [`src/rtk.ts`](src/rtk.ts) | 双差 RTK 滤波与 ratio 检验 |
| [`src/files.ts`](src/files.ts) | 通过 `ctx.fs` 进行有界的工作区读取 |
| — | 不发布运行时不变式伴生入口；这些无状态工具不拥有事件流或共享可变状态。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [航天子系统](../../../docs/subsystems/aerospace.zh.md)——算法来源与约定。
- [生成的工具目录](../../../docs/tool-catalog.zh.md#astro-onetool-gnss)——`gnss_position` 与 `gnss_visibility` 的精确 schema。
- [文件系统子系统](../../../docs/subsystems/filesystem.zh.md)——这些工具读取文件所经过的 `ctx.fs` seam。

-----

<a id="model-experience"></a>
## 模型体验

### 工具 schema

#### 模型看到的内容

模型看到生成的 [`gnss_position` 与 `gnss_visibility` schema](../../../docs/tool-catalog.zh.md#astro-onetool-gnss)。文件大小与历元上限是部署设置，不是模型参数。

#### Token 影响

插件加载期间，两个 schema 为每个请求增加固定开销。

#### KV Cache 影响

插件保持加载且定义不变时前缀稳定；加载或卸载插件会从第一个变化的 schema token 起使复用失效。

### 定位与可见性结果

#### 模型看到的内容

每个结果是一个 JSON 对象；当已求解的历元多于返回的 `maxReportedEpochs` 行时，`gnss_position` 把 `epochs_truncated` 设为 `true`。失败为 `Error: <message>`。

#### Token 影响

`maxReportedEpochs` 限制定位行数；可见性结果随步数与每步可见卫星数增长。

#### KV Cache 影响

仅追加；新可见内容位于可复用请求前缀之后，不会使已有 KV-cache 条目失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **仅广播星历与单频伪距**——不支持精密轨道（SP3/CLK）、GLONASS 与双频无电离层组合，因此 SPP 精度为米级。
- **短基线 RTK**——双差忽略残余电离层与对流层，因此基线超过约 10 km 时固定能力下降。周跳仅由接收机失锁指示检测，并重置受影响的模糊度；没有无几何或多普勒周跳检测。
- **每个文件的历元上限不报错**——历元数超过 `maxEpochs` 的观测文件只处理到该数量；`epochs_processed` 报告实际使用的历元数。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
