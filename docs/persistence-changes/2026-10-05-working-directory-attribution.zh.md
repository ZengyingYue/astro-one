---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-05-working-directory-attribution

[English](2026-10-05-working-directory-attribution.md) | 中文

## 概述

新增由工作目录组件拥有的通知来源标记。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

已有记录仍然有效。新增的 working-directory 来源种类只提供来源标记；已声明的来源策略保留未知标记而不解释其含义。Session 格式保持不变。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/session/working-directory/tests packages/shell/tool-bash/tests/tools.spec.ts packages/shell/tool-pwsh/tests/tools.spec.ts packages/subagent/subagent/tests/schedule-tools.spec.ts：5 个文件、207 个测试通过。

<a id="dev-note"></a>
## 开发备注

无。
