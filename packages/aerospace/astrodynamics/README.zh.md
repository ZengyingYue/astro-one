---
description: "轨道动力学与航天器姿态算法库：时间尺度、参考系、SGP4 与数值外推、Lambert、定轨、碰撞概率与姿态确定。"
kind: "package-reference"
---

# @astro-one/astrodynamics

[English](README.md) | 中文

## 概述

`astro-one-astrodynamics` 是航天工具背后的纯 TypeScript 算法库。它在 UTC、TAI、TT 与 GPS 时间之间转换；在 GCRF、TEME、ITRF 与大地坐标之间变换状态；用 SGP4、开普勒模型或 RKF7(8) 特殊摄动积分器外推轨道；求解 Lambert 问题；由跟踪数据确定轨道；计算碰撞概率；并求解 Wahba 姿态问题。距离单位为 km，速度为 km/s，角度为弧度，时刻为自 Unix 纪元起的 UTC 毫秒数。本库不向组合注册任何内容。

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

### 何时使用

当 Host 代码需要轨道力学计算、但不需要 [`astro-one-tool-astrodynamics`](../tool-astrodynamics/README.zh.md) 的面向模型校验与渲染时使用本库。所有函数都是同步且确定性的；无效几何、SGP4 衰减与不收敛会抛出带可读消息的 `Error`。

### 入口

用 SGP4 外推 TLE，把结果转换到 GCRF，并求解一条 Lambert 弧段：

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

完整导出列表见 [`src/index.ts`](src/index.ts)。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

[航天子系统页面](../../../docs/subsystems/aerospace.zh.md)列出了每个算法的已发表来源与参考系约定。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/time.ts`](src/time.ts) | UTC 解析与格式化、闰秒、TT、儒略日、IAU-82 恒星时 |
| [`src/frames.ts`](src/frames.ts) | IAU-76 岁差、IAU-80 章动、极移、TEME/GCRF/ITRF、大地坐标、ENU、观测角、RTN |
| [`src/kepler.ts`](src/kepler.ts) | 经典根数、开普勒方程、普适变量外推 |
| [`src/sgp4.ts`](src/sgp4.ts) | 通过 satellite.js 解析 TLE 与 CCSDS OMM 并运行 SGP4/SDP4 |
| [`src/forces.ts`](src/forces.ts)、[`src/ephemeris.ts`](src/ephemeris.ts) | J2–J6 带谐项、指数大气阻力、带锥形阴影的太阳光压、日月引力与低精度星历 |
| [`src/integrator.ts`](src/integrator.ts)、[`src/propagate.ts`](src/propagate.ts) | 带稠密输出的 RKF7(8) 自适应积分器，以及数值与二体外推 |
| [`src/lambert.ts`](src/lambert.ts) | 支持多圈分支的 Izzo Lambert 求解器 |
| [`src/iod.ts`](src/iod.ts) | Gibbs、Herrick–Gibbs 与 Gauss 仅测角初始定轨 |
| [`src/measurements.ts`](src/measurements.ts)、[`src/od.ts`](src/od.ts) | 观测模型、带野值剔除的批处理最小二乘、无迹卡尔曼滤波 |
| [`src/conjunction.ts`](src/conjunction.ts) | 近距离交会搜索、RTN 协方差、Foster 2D 碰撞概率、Alfano 最大概率 |
| [`src/passes.ts`](src/passes.ts) | 带光照判断的地面站升起/中天/降落搜索 |
| [`src/attitude.ts`](src/attitude.ts) | TRIAD、Davenport q-method 与带姿态误差协方差的 QUEST |
| [`src/maneuver.ts`](src/maneuver.ts) | Hohmann、双椭圆与轨道面变更 Δv |
| — | 不发布运行时不变式伴生入口，因为这个纯函数库不拥有事件流或共享可变状态；单元测试依据已发表参考算例覆盖每个算法。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [航天包映射](../README.zh.md)——使用本库的工具包。
- [航天子系统](../../../docs/subsystems/aerospace.zh.md)——单位、参考系与算法来源。

-----

<a id="model-experience"></a>
## 模型体验

间接地，通过 `@astro-one/tool-astrodynamics`，由它校验模型参数并渲染库的结果。

#### KV Cache 影响

无；本库不添加自己的提示词、schema 或结果文本。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **降低精度的地球定向**——章动只保留 IAU-1980 的主要项（截断误差低于 0.02″），GCRF 按 J2000 平赤道处理，未包含约 0.02″ 的参考架偏差。未提供 EOP 时 UT1 等于 UTC，可能使地固位置在赤道处偏差最多约 400 m；极移为零，在地表约 15 m。
- **仅带谐重力与指数大气**——力模型没有田谐项、没有 NRLMSISE-00 或 Jacchia 大气，也没有固体潮，因此数天尺度的数值外推适合任务规划，而非精密定轨。
- **闰秒表编译在代码中**——表中最后一项之后的时刻沿用最终的 TAI−UTC 值，直到更新该表。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
