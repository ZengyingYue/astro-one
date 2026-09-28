---
description: "Retrospective Session persistence types and adjacent-release changes for astro-one-v0.1.3-alpha.1."
kind: persistence-release
---

# Persistence release: astro-one-v0.1.3-alpha.1

English | [中文](astro-one-v0.1.3-alpha.1.zh.md)

## Summary

The writer format advances from 0 to 2 across these tags: the JSONL header replaces seedLength with required isSeeded, and session/end-seed gains optional inherited. assistant/chunk is removed, assistant/attempt is added, and assistant/message gains a required stream array. Team event payload versions advance from 1 to 2, alongside changes to shared content types and optional capturedFormatVersion/sessionFormatVersion metadata.

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
| Source tag | `astro-one-v0.1.3-alpha.1` |
| Source date | 2026-09-04T09:16:23.000Z |
| Release record | Release object present. |
| Previous release | [astro-one-v0.1.2-rc.1](astro-one-v0.1.2-rc.1.md) |
| Session writer version | 2 |
| Reconstructed inventory | <!-- persistence-release-inventory:start -->54 roots / 425 types<!-- persistence-release-inventory:end --> |
| This snapshot | [astro-one-v0.1.3-alpha.1.schema.json](astro-one-v0.1.3-alpha.1.schema.json) |

Source evidence for the writer version constant at this tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 2`

<a id="declaration"></a>
## Declaration

```yaml persistence-release
schemaVersion: 1
tag: astro-one-v0.1.3-alpha.1
previous: astro-one-v0.1.2-rc.1
sessionFormatVersion: 2
changes:
  - root: JsonlHeaderLine
    before: 3ad74ad1441e923fb6a28485037510ec53d9d4d39ab60224ad880026435d272a
    after: fb9765eaa403ff5ba6a181e97e33d62460689cd2cb3ced304a1c399230a25567
  - root: SessionHeader
    before: 3b708449408163b5f089dfffc7ed3a9bc087d8b6bb69de466b5d803b49b9a922
    after: 30aaf1562120f23a72fdfe10917e6c45ce4f82c6f0429bca8e9ade1873890645
  - root: event:agent/inbox/spliced
    before: aba2a9fe8b89b4982a5b4039c644e00b2aa55de4941dae2b01cb250694fe3283
    after: 8f5514c2703366006c8d91c80d44bdd5f64b999e79bbeae78bf9da0306d83515
  - root: event:assistant/attempt
    before: null
    after: 77efe2d2071899c4006eb7e04dc435c364bd4871f0c334b1fb1d4d7631016fde
  - root: event:assistant/chunk
    before: f3f2ffdd3841a487ad434abab6406072dc51bc45c26f06886c33eaa9b1c2cb84
    after: null
  - root: event:assistant/message
    before: ff5d927293a966f5dcddd4fad390900f90c4c1f7b04adfd672fc7c3182d6532b
    after: 44448168b0e4130ff0755b18ae7330a8c74761363dd58c479524e45044f6f530
  - root: event:compaction/summary
    before: 329cbb47bc3583292dce3f6fca0dffd7bb422194ec55b8180ab763b278b0aead
    after: 86249cbc5e771ce94f0f204a80a26507e9ab43c21926336db87da2dea6778de6
  - root: event:session-log-deepseek/delivery-accepted
    before: 3a1a5dcc8a77846e5666a4ade0f95a02c4484b2f7c3d44fc88887d77bc038313
    after: 9973ea7768edb9f676a7d81fe75d1f1140062efe48ac9dac38f69b63313fd3e2
  - root: event:session/end-seed
    before: 69facec182cf7f9c9a20968d20da8addceeae268ef1a118674d9ff6406d803c5
    after: ffdfa6c64d9bd05235b4328777c22f2646c279c9bd08bbae98020587eabe592d
  - root: event:session/title-llm-request
    before: 3fdbdacd81e7915aeb2bb763b438d2d2eb0c9301a230092ca09a5f414e2bdcac
    after: 428c1368bd6b44984dbae9235f68fda747709f5818352fc262092149e8199ae0
  - root: event:team/member
    before: c4002a911c01974f8274b7f56cea9c0d1986087ca0d7c1ab1f3ce3ed1ea766bb
    after: 86fbb380bfe6be8519dfedac3881ececa75776ec18f8eaa4b347706d9efc2c87
  - root: event:team/message/delivered
    before: e446a1f24aaa82dcd4ef38b0a033c653ec9c74628e9fb75f5ecf977821f7328c
    after: 076a0602e6ff0cc5112135542c0c0e4ec87a0ab4827d8383f5aa267f5855fc80
  - root: event:team/message/queued
    before: c23dc4e06b6cc3cfdc4f7583b83b82163d62329526ca1423bda3f3fb6818c976
    after: 583449a1cbb893559007a8ec4a12ae8bbfc22d6c5009afc385f4ac28ae4701d9
  - root: event:team/task
    before: 196ba28b1366d7f47ede901dae99b91be217a14482b583269a908f356e46d889
    after: 5f912a680f1d6e45a82fd24837d7c2b081aee816a6f24fe1d6fcbe915232dc53
  - root: event:tool/code-dispatch
    before: 716572b19456b27a5f5affede4cffc1293f7d30bbcaa433478624aae3b44b0f6
    after: 180aa99644b436311adc96c14027ecd1f876ff193f3e81ea9123eecdc79e8ffe
  - root: event:tool/result
    before: 82ec6c80072b8bd5a53cf6a1f7ae55c8e82a5a2c4a840bc1f059e4dac7f3cea7
    after: 129e962ae37a078d4422287fff2de3f1fc2318d5c90e71810851cfb4f85019b0
  - root: event:user/message
    before: 1431c0ee8c6323aa132477b7176198f6f73678948974c0a6aa579c54a2b1cb3d
    after: bdf54d2cae33c604bb91af75ad4e523910ac3f8b0404f174882ab45bc15f7577
```

<a id="changes"></a>
## Structural changes

<!-- persistence-release-changes:start -->

Detected 17 changed roots and 25 structural differences. The minimum below is calculated using current rules for comparison only; it does not assert historical compliance, migration correctness, or runtime compatibility.

| Path | Change | Current minimum |
|---|---|---|
| `JsonlHeaderLine.seedLength` | `property-removed` | `version-bump` |
| `JsonlHeaderLine.isSeeded` | `required-property-added` | `version-bump` |
| `SessionHeader.version` | `type-changed` | `version-bump` |
| `event:agent/inbox/spliced.data.inserted[].content[]` | `union-variants-changed` | `version-bump` |
| `event:agent/inbox/spliced.data.inserted[].source.references[].capturedFormatVersion` | `optional-property-added` | `same-version` |
| `event:assistant/attempt` | `root-added` | `same-version` |
| `event:assistant/chunk` | `root-removed` | `version-bump` |
| `event:assistant/message.data.message.content[]` | `union-variants-changed` | `version-bump` |
| `event:assistant/message.data.stream` | `required-property-added` | `version-bump` |
| `event:compaction/summary.data` | `union-variants-changed` | `version-bump` |
| `event:session-log-deepseek/delivery-accepted.data.sessionFormatVersion` | `optional-property-added` | `same-version` |
| `event:session/end-seed.data.inherited` | `optional-property-added` | `same-version` |
| `event:session/end-seed.data` | `index-signature-changed` | `version-bump` |
| `event:session/title-llm-request.data.messages[].content[]` | `union-variants-changed` | `version-bump` |
| `event:session/title-llm-request.data.messages[].source.references[].capturedFormatVersion` | `optional-property-added` | `same-version` |
| `event:team/member.data.version` | `type-changed` | `version-bump` |
| `event:team/message/delivered.data.version` | `type-changed` | `version-bump` |
| `event:team/message/queued.data.message.content[]` | `union-variants-changed` | `version-bump` |
| `event:team/message/queued.data.message.delivery` | `property-removed` | `version-bump` |
| `event:team/message/queued.data.version` | `type-changed` | `version-bump` |
| `event:team/task.data.version` | `type-changed` | `version-bump` |
| `event:tool/code-dispatch.data.content[]` | `union-variants-changed` | `version-bump` |
| `event:tool/result.data.message.content[0].content[]` | `union-variants-changed` | `version-bump` |
| `event:user/message.data.content[]` | `union-variants-changed` | `version-bump` |
| `event:user/message.data.source.references[].capturedFormatVersion` | `optional-property-added` | `same-version` |

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
