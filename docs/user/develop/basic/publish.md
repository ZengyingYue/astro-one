# Package and install a plugin

English | [中文](publish.zh.md)

The previous tutorials loaded a local plugin through a `--patch` overlay. This tutorial packages it as an installable **bundle**, installs it into a **profile** with `astro-one plugin add`, and explains the layer order that determines the composed configuration. It assumes the `astro-one` CLI is installed. Complete [plugin configuration](./config.md) first.

To use a fresh source checkout instead, complete the [run-from-source section](../../../../README.md#run-from-source), keep this tutorial's `hello-plugin` directory at the repository root, and run the remaining `astro-one ...` commands from there as `pnpm astro-one ...`. See [source execution](../../../../apps/cli/reference/README.md#source-execution) for build and launcher behavior.

## Two concepts, two manifests

Installation is built on two concepts. Both are described by a `package.json`, but they carry different kinds of manifest under the `astroOne` key, and they answer different questions:

- A **bundle** is an npm package that ships a configuration layer. Its manifest declares `astroOne.bundle`, answering "what does this package contribute?": a patch file that inserts or overrides plugin rows.
- A **profile** is a directory under `$ASTRO_ONE_HOME/profiles/<name>` describing one runnable composition. Its manifest declares `astroOne.profile`, answering "which bundles compose this setup, in what order?".

A bundle is what you author and distribute; a profile is what a user boots with `astro-one --profile <name>`. Nothing is both.

### The bundle manifest

Create the package directory:

```sh
mkdir -p hello-plugin
```

```
hello-plugin/
├── package.json       # declares astroOne.bundle
├── cordis.patch.yml   # the layer applied when a profile lists this bundle
└── index.js           # plugin modules the patch rows reference
```

Create `hello-plugin/package.json`:

```json
{
  "name": "astro-one-hello-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "astroOne": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

Create `hello-plugin/index.js` with the plugin entry point:

```js
export const name = 'hello-plugin'

export function apply() {
  console.log('[hello-plugin] plugin loaded!')
}
```

Create `hello-plugin/cordis.patch.yml`. The patch is a YAML array like the `--patch` overlays you wrote, except plugin rows reference the package by name instead of a relative source path so Node resolution finds the installed code:

```yaml
- insert:
    - id: hello
      name: astro-one-hello-plugin
```

`patch` also accepts an ordered list of files, for example `["./base.patch.yml", "./web.patch.yml"]`; the launcher applies them in that order as one layer, and each file's relative plugin paths resolve beside that file. A package without the `astroOne.bundle` declaration still installs, but only as a plain dependency: `astro-one plugin` prints a warning and activates no layer. Use that package format for a library that plugin packages import rather than a plugin users enable.

### The profile manifest

A profile directory holds two files:

- `package.json` — the profile's out-of-tree plugin dependencies (managed by pnpm) plus the `astroOne.profile` manifest with its ordered `bundles` list.
- `cordis.patch.yml` — the user's own patch layer, applied after every bundle layer.

You never write a profile manifest by hand: `astro-one --profile <name> --from-default-profile <template>` can create one from a shipped application template, while `astro-one plugin` creates a base-backed profile and maintains its installed bundle list. The [CLI behavior reference](../../../../apps/cli/reference/README.md#profile-boot) owns the creation rules; the next section shows the plugin path.

## Install into a profile

`astro-one plugin --profile <name> <args...>` forwards to pnpm in the profile directory, so every pnpm verb works. From the directory that contains `hello-plugin`, install the package checkout:

```sh
astro-one plugin --profile demo add ./hello-plugin
```

The first use initializes the profile (with `@astro-one/base` as its first bundle), pnpm links the checkout, and `astro-one` appends the bundle to `astroOne.profile.bundles` because the package declares `astroOne.bundle`:

```json
{
  "name": "astro-one-profile-demo",
  "private": true,
  "dependencies": {
    "astro-one-hello-plugin": "link:/path/to/hello-plugin"
  },
  "astroOne": {
    "profile": {
      "bundles": [
        "@astro-one/base",
        "astro-one-hello-plugin"
      ]
    }
  }
}
```

A linked checkout keeps its own `node_modules`. Declare astro-one packages whose instances the plugin must share with the host under both `peerDependencies` and `devDependencies`, as the harness packages do. At that manifest's lookup position, peers present in the running astro-one's runtime resolution use the installation's copy; the devDependency copy serves your type checker and standalone tests. Keep independently versioned third-party dependencies and stateless astro-one utilities under `dependencies`.

Ordinary linked imports follow Node's ancestor order and check each directory's current peer declarations. A nearer physical package wins before a higher peer declaration. A link target can lack `package.json`; ancestor peers still apply, even without a physical `node_modules` beside that manifest. Explicit `require.resolve(..., { paths })` is always native, including paths inside a profile. These rules are shared by npm, Desktop, and source launches; they do not invalidate loaded modules or validate peer version ranges. See the [resolution rules](../../../../.agents/notes/implemented/architecture/2026-09-19-profile-resolution-lookup-order.md) for scope and file-query behavior.

Linking a broad checkout does not apply peer interception to the running installation's own package directories. Links whose targets stay inside the profile, including its pnpm store, remain profile-owned installation content rather than external linked roots. Overlapping external links do not change lookup order: each request still starts from its importer's directory.

Verify the layer without booting, then boot:

```sh
astro-one --profile demo --dump-config   # shows a "# == astro-one-hello-plugin" layer
astro-one --profile demo
```

`astro-one plugin --profile demo remove astro-one-hello-plugin` removes both the dependency and the layer.

## The loading order

The effective configuration composes over an empty root by applying, in order:

1. Each bundle patch named in the profile's `astroOne.profile.bundles` list, in list order — `@astro-one/base` first, then each installed bundle in the order it was added.
2. The profile's own `cordis.patch.yml`.
3. The home-level `$ASTRO_ONE_HOME/cordis.patch.yml` — machine-local preferences shared by every profile.
4. Each `--patch <path>` overlay, in argv order.

App arguments are not another patch layer. A surface bundle can resolve them through an ordinary app-owned service, described below.

Later layers win per row, and a patch replaces a row's entire `config` value rather than deep-merging keys. Two consequences for bundle authors:

- Your patch can override rows from earlier layers by `id` — the same way [the `astro-one-web-app` bundle](../../../../packages/bundle/web-app/cordis.patch.yml) overrides `astro-one-base` rows — but must restate every key the row needs, not just the changed one.
- Users can override your rows in their profile's `cordis.patch.yml` without touching your package, so prefer configuration defaults users are likely to keep and let the schema carry the rest.

In-box bundle names always resolve from the astro-one installation itself; pnpm manages only out-of-tree packages, so your bundle can rely on `@astro-one/base` being present and current.

## Give a surface bundle its own command line

A bundle that defines a runnable app mounts an ordinary provider plugin:

```yaml
- id: hello-startup
  name: 'astro-one-hello-plugin/startup'
```

The plugin exports `inject = ['cmdlineArgs']`, calls `parseCmdline` from [`@astro-one/cmdline`](../../../../packages/boot/cmdline/README.md) with its own commander program, and provides its app-owned service from the program's action. The launcher hands every plugin the same immutable arguments after launcher flags, so app-specific flags need no launcher change and multiple plugins may parse the snapshot. The Loader row needs no launcher marker or special kind.

Rows configured by those arguments inject the provider's service and read it from their own `!!js` options, with the deployment value beside it as the fallback:

```yaml
- id: my-app
  name: '@example/my-app'
  inject: [myAppStartup]
  config:
    port: !!js ctx.myAppStartup.port ?? 8080
```

On `--help`, the provider publishes no service, so those rows never activate. Loader mounts the composition once, waits for each row's ordinary injections, and only then evaluates that row's `!!js` config against its injected context.

## Installing from GitHub: the build-script catch

Publishing to a registry is not required — users can install straight from a git host:

```sh
astro-one plugin --profile demo add github:you/hello-plugin
```

But a git install fetches **sources, not built artifacts**: nothing runs your `build` script, so a TypeScript package arrives without its `lib/` output and fails to load. Two things must happen, one on each side:

- **The author** ships a `prepare` script — pnpm runs it after a git install — that builds the published entry points from source, self-contained: it must not assume dev-only context such as a sibling monorepo checkout. A dedicated tsdown config can transpile `src/` without project references or type checking.
- **The user** allowlists the build. pnpm ≥10 refuses to run a git dependency's `prepare` script until it is explicitly allowed, so the first `add` fails; `astro-one` points at the fix — copy the exact package key pnpm printed into the profile's `pnpm-workspace.yaml`:

  ```yaml
  allowBuilds:
    astro-one-hello-plugin: true
  ```

  and re-run the `add`.

Treat that allowance as **permission to execute the package's code on your machine at install time**, outside any sandbox the agent runs under. Only allow packages whose source you trust, and pin a commit (`github:you/hello-plugin#<sha>`) so a later push cannot silently change what runs.

If you would rather not ask users for the allowance, distribute built artifacts instead — neither form needs any build permission:

- **Publish to npm** with `lib/` built at `pnpm publish` time; `astro-one plugin add your-package` then installs prebuilt code.
- **Ship a tarball** from `pnpm pack`; users run `astro-one plugin add ./hello-plugin-0.1.0.tgz`.

## Next steps

- [Plugins and lifecycle](../framework/index.md) — the full plugin lifecycle
- [CLI behavior reference](../../../../apps/cli/reference/README.md) — exact layer precedence, flags, and profile mechanics
