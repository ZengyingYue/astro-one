---
description: "Retrospective Session persistence types and adjacent-release changes for astro-one-v0.1.3-alpha.2."
kind: persistence-release
---

# Persistence release: astro-one-v0.1.3-alpha.2

English | [中文](astro-one-v0.1.3-alpha.2.zh.md)

## Summary

feedback/message-put and feedback/message-delete are added without changing the existing persistence root digests. The writer format remains 2.

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
| Source tag | `astro-one-v0.1.3-alpha.2` |
| Source date | 2026-09-07T11:45:35.000Z |
| Release record | Release object present. |
| Previous release | [astro-one-v0.1.3-alpha.1](astro-one-v0.1.3-alpha.1.md) |
| Session writer version | 2 |
| Reconstructed inventory | <!-- persistence-release-inventory:start -->56 roots / 435 types<!-- persistence-release-inventory:end --> |
| This snapshot | [astro-one-v0.1.3-alpha.2.schema.json](astro-one-v0.1.3-alpha.2.schema.json) |

Source evidence for the writer version constant at this tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 2`

<a id="declaration"></a>
## Declaration

```yaml persistence-release
schemaVersion: 1
tag: astro-one-v0.1.3-alpha.2
previous: astro-one-v0.1.3-alpha.1
sessionFormatVersion: 2
changes:
  - root: event:feedback/message-delete
    before: null
    after: c324fa0c271cf764b32a712491281a95a57ab72243f6acd42b58a7b2b3835113
  - root: event:feedback/message-put
    before: null
    after: 540cbfb85e0f23cc4e6dc3ee12ac3848c3bdf6c6b24b1f01184ed145a443e947
```

<a id="changes"></a>
## Structural changes

<!-- persistence-release-changes:start -->

Detected 2 changed roots and 2 structural differences. The minimum below is calculated using current rules for comparison only; it does not assert historical compliance, migration correctness, or runtime compatibility.

| Path | Change | Current minimum |
|---|---|---|
| `event:feedback/message-delete` | `root-added` | `same-version` |
| `event:feedback/message-put` | `root-added` | `same-version` |

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
