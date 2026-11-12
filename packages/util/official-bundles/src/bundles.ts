/** The bundle package names the astro-one installation selects, offers, installs on demand, or retires. */

/** Installation-owned defaults used when a shipped profile is first opened. */
export interface ProfileTemplate {
  /** Ordered bundle layer list. */
  bundles: readonly string[]
}

/** The shipped profile templates auto-initialized on first use, by name. */
export const PROFILE_TEMPLATES: Record<string, ProfileTemplate> = {
  acp: {
    bundles: ['@astro-one/base', '@astro-one/acp-app'],
  },
  web: {
    bundles: ['@astro-one/base', '@astro-one/web-app'],
  },
  headless: {
    bundles: ['@astro-one/base', '@astro-one/headless'],
  },
  sdk: {
    bundles: ['@astro-one/base', '@astro-one/sdk-app'],
  },
  'sdk-minimal': {
    bundles: ['@astro-one/sdk-minimal'],
  },
}

/**
 * Installation-owned bundle tuples that an earlier release wrote into a shipped profile; app-boot replaces an exact
 * match with the {@link PROFILE_TEMPLATES} entry of the same name and leaves every other list untouched.
 */
export const INSTALLATION_OWNED_PROFILE_TUPLES: Readonly<Record<string, readonly string[]>> = {
  headless: ['@astro-one/base', '@astro-one/web-app', '@astro-one/headless'],
}

/** Bundles an earlier release shipped and the installation no longer carries; app-boot removes them from profiles. */
export const RETIRED_BUNDLES: ReadonlySet<string> = new Set([
  // The Web composition mounts Schedule itself
  // ([upgrade guide](../../../../docs/upgrade-guide/v0.2.0-rc.2/schedule-bundle-retired/guide.md)).
  '@astro-one/experimental-schedule-bundle',
  '@astro-one/experimental-agent-team-profile',
])

/** The bundle list a `astro-one plugin` init uses for a name with no shipped template. */
export const DEFAULT_PROFILE_BUNDLES: readonly string[] = ['@astro-one/base']

/**
 * The bundles the astro-one installation ships for a person to switch on: each a
 * runtime dependency of the installation that declares `astroOne.bundle.patch`,
 * an `icon`, and `./locale/*.json` display metadata, selected by no shipped
 * template, and offered switched off by the plugin manager except persistent
 * terminals, which have no page switch.
 */
export const OPTIONAL_BUNDLES: readonly string[] = [
  '@astro-one/aerospace',
  '@astro-one/personalized-recommendations',
  '@astro-one/cua-bundle',
  '@astro-one/experimental-session-search',
  '@astro-one/experimental-ralph-bundle',
  '@astro-one/experimental-terminal-bundle',
  '@astro-one/experimental-badge-skill-bundle',
  '@astro-one/experimental-session-titles-bundle',
  '@astro-one/experimental-voice-input-bundle',
  '@astro-one/experimental-cot-translation-bundle',
  '@astro-one/experimental-auto-review',
  '@astro-one/experimental-inspector-profile',
  '@astro-one/experimental-liveshare',
  '@astro-one/experimental-plugin-market-bundle',
  '@astro-one/experimental-tool-worktree',
  '@astro-one/experimental-forge-bundle',
]

/** Public Astro One release members available through the ordinary on-demand bundle installer. */
export const ON_DEMAND_BUNDLES: readonly string[] = [
  '@astro-one/subagent-claude-code',
  '@astro-one/subagent-codex',
]
