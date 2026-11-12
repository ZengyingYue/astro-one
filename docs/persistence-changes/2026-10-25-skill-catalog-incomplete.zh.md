---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-25-skill-catalog-incomplete

[English](2026-10-25-skill-catalog-incomplete.md) | 中文

## 概述

当技能发现仅返回当前可读技能时，为 skill-catalog 消息来源添加可选的 incomplete: true 元数据。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

已有目录不含此标记，仍按完整目录读取。新读取方同时比较条目与完整性。旧读取方接受未变的来源判别值与条目字段，保留消息正文中已渲染的发现警告，并忽略可选标记。不改变事件判别值、必填字段或 Session 格式版本。

<a id="verification"></a>
## 验证

skill-filesystem 与 tool-skill 定向测试共 71 项通过，两个修改源文件覆盖率均为 100%。无密钥 headless skill-root-isolation 与 skill-load 快照共 2 项通过；隔离夹具记录部分目录，并在一个根失败时成功加载可读技能。

<a id="dev-note"></a>
## 开发备注

无。
