---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-25-skill-catalog-incomplete

English | [中文](2026-10-25-skill-catalog-incomplete.zh.md)

## Summary

Adds optional incomplete: true metadata to skill-catalog message sources when discovery returns only the currently readable skills.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-25-skill-catalog-incomplete
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-22-action-card-status"
    after: "195cc5bc142011ac48b46e95ed654490dd0f0d54d1a2e2ea176ea13b2d854b21"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-22-action-card-status"
    after: "5250753c3d76343ad39ddc8d02cd369a48f219be01626f79dada3827ddec89b1"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-22-action-card-status"
    after: "3b2cefaf0f15e6bc6b54955ca74c3e1f831c8d007d11816bc1984222138207e5"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-22-action-card-status"
    after: "a84ad105f15d593df6ab43810d5d2cf833625b07b6ba31aba411a274463d2efc"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing catalogs omit the flag and remain complete. New readers compare both entries and completeness. Older readers accept the unchanged source discriminator and entry fields, preserve the already-rendered discovery warning in message content, and ignore the optional flag. No event discriminator, required field, or Session format version changes.

<a id="verification"></a>
## Verification

Focused skill-filesystem and tool-skill tests: 71 passed with 100% coverage for both changed source files. Keyless headless skill-root-isolation and skill-load snapshots: 2 passed; the isolation fixture logs the partial catalog and loads a readable skill despite a failing root.

<a id="dev-note"></a>
## Dev Note

None.
