---
description: "回溯 astro-one-v0.1.2-alpha.4 的已声明 Session 持久化类型及相邻版本变化。"
kind: persistence-release
---

# 持久化版本回溯: astro-one-v0.1.2-alpha.4

[English](astro-one-v0.1.2-alpha.4.md) | 中文

## 概述

逻辑 SessionHeader 以必需字段 isSeeded 替代可选字段 seedLength，但物理 JSONL 头仍声明 seedLength。用户消息来源变体 subagent-report 和 coordinator 改为 agent-message。写入格式仍为 0。

## 目录

- [发行来源](#evidence)
- [声明](#declaration)
- [结构变化](#changes)
- [校验](#verification)
- [开发备注](#dev-note)

-----

<a id="evidence"></a>
## 发行来源

这是供阅读和格式校验的近似回填，不是当时的兼容性确认。提取方法和覆盖限制见[归档说明](README.zh.md)。

| 项目 | 记录值 |
|---|---|
| 源码 tag | `astro-one-v0.1.2-alpha.4` |
| 源码日期 | 2026-09-01T15:37:26.000Z |
| 发行记录 | 有 release 对象。 |
| 前一版本 | [astro-one-v0.1.2-alpha.3](astro-one-v0.1.2-alpha.3.zh.md) |
| Session 写入版本 | 0 |
| 完整重建清单 | <!-- persistence-release-inventory:start -->54 个根类型 / 415 种类型<!-- persistence-release-inventory:end --> |
| 本条快照 | [astro-one-v0.1.2-alpha.4.schema.json](astro-one-v0.1.2-alpha.4.schema.json) |

写入版本常量在该 tag 中的源码证据：

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## 声明

```yaml persistence-release
schemaVersion: 1
tag: astro-one-v0.1.2-alpha.4
previous: astro-one-v0.1.2-alpha.3
sessionFormatVersion: 0
changes:
  - root: SessionHeader
    before: 5d9a199ba51504f930c48c67749ae5607de257d3258e156a133eeaa2445c123d
    after: 3b708449408163b5f089dfffc7ed3a9bc087d8b6bb69de466b5d803b49b9a922
  - root: event:agent/inbox/spliced
    before: 8212b07d3fa4b0576e59b35dcb27381abdda80a0452bc8a348fddf18fc00cbce
    after: aba2a9fe8b89b4982a5b4039c644e00b2aa55de4941dae2b01cb250694fe3283
  - root: event:session/title-llm-request
    before: 15cf9727f25c72740eebf02f7e519537fb8a959850add3ee9600d803551455de
    after: 3fdbdacd81e7915aeb2bb763b438d2d2eb0c9301a230092ca09a5f414e2bdcac
  - root: event:user/message
    before: 9e3978467b987defa20278e58ab1cb3879f0801cef4dc3f629a09a7e709af9dc
    after: 1431c0ee8c6323aa132477b7176198f6f73678948974c0a6aa579c54a2b1cb3d
```

<a id="changes"></a>
## 结构变化

<!-- persistence-release-changes:start -->

检测到 4 个根类型变化、5 项结构差异。下表的最低要求按当前规则计算，只用于比较；不表示旧版本曾遵守这些规则，也不证明迁移或运行时兼容性。

| 路径 | 变化 | 当前最低要求 |
|---|---|---|
| `SessionHeader.seedLength` | `property-removed` | `version-bump` |
| `SessionHeader.isSeeded` | `required-property-added` | `version-bump` |
| `event:agent/inbox/spliced.data.inserted[].source` | `union-variants-changed` | `version-bump` |
| `event:session/title-llm-request.data.messages[].source` | `union-variants-changed` | `version-bump` |
| `event:user/message.data.source` | `union-variants-changed` | `version-bump` |

<!-- persistence-release-changes:end -->

<a id="verification"></a>
## 校验

提取结果已通过规范图、根摘要和全部可达类型摘要校验；仅对历史 surface 事件允许源码原有的可选 `surfaceOp`。仓库内检查从前驱重建每个 tag，核对 before/after、快照覆盖和双语机器声明。

```sh
pnpm run verify-persistence-releases
```

<a id="dev-note"></a>
## 开发备注

无。
