---
description: "Retrospective Session persistence types and adjacent-release changes for astro-one-v0.0.1-rc.2."
kind: persistence-release
---

# Persistence release: astro-one-v0.0.1-rc.2

English | [中文](astro-one-v0.0.1-rc.2.zh.md)

## Summary

The event envelope gains optional ignorable, and schedule/change plus four tool-workflow events are added. The writer format remains 0.

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
| Source tag | `astro-one-v0.0.1-rc.2` |
| Source date | 2026-08-11T15:04:55.000Z |
| Release record | Tag only; no release object. |
| Previous release | [astro-one-v0.0.1-rc.1](astro-one-v0.0.1-rc.1.md) |
| Session writer version | 0 |
| Reconstructed inventory | <!-- persistence-release-inventory:start -->47 roots / 374 types<!-- persistence-release-inventory:end --> |
| This snapshot | [astro-one-v0.0.1-rc.2.schema.json](astro-one-v0.0.1-rc.2.schema.json) |

Source evidence for the writer version constant at this tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## Declaration

```yaml persistence-release
schemaVersion: 1
tag: astro-one-v0.0.1-rc.2
previous: astro-one-v0.0.1-rc.1
sessionFormatVersion: 0
changes:
  - root: SessionEventEnvelope
    before: bf3fbb9b9ccfeac502172f6680b8d139a744274e9f017e4360e29bc7b574953c
    after: 3598ae976ac476f3e9471d2da2c1bb65a12d6075ec45bb4de337d138081d089e
  - root: event:agent-preset/selected
    before: a0a680dea6b49828e8f550ccc2286bd7b7f3dfeafc4756bf202b86203c58a236
    after: caf2e088d43f293903e3042e8f0ddd2080d14959d6a8469c9931a7493c5d33d7
  - root: event:agent/inbox/spliced
    before: 9c49b940542fc990d45bf8ba010b19d6c71f4506cffc96339c662afcffc45d65
    after: 8c40f0f353885f125ae8c94768fd466fe17e53c7f81c1f8604ac3035f1a29e1b
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
    before: b331e05113051852c9129662c9b865f11c580490e015c48a5db6707159d71877
    after: 55816540f8f455805bcca41d94ec51c36de703ebef8a51080dd373ce694997bf
  - root: event:assistant/message
    before: 3a3a97f39af1b73435f9f7062458f192062ccb3ab8dbb70f2f5fefee9024302c
    after: 5d6c2a2d2c5b5d507c5288e070aab7471aed408af160565165137cf9680f3330
  - root: event:command/done
    before: bc8d7ce85c2016e4a4c61729e9fac117f354283e7d730518eb7f6602a78a2ef5
    after: 74dbebca6a8b8cd2b367564810067ad7661f6a88d7d13e0d470f13137d347277
  - root: event:command/run
    before: b0c1753e83115cf09088fcd0006ed156a869e292c896324530e3479ce3cfbd44
    after: 60a423745d6bf26351de44770af194053e844406d58d91516313679cd691ba8b
  - root: event:compact/end
    before: 302d63834b743caf9dba1ad318e8a198b85518f5d429cce84179706786f58cd5
    after: 360aa2133868307cdd2f1e244a1cfeae237d850170e6686045e478912f3bd689
  - root: event:compact/prune
    before: 9bf77430b743cb92fb73a066d73c9c1adf51ac0971fd92422cb22498f765b562
    after: 4ad2a95158380bcf47833eb323df01a2798b99fa06099556cd9f9c782a06933c
  - root: event:compact/start
    before: 535c4b3e33d76d3f7236060dd7778b29fa21f4eacc1041874161220cb911c275
    after: 5f77517121e55e1cee6dc54800fbf6ca9008c2ef13c3fe7e56327a18f3c1a021
  - root: event:compact/summary
    before: 8e63b5242b7827484d2862907a871c7b71b996aa45e7e3a560a327cdc00317fe
    after: 995555416ea36e143b68530ad93bc899cd9615d6ddc9ab8117d4e25bf1da0c30
  - root: event:feedback/record
    before: 5eeec64e629a730e5c3fc83a58047d2c2cc1546c9e8f59b6009c1a6aec188d6d
    after: deb4219517fd1e5211eade234f2365b0489a8b2eb43d920de85873da61b4afb4
  - root: event:goal/change
    before: af625cb823b54e8b5a7735efe5d139cd824a341b7ec4effb042908431c171d5b
    after: 9ed18a0aca8e0d51b5cc6582c691a163570af373795f82b2e54c6080a6702fa6
  - root: event:hook/invoked
    before: 085a6d9f5b8b2c16045b3a4459ef8da8040b845e424e71995db6776ca2d48e5b
    after: cb564798d60dbcd664ddcb2daf0ae03eb3ad8ad90448743f2010783dca0924f4
  - root: event:hook/result
    before: 80bc6d5b324f3c775d6731e056ce9faad0f5fd42fc2cd922d9675e804edc40f4
    after: 9447910e41827bdf67dd59c77375c315dc7cdaded33d59e8953f5637c172b7d0
  - root: event:llm/retry
    before: 3a81f404784b6a2c2a2fa01f6f2251adc93146485d50c44542763cb03b52e52d
    after: d4b3dea1b854455477647b3cd1c1b34f8f3c9f4b524843364507eb348ffc2435
  - root: event:llm/retry-started
    before: 0c96f3739c32fd9087a0896e348c8951278eb5ad1c4e0976941d6a0436c18003
    after: 8bd1445bfd4015024774f71e06189b49329ab79d584450c885c6b7bb67202221
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
    before: b019745b7f57dc4a1840b28b2b5a38d6f6aaf566735d35dbf8222f3b8ebcfdca
    after: 31f202d9a61e34c123d7f9a444e14fec91862df4f0ac6ccdd29404a6bc274a8e
  - root: event:sandbox/mode
    before: 95718eae86dbae0e2dd0ff4097535a25a71a71d946a4a2a99111f084973f565b
    after: 1ed7b0d42bdcc62fd178ff9c4520d9bfed3c5ff33b797695c400f3c7012bec5c
  - root: event:schedule/change
    before: null
    after: 327994b012ef2661befa843e95d33588877111a52735f641d26b187d8ceb5335
  - root: event:session/end-seed
    before: a27fa3caa36b1508e7ddd2d1a7e58ac80e0b0b77ee96d355d92e4ce5995bf419
    after: 69facec182cf7f9c9a20968d20da8addceeae268ef1a118674d9ff6406d803c5
  - root: event:session/title
    before: db9884620cce7de7d6718655b98f9cfd28477650161e8fedefaed962afe419a2
    after: 0b27055ced025bccdbff6711305a7b8f20a689d7c4411376476ac85fa3d71aae
  - root: event:session/title-llm-request
    before: b31c72c5e4c206f6750ee97e3e1b32fffd5f28ef351f587ec74e1438cf9ba2bc
    after: 24520618248f41781f71898c656547485e09e0a8af4b1c4daf407f92addf42c8
  - root: event:step/end
    before: c43ede073364a47849bab37171bcaff8a1a90c91ea46a3b962bce6704fb722c4
    after: ef8385903c588883a8c9f668702973b28f5cd90d857e2bdac5a42361b26fd196
  - root: event:step/start
    before: 472fe1eab55a22f3b2e4362c917f89dea1e764d4ec51a4f81b83951b8ca755ad
    after: 1c7735f2951cf1f33498c05a7090dbf53b18c03914d33a4342c46c035b20d048
  - root: event:subagent/descriptor
    before: a50913fc99e9081745aab644abed10b33a6043df146e69432fa320322776ae92
    after: 113f3bebfd16ba81e19fe28c6f5a9046c65c4c069b36f2748aad27b320e51778
  - root: event:todo/write
    before: 096eb4f3c6715f66b7f7389477046be5c9373a6d625dff1c516866dc643372e0
    after: 1c57f5cacaa7b5b4668c581ecbecf7bfa4fbdf82957a5e383dd8ee595c10b11e
  - root: event:tool-workflow/agent-end
    before: null
    after: 7e379b484c7d8ab39d1b63b9c0559c9b1e1f8d5a624cc12e59cb7f6b58418765
  - root: event:tool-workflow/agent-start
    before: null
    after: 8f349514f2fc895f0d60be1f8a40c565d5c457b239ae8382318b09f2d88461ea
  - root: event:tool-workflow/run-end
    before: null
    after: 610822e6da5ef7d64010641b4d210f407e70dbfe7e77fdd40d1497fb4f37929a
  - root: event:tool-workflow/run-start
    before: null
    after: c8acd8c872e63bf5a008b610063dac0c758bb9afda1ecad90bd6c1fbcaaa3e65
  - root: event:tool/call
    before: 2cc138d64d80567a0b7a7441a5f27d1237b5c59afa14e479470328dbf9b23187
    after: 4037597fb04addc3bdcf376960146fedfd94ff703b15b4c7d784b00f242913a0
  - root: event:tool/code-dispatch
    before: d7d02b19415ccc60e860721323bc14d7e2831a301e8c4029c962e805669b210c
    after: 11ad92e21ebfa469207890d468047d2c6b474b8c9afa7b60e97455dbbc798986
  - root: event:tool/code-dispatch-start
    before: 02c091df7d51a5efcb42dbc696eb887a371d1c55b060918962468787e286b522
    after: 28630fd10b18fa30acd76184f679afc5e4832e4b8dd2ef6f97a97fc70e4a8d32
  - root: event:tool/result
    before: 4bfffc0bcac0977f50bed65c721a694781c7e834bba9790ffcf61b2a1da73a7f
    after: ebdcf56ec3c67a0752c5298553eb82fbc5b740759618a9a5b52212eb47dadb0f
  - root: event:turn/end
    before: 0ec430fec65233c9365969a6737f6965539e18c6ee1ef636757bcfd3c9bc8677
    after: d5b2d819b22beae540fa84627362470af8901a782209627e8b1fd37ac233e1ac
  - root: event:turn/start
    before: c6110c68daa866e2fc2e2d258766aaf17113d87749d4ce6fc52cbdd6d006c1ce
    after: 0e38b711b4d60ee86aadd6aa11baeca444c4fa76eaa3dece5fe3bda61c4c1f39
  - root: event:user/message
    before: 0aeb73c9de361ba2389df08ade91d256f8655a81f97b275c5cd495ca1e7c1dd7
    after: d5646e4d7b2b9053e32531c8434df277644fe1d712c271a4948464c72bc53e10
  - root: event:web/deepseek-search-llm-request
    before: 93b715fe07aa34ce309b7b9e385e9b9cffd040981aee1683c19443330f100abd
    after: ff55a2780a41c47bd5b882c44015058621ead9ad568eea06614f3a0b39f3903d
```

<a id="changes"></a>
## Structural changes

<!-- persistence-release-changes:start -->

Detected 45 changed roots and 48 structural differences. The minimum below is calculated using current rules for comparison only; it does not assert historical compliance, migration correctness, or runtime compatibility.

| Path | Change | Current minimum |
|---|---|---|
| `SessionEventEnvelope` | `union-variants-changed` | `version-bump` |
| `event:agent-preset/selected.ignorable` | `optional-property-added` | `version-bump` |
| `event:agent/inbox/spliced.data.inserted[].source` | `union-variants-changed` | `version-bump` |
| `event:agent/inbox/spliced.ignorable` | `optional-property-added` | `version-bump` |
| `event:approval/asked.ignorable` | `optional-property-added` | `version-bump` |
| `event:approval/decided.ignorable` | `optional-property-added` | `version-bump` |
| `event:approval/policy.ignorable` | `optional-property-added` | `version-bump` |
| `event:assistant/chunk.ignorable` | `optional-property-added` | `version-bump` |
| `event:assistant/message.ignorable` | `optional-property-added` | `version-bump` |
| `event:command/done.ignorable` | `optional-property-added` | `version-bump` |
| `event:command/run.ignorable` | `optional-property-added` | `version-bump` |
| `event:compact/end.ignorable` | `optional-property-added` | `version-bump` |
| `event:compact/prune.ignorable` | `optional-property-added` | `version-bump` |
| `event:compact/start.ignorable` | `optional-property-added` | `version-bump` |
| `event:compact/summary.ignorable` | `optional-property-added` | `version-bump` |
| `event:feedback/record.ignorable` | `optional-property-added` | `version-bump` |
| `event:goal/change.ignorable` | `optional-property-added` | `version-bump` |
| `event:hook/invoked.ignorable` | `optional-property-added` | `version-bump` |
| `event:hook/result.ignorable` | `optional-property-added` | `version-bump` |
| `event:llm/retry.ignorable` | `optional-property-added` | `version-bump` |
| `event:llm/retry-started.ignorable` | `optional-property-added` | `version-bump` |
| `event:permission/preset.ignorable` | `optional-property-added` | `version-bump` |
| `event:plan/mode.ignorable` | `optional-property-added` | `version-bump` |
| `event:request/context.ignorable` | `optional-property-added` | `version-bump` |
| `event:request/header.ignorable` | `optional-property-added` | `version-bump` |
| `event:sandbox/mode.ignorable` | `optional-property-added` | `version-bump` |
| `event:schedule/change` | `root-added` | `same-version` |
| `event:session/end-seed.ignorable` | `optional-property-added` | `version-bump` |
| `event:session/title.ignorable` | `optional-property-added` | `version-bump` |
| `event:session/title-llm-request.data.messages[].source` | `union-variants-changed` | `version-bump` |
| `event:session/title-llm-request.ignorable` | `optional-property-added` | `version-bump` |
| `event:step/end.ignorable` | `optional-property-added` | `version-bump` |
| `event:step/start.ignorable` | `optional-property-added` | `version-bump` |
| `event:subagent/descriptor.ignorable` | `optional-property-added` | `version-bump` |
| `event:todo/write.ignorable` | `optional-property-added` | `version-bump` |
| `event:tool-workflow/agent-end` | `root-added` | `same-version` |
| `event:tool-workflow/agent-start` | `root-added` | `same-version` |
| `event:tool-workflow/run-end` | `root-added` | `same-version` |
| `event:tool-workflow/run-start` | `root-added` | `same-version` |
| `event:tool/call.ignorable` | `optional-property-added` | `version-bump` |
| `event:tool/code-dispatch.ignorable` | `optional-property-added` | `version-bump` |
| `event:tool/code-dispatch-start.ignorable` | `optional-property-added` | `version-bump` |
| `event:tool/result.ignorable` | `optional-property-added` | `version-bump` |
| `event:turn/end.ignorable` | `optional-property-added` | `version-bump` |
| `event:turn/start.ignorable` | `optional-property-added` | `version-bump` |
| `event:user/message.data.source` | `union-variants-changed` | `version-bump` |
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
