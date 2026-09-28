---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-09-14-image-offload

English | [中文](2026-09-14-image-offload.zh.md)

## Summary

Record selected image occurrences with the image/offload event and derive their offloaded marks through the owning plugin's message projection.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Existing logs remain readable. The optional offloaded image field leaves unmarked occurrences retained. The new event is required on read: older builds that do not recognize image/offload refuse those logs, and current readers require its message projection. Event envelopes and structural Session format versions are unchanged.

<a id="verification"></a>
## Verification

Session and image-offload tests cover event validation, immutable message projection, missing interpreters, restore, and retry. The focused 1,144-test run and two TypeScript image snapshots pass. The Python advanced SDK recording was refreshed through the built astro-one profile and includes the standalone image/offload event.

<a id="dev-note"></a>
## Dev Note

None.
