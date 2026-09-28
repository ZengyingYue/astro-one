---
description: "Retrospective Session persistence types and adjacent-release changes for astro-one-v0.0.1-rc.3."
kind: persistence-release
---

# Persistence release: astro-one-v0.0.1-rc.3

English | [中文](astro-one-v0.0.1-rc.3.zh.md)

## Summary

The four compact/* event keys become compaction/*; user-message source kind workspace-instructions becomes agent-instructions, and hook dialect claude becomes claude-code. These literal and event-key changes occur while the writer format remains 0.

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
| Source tag | `astro-one-v0.0.1-rc.3` |
| Source date | 2026-08-12T20:18:26.000Z |
| Release record | Tag only; no release object. |
| Previous release | [astro-one-v0.0.1-rc.2](astro-one-v0.0.1-rc.2.md) |
| Session writer version | 0 |
| Reconstructed inventory | <!-- persistence-release-inventory:start -->47 roots / 374 types<!-- persistence-release-inventory:end --> |
| This snapshot | [astro-one-v0.0.1-rc.3.schema.json](astro-one-v0.0.1-rc.3.schema.json) |

Source evidence for the writer version constant at this tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## Declaration

```yaml persistence-release
schemaVersion: 1
tag: astro-one-v0.0.1-rc.3
previous: astro-one-v0.0.1-rc.2
sessionFormatVersion: 0
changes:
  - root: event:agent/inbox/spliced
    before: 8c40f0f353885f125ae8c94768fd466fe17e53c7f81c1f8604ac3035f1a29e1b
    after: 0219010871f5b43f511a3b0e75864bfd055b9e882eb185a23dd2bb34b0817ae7
  - root: event:compact/end
    before: 360aa2133868307cdd2f1e244a1cfeae237d850170e6686045e478912f3bd689
    after: null
  - root: event:compact/prune
    before: 4ad2a95158380bcf47833eb323df01a2798b99fa06099556cd9f9c782a06933c
    after: null
  - root: event:compact/start
    before: 5f77517121e55e1cee6dc54800fbf6ca9008c2ef13c3fe7e56327a18f3c1a021
    after: null
  - root: event:compact/summary
    before: 995555416ea36e143b68530ad93bc899cd9615d6ddc9ab8117d4e25bf1da0c30
    after: null
  - root: event:compaction/end
    before: null
    after: 959531fed950f8fb30a4bb90c05d85bd91176d2a72f2441e50aa30237081ee1e
  - root: event:compaction/prune
    before: null
    after: 33b3105d98e11e0920b762e6c1110014819d463c73c246b0eb21061a42fbde34
  - root: event:compaction/start
    before: null
    after: f5e7a61838ee075adc4866ad45fd996f64f04047303f48b39f6f628e58b5136d
  - root: event:compaction/summary
    before: null
    after: 5d41e236528af21c1ffbb247e8c82561766bf165f8be5ba1edf0a9bab92e9fac
  - root: event:hook/invoked
    before: cb564798d60dbcd664ddcb2daf0ae03eb3ad8ad90448743f2010783dca0924f4
    after: 9a1b2a6161e46a3b81d67083d0f4864a4b68eb3483bd6c3e6fbb9c3be0a5b07c
  - root: event:session/title-llm-request
    before: 24520618248f41781f71898c656547485e09e0a8af4b1c4daf407f92addf42c8
    after: 07116b665f7f6b97b553b8c87ff30e4461b06d8bb361b7b18b81a9597182f21f
  - root: event:user/message
    before: d5646e4d7b2b9053e32531c8434df277644fe1d712c271a4948464c72bc53e10
    after: fc6df762b1b045ab8d8b228c5317e21d274ee71f2157dabfa17b795f27d12813
```

<a id="changes"></a>
## Structural changes

<!-- persistence-release-changes:start -->

Detected 12 changed roots and 12 structural differences. The minimum below is calculated using current rules for comparison only; it does not assert historical compliance, migration correctness, or runtime compatibility.

| Path | Change | Current minimum |
|---|---|---|
| `event:agent/inbox/spliced.data.inserted[].source.kind` | `type-changed` | `version-bump` |
| `event:compact/end` | `root-removed` | `version-bump` |
| `event:compact/prune` | `root-removed` | `version-bump` |
| `event:compact/start` | `root-removed` | `version-bump` |
| `event:compact/summary` | `root-removed` | `version-bump` |
| `event:compaction/end` | `root-added` | `same-version` |
| `event:compaction/prune` | `root-added` | `same-version` |
| `event:compaction/start` | `root-added` | `same-version` |
| `event:compaction/summary` | `root-added` | `same-version` |
| `event:hook/invoked.data.dialect` | `type-changed` | `version-bump` |
| `event:session/title-llm-request.data.messages[].source.kind` | `type-changed` | `version-bump` |
| `event:user/message.data.source.kind` | `type-changed` | `version-bump` |

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
