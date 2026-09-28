---
description: "Retrospective Session persistence types and adjacent-release changes for astro-one-v0.1.0-rc.8."
kind: persistence-release
---

# Persistence release: astro-one-v0.1.0-rc.8

English | [中文](astro-one-v0.1.0-rc.8.zh.md)

## Summary

Four team/* events and the team-message user-message source variant are added; assistant/message gains optional interrupted. The writer format remains 0.

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
| Source tag | `astro-one-v0.1.0-rc.8` |
| Source date | 2026-08-19T15:11:50.000Z |
| Release record | Release object present. |
| Previous release | [astro-one-v0.1.0-rc.7](astro-one-v0.1.0-rc.7.md) |
| Session writer version | 0 |
| Reconstructed inventory | <!-- persistence-release-inventory:start -->51 roots / 403 types<!-- persistence-release-inventory:end --> |
| This snapshot | [astro-one-v0.1.0-rc.8.schema.json](astro-one-v0.1.0-rc.8.schema.json) |

Source evidence for the writer version constant at this tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## Declaration

```yaml persistence-release
schemaVersion: 1
tag: astro-one-v0.1.0-rc.8
previous: astro-one-v0.1.0-rc.7
sessionFormatVersion: 0
changes:
  - root: event:agent/inbox/spliced
    before: 0219010871f5b43f511a3b0e75864bfd055b9e882eb185a23dd2bb34b0817ae7
    after: 3a1ab1318bbe5cbe76a327ff3b0f7c0e578f3077fc6f5fcf01cae93ed70c232b
  - root: event:assistant/message
    before: 5d6c2a2d2c5b5d507c5288e070aab7471aed408af160565165137cf9680f3330
    after: 3ffbcc6804fc01dc0fcf31ab3a0904e426ec933d97a345a8a96055754e4334d5
  - root: event:session/title-llm-request
    before: 07116b665f7f6b97b553b8c87ff30e4461b06d8bb361b7b18b81a9597182f21f
    after: 6e0160c78c8eae2b62054efdf031fb75037205bbde10d97d4d7049b32c53702b
  - root: event:team/member
    before: null
    after: c4002a911c01974f8274b7f56cea9c0d1986087ca0d7c1ab1f3ce3ed1ea766bb
  - root: event:team/message/delivered
    before: null
    after: e446a1f24aaa82dcd4ef38b0a033c653ec9c74628e9fb75f5ecf977821f7328c
  - root: event:team/message/queued
    before: null
    after: 30ba185523e67225d238c65192e8f510fbbd8930244118ea7d1c4d964f3f4221
  - root: event:team/task
    before: null
    after: 196ba28b1366d7f47ede901dae99b91be217a14482b583269a908f356e46d889
  - root: event:user/message
    before: fc6df762b1b045ab8d8b228c5317e21d274ee71f2157dabfa17b795f27d12813
    after: 048c96bdc3d0a436c827c1337eea0ee134041a76725a00a461857a6794549a50
```

<a id="changes"></a>
## Structural changes

<!-- persistence-release-changes:start -->

Detected 8 changed roots and 8 structural differences. The minimum below is calculated using current rules for comparison only; it does not assert historical compliance, migration correctness, or runtime compatibility.

| Path | Change | Current minimum |
|---|---|---|
| `event:agent/inbox/spliced.data.inserted[].source` | `union-variants-changed` | `version-bump` |
| `event:assistant/message.data.interrupted` | `optional-property-added` | `same-version` |
| `event:session/title-llm-request.data.messages[].source` | `union-variants-changed` | `version-bump` |
| `event:team/member` | `root-added` | `same-version` |
| `event:team/message/delivered` | `root-added` | `same-version` |
| `event:team/message/queued` | `root-added` | `same-version` |
| `event:team/task` | `root-added` | `same-version` |
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
