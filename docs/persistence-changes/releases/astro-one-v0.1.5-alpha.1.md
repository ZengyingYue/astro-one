---
description: "Retrospective Session persistence types and adjacent-release changes for astro-one-v0.1.5-alpha.1."
kind: persistence-release
---

# Persistence release: astro-one-v0.1.5-alpha.1

English | [中文](astro-one-v0.1.5-alpha.1.zh.md)

## Summary

The writer format advances from 2 to 3: system/message is added and EpochHeader removes system. Surface replacement fields change from start/end to startSeq/endSeq, and tool/code-dispatch event keys become tool/ptc-dispatch keys.

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
| Source tag | `astro-one-v0.1.5-alpha.1` |
| Source date | 2026-09-08T15:25:45.000Z |
| Release record | Release object present. |
| Previous release | [astro-one-v0.1.3-alpha.2](astro-one-v0.1.3-alpha.2.md) |
| Session writer version | 3 |
| Reconstructed inventory | <!-- persistence-release-inventory:start -->57 roots / 443 types<!-- persistence-release-inventory:end --> |
| This snapshot | [astro-one-v0.1.5-alpha.1.schema.json](astro-one-v0.1.5-alpha.1.schema.json) |

Source evidence for the writer version constant at this tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 3`

<a id="declaration"></a>
## Declaration

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
## Structural changes

<!-- persistence-release-changes:start -->

Detected 12 changed roots and 25 structural differences. The minimum below is calculated using current rules for comparison only; it does not assert historical compliance, migration correctness, or runtime compatibility.

| Path | Change | Current minimum |
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
## Verification

Extraction passed canonical-graph, root-digest, and reachable-type-digest validation, permitting the original optional `surfaceOp` only for historical surface events. The in-tree check reconstructs each tag from its predecessor and verifies before/after values, snapshot coverage, and bilingual machine declarations.

```sh
pnpm run verify-persistence-releases
```

<a id="dev-note"></a>
## Dev Note

None.
