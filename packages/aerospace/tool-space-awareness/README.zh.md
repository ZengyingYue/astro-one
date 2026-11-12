---
description: "面向模型的空间目标感知工具：编目查询与碰撞筛查、观测与目标关联、机动检测、光学观测窗口与亮度、光变曲线周期、轨道衰减与 TLE 拟合。"
kind: "package-reference"
---

# @astro-one/tool-space-awareness

[English](README.md) | 中文

## 概述

`astro-one-tool-space-awareness` 为模型提供基于 SGP4 根数编目的空间目标感知流程：查找并分类目标，把一个目标与整个编目做接近筛查，判断一段短弧观测属于哪个编目目标，在根数历史中检测机动，结合亮度预测规划光学观测，由光变曲线估计自旋周期，预测轨道衰减与再入，以及把定轨得到的轨道拟合成 TLE 以便录入编目。编目为 TLE 文本或 CCSDS OMM JSON，通过 `ctx.fs` 读取，因此沙箱与工作区规则同样适用。

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

当用户处理的是卫星编目而不是单条轨道时选择本包：针对全部在轨编目目标的碰撞筛查、未关联航迹处理、机动或异常监视、光学传感器任务规划、目标特性分析，或再入预报。单条轨道的外推、定轨和两目标交会由 [`astro-one-tool-astrodynamics`](../tool-astrodynamics/README.zh.md) 负责。

### 最小配置

```yaml
- name: '@astro-one/tool-space-awareness'
  config:
    maxFileBytes: 268435456
    maxCatalogObjects: 100000
    maxEvaluations: 50000000
    maxObservations: 100000
    maxResults: 100
```

| 字段 | Bundle 取值 | 含义 |
|---|---|---|
| `maxFileBytes` | `268435456` | 读取的编目或光变曲线文件大小上限；更大的文件以 `FS_TOO_LARGE` 失败 |
| `maxCatalogObjects` | `100000` | 单个编目文件解析的条目数 |
| `maxEvaluations` | `50000000` | 单次调用可计划的 SGP4、测光或阻力模型计算次数；超出的请求在计算前失败 |
| `maxObservations` | `100000` | 单次调用的观测、光变点、星历行或根数组数 |
| `maxResults` | `100` | 返回给模型的结果行数；`more_*` 字段统计其余行数 |

生成的[配置目录](../../../docs/config-catalog.zh.md#astro-onetool-space-awareness)列出了各项声明。

### 工具

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

| 工具 | 回答的问题 |
|---|---|
| `ssa_catalog_query` | 哪些目标符合轨道类别、名称、编号或高度/倾角范围；各类别计数；GEO 经度与漂移 |
| `ssa_catalog_screen` | 哪些编目目标会在某个距离内接近主目标，何时接近、相对速度多大、最大碰撞概率多少 |
| `ssa_correlate` | 哪个编目目标能解释一段短弧观测，残差均方根与沿迹时间偏差是多少，或者该航迹未关联 |
| `ssa_maneuver_detect` | 目标何时改变了半长轴或轨道面，对应多大的 Δv |
| `ssa_optical_windows` | 望远镜何时能看到目标、指向哪里、目标多亮、移动多快 |
| `ssa_lightcurve` | 测光周期及其显著性，以及自旋周期是否为其两倍 |
| `ssa_decay` | 阻力何时把近地点降到再入高度，以及反映密度不确定性的提前/推迟区间 |
| `ssa_tle_fit` | 在 SGP4 下复现一段星历的 TLE 与 OMM，以及拟合误差 |

### 失败与恢复

文件缺失或格式错误、参数无效以及超出上限的请求会变成 `Error: <message>` 结果，例如 `Error: primary.catalog_number 25544 is not in the catalog` 或 `Error: this request needs about 61000000 model evaluations; at most 50000000 are allowed (increase step_s, shorten the window, or lower filter_pad_km)`。解析失败的编目条目会被跳过（`ssa_catalog_query` 在 `rejected_entries` 中计数），筛查窗口内衰减的次目标列在 `propagation_failures` 中；两者都不会使调用失败。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

每个工具都用 [`astro-one-astrodynamics`](../astrodynamics/README.zh.md) 的 SGP4 计算根数。编目筛查先应用 Hoots 远地点/近地点滤波，再在均匀网格上采样每个剩余目标对，跳过距离下界（端点距离减去相对运动距离）超过筛查距离的网格步，最后对距离变化率二分以精化最近接近时刻。关联对整段短弧计算每组根数的卡方；可选的时间偏差先对每个目标做 21 点扫描，再对排名靠前的候选做黄金分割精化。机动检测扣除半长轴的中位衰减率，并标出稳健 z 分数的离群值。衰减预测用四阶 Runge–Kutta 积分轨道平均阻力方程，步长受近地点变化量约束。TLE 拟合在春分点平根数上运行 Levenberg–Marquardt，偏导数经由 SGP4 有限差分求得。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口与 Config |
| [`src/catalog.ts`](src/catalog.ts) | TLE 与 OMM 编目解析、有界读取、ESA 轨道类别、GEO 经度与漂移 |
| [`src/screening.ts`](src/screening.ts) | 远地点/近地点滤波、网格时间滤波、最近接近时刻精化 |
| [`src/correlation.ts`](src/correlation.ts) | 短弧残差、卡方、时间偏差扫描与精化 |
| [`src/maneuvers.ts`](src/maneuvers.ts) | 区间根数变化、稳健统计、Δv 估计 |
| [`src/photometry.ts`](src/photometry.ts) | 漫反射球星等、大气质量、观测约束、窗口搜索 |
| [`src/lightcurve.ts`](src/lightcurve.ts) | 广义 Lomb–Scargle、虚警概率、相位色散最小化 |
| [`src/decay.ts`](src/decay.ts) | 轨道平均阻力变化率与寿命积分 |
| [`src/tle-fit.ts`](src/tle-fit.ts) | 春分点根数与 SGP4 微分改正 |
| [`src/tools/`](src/tools) | 每个文件一个工具定义：参数、上限与结果行 |
| — | 不发布运行时不变式伴生入口；这些无状态工具不拥有事件流或共享可变状态。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [航天子系统](../../../docs/subsystems/aerospace.zh.md)——单位、参考系，以及每个工具所依据的已发表算法。
- [生成的工具目录](../../../docs/tool-catalog.zh.md#astro-onetool-space-awareness)——面向模型的精确 schema。
- [文件系统子系统](../../../docs/subsystems/filesystem.zh.md)——编目与光变曲线读取所经过的 `ctx.fs` seam。

-----

<a id="model-experience"></a>
## 模型体验

### 工具 schema

#### 模型看到的内容

模型看到生成的八个 [`ssa_*` schema](../../../docs/tool-catalog.zh.md#astro-onetool-space-awareness)。文件、编目、计算次数与行数上限是部署设置，不是模型参数。

#### Token 影响

插件加载期间，八个 schema 为每个请求增加固定开销。

#### KV Cache 影响

插件保持加载且定义不变时前缀稳定；加载或卸载插件会从第一个变化的 schema token 起使复用失效。

### 分析结果

#### 模型看到的内容

每个结果是一个 JSON 对象。行列表在 `maxResults` 处截止，并在 `more_approaches`、`more_events` 或 `more_windows` 中报告剩余数量；`ssa_catalog_screen` 与 `ssa_optical_windows` 的空结果以一句话报告。失败为 `Error: <message>`。

#### Token 影响

`maxResults` 限制每个行列表，因此即使针对完整编目，结果也保持在几 KB。

#### KV Cache 影响

仅追加；新可见内容位于可复用请求前缀之后，不会使已有 KV-cache 条目失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **SGP4 精度限制了所有结果**——编目根数带有公里级误差且随根数龄期增长，因此筛查给出的是待精化的候选，而不是碰撞判定；碰撞概率需要用户提供协方差。
- **静态大气**——衰减预测使用与太阳活动无关的指数大气；对较长寿命，有意义的输出是提前/推迟区间而不是名义日期。
- **漫反射球亮度**——不模拟镜面闪光、随姿态变化的形状以及地球反照。
- **每次筛查一个主目标**——编目全体两两筛查需要循环调用。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
