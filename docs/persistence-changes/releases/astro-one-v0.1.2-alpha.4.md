---
description: "Retrospective Session persistence types and adjacent-release changes for astro-one-v0.1.2-alpha.4."
kind: persistence-release
---

# Persistence release: astro-one-v0.1.2-alpha.4

English | [中文](astro-one-v0.1.2-alpha.4.zh.md)

## Summary

The logical SessionHeader replaces optional seedLength with required isSeeded, while the physical JSONL header still declares seedLength. The subagent-report and coordinator user-message source variants become agent-message. The writer format remains 0.

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
| Source tag | `astro-one-v0.1.2-alpha.4` |
| Source date | 2026-09-01T15:37:26.000Z |
| Release record | Release object present. |
| Previous release | [astro-one-v0.1.2-alpha.3](astro-one-v0.1.2-alpha.3.md) |
| Session writer version | 0 |
| Reconstructed inventory | <!-- persistence-release-inventory:start -->54 roots / 415 types<!-- persistence-release-inventory:end --> |
| This snapshot | [astro-one-v0.1.2-alpha.4.schema.json](astro-one-v0.1.2-alpha.4.schema.json) |

Source evidence for the writer version constant at this tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## Declaration

```yaml persistence-release
schemaVersion: 1
tag: astro-one-v0.1.2-alpha.4
previous: astro-one-v0.1.2-alpha.3
sessionFormatVersion: 0
changes:
  - root: SessionHeader
    before: 5d9a199ba51504f930c48c67749ae5607de257d3258e156a133eeaa2445c123d
    after: 3b708449408163b5f089dfffc7ed3a9bc087d8b6bb69de466b5d803b49b9a922
  - root: event:agent/inbox/spliced
    before: 8212b07d3fa4b0576e59b35dcb27381abdda80a0452bc8a348fddf18fc00cbce
    after: aba2a9fe8b89b4982a5b4039c644e00b2aa55de4941dae2b01cb250694fe3283
  - root: event:session/title-llm-request
    before: 15cf9727f25c72740eebf02f7e519537fb8a959850add3ee9600d803551455de
    after: 3fdbdacd81e7915aeb2bb763b438d2d2eb0c9301a230092ca09a5f414e2bdcac
  - root: event:user/message
    before: 9e3978467b987defa20278e58ab1cb3879f0801cef4dc3f629a09a7e709af9dc
    after: 1431c0ee8c6323aa132477b7176198f6f73678948974c0a6aa579c54a2b1cb3d
```

<a id="changes"></a>
## Structural changes

<!-- persistence-release-changes:start -->

Detected 4 changed roots and 5 structural differences. The minimum below is calculated using current rules for comparison only; it does not assert historical compliance, migration correctness, or runtime compatibility.

| Path | Change | Current minimum |
|---|---|---|
| `SessionHeader.seedLength` | `property-removed` | `version-bump` |
| `SessionHeader.isSeeded` | `required-property-added` | `version-bump` |
| `event:agent/inbox/spliced.data.inserted[].source` | `union-variants-changed` | `version-bump` |
| `event:session/title-llm-request.data.messages[].source` | `union-variants-changed` | `version-bump` |
| `event:user/message.data.source` | `union-variants-changed` | `version-bump` |

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
