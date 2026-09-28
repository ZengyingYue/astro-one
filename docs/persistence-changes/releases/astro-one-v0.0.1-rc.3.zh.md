---
description: "回溯 astro-one-v0.0.1-rc.3 的已声明 Session 持久化类型及相邻版本变化。"
kind: persistence-release
---

# 持久化版本回溯: astro-one-v0.0.1-rc.3

[English](astro-one-v0.0.1-rc.3.md) | 中文

## 概述

四个 compact/* 事件键改为 compaction/*；用户消息来源的 kind 从 workspace-instructions 改为 agent-instructions，hook 方言从 claude 改为 claude-code。这些字面量及事件键发生变化时，写入格式仍为 0。

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
| 源码 tag | `astro-one-v0.0.1-rc.3` |
| 源码日期 | 2026-08-12T20:18:26.000Z |
| 发行记录 | 只有 tag，没有 release 对象。 |
| 前一版本 | [astro-one-v0.0.1-rc.2](astro-one-v0.0.1-rc.2.zh.md) |
| Session 写入版本 | 0 |
| 完整重建清单 | <!-- persistence-release-inventory:start -->47 个根类型 / 374 种类型<!-- persistence-release-inventory:end --> |
| 本条快照 | [astro-one-v0.0.1-rc.3.schema.json](astro-one-v0.0.1-rc.3.schema.json) |

写入版本常量在该 tag 中的源码证据：

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## 声明

```yaml persistence-release
schemaVersion: 1
tag: astro-one-v0.0.1-rc.3
previous: astro-one-v0.0.1-rc.2
sessionFormatVersion: 0
changes:
  - root: event:agent/inbox/spliced
    before: 8c40f0f353885f125ae8c94768fd466fe17e53c7f81c1f8604ac3035f1a29e1b
    after: 0219010871f5b43f511a3b0e75864bfd055b9e882eb185a23dd2bb34b0817ae7
  - root: event:compact/end
    before: 360aa2133868307cdd2f1e244a1cfeae237d850170e6686045e478912f3bd689
    after: null
  - root: event:compact/prune
    before: 4ad2a95158380bcf47833eb323df01a2798b99fa06099556cd9f9c782a06933c
    after: null
  - root: event:compact/start
    before: 5f77517121e55e1cee6dc54800fbf6ca9008c2ef13c3fe7e56327a18f3c1a021
    after: null
  - root: event:compact/summary
    before: 995555416ea36e143b68530ad93bc899cd9615d6ddc9ab8117d4e25bf1da0c30
    after: null
  - root: event:compaction/end
    before: null
    after: 959531fed950f8fb30a4bb90c05d85bd91176d2a72f2441e50aa30237081ee1e
  - root: event:compaction/prune
    before: null
    after: 33b3105d98e11e0920b762e6c1110014819d463c73c246b0eb21061a42fbde34
  - root: event:compaction/start
    before: null
    after: f5e7a61838ee075adc4866ad45fd996f64f04047303f48b39f6f628e58b5136d
  - root: event:compaction/summary
    before: null
    after: 5d41e236528af21c1ffbb247e8c82561766bf165f8be5ba1edf0a9bab92e9fac
  - root: event:hook/invoked
    before: cb564798d60dbcd664ddcb2daf0ae03eb3ad8ad90448743f2010783dca0924f4
    after: 9a1b2a6161e46a3b81d67083d0f4864a4b68eb3483bd6c3e6fbb9c3be0a5b07c
  - root: event:session/title-llm-request
    before: 24520618248f41781f71898c656547485e09e0a8af4b1c4daf407f92addf42c8
    after: 07116b665f7f6b97b553b8c87ff30e4461b06d8bb361b7b18b81a9597182f21f
  - root: event:user/message
    before: d5646e4d7b2b9053e32531c8434df277644fe1d712c271a4948464c72bc53e10
    after: fc6df762b1b045ab8d8b228c5317e21d274ee71f2157dabfa17b795f27d12813
```

<a id="changes"></a>
## 结构变化

<!-- persistence-release-changes:start -->

检测到 12 个根类型变化、12 项结构差异。下表的最低要求按当前规则计算，只用于比较；不表示旧版本曾遵守这些规则，也不证明迁移或运行时兼容性。

| 路径 | 变化 | 当前最低要求 |
|---|---|---|
| `event:agent/inbox/spliced.data.inserted[].source.kind` | `type-changed` | `version-bump` |
| `event:compact/end` | `root-removed` | `version-bump` |
| `event:compact/prune` | `root-removed` | `version-bump` |
| `event:compact/start` | `root-removed` | `version-bump` |
| `event:compact/summary` | `root-removed` | `version-bump` |
| `event:compaction/end` | `root-added` | `same-version` |
| `event:compaction/prune` | `root-added` | `same-version` |
| `event:compaction/start` | `root-added` | `same-version` |
| `event:compaction/summary` | `root-added` | `same-version` |
| `event:hook/invoked.data.dialect` | `type-changed` | `version-bump` |
| `event:session/title-llm-request.data.messages[].source.kind` | `type-changed` | `version-bump` |
| `event:user/message.data.source.kind` | `type-changed` | `version-bump` |

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
