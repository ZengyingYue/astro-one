---
kind: upgrade-guide
description: "The `agent-instructions` row no longer accepts `astroOneHome`; instruction loading always resolves the harness home from `$ASTRO_ONE_HOME` or `~/.astro-one`."
---

# Instruction loading resolves one harness home

English | [中文](guide.zh.md)

## Change

`@astro-one/agent-instructions` removed its `astroOneHome` config field. The plugin resolves the harness home through `resolveAstroOneHome()` from `@astro-one/home-paths`, like every other harness consumer: the home is `$ASTRO_ONE_HOME` when it is set and non-blank, otherwise `~/.astro-one`, with tilde expansion.

A `cordis.yml`, profile patch, or `--patch` overlay that still sets `astroOneHome` on the `agent-instructions` row has no effect: the row keeps the stray key and the plugin ignores it, so instruction loading follows the process home. Other providers, such as `astro-one-skill-filesystem` and `astro-one-shell-env`, keep their own home fields; this removal covers the instruction loader only.

## Migration

1. Delete `astroOneHome` from the `agent-instructions` row in `cordis.yml`, `$ASTRO_ONE_HOME/cordis.patch.yml`, `$ASTRO_ONE_HOME/profiles/<profile>/cordis.patch.yml`, and any `--patch` overlay.
2. Where the override pointed at a non-default home, export `ASTRO_ONE_HOME` for the process instead, so every harness consumer reads that home.
3. Confirm with `astro-one --profile <profile> --dump-config` that the `agent-instructions` row lists only its remaining fields, and that a new session's first request shows `Instructions from: $ASTRO_ONE_HOME/AGENTS.md` (or `~/.astro-one/AGENTS.md`) when that file exists.
