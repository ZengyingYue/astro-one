---
description: "基于 astro-one-astrodynamics 的面向模型轨道动力学工具：轨道外推、定轨、转移设计、地面站过境、交会评估、坐标转换与姿态确定。"
kind: "package-reference"
---

# @astro-one/tool-astrodynamics

[English](README.md) | 中文

## 概述

`astro-one-tool-astrodynamics` 为模型提供七个轨道力学工具：`orbit_propagate`、`orbit_determine`、`orbit_transfer`、`orbit_passes`、`orbit_conjunction`、`orbit_convert` 与 `attitude_determine`。模型传入 TLE、CCSDS OMM 记录、状态矢量或开普勒根数以及 ISO 8601 时刻；结果使用 km、km/s 与度。所有计算都通过 [`astro-one-astrodynamics`](../astrodynamics/README.zh.md) 在进程内完成，因此工具不需要网络访问。部署配置限制每次调用的采样数、观测数与数值积分器工作量。

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

启用 [`@astro-one/aerospace`](../../bundle/aerospace/README.zh.md) bundle，或在带有工具运行时的组合中直接挂载本包。

### 何时选择

当模型必须回答定量的航天问题时选择本包：卫星在哪里、何时飞过某个站点、一次转移需要多少 Δv、哪条轨道最符合一组观测、两个目标最近接近到多少，或哪种姿态最符合敏感器矢量。

### 最小配置

```yaml
- name: '@astro-one/tool-astrodynamics'
  config:
    maxSamples: 20000
    maxObservations: 5000
    relativeTolerance: 1.e-11
    absoluteTolerance: 1.e-9
    maxIntegratorSteps: 2000000
```

| 字段 | Bundle 取值 | 含义 |
|---|---|---|
| `maxSamples` | `20000` | 每次调用的星历、过境搜索或交会搜索采样数上限 |
| `maxObservations` | `5000` | `orbit_determine` 接受的观测数上限 |
| `relativeTolerance` | `1e-11` | RKF7(8) 相对误差容限 |
| `absoluteTolerance` | `1e-9` | RKF7(8) 绝对误差容限，单位 km 与 km/s |
| `maxIntegratorSteps` | `2000000` | 每次外推的 RKF7(8) 步数预算 |

每个字段都是必填项；生成的[配置目录](../../../docs/config-catalog.zh.md#astro-onetool-astrodynamics)列出了各项声明。非正的容限会使插件加载失败。

### 工具

| 工具 | 计算内容 |
|---|---|
| `orbit_propagate` | SGP4、数值（J2–J6、阻力、太阳光压、日月引力）或二体星历，输出 GCRF、ITRF、TEME 或大地坐标 |
| `orbit_determine` | Gibbs、Herrick–Gibbs 或 Gauss 初始轨道；由位置、距离、距离变化率、赤经赤纬或方位仰角观测进行带协方差的批处理最小二乘或无迹卡尔曼滤波 |
| `orbit_transfer` | 带多圈分支的 Izzo Lambert 弧段、Hohmann 与双椭圆转移代价、轨道面变更 Δv |
| `orbit_passes` | 地面站的升起、中天与降落时刻，以及观测角与光照 |
| `orbit_conjunction` | 最近接近、RTN 脱靶矢量、Foster 2D 碰撞概率与 Alfano 最大概率 |
| `orbit_convert` | 状态、根数与大地坐标转换；UTC、TT、GPS 时间与恒星时 |
| `attitude_determine` | TRIAD、Davenport q-method 或 QUEST 姿态，附欧拉角与 1-sigma 误差 |

```text
orbit_passes({ source: { kind: 'tle', line1: '1 25544U …', line2: '2 25544 …' }, method: 'sgp4',
  station: { lat_deg: 39.9, lon_deg: 116.4, alt_km: 0.05 }, start: '2025-03-01T00:00:00Z', end: '2025-03-02T00:00:00Z' })
```

### 失败与恢复

参数、几何与收敛问题会变成 `Error: <message>` 结果，例如 `Error: TLE checksum mismatch on line 1`、SGP4 衰减报告，或采样数超过 `maxSamples` 的请求。模型可以修正参数或缩小时间窗口后再次调用。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

每个工具校验 snake_case 参数，把它们转换为库的单位（弧度、UTC 毫秒），调用 [`astro-one-astrodynamics`](../astrodynamics/README.zh.md)，并把结果舍入为可无损表示的 JSON 数字。数值外推在请求窗口上只积分一次，再由已接受步的三次 Hermite 插值计算各采样点。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：配置 schema、容限校验、工具注册 |
| [`src/schema.ts`](src/schema.ts)、[`src/inputs.ts`](src/inputs.ts) | 共享 schema 片段，以及轨道来源、力模型、测站与时间网格的转换 |
| [`src/trajectory.ts`](src/trajectory.ts) | 过境与交会搜索使用的稠密轨迹 |
| [`src/propagate.ts`](src/propagate.ts) | `orbit_propagate` 与 CSV 星历渲染 |
| [`src/determine.ts`](src/determine.ts) | `orbit_determine` |
| [`src/transfer.ts`](src/transfer.ts) | `orbit_transfer` |
| [`src/passes.ts`](src/passes.ts) | `orbit_passes` |
| [`src/conjunction.ts`](src/conjunction.ts) | `orbit_conjunction` |
| [`src/convert.ts`](src/convert.ts) | `orbit_convert` |
| [`src/attitude.ts`](src/attitude.ts) | `attitude_determine` |
| — | 不发布运行时不变式伴生入口；这些无状态工具不拥有事件流或共享可变状态。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [航天子系统](../../../docs/subsystems/aerospace.zh.md)——单位、参考系与算法来源。
- [生成的工具目录](../../../docs/tool-catalog.zh.md#astro-onetool-astrodynamics)——七个工具的精确 schema。
- [生成的配置目录](../../../docs/config-catalog.zh.md#astro-onetool-astrodynamics)——每个配置字段及其声明。

-----

<a id="model-experience"></a>
## 模型体验

### 工具 schema

#### 模型看到的内容

模型看到生成的 [`orbit_*` 与 `attitude_determine` schema](../../../docs/tool-catalog.zh.md#astro-onetool-astrodynamics)。每个描述都说明方法选项、单位与默认值；配置上限不是模型参数。

#### Token 影响

插件加载期间，七个 schema 为每个请求增加固定开销；共享的轨道来源片段在每个接受轨道的工具中重复出现。

#### KV Cache 影响

插件保持加载且定义不变时前缀稳定；加载或卸载插件会从第一个变化的 schema token 起使复用失效。

### 星历结果

#### 模型看到的内容

`orbit_propagate` 返回一行摘要，例如 `sgp4 ephemeris, 3 samples, frame gcrf. Epoch <iso>: a=<km> km, e=<e>, i=<deg> deg, perigee alt=<km> km, apogee alt=<km> km, period=<s> s.`，随后是 CSV 表头（`time,x_km,y_km,z_km,vx_km_s,vy_km_s,vz_km_s`，大地坐标输出为 `time,lat_deg,lon_deg,alt_km`），每个采样一行。

#### Token 影响

开销随采样数线性增长，采样数受 `maxSamples` 限制；结果在压缩前会被重复发送。

#### KV Cache 影响

仅追加；新可见内容位于可复用请求前缀之后，不会使已有 KV-cache 条目失效。

### 分析结果

#### 模型看到的内容

其他工具返回紧凑的 JSON 对象。没有满足条件的结果时，`orbit_passes` 返回 `No passes above the elevation mask in the window.`，`orbit_conjunction` 返回 `No close approach inside the screening distance.`。失败为 `Error: <message>`。

#### Token 影响

结果大小取决于过境、接近事件或 Lambert 分支的数量；`orbit_determine` 为每个观测返回一行残差，因此其结果随受 `maxObservations` 限制的观测数增长。

#### KV Cache 影响

仅追加；新可见内容位于可复用请求前缀之后，不会使已有 KV-cache 条目失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **适用库的精度限制**——地球定向与力模型的简化列在 [`astro-one-astrodynamics`](../astrodynamics/README.zh.md#known-limitations-and-deferred-work) 中；模型可以通过 `eop` 参数传入 IERS EOP 值，消除 UT1 与极移误差。
- **观测是内联参数**——`orbit_determine` 从调用参数读取观测，而不是从 CCSDS TDM 等跟踪数据文件读取，因此大规模观测除受 `maxObservations` 限制外还受参数大小限制。
- **碰撞概率假设短时交会**——2D Foster 方法不适用于缓慢、长时间的交会，例如共位 GEO 卫星。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
