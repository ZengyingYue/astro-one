---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-09-30-job-session-lifecycle

[English](2026-09-30-job-session-lifecycle.md) | 中文

## 概述

以唯一 JobId 将有所有者 job 的注册与结算记录为 Session 事件，包含原始时间戳、创建工具调用和生产方完成报告。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

增加必需的 job 事件类型，不改变 Session 封装。新 JobId 用带 kind 前缀的 UUID 同时进行运行期控制与持久化配对；不为历史会话补造 job 事件。旧构建拒绝未知的必需事件。producerReported 表示完成 promise 兑现，不确认资源已释放。

<a id="verification"></a>
## 验证

注册表和快照归一化测试覆盖因果顺序与唯一 JobId。CLI 和 SDK 快照验证运行中的注册、结算和通知；[job 生命周期约定](../subsystems/jobs.zh.md#session-lifecycle-records)允许应用销毁时留下不完整的终态历史。

<a id="dev-note"></a>
## 开发备注

无。
