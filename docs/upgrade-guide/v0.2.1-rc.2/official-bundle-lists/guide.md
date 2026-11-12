---
kind: upgrade-guide
description: "The bundle lists and profile templates move from @astro-one/app-boot to @astro-one/official-bundles."
---

# Import bundle lists from `@astro-one/official-bundles`

English | [中文](guide.zh.md)

## Change

`@astro-one/app-boot` no longer exports `PROFILE_TEMPLATES`, `ProfileTemplate`, `DEFAULT_PROFILE_BUNDLES`, `OPTIONAL_BUNDLES`, `ON_DEMAND_BUNDLES`, `OFFICIAL_ON_DEMAND_CATALOG`, or `OfficialBundleCatalogEntry`. The new published package `@astro-one/official-bundles` exports them with unchanged values and types. Code that imports any of these names from `@astro-one/app-boot` fails to compile or load. The `astro-one` launcher, profiles, and bundle selection behave as before.

## Migration

1. Add `@astro-one/official-bundles` to the `dependencies` of each package that imports one of these names.
2. Change those imports from `@astro-one/app-boot` to `@astro-one/official-bundles`, for example `import { PROFILE_TEMPLATES } from '@astro-one/official-bundles'`. Keep importing every other name, such as `initProfile` or `loadProfile`, from `@astro-one/app-boot`.
3. Run your type check or build; it succeeds when no import of a moved name from `@astro-one/app-boot` remains. See the [package README](../../../../packages/util/official-bundles/README.md) for each list.
