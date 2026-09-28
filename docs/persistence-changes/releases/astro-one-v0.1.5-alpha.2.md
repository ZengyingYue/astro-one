---
description: "Retrospective Session persistence types and adjacent-release changes for astro-one-v0.1.5-alpha.2."
kind: persistence-release
---

# Persistence release: astro-one-v0.1.5-alpha.2

English | [中文](astro-one-v0.1.5-alpha.2.zh.md)

## Summary

deliverables/presented and subagent/catalog are added. Feedback records gain optional category, feedback/record text becomes optional, and the writer format remains 3.

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
| Source tag | `astro-one-v0.1.5-alpha.2` |
| Source date | 2026-09-09T14:13:03.000Z |
| Release record | Release object present. |
| Previous release | [astro-one-v0.1.5-alpha.1](astro-one-v0.1.5-alpha.1.md) |
| Session writer version | 3 |
| Reconstructed inventory | <!-- persistence-release-inventory:start -->59 roots / 462 types<!-- persistence-release-inventory:end --> |
| This snapshot | [astro-one-v0.1.5-alpha.2.schema.json](astro-one-v0.1.5-alpha.2.schema.json) |

Source evidence for the writer version constant at this tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 3`

<a id="declaration"></a>
## Declaration

```yaml persistence-release
schemaVersion: 1
tag: astro-one-v0.1.5-alpha.2
previous: astro-one-v0.1.5-alpha.1
sessionFormatVersion: 3
changes:
  - root: event:deliverables/presented
    before: null
    after: bc86457a4376925f38a23f1c143d64d820d3a1208be562a45f79ef2e421f77ee
  - root: event:feedback/message-put
    before: 540cbfb85e0f23cc4e6dc3ee12ac3848c3bdf6c6b24b1f01184ed145a443e947
    after: ba4cd1161e811ac8a5e578b5f918bf37b87bd3be68f597d77e88109160a52dad
  - root: event:feedback/record
    before: deb4219517fd1e5211eade234f2365b0489a8b2eb43d920de85873da61b4afb4
    after: 653a08a616f740052ceff3a81f95eeb42a8df685e582eab71db2d1249f2b74c2
  - root: event:subagent/catalog
    before: null
    after: 1f1587d927839e83d3af00eed5f2dc63c4cda9496ed6c9d382b19933b5135788
```

<a id="changes"></a>
## Structural changes

<!-- persistence-release-changes:start -->

Detected 4 changed roots and 5 structural differences. The minimum below is calculated using current rules for comparison only; it does not assert historical compliance, migration correctness, or runtime compatibility.

| Path | Change | Current minimum |
|---|---|---|
| `event:deliverables/presented` | `root-added` | `same-version` |
| `event:feedback/message-put.data.item.category` | `optional-property-added` | `same-version` |
| `event:feedback/record.data.text` | `property-made-optional` | `same-version` |
| `event:feedback/record.data.category` | `optional-property-added` | `same-version` |
| `event:subagent/catalog` | `root-added` | `same-version` |

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
