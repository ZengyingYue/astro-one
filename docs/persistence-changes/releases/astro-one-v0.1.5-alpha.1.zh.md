---
description: "回溯 astro-one-v0.1.5-alpha.1 的已声明 Session 持久化类型及相邻版本变化。"
kind: persistence-release
---

# 持久化版本回溯: astro-one-v0.1.5-alpha.1

[English](astro-one-v0.1.5-alpha.1.md) | 中文

## 概述

写入格式从 2 升至 3：新增 system/message，EpochHeader 删除 system。SurfaceOp 替换操作的字段从 start/end 改为 startSeq/endSeq，tool/code-dispatch 事件键改为 tool/ptc-dispatch 事件键。

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
| 源码 tag | `astro-one-v0.1.5-alpha.1` |
| 源码日期 | 2026-09-08T15:25:45.000Z |
| 发行记录 | 有 release 对象。 |
| 前一版本 | [astro-one-v0.1.3-alpha.2](astro-one-v0.1.3-alpha.2.zh.md) |
| Session 写入版本 | 3 |
| 完整重建清单 | <!-- persistence-release-inventory:start -->57 个根类型 / 443 种类型<!-- persistence-release-inventory:end --> |
| 本条快照 | [astro-one-v0.1.5-alpha.1.schema.json](astro-one-v0.1.5-alpha.1.schema.json) |

写入版本常量在该 tag 中的源码证据：

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 3`

<a id="declaration"></a>
## 声明

```yaml persistence-release
schemaVersion: 1
tag: astro-one-v0.1.5-alpha.1
previous: astro-one-v0.1.3-alpha.2
sessionFormatVersion: 3
changes:
  - root: SessionEventEnvelope
    before: 3598ae976ac476f3e9471d2da2c1bb65a12d6075ec45bb4de337d138081d089e
    after: 0979ce79d45f7ab7fd22c7f53ffd14012c3580a13370ba342f24273fa3ef24b7
  - root: SessionHeader
    before: 30aaf1562120f23a72fdfe10917e6c45ce4f82c6f0429bca8e9ade1873890645
    after: 10d645e11370ef434a059176c1992dfbf32e9ec118bbdb0417b5091e64b35253
  - root: event:assistant/message
    before: 44448168b0e4130ff0755b18ae7330a8c74761363dd58c479524e45044f6f530
    after: 6142308e8ffa10a63e40a9d1e1afb2da652b2d8f4c3965c5cfbd857308f8473f
  - root: event:request/context
    before: 3f955e2988cd28375b4e96a2597ee263145dad69e1442b902e92da051f50ff62
    after: d49012ddc5b2741c085aea52a6505f155102fe561df4c4931c69d037fe78a983
  - root: event:request/header
    before: 9c357f180064852c91c1adf60102d7c1c0b480b8119380008f4e590fc22eb782
    after: db725a177eb47c226a5d6cccfa671f85b9d3a072f3d77db21ef6e6778ddabad1
  - root: event:system/message
    before: null
    after: 3dfc275fafed6822b9bceec89ea75866b1d21fc86ae2e56f04ca94b7809f9458
  - root: event:tool/code-dispatch
    before: 180aa99644b436311adc96c14027ecd1f876ff193f3e81ea9123eecdc79e8ffe
    after: null
  - root: event:tool/code-dispatch-start
    before: 28630fd10b18fa30acd76184f679afc5e4832e4b8dd2ef6f97a97fc70e4a8d32
    after: null
  - root: event:tool/ptc-dispatch
    before: null
    after: e159f308f72ad71f75bf2c473289db89c067d87f5fff471cf5f0f40b8827aa43
  - root: event:tool/ptc-dispatch-start
    before: null
    after: a6743818a7eb2edc739937dd72ed5189431c68843037301dae2b52113b5aaa24
  - root: event:tool/result
    before: 129e962ae37a078d4422287fff2de3f1fc2318d5c90e71810851cfb4f85019b0
    after: 5c729aa0bf74eba2e35e7a56cd427b5d99fd1c7d8e990268b389e89cddd75452
  - root: event:user/message
    before: bdf54d2cae33c604bb91af75ad4e523910ac3f8b0404f174882ab45bc15f7577
    after: d506dd17bdcd342a0f99b6e70c3193c7b1500a5eeb3d5cae8167a1af844e78f6
```

<a id="changes"></a>
## 结构变化

<!-- persistence-release-changes:start -->

检测到 12 个根类型变化、25 项结构差异。下表的最低要求按当前规则计算，只用于比较；不表示旧版本曾遵守这些规则，也不证明迁移或运行时兼容性。

| 路径 | 变化 | 当前最低要求 |
|---|---|---|
| `SessionEventEnvelope` | `union-variants-changed` | `version-bump` |
| `SessionHeader.version` | `type-changed` | `version-bump` |
| `event:assistant/message.sourceEventSeqs` | `property-removed` | `version-bump` |
| `event:assistant/message.surfaceOp` | `property-made-required` | `version-bump` |
| `event:assistant/message.surfaceOp.end` | `property-removed` | `version-bump` |
| `event:assistant/message.surfaceOp.start` | `property-removed` | `version-bump` |
| `event:assistant/message.surfaceOp.endSeq` | `required-property-added` | `version-bump` |
| `event:assistant/message.surfaceOp.startSeq` | `required-property-added` | `version-bump` |
| `event:request/context.data.systemPromptUpdate` | `optional-property-added` | `same-version` |
| `event:request/header.data.header.system` | `property-removed` | `version-bump` |
| `event:system/message` | `root-added` | `version-bump` |
| `event:tool/code-dispatch` | `root-removed` | `version-bump` |
| `event:tool/code-dispatch-start` | `root-removed` | `version-bump` |
| `event:tool/ptc-dispatch` | `root-added` | `same-version` |
| `event:tool/ptc-dispatch-start` | `root-added` | `same-version` |
| `event:tool/result.surfaceOp` | `property-made-required` | `version-bump` |
| `event:tool/result.surfaceOp.end` | `property-removed` | `version-bump` |
| `event:tool/result.surfaceOp.start` | `property-removed` | `version-bump` |
| `event:tool/result.surfaceOp.endSeq` | `required-property-added` | `version-bump` |
| `event:tool/result.surfaceOp.startSeq` | `required-property-added` | `version-bump` |
| `event:user/message.surfaceOp` | `property-made-required` | `version-bump` |
| `event:user/message.surfaceOp.end` | `property-removed` | `version-bump` |
| `event:user/message.surfaceOp.start` | `property-removed` | `version-bump` |
| `event:user/message.surfaceOp.endSeq` | `required-property-added` | `version-bump` |
| `event:user/message.surfaceOp.startSeq` | `required-property-added` | `version-bump` |

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
