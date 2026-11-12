/** The package names the plugin manager protects, hides, orders, or marks experimental. */

/**
 * Plugin packages the plugin manager refuses to disable or remove, because management itself needs them; a bundle that
 * contains one is read-only as well. Removing a name drops only this `management-required` refusal; the manager's own
 * entry, installation-carried bundles, and unaddressable rows stay protected by their own rules.
 */
export const PROTECTED_PLUGINS: ReadonlySet<string> = new Set([
  '@astro-one/plugin-manager', '@astro-one/cordis-plugin-loader',
  '@astro-one/cordis-plugin-include', '@astro-one/api-gateway',
  '@astro-one/host-webserver', '@astro-one/client-modules',
  '@astro-one/client-ui-settings-plugin-inventory', '@astro-one/client-ui-plugin-manager',
  '@astro-one/host-plugin-inventory', '@astro-one/typert-registry',
  '@astro-one/api-remotes', '@astro-one/api-remote-access',
  '@astro-one/cordis-plugin-timer', '@astro-one/client-connection',
  '@astro-one/host-frontend-static', '@astro-one/tools',
  '@astro-one/hmr',
])

/**
 * Built-in profile bundles, persistent terminals, and the standalone worktree tool, which have no plugin manager page.
 * Their Host availability and activation stay intact.
 */
export const HIDDEN_BUNDLES: ReadonlySet<string> = new Set([
  '@astro-one/base',
  '@astro-one/web-app',
  '@astro-one/headless',
  '@astro-one/sdk-app',
  '@astro-one/acp-app',
  '@astro-one/sdk-minimal',
  '@astro-one/experimental-terminal-bundle',
  '@astro-one/experimental-tool-worktree',
])

/**
 * The optional bundles the plugin manager's main and More lists rank first, in this order. {@link MORE_BUNDLES}, not
 * this list, decides whether a bundle appears on the main list.
 */
export const EXTENSION_BUNDLES: readonly string[] = [
  '@astro-one/experimental-voice-input-bundle',
  '@astro-one/experimental-plugin-market-bundle',
  '@astro-one/experimental-auto-review',
]

/**
 * The optional bundles the plugin manager's main list leaves out until the profile enables them; its More list,
 * which includes every eligible bundle, ranks them last in this order.
 */
export const MORE_BUNDLES: readonly string[] = [
  '@astro-one/personalized-recommendations',
  '@astro-one/experimental-inspector-profile',
  '@astro-one/cua-bundle',
  '@astro-one/experimental-cot-translation-bundle',
  '@astro-one/experimental-session-search',
  '@astro-one/experimental-session-titles-bundle',
  '@astro-one/experimental-badge-skill-bundle',
  '@astro-one/experimental-ralph-bundle',
  '@astro-one/subagent-codex',
  '@astro-one/subagent-claude-code',
]

/** Official bundles the plugin manager marks with the Experimental badge. */
export const EXPERIMENTAL_BUNDLES: ReadonlySet<string> = new Set([
  '@astro-one/personalized-recommendations',
  '@astro-one/cua-bundle',
  '@astro-one/experimental-voice-input-bundle',
  '@astro-one/experimental-auto-review',
  '@astro-one/experimental-inspector-profile',
  '@astro-one/experimental-forge-bundle',
  '@astro-one/experimental-tool-worktree',
  '@astro-one/experimental-cot-translation-bundle',
  '@astro-one/experimental-session-search',
  '@astro-one/experimental-session-titles-bundle',
  '@astro-one/experimental-badge-skill-bundle',
  '@astro-one/experimental-ralph-bundle',
  '@astro-one/experimental-plugin-market-bundle',
  '@astro-one/experimental-liveshare',
])
