---
description: "Retrospective Session persistence types and adjacent-release changes for astro-one-v0.1.1-rc.1."
kind: persistence-release
---

# Persistence release: astro-one-v0.1.1-rc.1

English | [中文](astro-one-v0.1.1-rc.1.zh.md)

## Summary

permission/preset gains optional origin with default, selection, and inferred values. The writer format remains 0.

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
| Source tag | `astro-one-v0.1.1-rc.1` |
| Source date | 2026-08-21T06:21:44.000Z |
| Release record | Release object present. |
| Previous release | [astro-one-v0.1.0-rc.8](astro-one-v0.1.0-rc.8.md) |
| Session writer version | 0 |
| Reconstructed inventory | <!-- persistence-release-inventory:start -->51 roots / 407 types<!-- persistence-release-inventory:end --> |
| This snapshot | [astro-one-v0.1.1-rc.1.schema.json](astro-one-v0.1.1-rc.1.schema.json) |

Source evidence for the writer version constant at this tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## Declaration

```yaml persistence-release
schemaVersion: 1
tag: astro-one-v0.1.1-rc.1
previous: astro-one-v0.1.0-rc.8
sessionFormatVersion: 0
changes:
  - root: event:permission/preset
    before: 014393e7bc4c7991be894e0c7eca498d85f2ad56da0a38a6d960180ab8a1ff3a
    after: 3b9bf22b76208fd75990df1fbe5fe523a2298366e1b733383137aa8a2e54acaf
```

<a id="changes"></a>
## Structural changes

<!-- persistence-release-changes:start -->

Detected 1 changed root and 1 structural difference. The minimum below is calculated using current rules for comparison only; it does not assert historical compliance, migration correctness, or runtime compatibility.

| Path | Change | Current minimum |
|---|---|---|
| `event:permission/preset.data.origin` | `optional-property-added` | `same-version` |

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
