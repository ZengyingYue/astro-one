---
description: "回溯 astro-one-v0.1.2-alpha.1 的已声明 Session 持久化类型及相邻版本变化。"
kind: persistence-release
---

# 持久化版本回溯: astro-one-v0.1.2-alpha.1

[English](astro-one-v0.1.2-alpha.1.md) | 中文

## 概述

事件信封删除 ignorable，request/header 新增可选字段 startsSeries 及原因值 series，并新增模型选择、子 Agent 模型策略和投递确认事件。尽管存在这些结构变化，写入格式仍为 0。

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
| 源码 tag | `astro-one-v0.1.2-alpha.1` |
| 源码日期 | 2026-08-27T16:57:43.000Z |
| 发行记录 | 有 release 对象。 |
| 前一版本 | [astro-one-v0.1.1-rc.2](astro-one-v0.1.1-rc.2.zh.md) |
| Session 写入版本 | 0 |
| 完整重建清单 | <!-- persistence-release-inventory:start -->54 个根类型 / 417 种类型<!-- persistence-release-inventory:end --> |
| 本条快照 | [astro-one-v0.1.2-alpha.1.schema.json](astro-one-v0.1.2-alpha.1.schema.json) |

写入版本常量在该 tag 中的源码证据：

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## 声明

```yaml persistence-release
schemaVersion: 1
tag: astro-one-v0.1.2-alpha.1
previous: astro-one-v0.1.1-rc.2
sessionFormatVersion: 0
changes:
  - root: SessionEventEnvelope
    before: 3598ae976ac476f3e9471d2da2c1bb65a12d6075ec45bb4de337d138081d089e
    after: bf3fbb9b9ccfeac502172f6680b8d139a744274e9f017e4360e29bc7b574953c
  - root: event:agent-preset/selected
    before: caf2e088d43f293903e3042e8f0ddd2080d14959d6a8469c9931a7493c5d33d7
    after: a0a680dea6b49828e8f550ccc2286bd7b7f3dfeafc4756bf202b86203c58a236
  - root: event:agent/inbox/spliced
    before: 2d4362148432f44d2612b7e961399bacae3d4474800d82f174976876b509187d
    after: 2e1e83c93a237071242ff8d1d307506dc91f69f0d2e4b59b008bd545bef4905e
  - root: event:approval/asked
    before: 008c085b65de0c43f4e05339b13c5eddc74ce4e0b7bdd9e0c5737a3475a21964
    after: 9fc455ecd976cc437181e1f32888e0363800ab33339014ed7c7fea6e9ad35d06
  - root: event:approval/decided
    before: 5c48e09ed636bf49ea73ef1f2a327f5fe6c4d3b39b9dd8650e81b9b2b6e5b211
    after: e368c6fbec48a984839b6c5161674a765ddc24dc567ef900f9b1681d2d5f0af6
  - root: event:approval/policy
    before: bda8326539d1f44845688690b7cdbfa1e09953bb1d1efef56c30bb7df39cfad5
    after: 7ffc3a9078ad12961828fbdbf72d3e2dfaed1b9389e36bff02fbf6d6ecf62d73
  - root: event:assistant/chunk
    before: 7918584bcb08801b87a7b6c2c47c787a904abc94364df1b336dd820bf164b102
    after: 8234b014b3c6ec6d15656f220d6a0211d9c0413b37222c33889627720937757a
  - root: event:assistant/message
    before: 3c0ce9c21ad10ceffb3106b6b3dc6d0436f2ec37486ad75ee57610d0831dcf5d
    after: 3fe18000fb35ff2cc04fd8ebde6adf776dede1c350827cb067635eb8a6caea20
  - root: event:command/done
    before: 74dbebca6a8b8cd2b367564810067ad7661f6a88d7d13e0d470f13137d347277
    after: bc8d7ce85c2016e4a4c61729e9fac117f354283e7d730518eb7f6602a78a2ef5
  - root: event:command/run
    before: 60a423745d6bf26351de44770af194053e844406d58d91516313679cd691ba8b
    after: b0c1753e83115cf09088fcd0006ed156a869e292c896324530e3479ce3cfbd44
  - root: event:compaction/end
    before: 959531fed950f8fb30a4bb90c05d85bd91176d2a72f2441e50aa30237081ee1e
    after: b0945bbdbfdc1933252029820108c0dd4dac34da9230330c554bc73ac7875334
  - root: event:compaction/prune
    before: 33b3105d98e11e0920b762e6c1110014819d463c73c246b0eb21061a42fbde34
    after: 1dfe486046b6be9a3a2e395781234ec39e5604c2e16f3aa7347583ffffea057c
  - root: event:compaction/start
    before: f5e7a61838ee075adc4866ad45fd996f64f04047303f48b39f6f628e58b5136d
    after: 17481698c7297198fa8e5f3b4dbfa1e3b885e442f942dcc52dd2b0a59abaeffb
  - root: event:compaction/summary
    before: 88efa93b21af4fa33ca033e05dacfb8574a76ee7ec333385a36423646fddaf0c
    after: f6448d6036b5c2c95753792f2d24a2559e098a4209e92fa9ae177ce02416fc76
  - root: event:feedback/record
    before: deb4219517fd1e5211eade234f2365b0489a8b2eb43d920de85873da61b4afb4
    after: 5eeec64e629a730e5c3fc83a58047d2c2cc1546c9e8f59b6009c1a6aec188d6d
  - root: event:goal/change
    before: 9ed18a0aca8e0d51b5cc6582c691a163570af373795f82b2e54c6080a6702fa6
    after: af625cb823b54e8b5a7735efe5d139cd824a341b7ec4effb042908431c171d5b
  - root: event:hook/invoked
    before: 9a1b2a6161e46a3b81d67083d0f4864a4b68eb3483bd6c3e6fbb9c3be0a5b07c
    after: ee2ee3201f2212c931b4dd6a2888b4e1b0f04ce918dc3c382f46656db9d312ec
  - root: event:hook/result
    before: 9447910e41827bdf67dd59c77375c315dc7cdaded33d59e8953f5637c172b7d0
    after: 80bc6d5b324f3c775d6731e056ce9faad0f5fd42fc2cd922d9675e804edc40f4
  - root: event:llm/retry
    before: d4b3dea1b854455477647b3cd1c1b34f8f3c9f4b524843364507eb348ffc2435
    after: 3a81f404784b6a2c2a2fa01f6f2251adc93146485d50c44542763cb03b52e52d
  - root: event:llm/retry-started
    before: 8bd1445bfd4015024774f71e06189b49329ab79d584450c885c6b7bb67202221
    after: 0c96f3739c32fd9087a0896e348c8951278eb5ad1c4e0976941d6a0436c18003
  - root: event:model/selection
    before: null
    after: 982540c8455c7312214b20445af9ce252c51f6ec1b3f59dc3435f43e8aa248b8
  - root: event:permission/preset
    before: 014393e7bc4c7991be894e0c7eca498d85f2ad56da0a38a6d960180ab8a1ff3a
    after: 568b855edf43375d11663d098888c3adbf365cd0c83a9037dea07a0fda25f7b2
  - root: event:plan/mode
    before: 9b7041daa9407c23adbeee42cc42b23806986c2f221e388b9f0aa952030e0af8
    after: 6bc6d61439b63bfb14a09baee9f25d51aba8870d0dd3edad31b22bafdfd534f9
  - root: event:request/context
    before: 3f955e2988cd28375b4e96a2597ee263145dad69e1442b902e92da051f50ff62
    after: f5f8e74236ce6052d443dcd6a047c2b27332d3f7e8e2b10f7c3eb6efe296fb2d
  - root: event:request/header
    before: 31f202d9a61e34c123d7f9a444e14fec91862df4f0ac6ccdd29404a6bc274a8e
    after: cc5cf8c090c8d08e8f8756b5446e77f0e5c8be60d1e16f42024085b44d23a56a
  - root: event:sandbox/mode
    before: 1ed7b0d42bdcc62fd178ff9c4520d9bfed3c5ff33b797695c400f3c7012bec5c
    after: 95718eae86dbae0e2dd0ff4097535a25a71a71d946a4a2a99111f084973f565b
  - root: event:schedule/change
    before: 327994b012ef2661befa843e95d33588877111a52735f641d26b187d8ceb5335
    after: 49271ca1e87118c1e545e95486d69852ad3509fbcf0482940dc7ecb252d0ae52
  - root: event:session-log-deepseek/delivery-accepted
    before: null
    after: bce8f57edbce5abfb70a0b217258e2f7544f4c52fc852fd93fb05ccbe86fcc18
  - root: event:session/end-seed
    before: 69facec182cf7f9c9a20968d20da8addceeae268ef1a118674d9ff6406d803c5
    after: a27fa3caa36b1508e7ddd2d1a7e58ac80e0b0b77ee96d355d92e4ce5995bf419
  - root: event:session/title
    before: 0b27055ced025bccdbff6711305a7b8f20a689d7c4411376476ac85fa3d71aae
    after: db9884620cce7de7d6718655b98f9cfd28477650161e8fedefaed962afe419a2
  - root: event:session/title-llm-request
    before: c8d1264533350ad05d7a0e7c574d6658e7ea6fdf99c8cb87278b7b3b4905a3d4
    after: 630e89b4acb1438457d9d85b3bdf743754e3b75340032c0e45008dfe2f2c5771
  - root: event:step/end
    before: ef8385903c588883a8c9f668702973b28f5cd90d857e2bdac5a42361b26fd196
    after: c43ede073364a47849bab37171bcaff8a1a90c91ea46a3b962bce6704fb722c4
  - root: event:step/start
    before: 1c7735f2951cf1f33498c05a7090dbf53b18c03914d33a4342c46c035b20d048
    after: 472fe1eab55a22f3b2e4362c917f89dea1e764d4ec51a4f81b83951b8ca755ad
  - root: event:subagent/descriptor
    before: 113f3bebfd16ba81e19fe28c6f5a9046c65c4c069b36f2748aad27b320e51778
    after: 4399bbc24019d1296c7748151008388259d994a7386f64ef185b9fe8a92dbe37
  - root: event:subagent/model-selection-policy
    before: null
    after: 6d4461e9ac90b6f70e6aab53121ab36feb3a044d9c90e0e28c9287cf30c9c761
  - root: event:team/member
    before: c4002a911c01974f8274b7f56cea9c0d1986087ca0d7c1ab1f3ce3ed1ea766bb
    after: 585e6e516bbc4083a7fafb6ad9448f9277cfd4f97d2c32118ef9454e086d4961
  - root: event:team/message/delivered
    before: e446a1f24aaa82dcd4ef38b0a033c653ec9c74628e9fb75f5ecf977821f7328c
    after: 5522ab15b98dce30e4c9b9c98fd4fa9213400c6f42991e2c8d76055ce4005912
  - root: event:team/message/queued
    before: c23dc4e06b6cc3cfdc4f7583b83b82163d62329526ca1423bda3f3fb6818c976
    after: 2b78577b8f14d7ad8f18cf913812aa26c062bd7ff0af90451616694557da840d
  - root: event:team/task
    before: 196ba28b1366d7f47ede901dae99b91be217a14482b583269a908f356e46d889
    after: ec612550a43dc3533b455ffa8486cf27d7ea63903c1693df3f5544bbf79c5dcf
  - root: event:todo/write
    before: 1c57f5cacaa7b5b4668c581ecbecf7bfa4fbdf82957a5e383dd8ee595c10b11e
    after: 096eb4f3c6715f66b7f7389477046be5c9373a6d625dff1c516866dc643372e0
  - root: event:tool-workflow/agent-end
    before: 7e379b484c7d8ab39d1b63b9c0559c9b1e1f8d5a624cc12e59cb7f6b58418765
    after: 62a214280cd6dd29cf1d58ca17b570dc42acf561ee9636d5cf28331509579d9b
  - root: event:tool-workflow/agent-start
    before: 8f349514f2fc895f0d60be1f8a40c565d5c457b239ae8382318b09f2d88461ea
    after: ccf6966ee3e7c22345451a85914a3568bed0835e4bfec61df3abebc9cfe6b159
  - root: event:tool-workflow/run-end
    before: 610822e6da5ef7d64010641b4d210f407e70dbfe7e77fdd40d1497fb4f37929a
    after: a312d43c2809c59e52323011fd9f5f4f5270e36ca9d6aa4ecbc1aa774b238833
  - root: event:tool-workflow/run-start
    before: c8acd8c872e63bf5a008b610063dac0c758bb9afda1ecad90bd6c1fbcaaa3e65
    after: e3e62588066bcfc9eb23cf44fe6a0f50d77f2e5ae6911c3bdf83d8dea827478f
  - root: event:tool/call
    before: 4037597fb04addc3bdcf376960146fedfd94ff703b15b4c7d784b00f242913a0
    after: 2cc138d64d80567a0b7a7441a5f27d1237b5c59afa14e479470328dbf9b23187
  - root: event:tool/code-dispatch
    before: 716572b19456b27a5f5affede4cffc1293f7d30bbcaa433478624aae3b44b0f6
    after: ea6a64646c401df72d8db4aa3186012666a7f2e6178979e23b8bd362e1560d54
  - root: event:tool/code-dispatch-start
    before: 28630fd10b18fa30acd76184f679afc5e4832e4b8dd2ef6f97a97fc70e4a8d32
    after: 02c091df7d51a5efcb42dbc696eb887a371d1c55b060918962468787e286b522
  - root: event:tool/result
    before: 82ec6c80072b8bd5a53cf6a1f7ae55c8e82a5a2c4a840bc1f059e4dac7f3cea7
    after: 900efd0af241fcde7d62e9b78e975c50c811a0333a1b1a4d8d080fd13d21e500
  - root: event:turn/end
    before: d5b2d819b22beae540fa84627362470af8901a782209627e8b1fd37ac233e1ac
    after: 0ec430fec65233c9365969a6737f6965539e18c6ee1ef636757bcfd3c9bc8677
  - root: event:turn/start
    before: 0e38b711b4d60ee86aadd6aa11baeca444c4fa76eaa3dece5fe3bda61c4c1f39
    after: c6110c68daa866e2fc2e2d258766aaf17113d87749d4ce6fc52cbdd6d006c1ce
  - root: event:user/message
    before: e608c162536de02cfaa194ce99cf857c12225e1793f80e446ef98ae99a732d15
    after: 303cd594f88dbcaa85e1b960baaf9255cf20dd1479cd6e51fd3241a9964f30f6
  - root: event:web/deepseek-search-llm-request
    before: ff55a2780a41c47bd5b882c44015058621ead9ad568eea06614f3a0b39f3903d
    after: 93b715fe07aa34ce309b7b9e385e9b9cffd040981aee1683c19443330f100abd
```

<a id="changes"></a>
## 结构变化

<!-- persistence-release-changes:start -->

检测到 52 个根类型变化、61 项结构差异。下表的最低要求按当前规则计算，只用于比较；不表示旧版本曾遵守这些规则，也不证明迁移或运行时兼容性。

| 路径 | 变化 | 当前最低要求 |
|---|---|---|
| `SessionEventEnvelope` | `union-variants-changed` | `version-bump` |
| `event:agent-preset/selected.ignorable` | `property-removed` | `version-bump` |
| `event:agent/inbox/spliced.data.inserted[].source` | `union-variants-changed` | `version-bump` |
| `event:agent/inbox/spliced.ignorable` | `property-removed` | `version-bump` |
| `event:approval/asked.ignorable` | `property-removed` | `version-bump` |
| `event:approval/decided.ignorable` | `property-removed` | `version-bump` |
| `event:approval/policy.ignorable` | `property-removed` | `version-bump` |
| `event:assistant/chunk.data.chunk.usage.totalTokens` | `optional-property-added` | `same-version` |
| `event:assistant/chunk.ignorable` | `property-removed` | `version-bump` |
| `event:assistant/message.data.usage.totalTokens` | `optional-property-added` | `same-version` |
| `event:assistant/message.ignorable` | `property-removed` | `version-bump` |
| `event:command/done.ignorable` | `property-removed` | `version-bump` |
| `event:command/run.ignorable` | `property-removed` | `version-bump` |
| `event:compaction/end.ignorable` | `property-removed` | `version-bump` |
| `event:compaction/prune.ignorable` | `property-removed` | `version-bump` |
| `event:compaction/start.ignorable` | `property-removed` | `version-bump` |
| `event:compaction/summary.data.usage.totalTokens` | `optional-property-added` | `same-version` |
| `event:compaction/summary.ignorable` | `property-removed` | `version-bump` |
| `event:feedback/record.ignorable` | `property-removed` | `version-bump` |
| `event:goal/change.ignorable` | `property-removed` | `version-bump` |
| `event:hook/invoked.ignorable` | `property-removed` | `version-bump` |
| `event:hook/result.ignorable` | `property-removed` | `version-bump` |
| `event:llm/retry.ignorable` | `property-removed` | `version-bump` |
| `event:llm/retry-started.ignorable` | `property-removed` | `version-bump` |
| `event:model/selection` | `root-added` | `same-version` |
| `event:permission/preset.ignorable` | `property-removed` | `version-bump` |
| `event:plan/mode.ignorable` | `property-removed` | `version-bump` |
| `event:request/context.ignorable` | `property-removed` | `version-bump` |
| `event:request/header.data.reason` | `union-variants-changed` | `version-bump` |
| `event:request/header.data.startsSeries` | `optional-property-added` | `same-version` |
| `event:request/header.ignorable` | `property-removed` | `version-bump` |
| `event:sandbox/mode.ignorable` | `property-removed` | `version-bump` |
| `event:schedule/change.ignorable` | `property-removed` | `version-bump` |
| `event:session-log-deepseek/delivery-accepted` | `root-added` | `same-version` |
| `event:session/end-seed.ignorable` | `property-removed` | `version-bump` |
| `event:session/title.ignorable` | `property-removed` | `version-bump` |
| `event:session/title-llm-request.data.messages[].source` | `union-variants-changed` | `version-bump` |
| `event:session/title-llm-request.ignorable` | `property-removed` | `version-bump` |
| `event:step/end.ignorable` | `property-removed` | `version-bump` |
| `event:step/start.ignorable` | `property-removed` | `version-bump` |
| `event:subagent/descriptor.data.agentReasoningEffort` | `optional-property-added` | `same-version` |
| `event:subagent/descriptor.ignorable` | `property-removed` | `version-bump` |
| `event:subagent/model-selection-policy` | `root-added` | `same-version` |
| `event:team/member.ignorable` | `property-removed` | `version-bump` |
| `event:team/message/delivered.ignorable` | `property-removed` | `version-bump` |
| `event:team/message/queued.ignorable` | `property-removed` | `version-bump` |
| `event:team/task.ignorable` | `property-removed` | `version-bump` |
| `event:todo/write.ignorable` | `property-removed` | `version-bump` |
| `event:tool-workflow/agent-end.ignorable` | `property-removed` | `version-bump` |
| `event:tool-workflow/agent-start.ignorable` | `property-removed` | `version-bump` |
| `event:tool-workflow/run-end.ignorable` | `property-removed` | `version-bump` |
| `event:tool-workflow/run-start.ignorable` | `property-removed` | `version-bump` |
| `event:tool/call.ignorable` | `property-removed` | `version-bump` |
| `event:tool/code-dispatch.ignorable` | `property-removed` | `version-bump` |
| `event:tool/code-dispatch-start.ignorable` | `property-removed` | `version-bump` |
| `event:tool/result.ignorable` | `property-removed` | `version-bump` |
| `event:turn/end.ignorable` | `property-removed` | `version-bump` |
| `event:turn/start.ignorable` | `property-removed` | `version-bump` |
| `event:user/message.data.source` | `union-variants-changed` | `version-bump` |
| `event:user/message.ignorable` | `property-removed` | `version-bump` |
| `event:web/deepseek-search-llm-request.ignorable` | `property-removed` | `version-bump` |

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
