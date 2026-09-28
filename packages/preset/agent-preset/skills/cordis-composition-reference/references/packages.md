# Loadable Harness plugin packages

This file is GENERATED from workspace manifests (`scripts/gen-plugin-packages.ts`) and verified fresh by `pnpm run verify-plugin-packages` (part of `doc-sync`); do not edit it by hand.

Every package below exports a Cordis plugin that a bundle patch can name in a Loader row. `Config` marks packages whose row accepts a `config` mapping; query `Config.listConfigs` through `cordis_inspect_query` (filter by `name`, then query the `entry` id) for the mounted schema. Packages under `experimental` are pre-stable.

## acp

| Package | Config | Description |
|---|---|---|
| `@astro-one/acp` | yes | Automation-only Agent Client Protocol server for driving Astro One agents over JSON-RPC stdio |

## api

| Package | Config | Description |
|---|---|---|
| `@astro-one/api-account-controller` | no | Expose safe account operations over authenticated Remote |
| `@astro-one/api-gateway` | yes | Typert Remote Host dispatcher and Client API endpoint |
| `@astro-one/api-job-controller` | yes | Job Remote observation stream and the reference-counted client job-output service |
| `@astro-one/api-remotes` | no | Remote BFF assembly for application-selected Host capabilities |
| `@astro-one/api-session-controller` | yes | Session Remote commands, cold reads, and live control transport |
| `@astro-one/api-settings-controller` | yes | Remote owner for the configuration surfaces over the settings-domain seams |
| `@astro-one/api-terminal-controller` | yes | Session-owned interactive terminals with shell discovery, screen recovery and typed Remote control |
| `@astro-one/api-workspace-controller` | yes | Workspace Remote commands and reconnect-safe state transport |
| `@astro-one/api-workspace-files` | yes | Workspace file service and Client resource provider: bounded reads, directory listing, and live metadata over the workspaceFiles Remote namespace |

## attachment

| Package | Config | Description |
|---|---|---|
| `@astro-one/attachment-local` | yes | Private content-addressed ASTRO_ONE_HOME attachment storage |

## boot

| Package | Config | Description |
|---|---|---|
| `@astro-one/config-editor` | no | Persist plugin configuration through profile patches and Loader reconciliation |
| `@astro-one/hmr` | yes | Coordinated module and profile configuration hot reload |
| `@astro-one/plugin-manager` | yes | Current-profile plugin and bundle management shared by astro-one CLI, Web and agent tools |

## browser-use

| Package | Config | Description |
|---|---|---|
| `@astro-one/browser-use` | no | Exclusive named browser-use provider registration |

## bundle

| Package | Config | Description |
|---|---|---|
| `@astro-one/acp-app` | no | The astro-one ACP profile bundle: automation-only JSON-RPC stdio and process lifecycle over astro-one-base |
| `@astro-one/headless` | yes | The astro-one one-shot bundle: a direct core Agent/Session runner over astro-one-base with no Host, HTTP, or browser layer |
| `@astro-one/sdk-app` | yes | The astro-one SDK profile bundle: stdio JSON-RPC serving and process lifecycle over astro-one-base |
| `@astro-one/web-app` | yes | The astro-one browser-surface bundle: the web patch layer over astro-one-base plus the runtime glue plugin (frontend dist serving, web-surface prompt, bash runtime variables, URL line) |

## client

| Package | Config | Description |
|---|---|---|
| `@astro-one/client-connection` | yes | Authenticated RPC transport and generation lifecycle |
| `@astro-one/client-file-upload` | no | Agent-scoped browser file upload, streaming intake, and staged receipt service |
| `@astro-one/client-hmr` | yes | Web client graph synchronization and rebuilt-bundle reload transport |
| `@astro-one/client-locale` | no | Locale plugin: Host-backed preference, extensible language catalog, browser fallback, and typed built-in dictionaries |
| `@astro-one/client-modules` | no | Client module system, dual-face: node half composes the __ASTRO_ONE_BOOT__ entry graph (incremental astroOne.client scan, bundle route, index tap, webPlugins service); browser half is the lazy-CJS module table the vendored cordis Loader consumes as its internal seam |
| `@astro-one/client-resources` | no | Unified client resource model: protocol-registered providers turn URL addresses into live values, consumed through the useResource global standard hook |
| `@astro-one/client-ui-agent-preset` | no | Agent-preset surfaces: the default for later sessions, this session's seat, and the composition editor |
| `@astro-one/client-ui-approval` | no | Approval composer takeover over the scoped Remote Event waterfall |
| `@astro-one/client-ui-attachment` | no | Dynamic attachment presentation plugin for conversation input, message-image, and trajectory image slots |
| `@astro-one/client-ui-brand-official` | no | Official Astro One brand occupants for the Web client's sidebar slots |
| `@astro-one/client-ui-chat` | no | Chat Conversation target, node definitions, renderers, and details surface |
| `@astro-one/client-ui-commands` | no | Client command surface: global directory cache, '/' source, three command UI kinds, popupSelect registry |
| `@astro-one/client-ui-conversation` | no | Target-neutral Conversation assembly, shell, composer, queue, and view navigation |
| `@astro-one/client-ui-deliverables` | no | Changed-files card with per-file comparison tabs, delivery cards, and clickable final-response file references for Web |
| `@astro-one/client-ui-directory-picker-browse` | no | In-app directory browsing surface: the workspace directory-flow owner rendering the host's listing and creation primitives |
| `@astro-one/client-ui-directory-picker-native` | no | Native directory-picker surface: the renderless workspace directory-flow occupant driving the local Desktop or Host OS chooser |
| `@astro-one/client-ui-goal` | no | Session goal surface: GoalBar docked above the composer, read from the goal session projection |
| `@astro-one/client-ui-input-trigger` | no | Input trigger pipeline: '/' and '@' detection, candidate menu, pick routing to registered sources |
| `@astro-one/client-ui-jobs` | no | Session-header background-job list with on-demand streaming record panels |
| `@astro-one/client-ui-layout` | no | Shell plugin: three-column AppFrame with drag handles, ctx.layout viewing-state service (navigation + panels) |
| `@astro-one/client-ui-message-feedback` | no | The Web feedback surface: per-message Like/Dislike in the assistant-message action strip and the feedback dialog behind both ratings and /feedback, backed by the messageFeedback and sessionFeedback Host Remotes |
| `@astro-one/client-ui-model-selection` | no | Model selection over the shared model catalog, Session projection, and session.selectModel |
| `@astro-one/client-ui-open-in-app` | no | Web "Open In..." controls: the Session-header split button opening the workspace directory in an installed application, and the document preview's default-application controls for one file |
| `@astro-one/client-ui-permission-presets` | no | Permission surfaces: a new-session default in General settings and a current-session /permission popup over the permissions projection |
| `@astro-one/client-ui-plan` | no | Plan mode controls, persistent transcript plan cards, and sidebar Markdown previews |
| `@astro-one/client-ui-plugin-manager` | yes | Plugin management for the astro-one web client: the sidebar Plugins panel installs, enables, disables, retries, and composes installed plugin packages |
| `@astro-one/client-ui-reference` | no | Unified Web @file and @session reference source |
| `@astro-one/client-ui-renderer` | no | Browser UI renderer: React slot bindings, ctx.uiRenderer, and the assembled application root |
| `@astro-one/client-ui-schedule` | no | Read-only active Schedule catalog in the Web Session header |
| `@astro-one/client-ui-session` | no | Session Controller adapter for React and session-scoped slots |
| `@astro-one/client-ui-settings` | no | Settings domain base plugin: shared configuration forms and the canonical settings slot-type contract |
| `@astro-one/client-ui-settings-account` | yes | Manage DeepSeek login and open Platform billing pages |
| `@astro-one/client-ui-settings-agent-loop` | no | Settings page of the agent loop on the astro-one web client's Plugins page: the parallel tool-call cap of the agent-loop namespace |
| `@astro-one/client-ui-settings-general` | no | Settings ownerless-copy and product onboarding plugin: the General section, shell trigger/header chrome content, settings dictionaries, and the versioned welcome notice |
| `@astro-one/client-ui-settings-models` | yes | Models settings and shared product-onboarding dialogs over existing settings and credential joins |
| `@astro-one/client-ui-settings-plugin-inventory` | no | Read-only Cordis Loader inventory tab in Web Plugins settings |
| `@astro-one/client-ui-settings-plugins` | no | Built-in plugins settings section for the astro-one web client: the Settings navigation entry and the tab chrome feature-owned tabs register into |
| `@astro-one/client-ui-settings-shell` | no | Settings page of the shell executor on the astro-one web client's Plugins page: the command timeout and the per-stream output cap of the shell namespace |
| `@astro-one/client-ui-settings-subagent` | no | Settings page of Subagent delegation on the astro-one web client's Plugins page: recursion depth, parallel capacity, and the models agents may choose for subagents |
| `@astro-one/client-ui-settings-web-search` | no | Settings page of the DeepSeek web-search provider on the astro-one web client's Plugins page: its API key, endpoint, and per-request search budget |
| `@astro-one/client-ui-sidebar` | no | Sidebar plugin: session multi-level tree, search, grouping, state dots |
| `@astro-one/client-ui-sidebar-browser` | no | Sandboxed Web browser tabs for the right Sidebar |
| `@astro-one/client-ui-sidebar-documentpreview` | yes | Extensible Sidebar previews for Office documents, spreadsheets, Markdown, code, images, PDF, HTML, and plain text |
| `@astro-one/client-ui-sidebar-files` | no | Workspace file tree tab type for the right Sidebar: lazy directory listing over the workspaceFiles Remote namespace, opening files into the Sidebar |
| `@astro-one/client-ui-sidebar-right` | no | Right Sidebar: the docking surface's session-bound state, its panel and header expand control, and the navigation service over it |
| `@astro-one/client-ui-sidebar-terminal` | no | Interactive shell tabs for the right Sidebar |
| `@astro-one/client-ui-skill` | no | Web skill references and the dedicated skill tool row |
| `@astro-one/client-ui-subagent` | no | Subagent conversation catalog, continuation routing UI, and '@' reference source |
| `@astro-one/client-ui-theme` | yes | Theme plugin: Host bootstrap for the pre-plugin palette; DOM-free ThemeRuntime for light/dark/system state; --dsw-* token styles and Appearance settings row |
| `@astro-one/client-ui-tool` | no | Client Tool call-tree renderer and keyed per-tool presentation slot |
| `@astro-one/client-ui-trajectory` | no | Trajectory event ledger with an interactive timing overview: pure-consumer plugin registering into the conversation ViewMap (no service) |
| `@astro-one/client-ui-user-questions` | no | Web ask_user_question composer takeover and plan-review presentation UI |
| `@astro-one/client-ui-workflow-run` | no | Durable workflow-run Conversation Node and nested member disclosure for astro-one web |
| `@astro-one/client-ui-workspace` | no | Workspace picker plugin: one WorkspacePicker registered into the sidebar and empty-state workspace slots |

## compaction

| Package | Config | Description |
|---|---|---|
| `@astro-one/command-compact` | no | Human-facing slash command for explicit session compaction |
| `@astro-one/compaction-basic` | yes | Token-meter-driven compaction policy and LLM summarization backend for the Astro One |
| `@astro-one/compaction-image-offload` | no | Durable image offload for image-capable routes: replace over-budget request images with placeholders and retry |
| `@astro-one/compaction-tool-result-pruner` | yes | Replay-safe model-free head/middle/tail pruning for tool-result surface nodes |

## computer-use

| Package | Config | Description |
|---|---|---|
| `@astro-one/computer-use` | no | Exclusive named computer-use provider registration |

## context

| Package | Config | Description |
|---|---|---|
| `@astro-one/agent-instructions` | yes | Workspace context loader for AGENTS.md/CLAUDE.md instruction files |
| `@astro-one/file-reference-local` | yes | Local-filesystem ctx.fileReferences provider with bounded fuzzy indexes |
| `@astro-one/session-reference` | yes | Cross-session snapshot references and durable untrusted model context (ctx.sessionReferenceResolver) |
| `@astro-one/time-context` | yes | Opt-in durable per-step context with the current time and elapsed time |
| `@astro-one/tmux-context` | yes | Opt-in durable per-step context with this agent's tmux pane and window location |

## core

| Package | Config | Description |
|---|---|---|
| `@astro-one/agent` | no | Agent interface, registry, initiator scope, and event vocabulary for the Astro One |
| `@astro-one/agent-default-model` | yes | Default model selection shared by Agent entry points |
| `@astro-one/agent-loop` | yes | The concrete agent loop plugin for the Astro One |
| `@astro-one/agent-tool-presentation` | yes | Agent-plane presentation selector: composes one agent's tools as PTC mode, native, or both |
| `@astro-one/session` | no | Event-sourced session store for the Astro One |
| `@astro-one/system-prompt` | yes | System prompt assembly registry for the Astro One |
| `@astro-one/tools` | yes | Tool registry and execution pipeline for the Astro One |

## credentials

| Package | Config | Description |
|---|---|---|
| `@astro-one/authorization` | no | Authorization seam (ctx.authorization): plugin-owned flows that obtain a credential through a conversation with the human |
| `@astro-one/credentials-local` | yes | File-backed credentials provider ($ASTRO_ONE_HOME/.env under the live process environment) for the Astro One |
| `@astro-one/deepseek-account-platform` | yes | Authorize DeepSeek accounts through browser PKCE |

## deliverables

| Package | Config | Description |
|---|---|---|
| `@astro-one/tool-present` | yes | Explicit workspace file delivery declarations for the Astro One |
| `@astro-one/workspace-changes` | yes | Per-turn workspace file changes recorded from git working-tree snapshots and whole-file captures, with per-file comparisons, for the Astro One |

## document

| Package | Config | Description |
|---|---|---|
| `@astro-one/office-to-pdf` | yes | Shared Office-to-PDF conversion with bounded queues and caching |

## experimental

| Package | Config | Description |
|---|---|---|
| `@astro-one/experimental-agent-team` | yes | Implicit-root Agent Teams roster, durable peer mailbox, and shared task DAG |
| `@astro-one/experimental-api-speech-to-text` | yes | Authenticated experimental speech transcription for browser clients |
| `@astro-one/experimental-auto-review` | no | Per-tool LLM authorization review for the Astro One Auto permission preset |
| `@astro-one/experimental-browser-use-chrome-devtools-mcp` | yes | Experimental per-Session Chromium browser tools through chrome-devtools-mcp |
| `@astro-one/experimental-browser-use-playwright-mcp` | yes | Experimental per-Session Chromium browser tools through @playwright/mcp |
| `@astro-one/experimental-browser-use-stagehand-native` | yes | Experimental Stagehand browser tools with separately configured native models |
| `@astro-one/experimental-client-ui-agent-team` | no | Web Agent Teams roster, task board, and teammate navigation |
| `@astro-one/experimental-client-ui-voice-input` | no | Record speech and insert editable text into the conversation draft |
| `@astro-one/experimental-computer-use-cua-driver-mcp` | yes | Experimental computer use through an installed Cua Driver MCP executable |
| `@astro-one/experimental-computer-use-cua-driver-native` | no | Experimental computer-use provider embedding the Cua Driver native npm SDK |
| `@astro-one/experimental-inspector` | yes | Experimental cross-realm CDP hub for Host debugging and Client Runtime inspection |
| `@astro-one/experimental-ptc-runtime-python` | yes | CPython subprocess implementation of the Astro One PTC execution seam |
| `@astro-one/experimental-speech-to-text` | yes | Experimental speech recognition with independently selectable providers |
| `@astro-one/experimental-speech-to-text-sensevoice` | yes | Local SenseVoice ONNX transcription with a managed sherpa-onnx process |
| `@astro-one/experimental-tool-agent-team` | yes | Scoped model-facing Agent Teams tools over ctx.agentTeams |

## extensions

| Package | Config | Description |
|---|---|---|
| `@astro-one/client-ui-cordis` | no | Cordis dynamic-plugin definition card: the keyed cordis_define tool row with its run/stop switch |
| `@astro-one/cordis-client-runner` | no | Browser half of dynamic dual-half plugin packages: event subscription, closure evaluation, guard facade, and loader entries |
| `@astro-one/cordis-host-runner` | yes | Dynamic package definition registry, host-half sandbox lifecycle, and invoke handler table for model-mounted dual-half packages |
| `@astro-one/tool-cordis` | no | Read-only runtime API inspection for Harness plugin development |

## feedback

| Package | Config | Description |
|---|---|---|
| `@astro-one/command-feedback` | no | Log-only session feedback: the record event, the sessionFeedback Host Remote, and the human-facing slash command |
| `@astro-one/message-feedback` | yes | Canonical Session-log ratings and notes for finalized assistant messages |

## fs

| Package | Config | Description |
|---|---|---|
| `@astro-one/fs-local` | yes | Local-filesystem implementation of the Astro One filesystem seam (ctx.fs) |
| `@astro-one/fs-observation-policy` | no | File-context policy plugin for the Astro One — observed-state, read-before-edit, and version-guarded write/edit added over the ctx.fs provider seam through the fs/* event gate (no service API) |
| `@astro-one/fs-sandbox` | yes | Sandbox-enforcing implementation of the Astro One filesystem seam: fences write/edit by the per-call sandbox mode (read-only denies mutation, workspace-write contains it to the workspace + temp roots) while reads pass through |
| `@astro-one/tool-fs` | yes | Model-facing filesystem tools (read, write, edit) over the Astro One filesystem seam (ctx.fs) |
| `@astro-one/tool-fs-search` | yes | Model-facing filesystem discovery tools (glob, grep) backed by the packaged ripgrep binary (@vscode/ripgrep) |
| `@astro-one/tool-str-replace-editor` | yes | Model-facing view, create, literal replace, and line insert tool over the Harness filesystem service |

## goal

| Package | Config | Description |
|---|---|---|
| `@astro-one/command-goal` | no | Human-facing slash command for persisted same-session goals |
| `@astro-one/goal` | yes | Event-sourced same-session goal state and lifecycle service for the Astro One |
| `@astro-one/goal-round-driver` | no | Race-fenced same-session goal-round driver |
| `@astro-one/tool-goal` | yes | Model-facing same-session goal tools with execution-time authority checks |

## guard

| Package | Config | Description |
|---|---|---|
| `@astro-one/repeat-tool-reminder` | yes | Repeat-tool-call guard plugin: advisory reminders when an agent loops on identical tool calls |
| `@astro-one/tool-call-timeout-policy` | no | Tool-call timeout policy: a tools/execute wrapper that arms a per-tool deadline on exec.signal and returns TOOL_TIMEOUT when it wins |

## hooks

| Package | Config | Description |
|---|---|---|
| `@astro-one/hooks-claude-code` | yes | Bridge plugin: run a Claude Code hooks.json / settings hook config on the Astro One interception seams |
| `@astro-one/hooks-codex` | yes | Bridge plugin: run a Codex hooks.json hook config on the Astro One interception seams |

## host

| Package | Config | Description |
|---|---|---|
| `@astro-one/host-directory-picker-auto` | no | Adaptive chooser of the directory-picker seam: resolves the host situation at boot and mounts the native or browse backend for the Astro One web GUI host |
| `@astro-one/host-directory-picker-browse` | yes | In-app browsing backend of the directory-picker seam (listing/creation primitives over the host filesystem) |
| `@astro-one/host-directory-picker-native` | no | Native-OS-chooser backend of the directory-picker seam for the Astro One web GUI host |
| `@astro-one/host-frontend-static` | yes | SPA dist server for the Web shell: owns the webserver fallback seat, serving explicit index entries and static assets with traversal rejection and 404 misses |
| `@astro-one/host-open-in-app` | yes | Host half of open-in-app: resolved application catalog, icons, and the launch endpoint as three webServer routes |
| `@astro-one/host-plugin-inventory` | no | Read-only Remote projection of current Cordis Loader plugin state |
| `@astro-one/host-product-telemetry-otel` | yes | Explicit product usage events exported through OpenTelemetry HTTP logs |
| `@astro-one/host-webserver` | yes | Web route-registration plugin: HTTP and upgrade routes, index transform taps, and static dist fallback; knows no harness concepts |

## interaction

| Package | Config | Description |
|---|---|---|
| `@astro-one/commands` | no | Plugin-owned human command registry for Astro One UIs |
| `@astro-one/permission-presets` | yes | User-facing permission presets (ctx.permissionPresets) for the Astro One: one product-level Permissions select bundling the sandbox-mode and approval-policy knobs, written through to their own session events |
| `@astro-one/tool-ask-user` | no | Model-facing ask_user_question tool over the ctx.userQuestions seam |
| `@astro-one/user-approval` | yes | User-approval seam (ctx.approval) for the Astro One: one-shot permission decisions dispatched to composed answerers over the approval/request waterfall, fail-closed by default |
| `@astro-one/user-questions` | no | Abstract user-questions seam (ctx.userQuestions) for asking the human during agent runs |

## jobs

| Package | Config | Description |
|---|---|---|
| `@astro-one/jobs-local` | yes | Process-local implementation of the Astro One background job registry seam |
| `@astro-one/tool-jobs` | yes | Model-facing background job control tools (job_output, job_list, job_kill) over the ctx.jobs registry |

## llm

| Package | Config | Description |
|---|---|---|
| `@astro-one/deepseek-llm-api-extensions` | no | Additive request-field registry for the official DeepSeek LLM API adapter |
| `@astro-one/llm` | no | Provider-neutral LLM service interface for the Astro One |
| `@astro-one/llm-deepseek` | yes | DeepSeek Messages adapter |
| `@astro-one/llm-pi-ai` | yes | pi-ai-backed DeepSeek adapter for the Astro One LLM seam (design-verification twin of astro-one-llm-deepseek) |
| `@astro-one/llm-retry` | yes | Provider-routed LLM request retry policy for the Astro One |
| `@astro-one/plugin-package-inventory-deepseek` | yes | Active Loader-backed plugin package inventory for official DeepSeek LLM API requests |
| `@astro-one/token-meter` | yes | Replay-aware token measurement service (ctx.tokenMeter) for the Astro One |

## lsp

| Package | Config | Description |
|---|---|---|
| `@astro-one/lsp` | no | Abstract LSP capability seam (ctx.lsp) for the Astro One — language-server provider registry keyed by branded id and extension mapping, order-independent per-query selection, normalized definition/references/implementation/hover requests and results, and the LspError taxonomy |
| `@astro-one/lsp-stdio` | yes | Generic stdio language-server provider for the Astro One LSP capability seam (ctx.lsp) — spawns configured servers, translates JSON-RPC, and serves transient-open goToDefinition/findReferences/goToImplementation/hover queries in the host filesystem namespace |
| `@astro-one/tool-lsp` | yes | Model-facing lsp tool over the Astro One LSP capability seam (ctx.lsp) — one read-only tool with goToDefinition/findReferences/goToImplementation/hover operations, one-based UTF-16 cursor coordinates, bounded location rendering, and hover normalization |

## mcp

| Package | Config | Description |
|---|---|---|
| `@astro-one/mcp-client` | yes | MCP client bridge: connects to MCP servers and registers their tools on ctx.tools |
| `@astro-one/mcp-resources` | no | Scoped MCP resource discovery and reading through shared model tools |

## plan

| Package | Config | Description |
|---|---|---|
| `@astro-one/plan-mode` | yes | Logged per-agent plan mode with deployment guidance, a direct slash command, and a user-reviewed exit |

## preset

| Package | Config | Description |
|---|---|---|
| `@astro-one/agent-preset` | yes | Declare an Agent capability composition in Cordis YAML |
| `@astro-one/agent-preset-registry` | yes | Declarative Agent preset registry and profile-backed editing |
| `@astro-one/persona` | yes | Composition-authored deployment persona section for the Astro One |

## ptc-runtime

| Package | Config | Description |
|---|---|---|
| `@astro-one/ptc-runtime-node` | yes | Sandboxed Node process implementation of the Astro One PTC execution capability |

## runtime-diagnostics

| Package | Config | Description |
|---|---|---|
| `@astro-one/invariants` | yes | Registry service for package-owned Astro One runtime invariants |

## sandbox

| Package | Config | Description |
|---|---|---|
| `@astro-one/sandbox-local` | yes | Local process-sandbox backends for the Astro One sandbox seam: bwrap, the npm-distributed landlock-run launcher, macOS Seatbelt, or the Windows ACL restricted-token runner — functionally probed, fail-closed |
| `@astro-one/sandbox-policy` | yes | Per-call sandbox policy resolver and current model context: deployment fallbacks plus each session's mode and workspace root, shared by every enforcing capability family |

## schedule

| Package | Config | Description |
|---|---|---|
| `@astro-one/schedule` | no | Agent-scoped durable after, at, and fixed-rate reminders over the session event log |

## sdk

| Package | Config | Description |
|---|---|---|
| `@astro-one/sdk-jsonrpc-server` | yes | Stdio JSON-RPC server plugin for out-of-process Astro One SDK clients |

## session

| Package | Config | Description |
|---|---|---|
| `@astro-one/session-checkpoint-policy` | no | Semantic session durability checkpoints before model requests and tool side effects |
| `@astro-one/session-log-deepseek` | yes | Incremental lossless session-log request extension for the official DeepSeek LLM API |
| `@astro-one/session-persistence-jsonl` | yes | JSONL durable session persistence backend for the Astro One |
| `@astro-one/session-projection` | no | Session-projection seam: the merge-extensible projection type table, the provider contract, and the ctx.sessionProjections registry serving whole current values of log-derived per-session state |
| `@astro-one/session-projection-cache` | yes | Persisted projection cache (ctx.sessionProjectionCache): durable per-session checkpoint records on the session_projcache storage domain (per-record layout), throttled write-behind, and the cached listing read |
| `@astro-one/session-stats` | no | Whole-log conversation counts and wall times projection (sessionStats) for the Astro One |
| `@astro-one/session-telemetry-otel` | yes | OpenTelemetry backend for the Astro One telemetry seam: hands captured session records to the OTel JS SDK's log pipeline |
| `@astro-one/session-title` | yes | Log-backed session title service and provider registry for the Astro One |
| `@astro-one/session-title-all-prompts-llm` | yes | All-user-messages LLM provider plugin for Astro One session titles |
| `@astro-one/session-title-first-prompt-llm` | yes | First-message LLM provider plugin for Astro One session titles |
| `@astro-one/session-turn-outline` | no | Whole-log turn outline projection (turnOutline) for the Astro One |

## session-query

| Package | Config | Description |
|---|---|---|
| `@astro-one/session-log-export` | yes | Web Session-log export command and shared download dialog |
| `@astro-one/session-query-sqlite` | yes | Concrete ctx.sessionQuery backend with SQLite FTS5 search |
| `@astro-one/tool-session-query` | yes | Workspace-authorized model-facing session history search, trace, and event read tools |

## settings

| Package | Config | Description |
|---|---|---|
| `@astro-one/settings` | no | Abstract user-settings seam (ctx.settings) for the Astro One |

## shell

| Package | Config | Description |
|---|---|---|
| `@astro-one/bash-local` | yes | Local-subprocess implementation of the Astro One bash executor seam |
| `@astro-one/bash-sandbox` | yes | Sandbox-consuming implementation of the Astro One bash executor seam (confines every command via ctx.sandbox, reports denial/enforcement result facts) |
| `@astro-one/pwsh-local` | yes | Local PowerShell implementation of the Astro One bash executor seam |
| `@astro-one/pwsh-sandbox` | yes | Sandbox-consuming implementation of the Astro One PowerShell executor seam (confines every command via ctx.sandbox, reports denial/enforcement result facts) |
| `@astro-one/shell-env` | yes | Tool-independent managed ASTRO_ONE_* shell environment registry |
| `@astro-one/tool-bash` | yes | Model-facing bash tool with optional generic background-job and sandbox-escalation support |
| `@astro-one/tool-bash-persistent` | yes | Model-facing owner-scoped persistent Bash tool backed by the Harness PTY service |
| `@astro-one/tool-pwsh` | yes | Model-facing pwsh tool over the bash executor seam |
| `@astro-one/tool-pwsh-persistent` | yes | Model-facing owner-scoped persistent PowerShell tool backed by the Harness PTY service |

## skill

| Package | Config | Description |
|---|---|---|
| `@astro-one/skill` | yes | Agent skill provider registry for the Astro One |
| `@astro-one/skill-badge` | no | Bundled astro-one badge skill provider for Astro One |
| `@astro-one/skill-filesystem` | yes | Local filesystem skill provider for the Astro One |
| `@astro-one/skill-office` | yes | Bundled Word, PowerPoint, and Excel workflows and structural checks |
| `@astro-one/tool-skill` | yes | Model-facing skill loading tool for the Astro One |
| `@astro-one/tool-workspace-dependencies` | yes | The load_workspace_dependencies tool: absolute paths into a bundled Python, Node.js, and pnpm payload |

## spill

| Package | Config | Description |
|---|---|---|
| `@astro-one/spill-local` | yes | Local-filesystem implementation of the Astro One spill storage seam (private session-scoped files) |
| `@astro-one/spill-policy` | yes | Token-budgeted tool-result retention with recoverable text and image paths |

## ssh

| Package | Config | Description |
|---|---|---|
| `@astro-one/fs-ssh` | no | Filesystem provider over the shared POSIX SSH helper |
| `@astro-one/sandbox-ssh` | no | Remote POSIX sandbox argv provider over the shared SSH helper |
| `@astro-one/ssh` | yes | Shared OpenSSH connection and versioned POSIX remote helper |
| `@astro-one/subprocess-ssh` | no | Subprocess and terminal provider over the shared POSIX SSH helper |

## storage

| Package | Config | Description |
|---|---|---|
| `@astro-one/storage` | no | Storage hub (ctx.storage): named backend registry plus mounted data-form facilities for the Astro One |
| `@astro-one/storage-domain` | yes | Domain data form (ctx.storage.domain): schema-validated, event-emitting KV domains over storage backends for the Astro One |
| `@astro-one/storage-json` | yes | JSON file KV storage backend for the Astro One storage hub |
| `@astro-one/storage-sqlite` | yes | SQLite storage backend (kv facet) for the Astro One storage hub |

## subagent

| Package | Config | Description |
|---|---|---|
| `@astro-one/subagent` | yes | Abstract subagent seam (ctx.subagents): named-provider registry for delegating to child agents |
| `@astro-one/subagent-acp` | yes | Out-of-process ACP subagent backend: drives a child agent in a spawned subprocess over the Agent Client Protocol |
| `@astro-one/subagent-astro-one-sdk` | yes | Out-of-process SDK subagent backend: drives a child Astro One runtime subprocess over stdio JSON-RPC through the TypeScript SDK client |
| `@astro-one/subagent-claude-code` | yes | One-shot Claude Code subagent provider over the official Agent SDK |
| `@astro-one/subagent-codex` | yes | One-shot Codex subagent provider over the official app-server protocol |
| `@astro-one/subagent-fork-in-process` | yes | In-process fork subagent backend: runs a child agent seeded with a prefix of the parent's log |
| `@astro-one/subagent-spawn-in-process` | yes | In-process spawn subagent backend: runs a fresh child agent on ctx.agents |
| `@astro-one/tool-subagent` | yes | Model-facing subagent delegation tool over the ctx.subagents seam |
| `@astro-one/tool-subagent-control` | no | Globally named send_message, interrupt_agent, and list_agents tools over ctx.subagents continuations |

## subprocess

| Package | Config | Description |
|---|---|---|
| `@astro-one/subprocess-local` | no | Local-subprocess implementation of the Astro One subprocess seam |

## terminal

| Package | Config | Description |
|---|---|---|
| `@astro-one/terminal` | no | Persistent PTY session seam for the Astro One — owner-scoped ids, backend registry, interactive sends, reads, signals, and awaited cleanup |
| `@astro-one/terminal-bash` | yes | Persistent shell PTY backend over the Astro One subprocess terminal primitive |
| `@astro-one/tool-terminal` | yes | Six model-facing persistent PTY tools with owner isolation and generic background-job integration |

## test-support

| Package | Config | Description |
|---|---|---|
| `@astro-one/llm-replay` | yes | Replay LLM plugin: short-circuits llm/stream with model chunks reconstructed from a recorded session JSONL (keyless snapshot tests) |

## todo

| Package | Config | Description |
|---|---|---|
| `@astro-one/tool-todo` | yes | Model-facing todo_write tool over the Astro One event-sourced session log |

## typert

| Package | Config | Description |
|---|---|---|
| `@astro-one/typert-loader` | yes | Loader integration for generated Typert package contributions |

## web

| Package | Config | Description |
|---|---|---|
| `@astro-one/tool-web` | yes | Model-facing web tools (web_search, web_fetch) over the Astro One web capability seam (ctx.web) |
| `@astro-one/web` | yes | Abstract web access capability seam (ctx.web) for the Astro One — search/fetch provider registry, registration-order-independent selection, request/result vocabulary, and the WebError taxonomy |
| `@astro-one/web-fetch-http` | yes | Anonymous public HTTP(S) fetch provider for the Astro One web capability seam (ctx.web) |
| `@astro-one/web-search-deepseek` | yes | DeepSeek-backed search provider (native web_search via the Anthropic-compatible API) for the Astro One web capability seam (ctx.web) |
| `@astro-one/web-search-exa` | yes | Exa-backed search provider for the Astro One web capability seam (ctx.web) |
| `@astro-one/web-search-perplexity` | yes | Perplexity-backed search provider for the Astro One web capability seam (ctx.web) |

## webhook

| Package | Config | Description |
|---|---|---|
| `@astro-one/webhook` | no | Fire-and-forget webhook rule runtime that creates Workspace-backed Astro One Sessions |
| `@astro-one/webhook-github` | yes | Signed GitHub HTTP webhook adapter for the Astro One webhook runtime |

## workflow

| Package | Config | Description |
|---|---|---|
| `@astro-one/tool-ralph` | yes | Model-facing fresh-agent Ralph loop over the workflow and subagent seams |
| `@astro-one/tool-workflow` | yes | Model-facing workflow tool: run a JavaScript orchestration script over ctx.workflowEngine |
| `@astro-one/workflow-ptc` | yes | Workflow orchestration in the shared sandboxed Node PTC runtime |

## workspace

| Package | Config | Description |
|---|---|---|
| `@astro-one/workspace` | no | Workspace entity registry (ctx.workspaceRegistry): durable workspace records with validated session attachment over the domain data form for the Astro One |
