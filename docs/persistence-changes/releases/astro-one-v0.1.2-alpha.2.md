---
description: "Retrospective Session persistence types and adjacent-release changes for astro-one-v0.1.2-alpha.2."
kind: persistence-release
---

# Persistence release: astro-one-v0.1.2-alpha.2

English | [中文](astro-one-v0.1.2-alpha.2.zh.md)

## Summary

The envelope restores optional ignorable. The writer format remains 0.

## Table of Contents

- [Release evidence](#evidence)
- [Declaration](#declaration)
- [Structural changes](#changes)
- [Verification](#verification)
- [Dev Note](#dev-note)

-----

<a id="evidence"></a>
## Release evidence

This approximate backfill supports reading and format validation; it is not a contemporaneous compatibility acknowledgement. See the [archive reference](README.md) for extraction and coverage limits.

| Item | Recorded value |
|---|---|
| Source tag | `astro-one-v0.1.2-alpha.2` |
| Source date | 2026-08-30T13:37:53.000Z |
| Release record | Release object present. |
| Previous release | [astro-one-v0.1.2-alpha.1](astro-one-v0.1.2-alpha.1.md) |
| Session writer version | 0 |
| Reconstructed inventory | <!-- persistence-release-inventory:start -->54 roots / 417 types<!-- persistence-release-inventory:end --> |
| This snapshot | [astro-one-v0.1.2-alpha.2.schema.json](astro-one-v0.1.2-alpha.2.schema.json) |

Source evidence for the writer version constant at this tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## Declaration

```yaml persistence-release
schemaVersion: 1
tag: astro-one-v0.1.2-alpha.2
previous: astro-one-v0.1.2-alpha.1
sessionFormatVersion: 0
changes:
  - root: SessionEventEnvelope
    before: bf3fbb9b9ccfeac502172f6680b8d139a744274e9f017e4360e29bc7b574953c
    after: 3598ae976ac476f3e9471d2da2c1bb65a12d6075ec45bb4de337d138081d089e
  - root: event:agent-preset/selected
    before: a0a680dea6b49828e8f550ccc2286bd7b7f3dfeafc4756bf202b86203c58a236
    after: caf2e088d43f293903e3042e8f0ddd2080d14959d6a8469c9931a7493c5d33d7
  - root: event:agent/inbox/spliced
    before: 2e1e83c93a237071242ff8d1d307506dc91f69f0d2e4b59b008bd545bef4905e
    after: 8212b07d3fa4b0576e59b35dcb27381abdda80a0452bc8a348fddf18fc00cbce
  - root: event:approval/asked
    before: 9fc455ecd976cc437181e1f32888e0363800ab33339014ed7c7fea6e9ad35d06
    after: 008c085b65de0c43f4e05339b13c5eddc74ce4e0b7bdd9e0c5737a3475a21964
  - root: event:approval/decided
    before: e368c6fbec48a984839b6c5161674a765ddc24dc567ef900f9b1681d2d5f0af6
    after: 5c48e09ed636bf49ea73ef1f2a327f5fe6c4d3b39b9dd8650e81b9b2b6e5b211
  - root: event:approval/policy
    before: 7ffc3a9078ad12961828fbdbf72d3e2dfaed1b9389e36bff02fbf6d6ecf62d73
    after: bda8326539d1f44845688690b7cdbfa1e09953bb1d1efef56c30bb7df39cfad5
  - root: event:assistant/chunk
    before: 8234b014b3c6ec6d15656f220d6a0211d9c0413b37222c33889627720937757a
    after: f3f2ffdd3841a487ad434abab6406072dc51bc45c26f06886c33eaa9b1c2cb84
  - root: event:assistant/message
    before: 3fe18000fb35ff2cc04fd8ebde6adf776dede1c350827cb067635eb8a6caea20
    after: ff5d927293a966f5dcddd4fad390900f90c4c1f7b04adfd672fc7c3182d6532b
  - root: event:command/done
    before: bc8d7ce85c2016e4a4c61729e9fac117f354283e7d730518eb7f6602a78a2ef5
    after: 74dbebca6a8b8cd2b367564810067ad7661f6a88d7d13e0d470f13137d347277
  - root: event:command/run
    before: b0c1753e83115cf09088fcd0006ed156a869e292c896324530e3479ce3cfbd44
    after: 60a423745d6bf26351de44770af194053e844406d58d91516313679cd691ba8b
  - root: event:compaction/end
    before: b0945bbdbfdc1933252029820108c0dd4dac34da9230330c554bc73ac7875334
    after: 959531fed950f8fb30a4bb90c05d85bd91176d2a72f2441e50aa30237081ee1e
  - root: event:compaction/prune
    before: 1dfe486046b6be9a3a2e395781234ec39e5604c2e16f3aa7347583ffffea057c
    after: 33b3105d98e11e0920b762e6c1110014819d463c73c246b0eb21061a42fbde34
  - root: event:compaction/start
    before: 17481698c7297198fa8e5f3b4dbfa1e3b885e442f942dcc52dd2b0a59abaeffb
    after: f5e7a61838ee075adc4866ad45fd996f64f04047303f48b39f6f628e58b5136d
  - root: event:compaction/summary
    before: f6448d6036b5c2c95753792f2d24a2559e098a4209e92fa9ae177ce02416fc76
    after: 329cbb47bc3583292dce3f6fca0dffd7bb422194ec55b8180ab763b278b0aead
  - root: event:feedback/record
    before: 5eeec64e629a730e5c3fc83a58047d2c2cc1546c9e8f59b6009c1a6aec188d6d
    after: deb4219517fd1e5211eade234f2365b0489a8b2eb43d920de85873da61b4afb4
  - root: event:goal/change
    before: af625cb823b54e8b5a7735efe5d139cd824a341b7ec4effb042908431c171d5b
    after: 9ed18a0aca8e0d51b5cc6582c691a163570af373795f82b2e54c6080a6702fa6
  - root: event:hook/invoked
    before: ee2ee3201f2212c931b4dd6a2888b4e1b0f04ce918dc3c382f46656db9d312ec
    after: 9a1b2a6161e46a3b81d67083d0f4864a4b68eb3483bd6c3e6fbb9c3be0a5b07c
  - root: event:hook/result
    before: 80bc6d5b324f3c775d6731e056ce9faad0f5fd42fc2cd922d9675e804edc40f4
    after: 9447910e41827bdf67dd59c77375c315dc7cdaded33d59e8953f5637c172b7d0
  - root: event:llm/retry
    before: 3a81f404784b6a2c2a2fa01f6f2251adc93146485d50c44542763cb03b52e52d
    after: d4b3dea1b854455477647b3cd1c1b34f8f3c9f4b524843364507eb348ffc2435
  - root: event:llm/retry-started
    before: 0c96f3739c32fd9087a0896e348c8951278eb5ad1c4e0976941d6a0436c18003
    after: 8bd1445bfd4015024774f71e06189b49329ab79d584450c885c6b7bb67202221
  - root: event:model/selection
    before: 982540c8455c7312214b20445af9ce252c51f6ec1b3f59dc3435f43e8aa248b8
    after: c54174d9a250ccba77b972b96af750539a6c99c56985ec2814cc47e190a3f578
  - root: event:permission/preset
    before: 568b855edf43375d11663d098888c3adbf365cd0c83a9037dea07a0fda25f7b2
    after: 014393e7bc4c7991be894e0c7eca498d85f2ad56da0a38a6d960180ab8a1ff3a
  - root: event:plan/mode
    before: 6bc6d61439b63bfb14a09baee9f25d51aba8870d0dd3edad31b22bafdfd534f9
    after: 9b7041daa9407c23adbeee42cc42b23806986c2f221e388b9f0aa952030e0af8
  - root: event:request/context
    before: f5f8e74236ce6052d443dcd6a047c2b27332d3f7e8e2b10f7c3eb6efe296fb2d
    after: 3f955e2988cd28375b4e96a2597ee263145dad69e1442b902e92da051f50ff62
  - root: event:request/header
    before: cc5cf8c090c8d08e8f8756b5446e77f0e5c8be60d1e16f42024085b44d23a56a
    after: 9c357f180064852c91c1adf60102d7c1c0b480b8119380008f4e590fc22eb782
  - root: event:sandbox/mode
    before: 95718eae86dbae0e2dd0ff4097535a25a71a71d946a4a2a99111f084973f565b
    after: 1ed7b0d42bdcc62fd178ff9c4520d9bfed3c5ff33b797695c400f3c7012bec5c
  - root: event:schedule/change
    before: 49271ca1e87118c1e545e95486d69852ad3509fbcf0482940dc7ecb252d0ae52
    after: 327994b012ef2661befa843e95d33588877111a52735f641d26b187d8ceb5335
  - root: event:session-log-deepseek/delivery-accepted
    before: bce8f57edbce5abfb70a0b217258e2f7544f4c52fc852fd93fb05ccbe86fcc18
    after: 3a1a5dcc8a77846e5666a4ade0f95a02c4484b2f7c3d44fc88887d77bc038313
  - root: event:session/end-seed
    before: a27fa3caa36b1508e7ddd2d1a7e58ac80e0b0b77ee96d355d92e4ce5995bf419
    after: 69facec182cf7f9c9a20968d20da8addceeae268ef1a118674d9ff6406d803c5
  - root: event:session/title
    before: db9884620cce7de7d6718655b98f9cfd28477650161e8fedefaed962afe419a2
    after: 0b27055ced025bccdbff6711305a7b8f20a689d7c4411376476ac85fa3d71aae
  - root: event:session/title-llm-request
    before: 630e89b4acb1438457d9d85b3bdf743754e3b75340032c0e45008dfe2f2c5771
    after: 15cf9727f25c72740eebf02f7e519537fb8a959850add3ee9600d803551455de
  - root: event:step/end
    before: c43ede073364a47849bab37171bcaff8a1a90c91ea46a3b962bce6704fb722c4
    after: ef8385903c588883a8c9f668702973b28f5cd90d857e2bdac5a42361b26fd196
  - root: event:step/start
    before: 472fe1eab55a22f3b2e4362c917f89dea1e764d4ec51a4f81b83951b8ca755ad
    after: 1c7735f2951cf1f33498c05a7090dbf53b18c03914d33a4342c46c035b20d048
  - root: event:subagent/descriptor
    before: 4399bbc24019d1296c7748151008388259d994a7386f64ef185b9fe8a92dbe37
    after: a9394127e93a75643e52e6bbef981925d3d8ba404dd7913144514297fecb1a2d
  - root: event:subagent/model-selection-policy
    before: 6d4461e9ac90b6f70e6aab53121ab36feb3a044d9c90e0e28c9287cf30c9c761
    after: 407f8deee4e1efc5abd779c9c709bde1310238c4bfb9a680cadffdf4b955dac1
  - root: event:team/member
    before: 585e6e516bbc4083a7fafb6ad9448f9277cfd4f97d2c32118ef9454e086d4961
    after: c4002a911c01974f8274b7f56cea9c0d1986087ca0d7c1ab1f3ce3ed1ea766bb
  - root: event:team/message/delivered
    before: 5522ab15b98dce30e4c9b9c98fd4fa9213400c6f42991e2c8d76055ce4005912
    after: e446a1f24aaa82dcd4ef38b0a033c653ec9c74628e9fb75f5ecf977821f7328c
  - root: event:team/message/queued
    before: 2b78577b8f14d7ad8f18cf913812aa26c062bd7ff0af90451616694557da840d
    after: c23dc4e06b6cc3cfdc4f7583b83b82163d62329526ca1423bda3f3fb6818c976
  - root: event:team/task
    before: ec612550a43dc3533b455ffa8486cf27d7ea63903c1693df3f5544bbf79c5dcf
    after: 196ba28b1366d7f47ede901dae99b91be217a14482b583269a908f356e46d889
  - root: event:todo/write
    before: 096eb4f3c6715f66b7f7389477046be5c9373a6d625dff1c516866dc643372e0
    after: 1c57f5cacaa7b5b4668c581ecbecf7bfa4fbdf82957a5e383dd8ee595c10b11e
  - root: event:tool-workflow/agent-end
    before: 62a214280cd6dd29cf1d58ca17b570dc42acf561ee9636d5cf28331509579d9b
    after: 7e379b484c7d8ab39d1b63b9c0559c9b1e1f8d5a624cc12e59cb7f6b58418765
  - root: event:tool-workflow/agent-start
    before: ccf6966ee3e7c22345451a85914a3568bed0835e4bfec61df3abebc9cfe6b159
    after: 8f349514f2fc895f0d60be1f8a40c565d5c457b239ae8382318b09f2d88461ea
  - root: event:tool-workflow/run-end
    before: a312d43c2809c59e52323011fd9f5f4f5270e36ca9d6aa4ecbc1aa774b238833
    after: 610822e6da5ef7d64010641b4d210f407e70dbfe7e77fdd40d1497fb4f37929a
  - root: event:tool-workflow/run-start
    before: e3e62588066bcfc9eb23cf44fe6a0f50d77f2e5ae6911c3bdf83d8dea827478f
    after: c8acd8c872e63bf5a008b610063dac0c758bb9afda1ecad90bd6c1fbcaaa3e65
  - root: event:tool/call
    before: 2cc138d64d80567a0b7a7441a5f27d1237b5c59afa14e479470328dbf9b23187
    after: 4037597fb04addc3bdcf376960146fedfd94ff703b15b4c7d784b00f242913a0
  - root: event:tool/code-dispatch
    before: ea6a64646c401df72d8db4aa3186012666a7f2e6178979e23b8bd362e1560d54
    after: 716572b19456b27a5f5affede4cffc1293f7d30bbcaa433478624aae3b44b0f6
  - root: event:tool/code-dispatch-start
    before: 02c091df7d51a5efcb42dbc696eb887a371d1c55b060918962468787e286b522
    after: 28630fd10b18fa30acd76184f679afc5e4832e4b8dd2ef6f97a97fc70e4a8d32
  - root: event:tool/result
    before: 900efd0af241fcde7d62e9b78e975c50c811a0333a1b1a4d8d080fd13d21e500
    after: 82ec6c80072b8bd5a53cf6a1f7ae55c8e82a5a2c4a840bc1f059e4dac7f3cea7
  - root: event:turn/end
    before: 0ec430fec65233c9365969a6737f6965539e18c6ee1ef636757bcfd3c9bc8677
    after: d5b2d819b22beae540fa84627362470af8901a782209627e8b1fd37ac233e1ac
  - root: event:turn/start
    before: c6110c68daa866e2fc2e2d258766aaf17113d87749d4ce6fc52cbdd6d006c1ce
    after: 0e38b711b4d60ee86aadd6aa11baeca444c4fa76eaa3dece5fe3bda61c4c1f39
  - root: event:user/message
    before: 303cd594f88dbcaa85e1b960baaf9255cf20dd1479cd6e51fd3241a9964f30f6
    after: 9e3978467b987defa20278e58ab1cb3879f0801cef4dc3f629a09a7e709af9dc
  - root: event:web/deepseek-search-llm-request
    before: 93b715fe07aa34ce309b7b9e385e9b9cffd040981aee1683c19443330f100abd
    after: ff55a2780a41c47bd5b882c44015058621ead9ad568eea06614f3a0b39f3903d
```

<a id="changes"></a>
## Structural changes

<!-- persistence-release-changes:start -->

Detected 52 changed roots and 52 structural differences. The minimum below is calculated using current rules for comparison only; it does not assert historical compliance, migration correctness, or runtime compatibility.

| Path | Change | Current minimum |
|---|---|---|
| `SessionEventEnvelope` | `union-variants-changed` | `version-bump` |
| `event:agent-preset/selected.ignorable` | `optional-property-added` | `version-bump` |
| `event:agent/inbox/spliced.ignorable` | `optional-property-added` | `version-bump` |
| `event:approval/asked.ignorable` | `optional-property-added` | `version-bump` |
| `event:approval/decided.ignorable` | `optional-property-added` | `version-bump` |
| `event:approval/policy.ignorable` | `optional-property-added` | `version-bump` |
| `event:assistant/chunk.ignorable` | `optional-property-added` | `version-bump` |
| `event:assistant/message.ignorable` | `optional-property-added` | `version-bump` |
| `event:command/done.ignorable` | `optional-property-added` | `version-bump` |
| `event:command/run.ignorable` | `optional-property-added` | `version-bump` |
| `event:compaction/end.ignorable` | `optional-property-added` | `version-bump` |
| `event:compaction/prune.ignorable` | `optional-property-added` | `version-bump` |
| `event:compaction/start.ignorable` | `optional-property-added` | `version-bump` |
| `event:compaction/summary.ignorable` | `optional-property-added` | `version-bump` |
| `event:feedback/record.ignorable` | `optional-property-added` | `version-bump` |
| `event:goal/change.ignorable` | `optional-property-added` | `version-bump` |
| `event:hook/invoked.ignorable` | `optional-property-added` | `version-bump` |
| `event:hook/result.ignorable` | `optional-property-added` | `version-bump` |
| `event:llm/retry.ignorable` | `optional-property-added` | `version-bump` |
| `event:llm/retry-started.ignorable` | `optional-property-added` | `version-bump` |
| `event:model/selection.ignorable` | `optional-property-added` | `version-bump` |
| `event:permission/preset.ignorable` | `optional-property-added` | `version-bump` |
| `event:plan/mode.ignorable` | `optional-property-added` | `version-bump` |
| `event:request/context.ignorable` | `optional-property-added` | `version-bump` |
| `event:request/header.ignorable` | `optional-property-added` | `version-bump` |
| `event:sandbox/mode.ignorable` | `optional-property-added` | `version-bump` |
| `event:schedule/change.ignorable` | `optional-property-added` | `version-bump` |
| `event:session-log-deepseek/delivery-accepted.ignorable` | `optional-property-added` | `version-bump` |
| `event:session/end-seed.ignorable` | `optional-property-added` | `version-bump` |
| `event:session/title.ignorable` | `optional-property-added` | `version-bump` |
| `event:session/title-llm-request.ignorable` | `optional-property-added` | `version-bump` |
| `event:step/end.ignorable` | `optional-property-added` | `version-bump` |
| `event:step/start.ignorable` | `optional-property-added` | `version-bump` |
| `event:subagent/descriptor.ignorable` | `optional-property-added` | `version-bump` |
| `event:subagent/model-selection-policy.ignorable` | `optional-property-added` | `version-bump` |
| `event:team/member.ignorable` | `optional-property-added` | `version-bump` |
| `event:team/message/delivered.ignorable` | `optional-property-added` | `version-bump` |
| `event:team/message/queued.ignorable` | `optional-property-added` | `version-bump` |
| `event:team/task.ignorable` | `optional-property-added` | `version-bump` |
| `event:todo/write.ignorable` | `optional-property-added` | `version-bump` |
| `event:tool-workflow/agent-end.ignorable` | `optional-property-added` | `version-bump` |
| `event:tool-workflow/agent-start.ignorable` | `optional-property-added` | `version-bump` |
| `event:tool-workflow/run-end.ignorable` | `optional-property-added` | `version-bump` |
| `event:tool-workflow/run-start.ignorable` | `optional-property-added` | `version-bump` |
| `event:tool/call.ignorable` | `optional-property-added` | `version-bump` |
| `event:tool/code-dispatch.ignorable` | `optional-property-added` | `version-bump` |
| `event:tool/code-dispatch-start.ignorable` | `optional-property-added` | `version-bump` |
| `event:tool/result.ignorable` | `optional-property-added` | `version-bump` |
| `event:turn/end.ignorable` | `optional-property-added` | `version-bump` |
| `event:turn/start.ignorable` | `optional-property-added` | `version-bump` |
| `event:user/message.ignorable` | `optional-property-added` | `version-bump` |
| `event:web/deepseek-search-llm-request.ignorable` | `optional-property-added` | `version-bump` |

<!-- persistence-release-changes:end -->

<a id="verification"></a>
## Verification

Extraction passed canonical-graph, root-digest, and reachable-type-digest validation, permitting the original optional `surfaceOp` only for historical surface events. The in-tree check reconstructs each tag from its predecessor and verifies before/after values, snapshot coverage, and bilingual machine declarations.

```sh
pnpm run verify-persistence-releases
```

<a id="dev-note"></a>
## Dev Note

None.
