---
description: "Optional aerospace layer: mounts the astrodynamics, GNSS positioning, and remote-sensing tools from the plugin manager or a custom profile."
kind: "package-bundle"
---

# @astro-one/aerospace

English | [中文](README.zh.md)

## Summary

This optional bundle inserts [`astro-one-tool-astrodynamics`](../../aerospace/tool-astrodynamics/README.md), [`astro-one-tool-gnss`](../../aerospace/tool-gnss/README.md), and [`astro-one-tool-remote-sensing`](../../aerospace/tool-remote-sensing/README.md) with bounded default limits. It applies after `@astro-one/base`, which provides the tool registry and the workspace filesystem. Shipped profiles leave it disabled.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Open Plugins in the Web sidebar and enable Aerospace. For a terminal or headless profile, add `@astro-one/aerospace` after the existing bundles in `$ASTRO_ONE_HOME/profiles/<profile>/package.json`:

```json
{ "astroOne": { "profile": { "bundles": ["@astro-one/base", "@astro-one/headless", "@astro-one/aerospace"] } } }
```

The ONNX object detector stays off; the [remote-sensing README](../../aerospace/tool-remote-sensing/README.md#enable-object-detection) shows the profile override that enables it.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

The static `cordis.patch.yml` inserts the three tool rows with ids `tool-astrodynamics`, `tool-gnss`, and `tool-remote-sensing`, so profile patches can override each row's config by id. `@astro-one/aerospace` is listed in the boot package's optional bundles, which makes it manageable from the plugin manager without selecting it in default profiles. No runtime invariant companion is published because this configuration-only package has no runtime state.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Aerospace package map](../../aerospace/README.md) — the library and the three tool packages.
- [Aerospace subsystem](../../../docs/subsystems/aerospace.md) — units, frames, and algorithm sources.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the three inserted tool packages, which own every schema and result the model sees.

#### KV Cache effect

Enabling or disabling the bundle adds or removes up to ten tool schemas and invalidates reuse from the first changed schema token.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Installing astro-one also installs the native dependencies** — `sharp` and `onnxruntime-node` install with the CLI even while this bundle is disabled.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
