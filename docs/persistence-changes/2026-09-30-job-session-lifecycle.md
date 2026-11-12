---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-09-30-job-session-lifecycle

English | [中文](2026-09-30-job-session-lifecycle.zh.md)

## Summary

Records owned job registration and settlement with one unique JobId, original timestamps, creating tool calls, and producer completion reports.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-09-30-job-session-lifecycle
baseline: false
changes:
  - root: "event:job/registered"
    previous: null
    after: "58ce0801696b1933865834b433a83890e9c38ecbdea64d3943129e9a35593b8f"
    decision: same-version
  - root: "event:job/settled"
    previous: null
    after: "3690782986ea116dc846a779600f88a35e5122a736a5fed588d4c74d4dc5f899"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Adds required job event kinds without changing the Session envelope. New JobIds use a kind-prefixed UUID for both live controls and durable pairing; historical sessions receive no fabricated job history. Older builds reject unknown required events. producerReported describes completion-promise fulfillment, not verified resource release.

<a id="verification"></a>
## Verification

Registry and snapshot-normalizer tests cover causal order and unique JobIds. CLI and SDK snapshots verify registration, settlement, and notices during execution; the [job lifecycle contract](../subsystems/jobs.md#session-lifecycle-records) allows incomplete terminal history during application teardown.

<a id="dev-note"></a>
## Dev Note

None.
