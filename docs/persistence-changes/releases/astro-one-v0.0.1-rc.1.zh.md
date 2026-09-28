---
description: "回溯 astro-one-v0.0.1-rc.1 的已声明 Session 持久化类型及相邻版本变化。"
kind: persistence-release
---

# 持久化版本回溯: astro-one-v0.0.1-rc.1

[English](astro-one-v0.0.1-rc.1.md) | 中文

## 概述

这是现有 Astro One alpha/rc 标签中最早的版本，作为历史基线：包含 42 个持久化根类型，写入格式为 0。

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
| 源码 tag | `astro-one-v0.0.1-rc.1` |
| 源码日期 | 2026-08-10T19:25:09.000Z |
| 发行记录 | 只有 tag，没有 release 对象。 |
| 前一版本 | 最早可用的预发行 tag；没有更早的比较输入。 |
| Session 写入版本 | 0 |
| 完整重建清单 | <!-- persistence-release-inventory:start -->42 个根类型 / 341 种类型<!-- persistence-release-inventory:end --> |
| 本条快照 | [astro-one-v0.0.1-rc.1.schema.json](astro-one-v0.0.1-rc.1.schema.json) |

写入版本常量在该 tag 中的源码证据：

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## 声明

```yaml persistence-release
schemaVersion: 1
tag: astro-one-v0.0.1-rc.1
previous: null
sessionFormatVersion: 0
changes:
  - root: JsonlHeaderLine
    before: null
    after: 3ad74ad1441e923fb6a28485037510ec53d9d4d39ab60224ad880026435d272a
  - root: SessionEventEnvelope
    before: null
    after: bf3fbb9b9ccfeac502172f6680b8d139a744274e9f017e4360e29bc7b574953c
  - root: SessionHeader
    before: null
    after: 5d9a199ba51504f930c48c67749ae5607de257d3258e156a133eeaa2445c123d
  - root: event:agent-preset/selected
    before: null
    after: a0a680dea6b49828e8f550ccc2286bd7b7f3dfeafc4756bf202b86203c58a236
  - root: event:agent/inbox/spliced
    before: null
    after: 9c49b940542fc990d45bf8ba010b19d6c71f4506cffc96339c662afcffc45d65
  - root: event:approval/asked
    before: null
    after: 9fc455ecd976cc437181e1f32888e0363800ab33339014ed7c7fea6e9ad35d06
  - root: event:approval/decided
    before: null
    after: e368c6fbec48a984839b6c5161674a765ddc24dc567ef900f9b1681d2d5f0af6
  - root: event:approval/policy
    before: null
    after: 7ffc3a9078ad12961828fbdbf72d3e2dfaed1b9389e36bff02fbf6d6ecf62d73
  - root: event:assistant/chunk
    before: null
    after: b331e05113051852c9129662c9b865f11c580490e015c48a5db6707159d71877
  - root: event:assistant/message
    before: null
    after: 3a3a97f39af1b73435f9f7062458f192062ccb3ab8dbb70f2f5fefee9024302c
  - root: event:command/done
    before: null
    after: bc8d7ce85c2016e4a4c61729e9fac117f354283e7d730518eb7f6602a78a2ef5
  - root: event:command/run
    before: null
    after: b0c1753e83115cf09088fcd0006ed156a869e292c896324530e3479ce3cfbd44
  - root: event:compact/end
    before: null
    after: 302d63834b743caf9dba1ad318e8a198b85518f5d429cce84179706786f58cd5
  - root: event:compact/prune
    before: null
    after: 9bf77430b743cb92fb73a066d73c9c1adf51ac0971fd92422cb22498f765b562
  - root: event:compact/start
    before: null
    after: 535c4b3e33d76d3f7236060dd7778b29fa21f4eacc1041874161220cb911c275
  - root: event:compact/summary
    before: null
    after: 8e63b5242b7827484d2862907a871c7b71b996aa45e7e3a560a327cdc00317fe
  - root: event:feedback/record
    before: null
    after: 5eeec64e629a730e5c3fc83a58047d2c2cc1546c9e8f59b6009c1a6aec188d6d
  - root: event:goal/change
    before: null
    after: af625cb823b54e8b5a7735efe5d139cd824a341b7ec4effb042908431c171d5b
  - root: event:hook/invoked
    before: null
    after: 085a6d9f5b8b2c16045b3a4459ef8da8040b845e424e71995db6776ca2d48e5b
  - root: event:hook/result
    before: null
    after: 80bc6d5b324f3c775d6731e056ce9faad0f5fd42fc2cd922d9675e804edc40f4
  - root: event:llm/retry
    before: null
    after: 3a81f404784b6a2c2a2fa01f6f2251adc93146485d50c44542763cb03b52e52d
  - root: event:llm/retry-started
    before: null
    after: 0c96f3739c32fd9087a0896e348c8951278eb5ad1c4e0976941d6a0436c18003
  - root: event:permission/preset
    before: null
    after: 568b855edf43375d11663d098888c3adbf365cd0c83a9037dea07a0fda25f7b2
  - root: event:plan/mode
    before: null
    after: 6bc6d61439b63bfb14a09baee9f25d51aba8870d0dd3edad31b22bafdfd534f9
  - root: event:request/context
    before: null
    after: f5f8e74236ce6052d443dcd6a047c2b27332d3f7e8e2b10f7c3eb6efe296fb2d
  - root: event:request/header
    before: null
    after: b019745b7f57dc4a1840b28b2b5a38d6f6aaf566735d35dbf8222f3b8ebcfdca
  - root: event:sandbox/mode
    before: null
    after: 95718eae86dbae0e2dd0ff4097535a25a71a71d946a4a2a99111f084973f565b
  - root: event:session/end-seed
    before: null
    after: a27fa3caa36b1508e7ddd2d1a7e58ac80e0b0b77ee96d355d92e4ce5995bf419
  - root: event:session/title
    before: null
    after: db9884620cce7de7d6718655b98f9cfd28477650161e8fedefaed962afe419a2
  - root: event:session/title-llm-request
    before: null
    after: b31c72c5e4c206f6750ee97e3e1b32fffd5f28ef351f587ec74e1438cf9ba2bc
  - root: event:step/end
    before: null
    after: c43ede073364a47849bab37171bcaff8a1a90c91ea46a3b962bce6704fb722c4
  - root: event:step/start
    before: null
    after: 472fe1eab55a22f3b2e4362c917f89dea1e764d4ec51a4f81b83951b8ca755ad
  - root: event:subagent/descriptor
    before: null
    after: a50913fc99e9081745aab644abed10b33a6043df146e69432fa320322776ae92
  - root: event:todo/write
    before: null
    after: 096eb4f3c6715f66b7f7389477046be5c9373a6d625dff1c516866dc643372e0
  - root: event:tool/call
    before: null
    after: 2cc138d64d80567a0b7a7441a5f27d1237b5c59afa14e479470328dbf9b23187
  - root: event:tool/code-dispatch
    before: null
    after: d7d02b19415ccc60e860721323bc14d7e2831a301e8c4029c962e805669b210c
  - root: event:tool/code-dispatch-start
    before: null
    after: 02c091df7d51a5efcb42dbc696eb887a371d1c55b060918962468787e286b522
  - root: event:tool/result
    before: null
    after: 4bfffc0bcac0977f50bed65c721a694781c7e834bba9790ffcf61b2a1da73a7f
  - root: event:turn/end
    before: null
    after: 0ec430fec65233c9365969a6737f6965539e18c6ee1ef636757bcfd3c9bc8677
  - root: event:turn/start
    before: null
    after: c6110c68daa866e2fc2e2d258766aaf17113d87749d4ce6fc52cbdd6d006c1ce
  - root: event:user/message
    before: null
    after: 0aeb73c9de361ba2389df08ade91d256f8655a81f97b275c5cd495ca1e7c1dd7
  - root: event:web/deepseek-search-llm-request
    before: null
    after: 93b715fe07aa34ce309b7b9e385e9b9cffd040981aee1683c19443330f100abd
```

<a id="changes"></a>
## 结构变化

<!-- persistence-release-changes:start -->

本条记录建立历史比较起点。机器声明列出所有提取的根类型，不对更早版本作兼容性判断。

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
