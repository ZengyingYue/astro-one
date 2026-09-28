---
description: "Retrospective Session persistence types and adjacent-release changes for astro-one-v0.1.1-rc.2."
kind: persistence-release
---

# Persistence release: astro-one-v0.1.1-rc.2

English | [中文](astro-one-v0.1.1-rc.2.zh.md)

## Summary

permission/preset removes origin, while attachment records gain optional originalDimensions across the message and tool payloads that reference them. The writer format remains 0.

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
| Source tag | `astro-one-v0.1.1-rc.2` |
| Source date | 2026-08-21T12:03:37.000Z |
| Release record | Release object present. |
| Previous release | [astro-one-v0.1.1-rc.1](astro-one-v0.1.1-rc.1.md) |
| Session writer version | 0 |
| Reconstructed inventory | <!-- persistence-release-inventory:start -->51 roots / 404 types<!-- persistence-release-inventory:end --> |
| This snapshot | [astro-one-v0.1.1-rc.2.schema.json](astro-one-v0.1.1-rc.2.schema.json) |

Source evidence for the writer version constant at this tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## Declaration

```yaml persistence-release
schemaVersion: 1
tag: astro-one-v0.1.1-rc.2
previous: astro-one-v0.1.1-rc.1
sessionFormatVersion: 0
changes:
  - root: event:agent/inbox/spliced
    before: 3a1ab1318bbe5cbe76a327ff3b0f7c0e578f3077fc6f5fcf01cae93ed70c232b
    after: 2d4362148432f44d2612b7e961399bacae3d4474800d82f174976876b509187d
  - root: event:assistant/chunk
    before: cf51d35dbd89a38eb8824766e086cd31a2bc11d5e739a9549465c6453b851afe
    after: 7918584bcb08801b87a7b6c2c47c787a904abc94364df1b336dd820bf164b102
  - root: event:assistant/message
    before: 3ffbcc6804fc01dc0fcf31ab3a0904e426ec933d97a345a8a96055754e4334d5
    after: 3c0ce9c21ad10ceffb3106b6b3dc6d0436f2ec37486ad75ee57610d0831dcf5d
  - root: event:compaction/summary
    before: 5d41e236528af21c1ffbb247e8c82561766bf165f8be5ba1edf0a9bab92e9fac
    after: 88efa93b21af4fa33ca033e05dacfb8574a76ee7ec333385a36423646fddaf0c
  - root: event:permission/preset
    before: 3b9bf22b76208fd75990df1fbe5fe523a2298366e1b733383137aa8a2e54acaf
    after: 014393e7bc4c7991be894e0c7eca498d85f2ad56da0a38a6d960180ab8a1ff3a
  - root: event:session/title-llm-request
    before: 6e0160c78c8eae2b62054efdf031fb75037205bbde10d97d4d7049b32c53702b
    after: c8d1264533350ad05d7a0e7c574d6658e7ea6fdf99c8cb87278b7b3b4905a3d4
  - root: event:team/message/queued
    before: 30ba185523e67225d238c65192e8f510fbbd8930244118ea7d1c4d964f3f4221
    after: c23dc4e06b6cc3cfdc4f7583b83b82163d62329526ca1423bda3f3fb6818c976
  - root: event:tool/code-dispatch
    before: 11ad92e21ebfa469207890d468047d2c6b474b8c9afa7b60e97455dbbc798986
    after: 716572b19456b27a5f5affede4cffc1293f7d30bbcaa433478624aae3b44b0f6
  - root: event:tool/result
    before: ebdcf56ec3c67a0752c5298553eb82fbc5b740759618a9a5b52212eb47dadb0f
    after: 82ec6c80072b8bd5a53cf6a1f7ae55c8e82a5a2c4a840bc1f059e4dac7f3cea7
  - root: event:user/message
    before: 048c96bdc3d0a436c827c1337eea0ee134041a76725a00a461857a6794549a50
    after: e608c162536de02cfaa194ce99cf857c12225e1793f80e446ef98ae99a732d15
```

<a id="changes"></a>
## Structural changes

<!-- persistence-release-changes:start -->

Detected 10 changed roots and 11 structural differences. The minimum below is calculated using current rules for comparison only; it does not assert historical compliance, migration correctness, or runtime compatibility.

| Path | Change | Current minimum |
|---|---|---|
| `event:agent/inbox/spliced.data.inserted[].content[].attachment.originalDimensions` | `optional-property-added` | `same-version` |
| `event:assistant/chunk.data.chunk.block.attachment.originalDimensions` | `optional-property-added` | `same-version` |
| `event:assistant/message.data.message.content[].attachment.originalDimensions` | `optional-property-added` | `same-version` |
| `event:compaction/summary.data.rawOutput[].attachment.originalDimensions` | `optional-property-added` | `same-version` |
| `event:compaction/summary.data.summary[].attachment.originalDimensions` | `optional-property-added` | `same-version` |
| `event:permission/preset.data.origin` | `property-removed` | `version-bump` |
| `event:session/title-llm-request.data.messages[].content[].attachment.originalDimensions` | `optional-property-added` | `same-version` |
| `event:team/message/queued.data.message.content[].attachment.originalDimensions` | `optional-property-added` | `same-version` |
| `event:tool/code-dispatch.data.content[].attachment.originalDimensions` | `optional-property-added` | `same-version` |
| `event:tool/result.data.message.content[0].content[].attachment.originalDimensions` | `optional-property-added` | `same-version` |
| `event:user/message.data.content[].attachment.originalDimensions` | `optional-property-added` | `same-version` |

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
