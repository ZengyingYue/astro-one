---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-09-21-user-question-reply

English | [中文](2026-09-21-user-question-reply.zh.md)

## Summary

Adds a qualified user-question-reply message source for a late answer to a continued ask_user_question call.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-09-21-user-question-reply
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-09-16-session-format-v4"
    after: "4068f4f0dc40359777b4fc2c3cabcb1d671730021088f9c31e98f9b42ddd900f"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-09-16-session-format-v4"
    after: "4f9a3ac9175344f5071a824af07870313a4488d37c41ef7b773dbe00a584d9fb"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-09-16-session-format-v4"
    after: "a74a8a84c4c14646a5adbf415891f461c737852488c9488599ca6a9bf7eeaae3"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-09-16-session-format-v4"
    after: "c9057aa83f7727b61cd2f2fbd0d1a9d2a5dfde69f034ceee110a248d5aca7492"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing logs contain no such source and remain valid. The new source is qualified attribution on an ordinary user message; readers without astro-one-user-questions preserve the message and derive history from its content. Only the userQuestions projection reads this source to close the named question and record its answers. The answer RPC is its only producer and writes outcome answered; closing the Client panel persists no reply. No event type or Session header changes.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/interaction/user-questions/tests packages/interaction/tool-ask-user/tests: 81 tests passed. The focused projection, reply, view, and process-group suite passed 70 tests. pnpm run typecheck passed. pnpm run doc-sync passed all 42 gates, including persistence history and translation pairing.

<a id="dev-note"></a>
## Dev Note

None.
