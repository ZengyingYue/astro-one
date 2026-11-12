// Preserve Node's exit before Vitest installs its test-level process.exit guard.
globalThis.__astroOneCoverageFixtureExit = process.exit.bind(process)
