---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-05-working-directory-attribution

English | [中文](2026-10-05-working-directory-attribution.zh.md)

## Summary

Adds producer-owned working-directory notice attribution.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-05-working-directory-attribution
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-09-21-user-question-reply"
    after: "4598ab46b7850c2354c9fa9b45cfdde82437079cea8845a1a8d0ed10f489d784"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-09-21-user-question-reply"
    after: "5b24e3fa51e6d3c80f74114c25adf7bb29136f330f59b9565f8a976e1edc0695"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-09-21-user-question-reply"
    after: "daf326074e7bbcbff40984df001d6a791d8ec01b517693dc41ee427eb6fc3165"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-09-21-user-question-reply"
    after: "4f05c751fc3c9d5fff2f70674fa1c13afe1c17e397c8b868f5d28316efe913e7"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing records remain valid. The additive working-directory source kind is attribution only; the declared source policy preserves unknown attribution without interpreting it. The Session format remains unchanged.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/session/working-directory/tests packages/shell/tool-bash/tests/tools.spec.ts packages/shell/tool-pwsh/tests/tools.spec.ts packages/subagent/subagent/tests/schedule-tools.spec.ts: 5 files and 207 tests passed.

<a id="dev-note"></a>
## Dev Note

None.
