---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-22-action-card-status

English | [中文](2026-10-22-action-card-status.zh.md)

## Summary

Adds action-card status attribution to logged model context.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-22-action-card-status
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-13-user-rpc-principal"
    after: "33ce3cf206261be66ca3670965c264fa55b44885d4de23d1c24473e0c08d7a04"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "0276212bc7a842ce52bbbbb4329bbf4453cbc5e1930b4983240cd6de5dc173a1"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-13-user-rpc-principal"
    after: "26742d3f9c4c7fb60aa4b3fa750c380fdd3be94748c79416546fecda8b515f60"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "3e6aeaff9a4d4e36105b3fb145db1f01cba5754545e6475a6fc47e34e339549d"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing messages and records are unchanged. Readers without the action-card plugin preserve the new action-cards source kind and its JSON metadata and derive the recorded text as ordinary context. Only the producer uses the through sequence, to acknowledge delivered decisions; it grants no authority and does not change replay interpretation.

<a id="verification"></a>
## Verification

pnpm exec vitest run on the action-cards, creation-recommendations, client-ui-action-cards and client-ui-creation-recommendations tests: 120 tests passed with 100% coverage of their sources. The Web creation-recommendations replay logs the status notice of a dismissed card before the next answer.

<a id="dev-note"></a>
## Dev Note

None.
