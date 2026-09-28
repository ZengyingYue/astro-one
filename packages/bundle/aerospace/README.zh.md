---
description: "可选航天层：从插件管理器或自定义 profile 挂载轨道动力学、GNSS 定位与遥感工具。"
kind: "package-bundle"
---

# @astro-one/aerospace

[English](README.md) | 中文

## 概述

这个可选 bundle 以有界的默认上限插入 [`astro-one-tool-astrodynamics`](../../aerospace/tool-astrodynamics/README.zh.md)、[`astro-one-tool-gnss`](../../aerospace/tool-gnss/README.zh.md) 与 [`astro-one-tool-remote-sensing`](../../aerospace/tool-remote-sensing/README.zh.md)。它在提供工具注册表与工作区文件系统的 `@astro-one/base` 之后应用。随附的 profile 默认不启用它。

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

在 Web 侧边栏打开 Plugins 并启用 Aerospace。对于终端或 headless profile，在 `$ASTRO_ONE_HOME/profiles/<profile>/package.json` 中把 `@astro-one/aerospace` 加到现有 bundle 之后：

```json
{ "astroOne": { "profile": { "bundles": ["@astro-one/base", "@astro-one/headless", "@astro-one/aerospace"] } } }
```

ONNX 目标检测器默认关闭；[遥感 README](../../aerospace/tool-remote-sensing/README.zh.md#enable-object-detection) 给出了启用它的 profile 覆盖配置。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>维护者细节——点击展开</summary>

静态 `cordis.patch.yml` 以 id `tool-astrodynamics`、`tool-gnss` 与 `tool-remote-sensing` 插入三条工具行，因此 profile patch 可以按 id 覆盖每一行的配置。`@astro-one/aerospace` 列在 boot 包的可选 bundle 中，使插件管理器可以管理它，而不必在默认 profile 中选中它。不发布运行时不变式伴生入口，因为这个仅含配置的包没有运行时状态。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [航天包映射](../../aerospace/README.zh.md)——算法库与三个工具包。
- [航天子系统](../../../docs/subsystems/aerospace.zh.md)——单位、参考系与算法来源。

-----

<a id="model-experience"></a>
## 模型体验

间接地，通过插入的三个工具包，由它们拥有模型看到的每个 schema 与结果。

#### KV Cache 影响

启用或禁用本 bundle 会增加或移除最多十个工具 schema，并从第一个变化的 schema token 起使复用失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **安装 astro-one 也会安装原生依赖**——即使本 bundle 处于禁用状态，`sharp` 与 `onnxruntime-node` 也会随 CLI 一起安装。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者细节——点击展开</summary>

无。

</details>
