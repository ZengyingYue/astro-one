---
description: "航天家族的包映射：轨道动力学算法库，以及面向模型的轨道、GNSS 与遥感工具。"
kind: "package-group"
---

# aerospace/：航天算法家族

[English](README.md) | 中文

## 概述

`aerospace/` 包为模型提供航天任务所需的数值工具：轨道外推与定轨、转移设计、地面站过境、交会筛查、姿态确定、基于 RINEX 文件的 GNSS 定位，以及对地观测影像分析。除可选目标检测器使用 ONNX Runtime 外，所有算法都以 TypeScript 在进程内运行，不需要网络访问或外部服务。[`@astro-one/aerospace`](../bundle/aerospace/README.zh.md) bundle 挂载全部三个工具包；随附的 profile 默认不启用它。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

四个包分担航天相关职责；子系统参考负责共享的单位、参考系与算法来源。

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`astrodynamics/`](astrodynamics/README.zh.md) | 算法库：时间尺度、参考系、SGP4 与数值外推、Lambert、定轨、碰撞概率、姿态 | 无（库） |
| [`tool-astrodynamics/`](tool-astrodynamics/README.zh.md) | 向模型公开 `orbit_*` 工具与 `attitude_determine` | 注册到 `ctx.tools` |
| [`tool-gnss/`](tool-gnss/README.zh.md) | 基于 RINEX 3 文件公开 `gnss_position`（SPP 与 RTK）和 `gnss_visibility` | 注册到 `ctx.tools` |
| [`tool-remote-sensing/`](tool-remote-sensing/README.zh.md) | 公开光谱指数、变化检测与可选的 ONNX 旋转目标检测 | 注册到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相关文档

- [航天子系统](../../docs/subsystems/aerospace.zh.md)——单位、时间尺度、参考系，以及每个工具所依据的已发表算法。
- [生成的工具目录](../../docs/tool-catalog.zh.md#astro-onetool-astrodynamics)——面向模型的精确 schema。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
