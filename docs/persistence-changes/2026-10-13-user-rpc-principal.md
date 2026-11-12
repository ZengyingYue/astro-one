---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-13-user-rpc-principal

English | [中文](2026-10-13-user-rpc-principal.zh.md)

## Summary

Adds an optional principal to the user-rpc message source for prompts submitted by a caller other than the owner.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-13-user-rpc-principal
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-05-working-directory-attribution"
    after: "b1a0b64e223a36070786c2341b2b848ba6bc6c1a43e3eb2023ef1fa02a626926"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-05-working-directory-attribution"
    after: "65dfc3fc543e7853ec361a1e26b04b8990f73cb570186ab88c460b8e80bcacf2"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-07-title-reasoning-effort"
    after: "4753b6c3d2e9539ed0d32e8753abd40ef1838f7c60f91ef6596c128305b00e92"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-05-working-directory-attribution"
    after: "2b7582abaf5c72a084773984848d14fbc43fb78a402d2ff8ee254c66840928fb"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Owner prompts omit the field, so their sources and every existing Session log are unchanged; an absent principal means the owner. A reader that predates the field ignores it and treats the message as an ordinary user message, because the kind stays 'user'. A current reader of an older log finds no principal and treats every message as the owner's. The field is not part of any model request: provider adapters read only the model-visible message content. SESSION_FORMAT_VERSION does not change.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/api/session-controller/tests/remote-access.host.spec.ts packages/subagent/subagent/tests/control.spec.ts packages/api/session-controller/tests/session-cold.host.spec.ts: non-owner prompts persist source.principal in agent/inbox/spliced, owner and existing time-zone sources stay byte-identical; all tests passed.

<a id="dev-note"></a>
## Dev Note

None.
