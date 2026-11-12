---
description: "Satellite assembly workshop for the astro-one web client: a 3D bench that mounts catalog parts on a satellite bus, budgets the build, and hands it to the model for evaluation."
kind: "package-reference"
---

# @astro-one/client-ui-satellite-workshop

English | [中文](README.zh.md)

## Summary

This package adds the **Satellite workshop** entry to the Web client's sidebar and the page it opens. The user picks a mission and a satellite bus, mounts parts from a catalog on the bus with the mouse or the keyboard on a 3D bench, and reads the mass, power, battery, delta-v, pointing, downlink, and thermal budgets as the build changes. One button sends the build, its budgets, and the rules it breaks to the model as the first prompt of a new Session, where the model judges whether the configuration is sound and fits the mission.

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

The Web application bundle loads the package through its `ui-satellite-workshop` row; the page needs no configuration. The build persists in browser storage and a first visit starts from the Earth-observation reference build.

### Catalog

The catalog holds three buses (50 kg, 200 kg, and 2 t class), 28 parts in six families (power, payload, communications, attitude control, propulsion, thermal), and five missions (LEO Earth observation, LEO IoT constellation, MEO navigation, GEO communications, deep-space science). Each bus offers wing hinges, nadir, zenith, and ram face slots, one aft thrust plate, and internal bays; a part mounts only on a slot of its mount kind. Four missions have a reference build that passes every rule.

### Mouse and keyboard

| Action | Mouse | Keyboard (canvas focused) |
|---|---|---|
| Turn the camera | Drag empty space | Arrow keys or `W` `A` `S` `D` |
| Zoom | Wheel | `+` / `-` |
| Reset the camera | **Reset view** | `R` |
| Pick a part up | Click it in the bin | — |
| Mount the held part | Click a highlighted slot | `Q` / `E` to choose a slot, then `Enter` |
| Mount on the first free slot | Double-click the part, or drag it from the bin onto the bench | — |
| Move a mounted part | Drag it onto another slot of its kind; an occupied slot swaps | — |
| Remove a part | Right-click it, or the remove control in the mounted list | `Delete` on the focused slot |
| Exploded view | **Exploded view** | `X` |
| Put the held part down | Click the part again | `Esc` |

A bay part in hand, a focused bay, and the exploded view turn the bus body translucent so the internal bays are visible.

### Budgets and rule checks

The page recomputes seven first-order budgets on every change: wet mass against the bus limit, orbit-average generation against load, battery capacity against the longest eclipse at 60% depth of discharge, delta-v from the rocket equation against the mission need, pointing accuracy from the mounted actuators and star tracker against the tightest part requirement, orbit-average downlink against payload data, and heat load against rejection. Twenty rules report errors (a failed budget, a missing mission payload, no attitude control, no link) and warnings (thin margins, an Earth-facing payload off the nadir face, a star tracker on the nadir face, a single solar wing, wheels with no way to unload momentum, magnetorquers outside a usable magnetic field).

### Model evaluation

**Evaluate with the model** opens a blank Session in the Workspace of the Session on screen, or in the first Workspace, and submits the evaluation prompt there. The prompt is written in the interface language and states the mission, the bus, every mounted part with its slot and figures, the seven budgets, and the rule findings, then asks for soundness, suitability, risks, specific part changes, and a 0–100 score. **Copy evaluation prompt** places the same text on the clipboard. Without a Workspace the page asks the user to add one; a refused prompt or failed Session creation shows a notice and sends nothing.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`catalog.ts` holds the buses, parts, and missions; `assembly.ts` derives each bus's slots from its dimensions and declares the workshop store, whose actions are the only writes. `budgets.ts` computes the budgets and findings as pure functions, and `presentation.ts` words them for both the page and the prompt, so the model reads the same figures the user sees. A stored build can name a part or slot a later catalog dropped; `mountsOf` leaves those entries out.

`bench.ts` owns one three.js scene: the bus, a marker per slot, and a model per mounted part built procedurally by `models.ts`. It draws the view its owner passes and holds no build state. `Viewport.tsx` owns the canvas, the animation loop, and the pointer and key handlers. `LazyViewport.tsx` loads that chunk, and three.js with it, only when the page is opened; the chunk imports no value from the entry bundle. Under the reduced-motion preference parts and views are placed without animation. Where WebGL is unavailable the page shows a notice and the bin, double-click mounting, and the mounted list remain usable.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

These pages cover the slots the package registers into and the services its evaluation uses.

- [ui-layout](../ui-layout/README.md) — the keyed `main` slot that hosts global panels.
- [ui-sidebar](../ui-sidebar/README.md) — the `sidebar.panellist` entries.
- [ui-workspace](../ui-workspace/README.md) — the `uiWorkspace` navigation that opens the evaluation Session.

-----

<a id="model-experience"></a>
## Model Experience

### Evaluation prompt

#### What the model sees

One user message per evaluation, submitted through the Session Controller like a typed message and recorded in the Session log. The message is Markdown in the interface language: a one-paragraph request, `Mission`, `Bus`, `Mounted parts`, `Budgets`, and `Rule checks` sections filled from the build, and five numbered questions asking for soundness, suitability, risks, specific part changes, and a 0–100 score. The package adds no tool, system-prompt text, or context provider.

#### Token effect

Conditional: nothing is sent until the user requests an evaluation. One message carries seven budget lines, one line per mounted part (at most 15 on the largest bus), and one line per broken rule.

#### KV Cache effect

Append-only: the prompt is the first user message of a new Session and follows the unchanged system prompt and tool list.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define what the budgets and the evaluation can be trusted for.

- **Catalog figures are representative class values**, not data for specific products, and the budgets are first-order sizing relations. They have not been validated against real satellites or an independent sizing tool.
- **The evaluation is a chat answer.** The page does not read the model's reply, so it shows no score of its own and does not apply suggested changes to the build.
- **One propulsion slot and fixed slot layouts.** A build cannot combine propulsion systems or add slots, and part orientation within a slot is fixed.
- **The 3D bench needs WebGL.** The fallback covers selection and budgets but not spatial assembly.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Rebuild with `pnpm --filter @astro-one/client-ui-satellite-workshop bundle` before probing a live Web server. The bench chunk must stay free of value imports from `catalog.ts` and `assembly.ts`; a shared value makes the bundler emit a sibling chunk the module loader does not resolve.

</details>

**Runtime invariant:** No companion is published. The slot registrations are effects observed by the slot registry, and the budgets are pure functions of the store state with no second observation to diverge from.
