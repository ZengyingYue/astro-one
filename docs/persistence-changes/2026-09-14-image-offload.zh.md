---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-09-14-image-offload

[English](2026-09-14-image-offload.md) | 中文

## 概述

用 image/offload 事件记录选中的图片出现位置，通过所属插件的消息投影派生 offloaded 标记。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-09-14-image-offload
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-09-11-initial"
    after: "97fbaf35a6ad32d2654ba422e83ec6a4d1dcaa5701b62808ed1b218a6021f0bc"
    decision: same-version
  - root: "event:assistant/attempt"
    previous: "2026-09-11-initial"
    after: "e1a42476e3bb6a051b2ba4aba00f52aed6707848abef5814698444374e060233"
    decision: same-version
  - root: "event:assistant/message"
    previous: "2026-09-11-initial"
    after: "6cc3250577ffca04e6307627b06f522a579c5daab8c58a503e15ee98e00a417a"
    decision: same-version
  - root: "event:compaction/summary"
    previous: "2026-09-11-initial"
    after: "d32a71ee0e5c0d4cc049fb401b078ffe9b55aab6a19af848e258a9bde92835e3"
    decision: same-version
  - root: "event:image/offload"
    previous: null
    after: "4dda8bc541b9a07502824890c9fa495be75ac763c52cb277c9a013c16d3e77df"
    decision: same-version
  - root: "event:llm/retry"
    previous: "2026-09-11-initial"
    after: "718457e39b43b87a5defdc3ba93fb6026386a59950723e8088e08606e096bed1"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-09-11-initial"
    after: "53b17cdf7b0b359537e72838e9b405b84bf1da956a1b5bdc4d5a97feb5e84e40"
    decision: same-version
  - root: "event:system/message"
    previous: "2026-09-11-initial"
    after: "95bce6e1543f69bbfcdad9e045ff9f9d40323f95b7bdbd293e4f8396a1c4080c"
    decision: same-version
  - root: "event:team/message/queued"
    previous: "2026-09-11-initial"
    after: "7d2aeaf275f229b495d958227ad7ce80acb2daa9cddb882031c133b56b72d073"
    decision: same-version
  - root: "event:tool/ptc-dispatch"
    previous: "2026-09-12-auto-review-error-metadata"
    after: "e6baf8c667108170d1f9bd1a68c63f5877f903125b3775cc9929b3578881c20f"
    decision: same-version
  - root: "event:tool/result"
    previous: "2026-09-12-auto-review-error-metadata"
    after: "1eabd59c7de4fb4afd3546a01264b877b5cd037f4857bfd863ae916da3ba1174"
    decision: same-version
  - root: "event:turn/end"
    previous: "2026-09-11-initial"
    after: "ca8a7512b5c88e1325efdda7e6dd605bdef136e2784c02038c69134a2287fadd"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-09-11-initial"
    after: "82c87985c916d70c574ce53bbe578a58699df4639db8e55ada341db212db67a6"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

现有日志仍可读取。可选的图片字段 offloaded 使未标记的出现位置保持保留状态。新事件在读取时必须被识别：不认识 image/offload 的旧版本拒绝读取这些日志，当前读取器需要对应的消息投影。事件信封和结构性的 Session 格式版本不变。

<a id="verification"></a>
## 验证

Session 和图片省略测试覆盖事件校验、不可变消息投影、缺少处理器、恢复和重试。所选的 1,144 项测试和两项 TypeScript 图片快照通过。Python advanced SDK 录制已通过构建后的 astro-one profile 刷新，包含独立的 image/offload 事件。

<a id="dev-note"></a>
## 开发备注

无。
