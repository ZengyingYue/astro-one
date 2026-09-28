---
description: "回溯 astro-one-v0.1.0-rc.8 的已声明 Session 持久化类型及相邻版本变化。"
kind: persistence-release
---

# 持久化版本回溯: astro-one-v0.1.0-rc.8

[English](astro-one-v0.1.0-rc.8.md) | 中文

## 概述

新增四种 team/* 事件及用户消息来源变体 team-message；assistant/message 新增可选字段 interrupted。写入格式仍为 0。

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
| 源码 tag | `astro-one-v0.1.0-rc.8` |
| 源码日期 | 2026-08-19T15:11:50.000Z |
| 发行记录 | 有 release 对象。 |
| 前一版本 | [astro-one-v0.1.0-rc.7](astro-one-v0.1.0-rc.7.zh.md) |
| Session 写入版本 | 0 |
| 完整重建清单 | <!-- persistence-release-inventory:start -->51 个根类型 / 403 种类型<!-- persistence-release-inventory:end --> |
| 本条快照 | [astro-one-v0.1.0-rc.8.schema.json](astro-one-v0.1.0-rc.8.schema.json) |

写入版本常量在该 tag 中的源码证据：

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## 声明

```yaml persistence-release
schemaVersion: 1
tag: astro-one-v0.1.0-rc.8
previous: astro-one-v0.1.0-rc.7
sessionFormatVersion: 0
changes:
  - root: event:agent/inbox/spliced
    before: 0219010871f5b43f511a3b0e75864bfd055b9e882eb185a23dd2bb34b0817ae7
    after: 3a1ab1318bbe5cbe76a327ff3b0f7c0e578f3077fc6f5fcf01cae93ed70c232b
  - root: event:assistant/message
    before: 5d6c2a2d2c5b5d507c5288e070aab7471aed408af160565165137cf9680f3330
    after: 3ffbcc6804fc01dc0fcf31ab3a0904e426ec933d97a345a8a96055754e4334d5
  - root: event:session/title-llm-request
    before: 07116b665f7f6b97b553b8c87ff30e4461b06d8bb361b7b18b81a9597182f21f
    after: 6e0160c78c8eae2b62054efdf031fb75037205bbde10d97d4d7049b32c53702b
  - root: event:team/member
    before: null
    after: c4002a911c01974f8274b7f56cea9c0d1986087ca0d7c1ab1f3ce3ed1ea766bb
  - root: event:team/message/delivered
    before: null
    after: e446a1f24aaa82dcd4ef38b0a033c653ec9c74628e9fb75f5ecf977821f7328c
  - root: event:team/message/queued
    before: null
    after: 30ba185523e67225d238c65192e8f510fbbd8930244118ea7d1c4d964f3f4221
  - root: event:team/task
    before: null
    after: 196ba28b1366d7f47ede901dae99b91be217a14482b583269a908f356e46d889
  - root: event:user/message
    before: fc6df762b1b045ab8d8b228c5317e21d274ee71f2157dabfa17b795f27d12813
    after: 048c96bdc3d0a436c827c1337eea0ee134041a76725a00a461857a6794549a50
```

<a id="changes"></a>
## 结构变化

<!-- persistence-release-changes:start -->

检测到 8 个根类型变化、8 项结构差异。下表的最低要求按当前规则计算，只用于比较；不表示旧版本曾遵守这些规则，也不证明迁移或运行时兼容性。

| 路径 | 变化 | 当前最低要求 |
|---|---|---|
| `event:agent/inbox/spliced.data.inserted[].source` | `union-variants-changed` | `version-bump` |
| `event:assistant/message.data.interrupted` | `optional-property-added` | `same-version` |
| `event:session/title-llm-request.data.messages[].source` | `union-variants-changed` | `version-bump` |
| `event:team/member` | `root-added` | `same-version` |
| `event:team/message/delivered` | `root-added` | `same-version` |
| `event:team/message/queued` | `root-added` | `same-version` |
| `event:team/task` | `root-added` | `same-version` |
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
