---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-13-user-rpc-principal

[English](2026-10-13-user-rpc-principal.md) | 中文

## 概述

为 owner 以外的调用方提交的 prompt，在 user-rpc 消息来源上增加可选的 principal。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

owner 的 prompt 不写该字段，因此其来源与所有既有 Session 日志都不变；缺少 principal 即为 owner。早于该字段的读取方会忽略它，并因 kind 仍为 'user' 而把消息当作普通用户消息。当前读取方读取旧日志时找不到 principal，把每条消息都视为 owner 的消息。该字段不进入任何模型请求：provider 适配器只读取模型可见的消息内容。SESSION_FORMAT_VERSION 不变。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/api/session-controller/tests/remote-access.host.spec.ts packages/subagent/subagent/tests/control.spec.ts packages/api/session-controller/tests/session-cold.host.spec.ts：非 owner 的 prompt 在 agent/inbox/spliced 中持久化 source.principal，owner 与既有时区来源保持逐字节不变；全部测试通过。

<a id="dev-note"></a>
## 开发备注

无。
