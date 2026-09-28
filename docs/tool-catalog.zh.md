<!-- 英文源文件由 scripts/gen-tool-catalog.ts 生成；本中文文件是通过双语配对维护的经评审对侧。
     更新时先运行 `pnpm run gen-tool-catalog` 更新英文，再更新本文件并运行 `pnpm run verify-translation-pairing --write docs/tool-catalog.md` 重新记录配对。 -->

# 工具 Schema 目录

[English](tool-catalog.md) | 中文

已发布插件向 `ctx.tools` 提供的所有面向模型的工具：模型通过系统提示词组装获得的 `name`、`description` 和 JSON Schema `parameters`。本目录是[子系统页面](subsystems/core.zh.md)（类型及每页生成的 `cordis-surface` 接线区域）的补充；本页列出的是向 agent（智能体）提供的*工具*。

英文源文件由系统**生成**，并通过 `pnpm run verify-tool-catalog`（`doc-sync`（文档同步门禁）的一部分）验证新鲜度；本中文文件作为经评审对侧通过双语配对维护。与 Cordis 目录（纯源码 AST 处理）不同，英文生成器会在真实上下文中**启动**每个工具插件并读取 `ctx.tools.schemas()`，因为工具 schema 无法通过静态分析完全确定，例如运行时展开的枚举、拼接的描述、由配置决定的名称以及使用原始 JSON Schema 的 MCP 工具。完整性守卫会 glob 匹配 `packages/*/tool-*`；如果生成器的启动 manifest（元数据清单）遗漏任何包，检查就会失败，因此新工具不会在无人察觉的情况下缺少文档。

范围：`packages/*/tool-*` 下已发布的产品工具，每个工具均使用其**默认**配置启动；但如果某个 Config 字段是**必填项**且没有默认值，生成器就必须作出选择，对应包的说明会记录本页展示的是哪个分支。注册的工具**名称**可以是加载时配置，例如 `tool-subagent` 的 `toolName`，因此部署可能以不同名称或额外名称提供某个包；如果存在随产品发布的别名，对应包的说明会予以记录。`examples/` 中的演示工具（例如 `echo`）不在范围内，这与 Cordis 目录仅涵盖包的范围一致。

<a id="tool-package-map"></a>

## 工具包映射

下表将模型可见的工具名称与其背后的插件包和服务 seam 对应起来。各包章节随后给出确切的 JSON Schema。

| 工具包 | 模型可见名称 | 依赖 | 写入／影响 | 随产品发布的别名 | 部署说明 |
| --- | --- | --- | --- | --- | --- |
| `@astro-one/plugin-manager` | `plugin_manager` | `ctx.tools`, `ctx.pluginManager`, `ctx.sandboxPolicy` | `tool/call`, `tool/result`, `user/message` | - | - |
| `@astro-one/mcp-resources` | `list_mcp_resource_templates`, `list_mcp_resources`, `read_mcp_resource` | `ctx.tools`, `ctx.mcpResources` | `tool/call`, `tool/result` | - | - |
| `@astro-one/experimental-browser-use-stagehand-native` | `stagehand_act`、`stagehand_extract`、`stagehand_navigate`、`stagehand_observe`、`stagehand_screenshot`、`stagehand_tabs` | `ctx.browserUse`、`ctx.agents`、`ctx.tools`、`ctx.systemPrompt` | `tool/call`、`tool/result` | - | - |
| `@astro-one/tool-ask-user` | `ask_user_question` | `ctx.tools`、`ctx.userQuestions` | `tool/call`、`tool/result after a UI/provider answers the question` | - | ask_user_question 会暂停工具调用，直到当前 UI 提供方返回人类答案。 |
| `@astro-one/tools` | `run_code` | `ctx.tools`、`ctx.ptcRuntime (execution time)`、`ctx.systemPrompt` | `tool/call`、`one tool/ptc-dispatch-start + tool/ptc-dispatch pair per bridged sub-call`、`tool/result` | - | 在 `mode: ptc`／`mode: both` 下，它由工具注册表所有，作为可过滤能力层之外的保留传输机制（参见 PTC mode Agent Note）。在 `ptc` 下，它是注册表对协议格式（wire format）的唯一贡献；其他可见能力在使用已加载运行时语言生成的 SDK 章节中声明。程序通过 binding 调用这些能力，调用按照原生并发约定调度：启动顺序和策略遵循提交顺序，并发安全的函数体最多重叠执行 `maxParallelSubCalls` 个。调用会重新进入完整且受守卫保护的工具流水线，并将每个嵌套执行关联到此外层结果。 |
| `@astro-one/plan-mode` | `exit_plan_mode` | `ctx.tools`、`ctx.systemPrompt`、`ctx.userQuestions (execution time, opportunistic)` | `tool/call`、`plan/mode inactive on an approved review`、`tool/result` | - | 规划未激活时，exit_plan_mode 仍保留在面向模型的 schema 中，这样状态转换不会在规划策略变更之外额外造成工具目录变动。其执行路径会拒绝规划模式之外的调用；在规划模式下，它通过用户交互 seam 提交计划（批准／根据反馈继续规划），批准后会在步骤边界记录规划模式已停用。 |
| `@astro-one/tool-bash` | `bash` | `ctx.tools`、`ctx.shell`、`ctx.systemPrompt`、`ctx.shellEnv`、`ctx.jobs for run_in_background and the job-backed foreground path` | `tool/call`、`tool/result` | - | bash 工具是 bash 执行器 seam 面向模型的消费方。组合中有 job 注册表时，每次调用一启动就注册到通用 `ctx.jobs` 运行时，并通过 `job_*` 工具（来自 `@astro-one/tool-jobs`）收集／停止；没有注册表或 `enableRunInBackground: false` 时，工具注册不带 `run_in_background` 参数的纯前台 schema。 |
| `@astro-one/tool-present` | `present` | `ctx.tools`, `ctx.fs`, `ctx.sessionProjections` | `tool/call`, `deliverables/presented 在成功的最终结果之后`, `tool/result` | - | 交付归调用方 Session 所有；Web ui-deliverables 提供源文件打开与卡片。 |
| `@astro-one/tool-pwsh` | `pwsh` | `ctx.tools`、`ctx.shell`、`ctx.systemPrompt`、`ctx.shellEnv`、`ctx.jobs for run_in_background and the job-backed foreground path` | `tool/call`、`tool/result` | - | pwsh 工具是 Windows 组合中 bash 执行器 seam 的 PowerShell 方言消费方（由 `@astro-one/pwsh-local` 等 PowerShell 执行器为 `ctx.shell` 提供后端）；除沙箱接口外，它逐项对应 bash 工具调用。使用 `run_in_background` 的运行会注册到通用 `ctx.jobs` 运行时，并通过 `job_*` 工具收集／停止；托管的 `ASTRO_ONE_*` 环境来自 `@astro-one/shell-env`。每次调用都在新进程中运行，不使用持久 PTY 会话。路径采用原生 `C:\...` 形式，变量采用 `$env:NAME`。 |
| `@astro-one/tool-cordis` | `cordis_inspect_list`, `cordis_inspect_query` | `ctx.tools`, `ctx.cordisInspect` | `tool/call`, `tool/result` | - | 创造模式提供两个只读运行时检查工具。Cordis host runner 提供检查注册表；Client 查询需要已连接页面。持久化变更编写为组合包，再通过 plugin_manager 安装。 |
| `@astro-one/tool-bash-persistent` | `bash` | `ctx.tools`、`ctx.terminals`、`an owning Agent at execution time` | `tool/call`、`PTY shell state`、`tool/result` | - | 一个按所有者隔离的持久 bash 工具；部署组合提供 PTY 后端，并可覆盖面向模型的环境描述。 |
| `@astro-one/tool-pwsh-persistent` | `pwsh` | `ctx.tools`、`ctx.terminals`、`an owning Agent at execution time` | `tool/call`、`PTY shell state`、`tool/result` | - | 一个按所有者隔离的持久 pwsh 工具，持久 bash 工具的 Windows 对应物；部署组合提供 pwsh 方言的 PTY 后端，并可覆盖面向模型的环境描述。 |
| `@astro-one/tool-str-replace-editor` | `str_replace_editor` | `ctx.tools`、`ctx.fs` | `tool/call`、`fs/observed after view presence/absence, edit absence, or successful mutation`、`tool/result` | - | 基于文件系统 seam 的独立查看／创建／唯一字面量替换／按行插入工具；可与任何 shell 或终端接口组合。 |
| `@astro-one/tool-fs` | `edit`、`read`、`read_image`、`write` | `ctx.tools`、`ctx.fs`、`ctx.systemPrompt`、`ctx.attachments (image-tool registration)`、`ctx.llm + an image-capable route (image-tool execution)` | `tool/call`、`fs/write-intent or fs/edit-intent for mutations`、`fs/observed after read presence/absence or successful file operation`、`durable attachment (read_image)`、`tool/result` | - | 先读后写／编辑策略由 `@astro-one/fs-observation-policy` 添加；它是一个 `fs/*` 事件门禁插件，不会改变 schema。加载这些工具的部署按预期也应加载该插件。没有 `ctx.attachments` 时图片工具不会注册；其 schema 与路由无关，执行时除非确切路由的模型声明图片输入，否则拒绝。 |
| `@astro-one/tool-fs-search` | `glob`、`grep` | `ctx.tools`、`ctx.subprocess`、`ctx.systemPrompt` | `tool/call`、`tool/result` | - | glob 和 grep 是无条件可用的发现工具，通过 ctx.subprocess spawn 随包提供的 ripgrep 二进制文件（`@vscode/ripgrep`），并作为普通前台调用运行，绝不作为后台任务；无需在宿主机安装 `rg`，也不经过 shell 层。本目录使用 `sampleOverCapGlobResults: true`；部署必须显式选择该行为。结果超过上限时，会通过可选的 ctx.spillStore 后端保存完整的格式化列表；在共置部署中，如果后端公开本地路径，返回的定位信息可供后续读取／搜索。 |
| `@astro-one/tool-terminal` | `terminal_close`、`terminal_list`、`terminal_open`、`terminal_read`、`terminal_send`、`terminal_signal` | `ctx.tools`、`ctx.terminals`、`ctx.systemPrompt`、`ctx.jobs at call time for run_in_background` | `tool/call`、`tool/result` | - | 这 6 个终端工具需要选择启用，用于补充一次性 bash／文件系统工具。`terminal_send(run_in_background: true)` 会注册到 `ctx.jobs`；schema 不包含 TUI、具名按键序列、BEL、调整尺寸、自动启动和跨 agent 共享。 |
| `@astro-one/tool-goal` | `create_goal`、`get_goal`、`update_goal` | `ctx.tools`、`ctx.agents`、`ctx.goals`、`ctx.systemPrompt`、`a calling Agent in an authorized open turn` | `tool/call`、`goal/change for mutations`、`tool/result` | - | create、edit、pause 和 resume 要求直接来自人类的根权限；complete 和 blocked 也接受确切的当前 Goal Round。blocked 的默认下限是 3 个获准的 Round。 |
| `@astro-one/schedule` | `schedule_create`、`schedule_delete`、`schedule_list` | `ctx.tools`、`ctx.sessions`、Session 持久化、未来创建的 live 根 Agent | `tool/call`、`schedule/change create or delete`、`tool/result` | - | 仅在选择启用的 Schedule 插件加载后创建的 live 根 Agent scope 内注册。版本 1 接受 after_seconds、显式绝对 at 和有界固定速率 every_seconds，并披露 session-local 交付；管理读取与变更必须通过共享的 Session 持久化 barrier。 |
| `@astro-one/tool-lsp` | `lsp` | `ctx.tools`、`ctx.lsp`、`ctx.systemPrompt` | `tool/call`、`tool/result` | - | lsp 工具将提供方选择和语言服务器子进程置于 ctx.lsp 之后，因此其模型可见 schema 在更换提供方时保持稳定。运行时要求已注册提供方，例如 `@astro-one/lsp-stdio`；如果没有提供方，查询会返回结构化 `LSP_UNAVAILABLE` 错误，而不会改变 schema。 |
| `@astro-one/tool-ralph` | `ralph` | `ctx.tools`、`ctx.workflowEngine`、`ctx.subagents`、`ctx.systemPrompt`、`a calling Agent (exec.agent parents every fresh round)` | `tool/call`、`tool/result`、`workflow and child session events during execution` | - | 固定的前台工作流会在每个 Round 启动一个全新的结构化子级；模型只能选择不可变目标和可选的 Round 上限。 |
| `@astro-one/tool-skill` | `skill` | `ctx.tools`、`ctx.agents`、`ctx.skills` | `tool/call`、`tool/result`、`user/message replacement catalogs via agent.inject()` | - | - |
| `@astro-one/tool-session-query` | `session_event_read`、`session_event_search`、`session_event_trace`、`session_search`、`session_trace` | `ctx.tools`、`ctx.systemPrompt`、`ctx.sessionQuery`、`a calling Agent for workspace authority` | `tool/call`、`tool/result` | - | 这 5 个只读工具会隐藏提供方游标，并根据不可变的调用 agent 会话为每个结果授权。该包需要选择启用；需要强制截止时间或限制行内输出的组合还会挂载通用超时或 spill 策略。 |
| `@astro-one/tool-subagent` | `list_subagent_models`、`subagent` | `ctx.tools`、`ctx.subagents`、`ctx.systemPrompt`、`用于模型发现和所选路由校验的 ctx.llm` | `tool/call`、`tool/result`、`child session events through the chosen provider` | `subagent`、`subagent_fork` | 注册的委派工具名称取决于加载时 `toolName` 配置（默认为 `subagent`）；上述默认 schema 关闭模型选择，而发现 schema 则展示为已启用 Session 中可用的固定配套工具。Web preset 会在每个新顶层 Session 创建时读取插件页偏好，并为其子 Session 保留该决定；`subagent_fork` 始终使用固定路由。每个实例通过 `modelSelectionSettings`、`backgroundMode` 与 `enableRunInBackground` 独立控制是否读取模型选择设置及其后台行为。 |
| `@astro-one/tool-subagent-control` | `interrupt_agent`、`list_agents`、`send_message` | `ctx.tools`、`ctx.subagents`、`ctx.agents and ctx.sessionProjections (list_agents only)` | `tool/call`、`tool/result`、`child session events through ctx.subagents` | - | 这些是控制可继续后台 subagent 的全局命名工具：绑定提供方的 `tool-subagent` 实例注册不同的委派工具；本包注册一次 `send_message` 和 `interrupt_agent`，另由 `list_agents` 通过单独加载的 `/list-agents` 插件提供，其目录行使用 sessionProjections 和实时 Agent 注册表。 |
| `@astro-one/tool-jobs` | `job_kill`、`job_list`、`job_output` | `ctx.tools`、`ctx.jobs`、`ctx.systemPrompt` | `tool/call`、`tool/result`、`user/message via agent.inject() for background completion notices` | - | 与任务种类无关的后台任务控制器：后台 bash 命令、PTY 发送和 subagent 都通过相同的 3 个工具读取、列出和终止。加载该插件会挂接控制器，从而启用生产方的 `ctx.jobs.start()`。 |
| `@astro-one/experimental-tool-agent-team` | `interrupt_agent`、`list_agents`、`send_message`、`spawn_teammate`、`team_task_create`、`team_task_get`、`team_task_list`、`team_task_update`、`wait_agent` | `ctx.tools`、`ctx.systemPrompt`、`ctx.agentTeams`、`an exact live Team member Agent` | `tool/call`、`team/member`、`team/message/queued`、`team/message/delivered`、`team/task`、`tool/result` | - | 这 9 个工具限定于隐式 Team Lead 与持久 teammate 作用域。随产品发布的 astro-one-base bundle 默认禁用该包；文档中的 Agent Teams profile patch 会启用它，并禁用旧 continuable child 的同名控制工具。 |
| `@astro-one/tool-astrodynamics` | `attitude_determine`、`orbit_conjunction`、`orbit_convert`、`orbit_determine`、`orbit_passes`、`orbit_propagate`、`orbit_transfer` | `ctx.tools` | `tool/call`、`tool/result` | - | 随可选的 `@astro-one/aerospace` bundle 发布，插件管理器默认将其关闭。所有 Config 上限都是必填项；本目录使用 bundle 中的值，这些上限只出现在失败消息中，不出现在 schema 中。 |
| `@astro-one/tool-gnss` | `gnss_position`、`gnss_visibility` | `ctx.tools`、`ctx.fs` | `tool/call`、`tool/result` | - | 随可选的 `@astro-one/aerospace` bundle 发布。两个工具都通过 ctx.fs 读取相对于调用会话工作区的 RINEX 3 文件。 |
| `@astro-one/tool-remote-sensing` | `rs_change_detect`、`rs_spectral_index` | `ctx.tools`、`ctx.fs` | `tool/call`、`tool/result` | - | 随可选的 `@astro-one/aerospace` bundle 发布且不带检测器，因此本页展示 rs_spectral_index 与 rs_change_detect。配置了 `detector` 的部署还会获得 rs_detect_objects，其描述会列出配置的类别名称。 |
| `@astro-one/tool-todo` | `todo_write` | `ctx.tools`、`owning Agent session` | `tool/call`、`todo/write`、`tool/result` | - | todo_write 是会话所有的状态；UI 将最新的 todo/write 事件渲染为检查清单。`allowParallelInProgress` 是没有默认值的必填项，因此本目录明确选择 `true`，对应描述允许同时存在多个 `in_progress` 项。选择 `false` 的部署会获得同一工具，但描述会要求只能有 1 个活动任务。 |
| `@astro-one/tool-workflow` | `workflow` | `ctx.tools`、`ctx.workflowEngine`、`ctx.systemPrompt`、`a calling Agent (exec.agent parents the script children)` | `tool/call`、`tool/result` | - | - |
| `@astro-one/tool-workspace-dependencies` | `load_workspace_dependencies` | `ctx.tools` | `tool/call`, `tool/result` | - | - |
| `@astro-one/tool-web` | `web_fetch`、`web_search` | `ctx.tools`、`ctx.web`、`ctx.systemPrompt` | `tool/call`、`tool/result` | - | web_search 和 web_fetch 将提供方选择置于 ctx.web 之后，使模型可见 schema 在更换后端时保持稳定。 |

<a id="astro-oneplugin-manager"></a>

## `@astro-one/plugin-manager`

### `plugin_manager`

列出当前 profile 中的插件或组合包，启用或禁用它们，安装组合包或移除已安装的组合包。每项操作都要求 danger-full-access 权限或本次调用的批准。批准不改变会话权限模式。变更影响该 profile 的所有会话。先列出条目以获取准确标识。包安装可能运行已获批准的构建脚本。支持热更新的 profile 立即应用变更；仅启动时加载的 profile 需要重启。不兼容的 Astro One peer 依赖会阻止安装和激活。版本豁免可能导致崩溃和数据丢失：授权前必须警告用户，并获得用户对精确插件版本与运行时版本组合的明确许可。

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "description": "Management operation.",
      "enum": [
        "list_plugins",
        "list_bundles",
        "set_plugin",
        "set_bundle",
        "install_bundle",
        "remove_bundle",
        "list_version_exemptions",
        "set_version_exemption"
      ]
    },
    "target": {
      "type": "string",
      "description": "Plugin entry id, bundle package name, or installation spec, according to action."
    },
    "enabled": {
      "type": "boolean",
      "description": "Required for set operations; defaults to true for installation. For set_version_exemption, true grants and false revokes."
    },
    "runtimeVersion": {
      "type": "string",
      "description": "For set_version_exemption: exact Astro One version from list_version_exemptions. Target must be the manifest package-name@version, not an alias or version range."
    },
    "acceptRisk": {
      "type": "boolean",
      "description": "For granting an exemption: true only after warning the user about possible crashes and data loss and receiving explicit permission for this exact plugin/runtime pair. General installation permission is not enough."
    },
    "approvedBuilds": {
      "type": "array",
      "description": "For install_bundle: pass names from pendingBuilds only after the user explicitly approves running their install scripts in the conversation. This grants persistent permission for this profile.",
      "items": {
        "type": "string"
      }
    },
    "registry": {
      "type": "string",
      "description": "For install_bundle: the npm registry URL asked first, when the user names one; otherwise the configured registry is asked, and its configured fallbacks while a registry is unreachable."
    },
    "offset": {
      "type": "number",
      "description": "Zero-based list offset; defaults to 0."
    },
    "limit": {
      "type": "number",
      "description": "List page size, from 1 to 100; defaults to 25."
    }
  },
  "required": [
    "action"
  ]
}
```

来源： [`packages/boot/plugin-manager/src/tools.ts`](../packages/boot/plugin-manager/src/tools.ts)

<a id="astro-onemcp-resources"></a>

## `@astro-one/mcp-resources`

### `list_mcp_resource_templates`

列出 MCP 服务器提供的参数化资源 URI 模板。

```json
{
  "type": "object",
  "properties": {
    "server": {
      "type": "string",
      "description": "Configured MCP server name."
    },
    "cursor": {
      "type": "string",
      "description": "Continuation cursor returned by this server."
    }
  },
  "required": [
    "server"
  ]
}
```

来源： [`packages/mcp/mcp-resources/src/tools.ts`](../packages/mcp/mcp-resources/src/tools.ts)

### `list_mcp_resources`

列出 MCP 服务器提供的资源。

```json
{
  "type": "object",
  "properties": {
    "server": {
      "type": "string",
      "description": "Configured MCP server name."
    },
    "cursor": {
      "type": "string",
      "description": "Continuation cursor returned by this server."
    }
  },
  "required": [
    "server"
  ]
}
```

来源： [`packages/mcp/mcp-resources/src/tools.ts`](../packages/mcp/mcp-resources/src/tools.ts)

### `read_mcp_resource`

按 URI 从指定服务器读取 MCP 资源。使用已列出的 URI 或展开后的资源模板。

```json
{
  "type": "object",
  "properties": {
    "server": {
      "type": "string",
      "description": "Configured MCP server name."
    },
    "uri": {
      "type": "string",
      "description": "Resource URI to read."
    }
  },
  "required": [
    "server",
    "uri"
  ]
}
```

来源： [`packages/mcp/mcp-resources/src/tools.ts`](../packages/mcp/mcp-resources/src/tools.ts)

<a id="astro-oneexperimental-browser-use-stagehand-native"></a>

## `@astro-one/experimental-browser-use-stagehand-native`

### `stagehand_act`

使用配置的 Stagehand 模型执行一次自然语言浏览器操作。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "pageId": {
      "type": "string",
      "minLength": 1
    },
    "instruction": {
      "type": "string",
      "minLength": 1
    }
  },
  "required": [
    "instruction"
  ],
  "additionalProperties": false
}
```

来源：[`packages/experimental/browser-use-stagehand-native/src/index.ts`](../packages/experimental/browser-use-stagehand-native/src/index.ts)

### `stagehand_extract`

使用配置的 Stagehand 模型与可选的 JSON Schema 提取页面数据。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "pageId": {
      "type": "string",
      "minLength": 1
    },
    "instruction": {
      "type": "string",
      "minLength": 1
    },
    "schema": {
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {
        "$ref": "#/$defs/__schema0"
      }
    }
  },
  "required": [
    "instruction"
  ],
  "additionalProperties": false,
  "$defs": {
    "__schema0": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "number"
        },
        {
          "type": "boolean"
        },
        {
          "type": "null"
        },
        {
          "type": "array",
          "items": {
            "$ref": "#/$defs/__schema0"
          }
        },
        {
          "type": "object",
          "propertyNames": {
            "type": "string"
          },
          "additionalProperties": {
            "$ref": "#/$defs/__schema0"
          }
        }
      ]
    }
  }
}
```

来源：[`packages/experimental/browser-use-stagehand-native/src/index.ts`](../packages/experimental/browser-use-stagehand-native/src/index.ts)

### `stagehand_navigate`

将 Stagehand 浏览器标签页导航至指定 URL。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "pageId": {
      "type": "string",
      "minLength": 1
    },
    "url": {
      "type": "string",
      "format": "uri"
    }
  },
  "required": [
    "url"
  ],
  "additionalProperties": false
}
```

来源：[`packages/experimental/browser-use-stagehand-native/src/index.ts`](../packages/experimental/browser-use-stagehand-native/src/index.ts)

### `stagehand_observe`

使用配置的 Stagehand 模型查找符合指令的浏览器操作。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "pageId": {
      "type": "string",
      "minLength": 1
    },
    "instruction": {
      "type": "string",
      "minLength": 1
    }
  },
  "required": [
    "instruction"
  ],
  "additionalProperties": false
}
```

来源：[`packages/experimental/browser-use-stagehand-native/src/index.ts`](../packages/experimental/browser-use-stagehand-native/src/index.ts)

### `stagehand_screenshot`

截取 Stagehand 标签页图像以供视觉检查。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "pageId": {
      "type": "string",
      "minLength": 1
    },
    "fullPage": {
      "default": false,
      "type": "boolean"
    }
  },
  "required": [
    "fullPage"
  ],
  "additionalProperties": false
}
```

来源：[`packages/experimental/browser-use-stagehand-native/src/index.ts`](../packages/experimental/browser-use-stagehand-native/src/index.ts)

### `stagehand_tabs`

列出、创建、选择或关闭 Stagehand 浏览器标签页。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "const": "list"
        }
      },
      "required": [
        "action"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "const": "new"
        },
        "url": {
          "type": "string",
          "format": "uri"
        }
      },
      "required": [
        "action"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "select",
            "close"
          ]
        },
        "pageId": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "action",
        "pageId"
      ],
      "additionalProperties": false
    }
  ],
  "type": "object"
}
```

来源：[`packages/experimental/browser-use-stagehand-native/src/index.ts`](../packages/experimental/browser-use-stagehand-native/src/index.ts)

<a id="astro-onetool-ask-user"></a>

## `@astro-one/tool-ask-user`

### `ask_user_question`

继续操作前，如果需要确认、选择或缺失的信息，请向用户提出简明问题。发送一个或多个问题，每个问题都带一个稳定 id，该 id 会在答案中原样返回。

```json
{
  "type": "object",
  "properties": {
    "questions": {
      "type": "array",
      "description": "Questions to ask the user before continuing.",
      "items": {
        "type": "object",
        "additionalProperties": true,
        "properties": {
          "id": {
            "type": "string",
            "description": "Stable id for this question; echoed in the answer."
          },
          "question": {
            "type": "string",
            "description": "The specific question to ask the user."
          },
          "header": {
            "type": "string",
            "description": "Optional short heading for the question, such as \"Confirm\" or \"Choose Mode\"."
          },
          "options": {
            "type": "array",
            "description": "Optional choices to show the user. If you recommend one, put it first and append \"(Recommended)\" to that label.",
            "items": {
              "type": "object",
              "additionalProperties": true,
              "properties": {
                "label": {
                  "type": "string",
                  "description": "Short user-facing option label."
                },
                "description": {
                  "type": "string",
                  "description": "One sentence explaining the tradeoff or impact."
                }
              },
              "required": [
                "label"
              ]
            }
          },
          "multi_select": {
            "type": "boolean",
            "description": "Whether the user may select more than one option. Defaults to false."
          }
        },
        "required": [
          "id",
          "question"
        ]
      }
    }
  },
  "required": [
    "questions"
  ]
}
```

来源：[`packages/interaction/tool-ask-user/src/index.ts`](../packages/interaction/tool-ask-user/src/index.ts)

ask_user_question 会暂停工具调用，直到当前 UI 提供方返回人类答案。

<a id="astro-onetools"></a>

## `@astro-one/tools`

### `run_code`

针对可用工具执行 TypeScript 程序。接受两个必填参数：`code`，即异步函数的**函数体**（仅使用可擦除语法；支持顶层 `await` 和 `return`）；以及 `description`，简要说明该程序做什么。请根据系统提示词中的声明，以 `await tools.name(args)` 形式调用工具。只有打印或返回的内容属于程序输出，请谨慎筛选。含图片的子工具结果会在运行结束后附加。

```json
{
  "type": "object",
  "properties": {
    "code": {
      "type": "string",
      "description": "The program: the body of an async TypeScript function."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this program does in active voice, 5-10 words (shown in the UI). Examples: \"Count TODO markers across packages\"; \"Read failing test and its fixture\"; \"Rename config key in every cordis.yml\"."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Positive elapsed-time budget in milliseconds, capped by the deployment maximum."
    },
    "sandbox_permissions": {
      "type": "string",
      "description": "Wider sandbox mode for this complete program execution; requires justification and approval.",
      "enum": [
        "workspace-write",
        "danger-full-access"
      ]
    },
    "justification": {
      "type": "string",
      "description": "Reason this complete program needs wider access, shown to the user for approval."
    }
  },
  "required": [
    "code",
    "description"
  ]
}
```

来源：[`packages/core/tools/src/ptc.ts`](../packages/core/tools/src/ptc.ts)

在 `mode: ptc`／`mode: both` 下，它由工具注册表所有，作为可过滤能力层之外的保留传输机制（参见 PTC mode Agent Note）。在 `ptc` 下，它是注册表对协议格式的唯一贡献；其他可见能力在使用已加载运行时语言生成的 SDK 章节中声明。程序通过 binding 调用这些能力，调用按照原生并发约定调度：启动顺序和策略遵循提交顺序，并发安全的函数体最多重叠执行 `maxParallelSubCalls` 个。调用会重新进入完整且受守卫保护的工具流水线，并将每个嵌套执行关联到此外层结果。

<a id="astro-oneplan-mode"></a>

## `@astro-one/plan-mode`

### `exit_plan_mode`

仅在规划模式下使用。提交计划供用户评审，并在获批后退出规划模式。发送**完整的** Markdown 计划，以一个为计划命名的 # 标题开头。用户可以批准（从你的下一步骤起执行计划），也可以要求继续规划；其反馈会通过工具结果返回，请修改后再次提交。

```json
{
  "type": "object",
  "properties": {
    "plan": {
      "type": "string",
      "description": "The complete plan, as markdown, starting with a # heading that names it."
    }
  },
  "required": [
    "plan"
  ]
}
```

来源：[`packages/plan/plan-mode/src/index.ts`](../packages/plan/plan-mode/src/index.ts)

规划未激活时，exit_plan_mode 仍保留在面向模型的 schema 中，这样状态转换不会在规划策略变更之外额外造成工具目录变动。其执行路径会拒绝规划模式之外的调用；在规划模式下，它通过用户交互 seam 提交计划（批准／根据反馈继续规划），批准后会在步骤边界记录规划模式已停用。

<a id="astro-onetool-bash"></a>

## `@astro-one/tool-bash`

### `bash`

执行 bash 命令（`bash -c`）并返回 stdout/stderr。每次调用都在新 shell 中运行：调用之间不保留任何状态（cwd、变量、函数），请传入 `workdir`，不要使用 `cd`。非零退出会报告为 `[exit code: N]`。当前 harness 环境信息通过托管的 `$ASTRO_ONE_*` 变量公开，需要时请检查这些变量。命令可能在文件沙箱中运行；被阻止的文件操作报告为 `[sandbox: file access denied under <mode> mode]`，这是策略拒绝，而不是命令缺陷，请勿换一种方式重试。较长的输出会截断，只保留尾部；如可用，完整输出会保存到文件并报告其路径。对于长时间运行的命令，请设置 `run_in_background: true`：调用会立即返回 job id；使用 `job_output` 读取输出，使用 `job_kill` 停止任务。到达超时的前台命令不会被杀：它以同样的方式转入后台，返回其 job id 与已捕获的输出。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The bash command to execute."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples: \"ls\" → \"List files in current directory\"; \"git status\" → \"Show working tree status\"; \"npm install\" → \"Install package dependencies\"."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Timeout in milliseconds. The executor applies its configured default and cap; on expiry the command moves to the background as a job instead of being killed."
    },
    "workdir": {
      "type": "string",
      "description": "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies."
    }
  },
  "required": [
    "command",
    "description"
  ]
}
```

来源：[`packages/shell/tool-bash/src/index.ts`](../packages/shell/tool-bash/src/index.ts)

bash 工具是 bash 执行器 seam 面向模型的消费方。组合中有 job 注册表时，每次调用一启动就注册到通用 `ctx.jobs` 运行时，并通过 `job_*` 工具（来自 `@astro-one/tool-jobs`）收集／停止；没有注册表或 `enableRunInBackground: false` 时，工具注册不带 `run_in_background` 参数的纯前台 schema。

<a id="astro-onetool-present"></a>

## `@astro-one/tool-present`

### `present`

选择 Session 文件系统可访问的已有文件，声明为最终交付物。当用户需要独立的文件交付物时使用 present，尤其是 Office 文档、电子表格和演示文稿。如果最终回复已经足够展示结果，优先在回复中展示；创建或编辑文件本身不要求调用 present。通常选择最重要的 1 至 2 项交付物，任务需要时可以更多，但一次 present 调用最多 4 个文件。文件必须已存在。用户打开当前源文件；不复制或保存其内容。

```json
{
  "type": "object",
  "properties": {
    "files": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "path": {
            "type": "string",
            "description": "Path of an existing regular file. Relative paths use the Session working directory."
          },
          "description": {
            "type": "string",
            "description": "Brief description for the user."
          }
        },
        "required": [
          "path"
        ]
      }
    }
  },
  "required": [
    "files"
  ]
}
```

来源： [`packages/deliverables/tool-present/src/index.ts`](../packages/deliverables/tool-present/src/index.ts)

交付归调用方 Session 所有；Web ui-deliverables 提供源文件打开与卡片。

<a id="astro-onetool-pwsh"></a>

## `@astro-one/tool-pwsh`

### `pwsh`

执行 PowerShell 命令（`pwsh -Command`）并返回 stdout/stderr。每次调用都在新的 pwsh 进程中运行：调用之间不保留任何状态（cwd、变量、函数），请传入 `workdir`，不要使用 `cd`。路径采用 Windows 原生形式（`C:\...`）；使用 `$env:NAME` 读取环境变量。非零退出会报告为 `[exit code: N]`。当前 harness 环境信息通过托管的 `$env:ASTRO_ONE_*` 变量公开，需要时请检查这些变量。命令可能在文件沙箱中运行；被阻止的文件操作报告为 `[sandbox: file access denied under <mode> mode]`，这是策略拒绝，而不是命令缺陷，请勿换一种方式重试。较长的输出会截断，只保留尾部；如可用，完整输出会保存到文件并报告其路径。在 Windows 上，被强制终止的命令会以 `[exit code: 1]` 结算且不带信号标记，请将其视为中断，而不是命令失败。对于长时间运行的命令，请设置 `run_in_background: true`：调用会立即返回 job id；使用 `job_output` 读取输出，使用 `job_kill` 停止任务。到达超时的前台命令不会被杀：它以同样的方式转入后台，返回其 job id 与已捕获的输出。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The PowerShell command to execute."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples: \"ls\" → \"List files in current directory\"; \"git status\" → \"Show working tree status\"; \"Get-Process\" → \"List running processes\"."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Timeout in milliseconds. The executor applies its configured default and cap; on expiry the command moves to the background as a job instead of being killed."
    },
    "workdir": {
      "type": "string",
      "description": "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies."
    }
  },
  "required": [
    "command",
    "description"
  ]
}
```

来源：[`packages/shell/tool-pwsh/src/index.ts`](../packages/shell/tool-pwsh/src/index.ts)

pwsh 工具是 Windows 组合中 bash 执行器 seam 的 PowerShell 方言消费方（由 `@astro-one/pwsh-local` 等 PowerShell 执行器为 `ctx.shell` 提供后端）；除沙箱接口外，它逐项对应 bash 工具调用。使用 `run_in_background` 的运行会注册到通用 `ctx.jobs` 运行时，并通过 `job_*` 工具收集／停止；托管的 `ASTRO_ONE_*` 环境来自 `@astro-one/shell-env`。每次调用都在新进程中运行，不使用持久 PTY 会话。路径采用原生 `C:\...` 形式，变量采用 `$env:NAME`。

<a id="astro-onetool-cordis"></a>

## `@astro-one/tool-cordis`

### `cordis_inspect_list`

列出 Host 当前已知的所有 Cordis Inspect Provider，包括本地 Host Provider 和 Client 同步的最新清单。每项包含平台、用途、只读方法以及输入输出 schema。编写或配置插件前先调用本工具，再从结果选择 cordis_inspect_query 的 provider 和方法。不要猜测名称，也不要把 Inspect 方法当作插件代码可调用的业务 Service。

```json
{
  "type": "object",
  "properties": {}
}
```

来源： [`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_inspect_query`

执行 Inspect Provider 声明的只读查询。platform、provider 和 method 必须来自 cordis_inspect_list，input 必须符合该方法的 schema。编写插件代码前，用本工具读取准确的 Service 方法、Event 模式、插件 Config schema、Tool schema、主题 token，或实时 Slot 树与 props。Host 查询在本地运行。Client 查询等待页面首个有效响应，直到页面回应或工具取消。本工具不能调用业务 Service 方法或修改运行时。

```json
{
  "type": "object",
  "properties": {
    "platform": {
      "type": "string",
      "description": "Runtime platform that owns the Provider.",
      "enum": [
        "host",
        "client"
      ]
    },
    "provider": {
      "type": "string",
      "description": "Exact Provider ID returned by cordis_inspect_list."
    },
    "method": {
      "type": "string",
      "description": "Exact method name declared by the Provider manifest."
    },
    "input": {
      "description": "Optional query input; it must satisfy the method input schema."
    }
  },
  "required": [
    "platform",
    "provider",
    "method"
  ]
}
```

来源： [`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

创造模式提供两个只读运行时检查工具。Cordis host runner 提供检查注册表；Client 查询需要已连接页面。持久化变更编写为组合包，再通过 plugin_manager 安装。

<a id="astro-onetool-bash-persistent"></a>

## `@astro-one/tool-bash-persistent`

### `bash`

在持久 bash shell 中运行命令。包括当前目录和已导出环境变量在内的状态会在此 agent 的多次调用之间保留。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The bash command to run. Relative path is preferred in the command."
    }
  },
  "required": [
    "command"
  ]
}
```

来源：[`packages/shell/tool-bash-persistent/src/index.ts`](../packages/shell/tool-bash-persistent/src/index.ts)

一个按所有者隔离的持久 bash 工具；部署组合提供 PTY 后端，并可覆盖面向模型的环境描述。

<a id="astro-onetool-pwsh-persistent"></a>

## `@astro-one/tool-pwsh-persistent`

### `pwsh`

在持久 PowerShell shell 中运行命令。包括当前目录和已导出环境变量在内的状态会在此 agent 的多次调用之间保留。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The PowerShell command to run. Relative path is preferred in the command."
    }
  },
  "required": [
    "command"
  ]
}
```

来源：[`packages/shell/tool-pwsh-persistent/src/index.ts`](../packages/shell/tool-pwsh-persistent/src/index.ts)

一个按所有者隔离的持久 pwsh 工具，持久 bash 工具的 Windows 对应物；部署组合提供 pwsh 方言的 PTY 后端，并可覆盖面向模型的环境描述。

<a id="astro-onetool-str-replace-editor"></a>

## `@astro-one/tool-str-replace-editor`

### `str_replace_editor`

用于查看、创建和编辑文件的自定义编辑工具：

* 状态会在命令调用以及与用户的讨论之间持久保留
* 如果 `path` 是文件，`view` 会显示应用 `cat -n` 后的结果。如果 `path` 是目录，`view` 会列出最多向下 2 层的非隐藏文件和目录
* 如果指定的 `create` 命令目标 `path` 已作为文件存在，则不能使用该命令
* 如果 `command` 产生较长输出，输出会被截断并标记为 `<response clipped>`
* 当前命令不使用某个参数时，值为 `null` 的占位参数视为未提供。必填参数仍须提供值；删除匹配内容时应省略 `str_replace.new_str`，而不是将其设为 `null`

使用 `str_replace` 命令时请注意：

* `old_str` 参数应与原文件中一行或多行连续内容**完全**匹配。请留意空白字符！
* 如果 `old_str` 参数在文件中不唯一，则不会执行替换。请确保在 `old_str` 中包含足够的上下文，使其唯一
* `new_str` 参数应包含用于替换 `old_str` 的已编辑行

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The commands to run. Allowed options are: `view`, `create`, `str_replace`, `insert`.",
      "enum": [
        "view",
        "create",
        "str_replace",
        "insert"
      ]
    },
    "path": {
      "type": "string",
      "description": "Absolute path to file or directory, e.g. `/repo/file.py` or `/repo`."
    },
    "file_text": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "description": "Required string parameter of `create` command, with the content of the file to be created. A null placeholder is treated as omitted by commands that do not use this parameter."
    },
    "insert_line": {
      "oneOf": [
        {
          "type": "integer"
        },
        {
          "type": "null"
        }
      ],
      "description": "Required integer parameter of `insert` command. The `new_str` will be inserted AFTER the line `insert_line` of `path`. A null placeholder is treated as omitted by commands that do not use this parameter."
    },
    "new_str": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "description": "Optional string parameter of `str_replace` command containing the new string (if omitted, no string will be added). Required string parameter of `insert` command containing the string to insert. A null placeholder is accepted only by commands that do not use this parameter."
    },
    "old_str": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "description": "Required string parameter of `str_replace` command containing the string in `path` to replace. A null placeholder is treated as omitted by commands that do not use this parameter."
    },
    "view_range": {
      "oneOf": [
        {
          "type": "array",
          "items": {
            "type": "integer"
          }
        },
        {
          "type": "null"
        }
      ],
      "description": "Optional parameter of `view` command when `path` points to a file. If omitted or null, the full file is shown. If provided, the file will be shown in the indicated line number range, e.g. [11, 12] will show lines 11 and 12. Indexing at 1 to start. Setting `[start_line, -1]` shows all lines from `start_line` to the end of the file."
    }
  },
  "required": [
    "command",
    "path"
  ]
}
```

来源：[`packages/fs/tool-str-replace-editor/src/index.ts`](../packages/fs/tool-str-replace-editor/src/index.ts)

基于文件系统 seam 的独立查看／创建／唯一字面量替换／按行插入工具；可与任何 shell 或终端接口组合。

<a id="astro-onetool-fs"></a>

## `@astro-one/tool-fs`

### `edit`

通过替换字面量文本来编辑现有 UTF-8 文本文件。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to edit, resolved by the filesystem backend."
    },
    "old_string": {
      "type": "string",
      "description": "Literal text to replace. Must match exactly."
    },
    "new_string": {
      "type": "string",
      "description": "Literal replacement text. Use an empty string to delete the match."
    },
    "replace_all": {
      "type": "boolean",
      "description": "Replace all matches. Defaults to false; when false, old_string must appear exactly once."
    }
  },
  "required": [
    "file_path",
    "old_string",
    "new_string"
  ]
}
```

来源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `read`

读取 UTF-8 文本文件，并返回带行号的内容。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to read, resolved by the filesystem backend."
    },
    "offset": {
      "type": "number",
      "description": "1-based first line to return. Defaults to 1."
    },
    "limit": {
      "type": "number",
      "description": "Maximum number of lines to return. Defaults to 2000."
    }
  },
  "required": [
    "file_path"
  ]
}
```

来源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `read_image`

读取 PNG/JPEG/WebP/GIF 文件并返回图像本身。无扩展名的路径同样被接受；格式按文件内容检测，因此规范化附件路径可以直接传入，无需复制或重命名。Harness 会在下一次模型请求前校验并缩小受支持的大图，因此仅为查看图片时应直接使用此工具，无需安装图片库或创建缩略图。可以用小批次并发读取彼此独立的文件。要求当前模型接受图像输入。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to the image file, resolved by the filesystem backend."
    }
  },
  "required": [
    "file_path"
  ]
}
```

来源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `write`

创建或完全替换 UTF-8 文本文件。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to write, resolved by the filesystem backend."
    },
    "content": {
      "type": "string",
      "description": "Full UTF-8 text content to write."
    }
  },
  "required": [
    "file_path",
    "content"
  ]
}
```

来源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

先读后写／编辑策略由 `@astro-one/fs-observation-policy` 添加；它是一个 `fs/*` 事件门禁插件，不会改变 schema。加载这些工具的部署按预期也应加载该插件。没有 `ctx.attachments` 时图片工具不会注册；其 schema 与路由无关，执行时除非确切路由的模型声明图片输入，否则拒绝。

<a id="astro-onetool-fs-search"></a>

## `@astro-one/tool-fs-search`

### `glob`

查找路径匹配 glob 模式的文件。只返回匹配的文件路径，绝不返回目录；包括隐藏文件和被忽略的文件，但排除 VCS 元数据目录。最多按修改时间顺序返回 100 条路径；如果结果更多，则改为返回从顶层条目中抽样的 100 条路径，说明已抽样，并报告完整排序列表的保存位置。该工具不枚举目录条目。

```json
{
  "type": "object",
  "properties": {
    "pattern": {
      "type": "string",
      "description": "Glob pattern to match file paths against (e.g. \"**/*.ts\", \"src/**/*.test.js\"). A pattern with no \"/\" matches the basename at any depth, so \"*\" and \"*.ts\" both search the whole tree; include a separator to anchor the depth."
    },
    "path": {
      "type": "string",
      "description": "Directory to search in. Defaults to the session workspace; a relative path resolves against it."
    }
  },
  "required": [
    "pattern"
  ]
}
```

来源：[`packages/fs/tool-fs-search/src/index.ts`](../packages/fs/tool-fs-search/src/index.ts)

### `grep`

使用 ripgrep 正则表达式搜索文件内容。返回带行号的匹配行，并按文件分组。前 250 条匹配会直接返回；结果达到上限时会报告完整匹配列表的保存位置。如需周边上下文，请对匹配的文件使用 read。

```json
{
  "type": "object",
  "properties": {
    "pattern": {
      "type": "string",
      "description": "Regular expression to search for (ripgrep syntax)."
    },
    "path": {
      "type": "string",
      "description": "File or directory to search. Defaults to the session workspace; a relative path resolves against it."
    },
    "include": {
      "type": "string",
      "description": "One glob filter for which files to search (e.g. \"*.ts\", \"*.{js,jsx}\"). Not a list; negation is not supported."
    }
  },
  "required": [
    "pattern"
  ]
}
```

来源：[`packages/fs/tool-fs-search/src/index.ts`](../packages/fs/tool-fs-search/src/index.ts)

glob 和 grep 是无条件可用的发现工具，通过 ctx.subprocess spawn 随包提供的 ripgrep 二进制文件（`@vscode/ripgrep`），并作为普通前台调用运行，绝不作为后台任务；无需在宿主机安装 `rg`，也不经过 shell 层。本目录使用 `sampleOverCapGlobResults: true`；部署必须显式选择该行为。结果超过上限时，会通过可选的 ctx.spillStore 后端保存完整的格式化列表；在共置部署中，如果后端公开本地路径，返回的定位信息可供后续读取／搜索。

<a id="astro-onetool-terminal"></a>

## `@astro-one/tool-terminal`

### `terminal_close`

关闭一个持久终端，并等待其捕获且所有的进程树完全退出。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    }
  },
  "required": [
    "sessionId"
  ]
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_list`

列出当前 agent 所有的持久终端会话。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_open`

通过已注册的后端类型创建按所有者隔离的持久终端会话。需要在多次工具调用之间保留 shell 或 REPL 状态时，请使用此工具。

```json
{
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "description": "Registered terminal backend type, usually \"shell\"."
    },
    "name": {
      "type": "string",
      "description": "Optional owner-local display name such as \"main\" or \"gdb\"."
    },
    "cwd": {
      "type": "string",
      "description": "Initial working directory. Defaults to the deployment workspace root."
    }
  },
  "required": [
    "type"
  ]
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_read`

从持久终端读取一页有界的保留输出，不发送输入。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    },
    "offset": {
      "type": "number",
      "description": "Newest-relative line offset (default 0)."
    },
    "count": {
      "type": "number",
      "description": "Requested line count (default 500; backend caps apply)."
    }
  },
  "required": [
    "sessionId"
  ]
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_send`

向持久终端发送文本。默认会提交 Enter，并等待提示符、stdin 等待、输出静默、超时或会话退出。后台模式会返回供 job_output／job_kill 使用的 job id。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id returned by terminal_open or terminal_list."
    },
    "text": {
      "type": "string",
      "description": "UTF-8 text to write to the terminal."
    },
    "submit": {
      "type": "boolean",
      "description": "Submit Enter after text (default true). Set false for control characters or incomplete REPL input."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Return a job id immediately; collect with job_output or stop with job_kill."
    }
  },
  "required": [
    "sessionId",
    "text"
  ]
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_signal`

向持久终端当前的前台进程组发送允许的信号。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    },
    "signal": {
      "type": "string",
      "description": "Signal to deliver. Shell-targeted SIGKILL is rejected; use terminal_close.",
      "enum": [
        "SIGINT",
        "SIGTERM",
        "SIGKILL",
        "SIGTSTP",
        "SIGHUP"
      ]
    }
  },
  "required": [
    "sessionId",
    "signal"
  ]
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

这 6 个终端工具需要选择启用，用于补充一次性 bash／文件系统工具。`terminal_send(run_in_background: true)` 会注册到 `ctx.jobs`；schema 不包含 TUI、具名按键序列、BEL、调整尺寸、自动启动和跨 agent 共享。

<a id="astro-onetool-goal"></a>

## `@astro-one/tool-goal`

### `create_goal`

当当前直接人类请求是需要跨自主 Goal Round 持续推进的长期目标时，创建一个持久化的同会话完成目标。即使用户没有明确说「创建目标」，你也可以推断其意图。不要用于简单的单轮工作。执行时会拒绝非人类权限和 subagent 权限。

```json
{
  "type": "object",
  "properties": {
    "objective": {
      "type": "string",
      "description": "The concrete completion objective inferred from the direct human request."
    },
    "max_goal_rounds": {
      "type": "number",
      "description": "Optional positive safe-integer limit on automatic continuation rounds."
    }
  },
  "required": [
    "objective"
  ]
}
```

来源：[`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

### `get_goal`

读取当前的同会话目标，包括确切的 id／revision、目标、阶段、已完成的延续 Round 数、Round 上限、存在时的阻塞原因，以及是否已准备下一次延续。更新目标前请先调用此工具。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

### `update_goal`

更新确切的当前目标 revision。edit、pause 和 resume 要求直接的顶层人类请求。在自动延续当前目标期间，也允许 complete 和 blocked。在达到配置的最小 Round 数之前会拒绝 blocked；模型仍须判断相同条件是否在这些 Round 中持续存在，并在 blocked_reason 中予以说明。

```json
{
  "type": "object",
  "properties": {
    "goal_id": {
      "type": "string",
      "description": "Exact id returned by get_goal."
    },
    "revision": {
      "type": "number",
      "description": "Exact positive revision returned by get_goal."
    },
    "action": {
      "type": "string",
      "description": "edit | pause | resume | complete | blocked",
      "enum": [
        "edit",
        "pause",
        "resume",
        "complete",
        "blocked"
      ]
    },
    "objective": {
      "type": "string",
      "description": "Replacement objective; valid only with action edit."
    },
    "max_goal_rounds": {
      "type": "number",
      "description": "Replacement cap; valid only with action edit."
    },
    "blocked_reason": {
      "type": "string",
      "description": "Concrete blocking condition; required only with action blocked."
    }
  },
  "required": [
    "goal_id",
    "revision",
    "action"
  ]
}
```

来源：[`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

create、edit、pause 和 resume 要求直接来自人类的根权限；complete 和 blocked 也接受确切的当前 Goal Round。blocked 的默认下限是 3 个获准的 Round。

<a id="astro-oneschedule"></a>

## `@astro-one/schedule`

### `schedule_create`

在当前会话中创建一条提醒。请提供非空 prompt 和恰好一个 selector：正的安全整数 after_seconds 延时；作为严格带偏移日期时间或本地日期／时间对象的 at；或不小于 300 的安全整数 every_seconds。固定速率提醒始终与创建时刻对齐，会跳过错过的发生时点，并把每条逾期规则的最新一个发生时点合并到一个批次中。交付模式是 session-local：只有此会话处于 live 状态时，提醒才会准时运行；否则提醒会进入 overdue 状态，直至会话恢复。

```json
{
  "type": "object",
  "properties": {
    "prompt": {
      "type": "string",
      "description": "Reminder content to present when the target becomes due."
    },
    "after_seconds": {
      "type": "number",
      "description": "Positive safe-integer delay in seconds."
    },
    "every_seconds": {
      "type": "number",
      "description": "Fixed-rate safe-integer interval in seconds, at least 300."
    },
    "at": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "date": {
              "type": "string"
            },
            "time": {
              "type": "string"
            },
            "time_zone": {
              "type": "string"
            }
          },
          "required": [
            "date",
            "time",
            "time_zone"
          ]
        }
      ],
      "description": "Absolute target as strict offset RFC 3339 or local date/time with an explicit IANA zone."
    }
  },
  "required": [
    "prompt"
  ]
}
```

来源：[`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

### `schedule_delete`

使用 schedule_create 或 schedule_list 返回的确切 id，删除当前会话中的一条活动提醒。未知或已经结束的 id 会返回 deleted false。

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "Exact session-local schedule id."
    }
  },
  "required": [
    "id"
  ]
}
```

来源：[`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

### `schedule_list`

按创建顺序列出当前会话中的所有活动提醒，包括确切 id、UTC 目标、scheduled 或 overdue 状态，以及 session-local 交付模式。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

仅在选择启用的 Schedule 插件加载后创建的 live 根 Agent scope 内注册。版本 1 接受 after_seconds、显式绝对 at 和有界固定速率 every_seconds，并披露 session-local 交付；管理读取与变更必须通过共享的 Session 持久化 barrier。

<a id="astro-onetool-lsp"></a>

## `@astro-one/tool-lsp`

### `lsp`

查询语言服务器，以精确导航代码。operation 可取 goToDefinition、findReferences、goToImplementation 或 hover。line 和 character 是从 1 开始的 UTF-16 光标坐标。findReferences 包含声明。

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "description": "goToDefinition, findReferences, goToImplementation, or hover.",
      "enum": [
        "goToDefinition",
        "findReferences",
        "goToImplementation",
        "hover"
      ]
    },
    "file_path": {
      "type": "string",
      "description": "The source file to query, relative to the workspace or absolute."
    },
    "line": {
      "type": "number",
      "description": "One-based line of the cursor."
    },
    "character": {
      "type": "number",
      "description": "One-based UTF-16 column of the cursor."
    }
  },
  "required": [
    "operation",
    "file_path",
    "line",
    "character"
  ]
}
```

来源：[`packages/lsp/tool-lsp/src/index.ts`](../packages/lsp/tool-lsp/src/index.ts)

lsp 工具将提供方选择和语言服务器子进程置于 ctx.lsp 之后，因此其模型可见 schema 在更换提供方时保持稳定。运行时要求已注册提供方，例如 `@astro-one/lsp-stdio`；如果没有提供方，查询会返回结构化 `LSP_UNAVAILABLE` 错误，而不会改变 schema。

<a id="astro-onetool-ralph"></a>

## `@astro-one/tool-ralph`

### `ralph`

围绕一个不可变目标运行使用全新 agent 的前台 Ralph 循环。仅当直接人类明确要求 Ralph 或使用全新 agent 迭代时使用。每个 Round 都会启动一个全新子级，该子级看不到父级对话或先前子会话；共享工作区充当长期记忆，Round 之间只传递有界的结构化报告。当工作进程报告完成、报告具体阻塞项或达到 Round 上限时，调用返回。普通的长期同会话工作应使用 goal 工具。

```json
{
  "type": "object",
  "properties": {
    "objective": {
      "type": "string",
      "description": "The immutable completion objective for every fresh Ralph round."
    },
    "maxRounds": {
      "type": "number",
      "description": "Optional positive safe-integer round cap, bounded by the deployment ceiling."
    }
  },
  "required": [
    "objective"
  ]
}
```

来源：[`packages/workflow/tool-ralph/src/index.ts`](../packages/workflow/tool-ralph/src/index.ts)

固定的前台工作流会在每个 Round 启动一个全新的结构化子级；模型只能选择不可变目标和可选的 Round 上限。

<a id="astro-onetool-skill"></a>

## `@astro-one/tool-skill`

### `skill`

加载可用 skill（技能）的完整说明。在执行点名某项 skill 或与其明确匹配的任务前，请使用会话 skill 目录中的确切名称调用此工具。

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "The exact skill name from the available skills list."
    }
  },
  "required": [
    "name"
  ]
}
```

来源：[`packages/skill/tool-skill/src/index.ts`](../packages/skill/tool-skill/src/index.ts)

<a id="astro-onetool-session-query"></a>

## `@astro-one/tool-session-query`

### `session_event_read`

从一个已获授权的会话中读取一个完整且未删节的事件，以及可选的相邻原始事件概述。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "seq": {
      "type": "integer",
      "description": "Target event sequence number."
    },
    "before": {
      "type": "integer",
      "description": "Number of preceding raw events to summarize. Omit for none."
    },
    "after": {
      "type": "integer",
      "description": "Number of following raw events to summarize. Omit for none."
    }
  },
  "required": [
    "seq"
  ]
}
```

来源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_event_search`

在一个已获授权的会话中搜索先前事件；如果搜索当前会话，则排除执行此次调用的步骤。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "query": {
      "type": "string",
      "description": "Literal full-text query over the target session."
    },
    "seq_from": {
      "type": "integer",
      "description": "Inclusive event sequence lower bound."
    },
    "seq_to": {
      "type": "integer",
      "description": "Inclusive event sequence upper bound."
    },
    "time_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time lower bound."
    },
    "time_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time upper bound."
    },
    "event_types": {
      "type": "array",
      "description": "Event types to include.",
      "items": {
        "type": "string"
      }
    },
    "surfaces": {
      "type": "array",
      "description": "Event surfaces to include.",
      "items": {
        "type": "string",
        "enum": [
          "current",
          "shadowed",
          "log-only"
        ]
      }
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_event_trace`

读取已获授权会话中某个事件的所有直接替换关系，以及该事件与其引用的来源事件之间的关系。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "seq": {
      "type": "integer",
      "description": "Target event sequence number."
    }
  },
  "required": [
    "seq"
  ]
}
```

来源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_search`

搜索调用方工作区中的先前会话，并从每个会话返回匹配度最高的事件。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Literal full-text query over prior session history."
    },
    "session_ids": {
      "type": "array",
      "description": "Optional session ids to include.",
      "items": {
        "type": "string"
      }
    },
    "created_at_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 creation-time lower bound."
    },
    "created_at_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 creation-time upper bound."
    },
    "parent_session_ids": {
      "type": "array",
      "description": "Optional direct parent session ids.",
      "items": {
        "type": "string"
      }
    },
    "include_root_sessions": {
      "type": "boolean",
      "description": "Include sessions with no parent in the parent filter."
    },
    "availability": {
      "type": "array",
      "description": "Require at least one selected source availability.",
      "items": {
        "type": "string",
        "enum": [
          "live",
          "persisted"
        ]
      }
    },
    "event_seq_from": {
      "type": "integer",
      "description": "Inclusive event sequence lower bound."
    },
    "event_seq_to": {
      "type": "integer",
      "description": "Inclusive event sequence upper bound."
    },
    "event_time_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time lower bound."
    },
    "event_time_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time upper bound."
    },
    "event_types": {
      "type": "array",
      "description": "Event types to include.",
      "items": {
        "type": "string"
      }
    },
    "event_surfaces": {
      "type": "array",
      "description": "Event surfaces to include.",
      "items": {
        "type": "string",
        "enum": [
          "current",
          "shadowed",
          "log-only"
        ]
      }
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_trace`

读取围绕一个会话的已授权会话谱系，包括完整可见的祖先和后代关系。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    }
  }
}
```

来源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

这 5 个只读工具会隐藏提供方游标，并根据不可变的调用 agent 会话为每个结果授权。该包需要选择启用；需要强制截止时间或限制行内输出的组合还会挂载通用超时或 spill 策略。

<a id="astro-onetool-subagent"></a>

## `@astro-one/tool-subagent`

### `list_subagent_models`

发现 subagent 可用的 LLM 路由，不更改当前 Agent。无参数调用会列出已注册提供方；提供 `provider` 时会列出其公布的模型；同时提供 `provider` 和 `model` 时会检查该精确模型及其推理强度。目录条目只提供建议：adapter 可能接受未列出的模型 id。把返回的 id 用于委派工具的 `provider`、`model` 与 `reasoning_effort` 字段。

```json
{
  "type": "object",
  "properties": {
    "provider": {
      "type": "string",
      "description": "Registered LLM provider id. Omit to list providers."
    },
    "model": {
      "type": "string",
      "description": "Exact model id to inspect. Requires provider; omit to list that provider's advertised models."
    }
  }
}
```

来源：[`packages/subagent/tool-subagent/src/list-models.ts`](../packages/subagent/tool-subagent/src/list-models.ts)

### `subagent`

将一项自包含任务委派给 subagent（在自身上下文中工作的独立 agent），用它卸载聚焦且独立的工作，例如研究、限定范围的实现或分析，以免消耗当前对话的上下文。subagent 会返回结果，但不会返回中间步骤。请提供完整、独立的提示词，因为它看不到当前对话。此调用默认等待结果。设置 `run_in_background: true` 可返回 job id；使用 `job_output` 收集结果，使用 `job_kill` 停止任务。

```json
{
  "type": "object",
  "properties": {
    "description": {
      "type": "string",
      "description": "A short (3-5 word) description of the delegated task, for display."
    },
    "prompt": {
      "type": "string",
      "description": "The complete, self-contained task for the subagent. It does not share this conversation's context, so include everything it needs."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Whether to run as a background job and return its id. Defaults to false; collect with job_output or stop with job_kill."
    }
  },
  "required": [
    "description",
    "prompt"
  ]
}
```

来源：[`packages/subagent/tool-subagent/src/index.ts`](../packages/subagent/tool-subagent/src/index.ts)

注册的委派工具名称取决于加载时 `toolName` 配置（默认为 `subagent`）；上述默认 schema 关闭模型选择，而发现 schema 则展示为已启用 Session 中可用的固定配套工具。Web preset 会在每个新顶层 Session 创建时读取插件页偏好，并为其子 Session 保留该决定；`subagent_fork` 始终使用固定路由。每个实例通过 `modelSelectionSettings`、`backgroundMode` 与 `enableRunInBackground` 独立控制是否读取模型选择设置及其后台行为。

<a id="astro-onetool-subagent-control"></a>

## `@astro-one/tool-subagent-control`

### `interrupt_agent`

根据 agent id 请求取消后台 agent 的当前轮次。目标可以是你的直接子级，也可以是在你下方创建的更深层 agent。只有当前轮次会停止：已经排队发给该 agent 的消息会一直搁置到后续的 send_message；它启动的 agent 会继续运行；该 agent 本身仍可接受后续操作。停止请求被接受后，此调用立即返回，因此目标可能还会短暂运行；中断一个已经完成的 agent 是可接受的空操作。

```json
{
  "type": "object",
  "properties": {
    "agent_id": {
      "type": "string",
      "description": "The agent id of the running agent to interrupt."
    }
  },
  "required": [
    "agent_id"
  ]
}
```

来源：[`packages/subagent/tool-subagent-control/src/index.ts`](../packages/subagent/tool-subagent-control/src/index.ts)

### `list_agents`

按持久 id 和标签列出你的可继续后台 subagent。用它回忆你启动过哪些 subagent，而不是轮询完成情况——subagent 完成时你会被告知。状态来自实时注册表：running 表示 agent 此刻正在工作；inactive 表示没有轮次在执行，包括已加载和需要恢复的 child。inactive 不表示任务完成、成功、失败或等待其他 agent。`send_message` 会在运行中 child 的最近 step 边界 steer 消息，或为 inactive child 启动或恢复轮次，且无论处于哪种状态，直接子级都仍可作为 `send_message` 的目标。该快照并非投递承诺；`send_message` 会执行权威检查，仍可能失败。无法读取的子级仅在 `descendants` 作用域中作为诊断信息报告。`descendants` 作用域会按稳定的前序顺序遍历你下方的整棵树，并为每个条目标注其持久的直接父会话 id 和深度。只有深度为 1 的条目可以使用 `send_message`；更深的条目只能作为 `interrupt_agent` 的候选目标。

```json
{
  "type": "object",
  "properties": {
    "scope": {
      "type": "string",
      "description": "children (default) lists direct children only; descendants walks the complete tree below you.",
      "enum": [
        "children",
        "descendants"
      ]
    }
  }
}
```

来源：[`packages/subagent/tool-subagent-control/src/list-agents.ts`](../packages/subagent/tool-subagent-control/src/list-agents.ts)

### `send_message`

根据 agent id 向直接可继续 child 发送消息。如果你是驻留的可继续 child，也可以把自己的直接 parent 作为目标。如果目标仍在工作，消息会 steer 其最近的 step；如果目标处于 inactive，消息会启动或恢复一个轮次。此调用不会返回该 agent 的答案，只会确认消息已投递。调用失败表示消息**未**投递。

```json
{
  "type": "object",
  "properties": {
    "agent_id": {
      "type": "string",
      "description": "The agent id of your direct continuable child, or your direct parent when you are a resident continuable child."
    },
    "message": {
      "type": "string",
      "description": "The message to deliver to the agent."
    }
  },
  "required": [
    "agent_id",
    "message"
  ]
}
```

来源：[`packages/subagent/tool-subagent-control/src/index.ts`](../packages/subagent/tool-subagent-control/src/index.ts)

这些是控制可继续后台 subagent 的全局命名工具：绑定提供方的 `tool-subagent` 实例注册不同的委派工具；本包注册一次 `send_message` 和 `interrupt_agent`，另由 `list_agents` 通过单独加载的 `/list-agents` 插件提供，其目录行使用 sessionProjections 和实时 Agent 注册表。

<a id="astro-onetool-jobs"></a>

## `@astro-one/tool-jobs`

### `job_kill`

根据 job id 请求取消正在运行的后台任务。此调用立即返回；任务的工作真正停止后，会以 killed 状态结算。

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "description": "Job id returned by the tool that started the background work."
    },
    "reason": {
      "type": "string",
      "description": "Optional short reason, recorded in the log and forwarded to the job."
    }
  },
  "required": [
    "job_id"
  ]
}
```

来源：[`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

### `job_list`

列出你的后台任务（包括正在运行和已完成的任务）及其 id、种类和状态。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

### `job_output`

读取后台任务。流式任务只返回自上次读取以来的输出；最终输出任务会在结算后返回结果。每个响应都以 `[status: ...]` 结尾。读取默认不阻塞；设置 `wait: true` 后，最长等待到配置的上限。

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "description": "Job id returned by the tool that started the background work."
    },
    "wait": {
      "type": "boolean",
      "description": "Block until the job reaches a terminal status or the timeout expires. A timed-out wait returns [status: running] and leaves the job alive."
    },
    "timeout_ms": {
      "type": "number",
      "description": "Max wait in milliseconds (only meaningful with wait: true). Defaults to the configured wait timeout; capped by the configured maximum."
    }
  },
  "required": [
    "job_id"
  ]
}
```

来源：[`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

与任务种类无关的后台任务控制器：后台 bash 命令、PTY 发送和 subagent 都通过相同的 3 个工具读取、列出和终止。加载该插件会挂接控制器，从而启用生产方的 `ctx.jobs.start()`。

<a id="astro-oneexperimental-tool-agent-team"></a>

## `@astro-one/experimental-tool-agent-team`

### `interrupt_agent`

中断一名 teammate 的当前 turn，同时保留其待处理 inbox。仅 Team Lead 可用。

```json
{
  "type": "object",
  "properties": {
    "target": {
      "type": "string",
      "description": "Teammate target returned by spawn_teammate or list_agents."
    }
  },
  "required": [
    "target"
  ]
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `list_agents`

列出 Lead 与所有持久 teammate，以及可用于寻址的 target 和当前可用状态。inactive 表示没有轮次在执行，不表示任务结果。provisioning 与 failed 描述成员创建状态。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `send_message`

向另一名 Team member 发送一条持久消息。running target 会在最近的步骤边界收到消息；inactive target 会启动或恢复一个 turn。

```json
{
  "type": "object",
  "properties": {
    "target": {
      "type": "string",
      "description": "Member target returned by spawn_teammate or list_agents, including lead."
    },
    "message": {
      "type": "string",
      "description": "Self-contained message for the target."
    }
  },
  "required": [
    "target",
    "message"
  ]
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `spawn_teammate`

创建一名具名、持久的 teammate。只有 Team Lead 可以调用此工具。

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Unique lower-kebab-case teammate name."
    },
    "description": {
      "type": "string",
      "description": "Short description of the delegated responsibility."
    },
    "prompt": {
      "type": "string",
      "description": "Complete initial task for the teammate."
    },
    "context": {
      "type": "string",
      "description": "fresh starts without Lead history; fork inherits completed Lead turns. Defaults to fresh.",
      "enum": [
        "fresh",
        "fork"
      ]
    }
  },
  "required": [
    "name",
    "description",
    "prompt"
  ]
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_create`

在共享 Team 任务板上创建一个无 owner 的 pending task。

```json
{
  "type": "object",
  "properties": {
    "subject": {
      "type": "string",
      "description": "Concise task title."
    },
    "description": {
      "type": "string",
      "description": "Complete task details and acceptance criteria."
    },
    "blocked_by": {
      "type": "array",
      "description": "Task ids that must complete first.",
      "items": {
        "type": "string"
      }
    },
    "write_scopes": {
      "type": "array",
      "description": "Advisory workspace-relative file or directory prefixes this task expects to modify.",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "subject",
    "description"
  ]
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_get`

在修改或执行共享任务前，读取其完整的最新值。

```json
{
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "description": "Shared task id."
    }
  },
  "required": [
    "task_id"
  ]
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_list`

列出共享任务，包括 readiness、owner、revision、blocker 与 write-scope warning。

```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "description": "Optional exact status filter.",
      "enum": [
        "pending",
        "in_progress",
        "completed"
      ]
    },
    "owner": {
      "type": "string",
      "description": "Optional member target from spawn_teammate or list_agents, matching ownerName; use unowned for tasks without an owner."
    },
    "ready": {
      "type": "boolean",
      "description": "Optional readiness filter."
    },
    "cursor": {
      "type": "integer",
      "description": "Zero-based result offset. Defaults to 0."
    },
    "limit": {
      "type": "integer",
      "description": "Number of rows, 1 through 100. Defaults to 50."
    }
  }
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_update`

使用 team_task_get 或 team_task_list 返回的最新 revision，对共享任务操作执行 compare-and-set。

```json
{
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "description": "Shared task id."
    },
    "expected_revision": {
      "type": "integer",
      "description": "Current task revision used as the CAS precondition."
    },
    "action": {
      "type": "string",
      "description": "Task transition to apply.",
      "enum": [
        "claim",
        "release",
        "edit",
        "set_dependencies",
        "complete",
        "reopen",
        "reassign",
        "delete"
      ]
    },
    "subject": {
      "type": "string",
      "description": "Replacement title for edit."
    },
    "description": {
      "type": "string",
      "description": "Replacement details for edit."
    },
    "blocked_by": {
      "type": "array",
      "description": "Complete blocker list for set_dependencies.",
      "items": {
        "type": "string"
      }
    },
    "write_scopes": {
      "type": "array",
      "description": "Replacement advisory write scopes for edit.",
      "items": {
        "type": "string"
      }
    },
    "owner": {
      "type": "string",
      "description": "Member target from spawn_teammate or list_agents for Lead-only reassign; omit to unassign."
    }
  },
  "required": [
    "task_id",
    "expected_revision",
    "action"
  ]
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `wait_agent`

等待本次调用开始后下一次 teammate 状态、mailbox 或共享任务变更。它绝不会唤醒 inactive member；若没有其他 member 正在 running 或 provisioning，则立即返回 noProgress。唤醒或超时后应重新列出状态，而不是轮询。

```json
{
  "type": "object",
  "properties": {
    "timeout_ms": {
      "type": "integer",
      "description": "Wait duration in milliseconds, from 10000 through 3600000. Defaults to 30000."
    }
  }
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

这 10 个工具限定于隐式 Team Lead 与持久 teammate 作用域。随产品发布的 astro-one-base bundle 默认禁用该包；文档中的 Agent Teams profile patch 会启用它，并禁用旧 continuable child 的同名控制工具。


<a id="astro-onetool-astrodynamics"></a>

## `@astro-one/tool-astrodynamics`

### `attitude_determine`

由两个或更多矢量观测估计航天器姿态（Wahba 问题），例如太阳敏感器、磁强计和星敏感器方向。每个观测把测得的本体系矢量与参考系（例如 J2000）中已知的同一方向配对，并给出测量 sigma_deg。method 可选 q-method（Davenport，精确最优，默认）、quest（Shuster，快速）或 triad（前两个矢量，第一个视为精确）。返回参考系到本体系的四元数（标量在后，q4 >= 0）、方向余弦矩阵、3-2-1 偏航/俯仰/滚转角、Wahba 损失，以及绕本体轴的 1-sigma 姿态误差。

```json
{
  "type": "object",
  "properties": {
    "method": {
      "type": "string",
      "enum": [
        "q-method",
        "quest",
        "triad"
      ]
    },
    "observations": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "body": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "reference": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "sigma_deg": {
            "type": "number"
          }
        },
        "required": [
          "body",
          "reference",
          "sigma_deg"
        ]
      }
    }
  },
  "required": [
    "observations"
  ]
}
```

来源：[`packages/aerospace/tool-astrodynamics/src/index.ts`](../packages/aerospace/tool-astrodynamics/src/index.ts)

### `orbit_conjunction`

在 start 与 end 之间筛查两个目标的近距离交会，报告每个小于 screening_distance_km（默认 10）的局部最小值：最近接近时刻、脱靶距离、相对速度，以及主目标径向/横向/法向坐标系中的脱靶矢量。当两个位置协方差都已给出（km² 单位的 3x3 RTN 矩阵，或 sigma_rtn_km 对角线）时，还会返回针对 hard_body_radius_km（组合目标半径，默认 0.02 km）的短时交会（2D，Foster）碰撞概率，以及不依赖协方差的 Alfano 最大概率。step_s（默认 10）必须远短于交会时长；每个目标都有自己的 source 与 method。

```json
{
  "type": "object",
  "properties": {
    "primary": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "source": {
          "type": "object",
          "description": "Orbit to use. kind=tle needs line1/line2; kind=omm needs omm (CCSDS OMM JSON keywords as served by CelesTrak); kind=state needs epoch, frame, position_km, velocity_km_s; kind=elements needs epoch, a_km, e, i_deg, raan_deg, argp_deg, and exactly one of true_anomaly_deg or mean_anomaly_deg (GCRF/J2000).",
          "additionalProperties": false,
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "tle",
                "omm",
                "state",
                "elements"
              ]
            },
            "line1": {
              "type": "string"
            },
            "line2": {
              "type": "string"
            },
            "omm": {},
            "epoch": {
              "type": "string",
              "description": "ISO 8601 date-time with Z or a UTC offset, for example 2025-03-01T12:00:00Z."
            },
            "frame": {
              "type": "string",
              "description": "Frame of position_km/velocity_km_s.",
              "enum": [
                "gcrf",
                "itrf",
                "teme"
              ]
            },
            "position_km": {
              "type": "array",
              "items": {
                "type": "number"
              }
            },
            "velocity_km_s": {
              "type": "array",
              "items": {
                "type": "number"
              }
            },
            "a_km": {
              "type": "number"
            },
            "e": {
              "type": "number"
            },
            "i_deg": {
              "type": "number"
            },
            "raan_deg": {
              "type": "number"
            },
            "argp_deg": {
              "type": "number"
            },
            "true_anomaly_deg": {
              "type": "number"
            },
            "mean_anomaly_deg": {
              "type": "number"
            }
          },
          "required": [
            "kind"
          ]
        },
        "method": {
          "type": "string",
          "description": "sgp4 (TLE/OMM sources only; standard for catalog element sets), numerical (RKF7(8) special perturbations with the forces field), or two-body (Keplerian).",
          "enum": [
            "sgp4",
            "numerical",
            "two-body"
          ]
        },
        "covariance_rtn_km2": {
          "type": "array",
          "items": {
            "type": "array",
            "items": {
              "type": "number"
            }
          }
        },
        "sigma_rtn_km": {
          "type": "array",
          "items": {
            "type": "number"
          }
        }
      },
      "required": [
        "source",
        "method"
      ]
    },
    "secondary": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "source": {
          "type": "object",
          "description": "Orbit to use. kind=tle needs line1/line2; kind=omm needs omm (CCSDS OMM JSON keywords as served by CelesTrak); kind=state needs epoch, frame, position_km, velocity_km_s; kind=elements needs epoch, a_km, e, i_deg, raan_deg, argp_deg, and exactly one of true_anomaly_deg or mean_anomaly_deg (GCRF/J2000).",
          "additionalProperties": false,
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "tle",
                "omm",
                "state",
                "elements"
              ]
            },
            "line1": {
              "type": "string"
            },
            "line2": {
              "type": "string"
            },
            "omm": {},
            "epoch": {
              "type": "string",
              "description": "ISO 8601 date-time with Z or a UTC offset, for example 2025-03-01T12:00:00Z."
            },
            "frame": {
              "type": "string",
              "description": "Frame of position_km/velocity_km_s.",
              "enum": [
                "gcrf",
                "itrf",
                "teme"
              ]
            },
            "position_km": {
              "type": "array",
              "items": {
                "type": "number"
              }
            },
            "velocity_km_s": {
              "type": "array",
              "items": {
                "type": "number"
              }
            },
            "a_km": {
              "type": "number"
            },
            "e": {
              "type": "number"
            },
            "i_deg": {
              "type": "number"
            },
            "raan_deg": {
              "type": "number"
            },
            "argp_deg": {
              "type": "number"
            },
            "true_anomaly_deg": {
              "type": "number"
            },
            "mean_anomaly_deg": {
              "type": "number"
            }
          },
          "required": [
            "kind"
          ]
        },
        "method": {
          "type": "string",
          "description": "sgp4 (TLE/OMM sources only; standard for catalog element sets), numerical (RKF7(8) special perturbations with the forces field), or two-body (Keplerian).",
          "enum": [
            "sgp4",
            "numerical",
            "two-body"
          ]
        },
        "covariance_rtn_km2": {
          "type": "array",
          "items": {
            "type": "array",
            "items": {
              "type": "number"
            }
          }
        },
        "sigma_rtn_km": {
          "type": "array",
          "items": {
            "type": "number"
          }
        }
      },
      "required": [
        "source",
        "method"
      ]
    },
    "start": {
      "type": "string",
      "description": "ISO 8601 date-time with Z or a UTC offset, for example 2025-03-01T12:00:00Z."
    },
    "end": {
      "type": "string",
      "description": "ISO 8601 date-time with Z or a UTC offset, for example 2025-03-01T12:00:00Z."
    },
    "step_s": {
      "type": "number"
    },
    "screening_distance_km": {
      "type": "number"
    },
    "hard_body_radius_km": {
      "type": "number"
    },
    "forces": {
      "type": "object",
      "description": "Numerical force model. Defaults: zonal_degree 2 (J2), no drag, no radiation pressure, no third bodies.",
      "additionalProperties": false,
      "properties": {
        "zonal_degree": {
          "type": "integer",
          "description": "Highest zonal harmonic, 0 (point mass) to 6 (J2–J6)."
        },
        "drag": {
          "type": "object",
          "description": "Exponential-atmosphere drag.",
          "additionalProperties": false,
          "properties": {
            "cd": {
              "type": "number"
            },
            "area_m2": {
              "type": "number"
            },
            "mass_kg": {
              "type": "number"
            }
          },
          "required": [
            "cd",
            "area_m2",
            "mass_kg"
          ]
        },
        "srp": {
          "type": "object",
          "description": "Cannonball solar radiation pressure with conical Earth shadow.",
          "additionalProperties": false,
          "properties": {
            "cr": {
              "type": "number"
            },
            "area_m2": {
              "type": "number"
            },
            "mass_kg": {
              "type": "number"
            }
          },
          "required": [
            "cr",
            "area_m2",
            "mass_kg"
          ]
        },
        "sun": {
          "type": "boolean",
          "description": "Solar third-body gravity."
        },
        "moon": {
          "type": "boolean",
          "description": "Lunar third-body gravity."
        }
      }
    }
  },
  "required": [
    "primary",
    "secondary",
    "start",
    "end"
  ]
}
```

来源：[`packages/aerospace/tool-astrodynamics/src/index.ts`](../packages/aerospace/tool-astrodynamics/src/index.ts)

### `orbit_convert`

转换轨道与时间表示。operation=state 把 source（gcrf/itrf/teme 状态、开普勒根数、TLE 或 OMM）在其历元转换为 GCRF、ITRF 和 TEME 位置/速度、密切根数以及大地星下点。operation=geodetic 把测站（lat_deg、lon_deg、alt_km）转换为地固坐标。operation=time 把时刻转换为儒略日（UTC 与 TT）、TAI-UTC、GPS 周/周内秒和格林尼治恒星时。

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "state",
        "geodetic",
        "time"
      ]
    },
    "source": {
      "type": "object",
      "description": "Orbit to use. kind=tle needs line1/line2; kind=omm needs omm (CCSDS OMM JSON keywords as served by CelesTrak); kind=state needs epoch, frame, position_km, velocity_km_s; kind=elements needs epoch, a_km, e, i_deg, raan_deg, argp_deg, and exactly one of true_anomaly_deg or mean_anomaly_deg (GCRF/J2000).",
      "additionalProperties": false,
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "tle",
            "omm",
            "state",
            "elements"
          ]
        },
        "line1": {
          "type": "string"
        },
        "line2": {
          "type": "string"
        },
        "omm": {},
        "epoch": {
          "type": "string",
          "description": "ISO 8601 date-time with Z or a UTC offset, for example 2025-03-01T12:00:00Z."
        },
        "frame": {
          "type": "string",
          "description": "Frame of position_km/velocity_km_s.",
          "enum": [
            "gcrf",
            "itrf",
            "teme"
          ]
        },
        "position_km": {
          "type": "array",
          "items": {
            "type": "number"
          }
        },
        "velocity_km_s": {
          "type": "array",
          "items": {
            "type": "number"
          }
        },
        "a_km": {
          "type": "number"
        },
        "e": {
          "type": "number"
        },
        "i_deg": {
          "type": "number"
        },
        "raan_deg": {
          "type": "number"
        },
        "argp_deg": {
          "type": "number"
        },
        "true_anomaly_deg": {
          "type": "number"
        },
        "mean_anomaly_deg": {
          "type": "number"
        }
      },
      "required": [
        "kind"
      ]
    },
    "station": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "lat_deg": {
          "type": "number"
        },
        "lon_deg": {
          "type": "number"
        },
        "alt_km": {
          "type": "number"
        }
      },
      "required": [
        "lat_deg",
        "lon_deg",
        "alt_km"
      ]
    },
    "time": {
      "type": "string",
      "description": "ISO 8601 date-time with Z or a UTC offset, for example 2025-03-01T12:00:00Z."
    },
    "eop": {
      "type": "object",
      "description": "Optional IERS Bulletin A values; omit for UT1=UTC and no polar motion (≈15 m and ≈0.4 km/s·ΔUT1 errors).",
      "additionalProperties": false,
      "properties": {
        "dut1_s": {
          "type": "number"
        },
        "xp_arcsec": {
          "type": "number"
        },
        "yp_arcsec": {
          "type": "number"
        }
      }
    }
  },
  "required": [
    "operation"
  ]
}
```

来源：[`packages/aerospace/tool-astrodynamics/src/index.ts`](../packages/aerospace/tool-astrodynamics/src/index.ts)

### `orbit_determine`

由跟踪观测确定轨道。初始方法：gibbs 或 herrick-gibbs（恰好三个位置观测；弧段仅跨几度时用 Herrick–Gibbs）、gauss（恰好三个来自地面站的 radec 观测，仅测角）。精密方法：batch（带野值剔除的加权最小二乘，给出协方差）和 ukf（无迹卡尔曼滤波，状态位于最后一个观测时刻）。观测类型与单位：position [x,y,z] km GCRF；range km；range_rate km/s；radec [赤经, 赤纬] deg 站心 J2000；azel [方位角, 仰角] deg。sigma 使用相同单位，batch 与 ukf 必须提供。除 position 外的所有类型都需要 station。batch 与 ukf 在给出 initial 时使用它，否则自动使用 Gibbs/Herrick–Gibbs 或 Gauss 解。

```json
{
  "type": "object",
  "properties": {
    "method": {
      "type": "string",
      "enum": [
        "gibbs",
        "herrick-gibbs",
        "gauss",
        "batch",
        "ukf"
      ]
    },
    "observations": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "time": {
            "type": "string",
            "description": "ISO 8601 date-time with Z or a UTC offset, for example 2025-03-01T12:00:00Z."
          },
          "type": {
            "type": "string",
            "enum": [
              "position",
              "range",
              "range_rate",
              "radec",
              "azel"
            ]
          },
          "value": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "sigma": {
            "type": "number"
          },
          "station": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "lat_deg": {
                "type": "number"
              },
              "lon_deg": {
                "type": "number"
              },
              "alt_km": {
                "type": "number"
              }
            },
            "required": [
              "lat_deg",
              "lon_deg",
              "alt_km"
            ]
          }
        },
        "required": [
          "time",
          "type",
          "value"
        ]
      }
    },
    "initial": {
      "type": "object",
      "description": "A priori orbit for batch/ukf (any source kind).",
      "additionalProperties": false,
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "tle",
            "omm",
            "state",
            "elements"
          ]
        },
        "line1": {
          "type": "string"
        },
        "line2": {
          "type": "string"
        },
        "omm": {},
        "epoch": {
          "type": "string",
          "description": "ISO 8601 date-time with Z or a UTC offset, for example 2025-03-01T12:00:00Z."
        },
        "frame": {
          "type": "string",
          "description": "Frame of position_km/velocity_km_s.",
          "enum": [
            "gcrf",
            "itrf",
            "teme"
          ]
        },
        "position_km": {
          "type": "array",
          "items": {
            "type": "number"
          }
        },
        "velocity_km_s": {
          "type": "array",
          "items": {
            "type": "number"
          }
        },
        "a_km": {
          "type": "number"
        },
        "e": {
          "type": "number"
        },
        "i_deg": {
          "type": "number"
        },
        "raan_deg": {
          "type": "number"
        },
        "argp_deg": {
          "type": "number"
        },
        "true_anomaly_deg": {
          "type": "number"
        },
        "mean_anomaly_deg": {
          "type": "number"
        }
      },
      "required": [
        "kind"
      ]
    },
    "dynamics": {
      "type": "string",
      "description": "Dynamics for batch/ukf (default numerical).",
      "enum": [
        "numerical",
        "two-body"
      ]
    },
    "forces": {
      "type": "object",
      "description": "Numerical force model. Defaults: zonal_degree 2 (J2), no drag, no radiation pressure, no third bodies.",
      "additionalProperties": false,
      "properties": {
        "zonal_degree": {
          "type": "integer",
          "description": "Highest zonal harmonic, 0 (point mass) to 6 (J2–J6)."
        },
        "drag": {
          "type": "object",
          "description": "Exponential-atmosphere drag.",
          "additionalProperties": false,
          "properties": {
            "cd": {
              "type": "number"
            },
            "area_m2": {
              "type": "number"
            },
            "mass_kg": {
              "type": "number"
            }
          },
          "required": [
            "cd",
            "area_m2",
            "mass_kg"
          ]
        },
        "srp": {
          "type": "object",
          "description": "Cannonball solar radiation pressure with conical Earth shadow.",
          "additionalProperties": false,
          "properties": {
            "cr": {
              "type": "number"
            },
            "area_m2": {
              "type": "number"
            },
            "mass_kg": {
              "type": "number"
            }
          },
          "required": [
            "cr",
            "area_m2",
            "mass_kg"
          ]
        },
        "sun": {
          "type": "boolean",
          "description": "Solar third-body gravity."
        },
        "moon": {
          "type": "boolean",
          "description": "Lunar third-body gravity."
        }
      }
    },
    "max_iterations": {
      "type": "integer",
      "description": "Batch differential-correction iterations (default 20)."
    },
    "edit_sigma": {
      "type": "number",
      "description": "Batch outlier threshold in normalized residuals (default 3; 0 disables editing)."
    },
    "process_noise_km_s2": {
      "type": "number",
      "description": "UKF white-noise acceleration sigma (default 1e-9 km/s²)."
    },
    "initial_sigma_km": {
      "type": "number",
      "description": "UKF a priori position sigma (default 1 km)."
    },
    "initial_sigma_km_s": {
      "type": "number",
      "description": "UKF a priori velocity sigma (default 0.001 km/s)."
    },
    "eop": {
      "type": "object",
      "description": "Optional IERS Bulletin A values; omit for UT1=UTC and no polar motion (≈15 m and ≈0.4 km/s·ΔUT1 errors).",
      "additionalProperties": false,
      "properties": {
        "dut1_s": {
          "type": "number"
        },
        "xp_arcsec": {
          "type": "number"
        },
        "yp_arcsec": {
          "type": "number"
        }
      }
    }
  },
  "required": [
    "method",
    "observations"
  ]
}
```

来源：[`packages/aerospace/tool-astrodynamics/src/index.ts`](../packages/aerospace/tool-astrodynamics/src/index.ts)

### `orbit_passes`

预测卫星在 start 与 end 之间何时对地面站可见：高于 min_elevation_deg（默认 10）的升起、中天和降落时刻，以及方位角/仰角/距离。step_s（默认 60）是粗搜索步长，必须短于所关心的最短过境。每次过境还会报告卫星在中天时是否被太阳照亮以及测站处的太阳仰角（光学可见过境需要卫星被照亮且测站太阳仰角低于约 -6 deg）。

```json
{
  "type": "object",
  "properties": {
    "source": {
      "type": "object",
      "description": "Orbit to use. kind=tle needs line1/line2; kind=omm needs omm (CCSDS OMM JSON keywords as served by CelesTrak); kind=state needs epoch, frame, position_km, velocity_km_s; kind=elements needs epoch, a_km, e, i_deg, raan_deg, argp_deg, and exactly one of true_anomaly_deg or mean_anomaly_deg (GCRF/J2000).",
      "additionalProperties": false,
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "tle",
            "omm",
            "state",
            "elements"
          ]
        },
        "line1": {
          "type": "string"
        },
        "line2": {
          "type": "string"
        },
        "omm": {},
        "epoch": {
          "type": "string",
          "description": "ISO 8601 date-time with Z or a UTC offset, for example 2025-03-01T12:00:00Z."
        },
        "frame": {
          "type": "string",
          "description": "Frame of position_km/velocity_km_s.",
          "enum": [
            "gcrf",
            "itrf",
            "teme"
          ]
        },
        "position_km": {
          "type": "array",
          "items": {
            "type": "number"
          }
        },
        "velocity_km_s": {
          "type": "array",
          "items": {
            "type": "number"
          }
        },
        "a_km": {
          "type": "number"
        },
        "e": {
          "type": "number"
        },
        "i_deg": {
          "type": "number"
        },
        "raan_deg": {
          "type": "number"
        },
        "argp_deg": {
          "type": "number"
        },
        "true_anomaly_deg": {
          "type": "number"
        },
        "mean_anomaly_deg": {
          "type": "number"
        }
      },
      "required": [
        "kind"
      ]
    },
    "method": {
      "type": "string",
      "description": "sgp4 (TLE/OMM sources only; standard for catalog element sets), numerical (RKF7(8) special perturbations with the forces field), or two-body (Keplerian).",
      "enum": [
        "sgp4",
        "numerical",
        "two-body"
      ]
    },
    "station": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "lat_deg": {
          "type": "number"
        },
        "lon_deg": {
          "type": "number"
        },
        "alt_km": {
          "type": "number"
        }
      },
      "required": [
        "lat_deg",
        "lon_deg",
        "alt_km"
      ]
    },
    "start": {
      "type": "string",
      "description": "ISO 8601 date-time with Z or a UTC offset, for example 2025-03-01T12:00:00Z."
    },
    "end": {
      "type": "string",
      "description": "ISO 8601 date-time with Z or a UTC offset, for example 2025-03-01T12:00:00Z."
    },
    "min_elevation_deg": {
      "type": "number"
    },
    "step_s": {
      "type": "number"
    },
    "forces": {
      "type": "object",
      "description": "Numerical force model. Defaults: zonal_degree 2 (J2), no drag, no radiation pressure, no third bodies.",
      "additionalProperties": false,
      "properties": {
        "zonal_degree": {
          "type": "integer",
          "description": "Highest zonal harmonic, 0 (point mass) to 6 (J2–J6)."
        },
        "drag": {
          "type": "object",
          "description": "Exponential-atmosphere drag.",
          "additionalProperties": false,
          "properties": {
            "cd": {
              "type": "number"
            },
            "area_m2": {
              "type": "number"
            },
            "mass_kg": {
              "type": "number"
            }
          },
          "required": [
            "cd",
            "area_m2",
            "mass_kg"
          ]
        },
        "srp": {
          "type": "object",
          "description": "Cannonball solar radiation pressure with conical Earth shadow.",
          "additionalProperties": false,
          "properties": {
            "cr": {
              "type": "number"
            },
            "area_m2": {
              "type": "number"
            },
            "mass_kg": {
              "type": "number"
            }
          },
          "required": [
            "cr",
            "area_m2",
            "mass_kg"
          ]
        },
        "sun": {
          "type": "boolean",
          "description": "Solar third-body gravity."
        },
        "moon": {
          "type": "boolean",
          "description": "Lunar third-body gravity."
        }
      }
    }
  },
  "required": [
    "source",
    "method",
    "station",
    "start",
    "end"
  ]
}
```

来源：[`packages/aerospace/tool-astrodynamics/src/index.ts`](../packages/aerospace/tool-astrodynamics/src/index.ts)

### `orbit_propagate`

外推轨道并返回星历。TLE/OMM 编目根数使用 method=sgp4（对这类根数唯一物理一致的模型），状态或根数的精密特殊摄动外推使用 numerical 并配合 forces 字段（J2–J6 带谐项、大气阻力、太阳光压、日月引力），开普勒运动使用 two-body。给出 times（显式 ISO 时刻），或给出 start、end 与 step_s。output_frame 选择 gcrf（J2000 惯性系，默认）、itrf（地固系）、teme（SGP4 坐标系）或 geodetic（WGS-84 纬度、经度、高度）。距离单位为 km，速度为 km/s，角度为度。

```json
{
  "type": "object",
  "properties": {
    "source": {
      "type": "object",
      "description": "Orbit to use. kind=tle needs line1/line2; kind=omm needs omm (CCSDS OMM JSON keywords as served by CelesTrak); kind=state needs epoch, frame, position_km, velocity_km_s; kind=elements needs epoch, a_km, e, i_deg, raan_deg, argp_deg, and exactly one of true_anomaly_deg or mean_anomaly_deg (GCRF/J2000).",
      "additionalProperties": false,
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "tle",
            "omm",
            "state",
            "elements"
          ]
        },
        "line1": {
          "type": "string"
        },
        "line2": {
          "type": "string"
        },
        "omm": {},
        "epoch": {
          "type": "string",
          "description": "ISO 8601 date-time with Z or a UTC offset, for example 2025-03-01T12:00:00Z."
        },
        "frame": {
          "type": "string",
          "description": "Frame of position_km/velocity_km_s.",
          "enum": [
            "gcrf",
            "itrf",
            "teme"
          ]
        },
        "position_km": {
          "type": "array",
          "items": {
            "type": "number"
          }
        },
        "velocity_km_s": {
          "type": "array",
          "items": {
            "type": "number"
          }
        },
        "a_km": {
          "type": "number"
        },
        "e": {
          "type": "number"
        },
        "i_deg": {
          "type": "number"
        },
        "raan_deg": {
          "type": "number"
        },
        "argp_deg": {
          "type": "number"
        },
        "true_anomaly_deg": {
          "type": "number"
        },
        "mean_anomaly_deg": {
          "type": "number"
        }
      },
      "required": [
        "kind"
      ]
    },
    "method": {
      "type": "string",
      "description": "sgp4 (TLE/OMM sources only; standard for catalog element sets), numerical (RKF7(8) special perturbations with the forces field), or two-body (Keplerian).",
      "enum": [
        "sgp4",
        "numerical",
        "two-body"
      ]
    },
    "times": {
      "type": "array",
      "description": "Explicit output instants.",
      "items": {
        "type": "string",
        "description": "ISO 8601 date-time with Z or a UTC offset, for example 2025-03-01T12:00:00Z."
      }
    },
    "start": {
      "type": "string",
      "description": "ISO 8601 date-time with Z or a UTC offset, for example 2025-03-01T12:00:00Z."
    },
    "end": {
      "type": "string",
      "description": "ISO 8601 date-time with Z or a UTC offset, for example 2025-03-01T12:00:00Z."
    },
    "step_s": {
      "type": "number",
      "description": "Grid step in seconds."
    },
    "output_frame": {
      "type": "string",
      "enum": [
        "gcrf",
        "itrf",
        "teme",
        "geodetic"
      ]
    },
    "forces": {
      "type": "object",
      "description": "Numerical force model. Defaults: zonal_degree 2 (J2), no drag, no radiation pressure, no third bodies.",
      "additionalProperties": false,
      "properties": {
        "zonal_degree": {
          "type": "integer",
          "description": "Highest zonal harmonic, 0 (point mass) to 6 (J2–J6)."
        },
        "drag": {
          "type": "object",
          "description": "Exponential-atmosphere drag.",
          "additionalProperties": false,
          "properties": {
            "cd": {
              "type": "number"
            },
            "area_m2": {
              "type": "number"
            },
            "mass_kg": {
              "type": "number"
            }
          },
          "required": [
            "cd",
            "area_m2",
            "mass_kg"
          ]
        },
        "srp": {
          "type": "object",
          "description": "Cannonball solar radiation pressure with conical Earth shadow.",
          "additionalProperties": false,
          "properties": {
            "cr": {
              "type": "number"
            },
            "area_m2": {
              "type": "number"
            },
            "mass_kg": {
              "type": "number"
            }
          },
          "required": [
            "cr",
            "area_m2",
            "mass_kg"
          ]
        },
        "sun": {
          "type": "boolean",
          "description": "Solar third-body gravity."
        },
        "moon": {
          "type": "boolean",
          "description": "Lunar third-body gravity."
        }
      }
    },
    "eop": {
      "type": "object",
      "description": "Optional IERS Bulletin A values; omit for UT1=UTC and no polar motion (≈15 m and ≈0.4 km/s·ΔUT1 errors).",
      "additionalProperties": false,
      "properties": {
        "dut1_s": {
          "type": "number"
        },
        "xp_arcsec": {
          "type": "number"
        },
        "yp_arcsec": {
          "type": "number"
        }
      }
    }
  },
  "required": [
    "source",
    "method"
  ]
}
```

来源：[`packages/aerospace/tool-astrodynamics/src/index.ts`](../packages/aerospace/tool-astrodynamics/src/index.ts)

### `orbit_transfer`

设计脉冲转移。mode=lambert 求解从位置 r1_km 到位置 r2_km、飞行时间 tof_s 的两点边值问题（Izzo 2015），返回 max_revolutions 以内的所有零圈与多圈弧段；给出 v1_km_s 和/或 v2_km_s（当前与目标速度）即可得到出发/到达 Δv。mode=hohmann 与 mode=bi-elliptic 计算从 radius1_km 到 radius2_km 的共面圆轨道间转移代价（bi-elliptic 还需要中间远拱点半径 rb_km）。mode=plane-change 计算在 speed_km_s 速度下改变 delta_inclination_deg 倾角的代价。mu_km3_s2 默认为地球（398600.4418）。

```json
{
  "type": "object",
  "properties": {
    "mode": {
      "type": "string",
      "enum": [
        "lambert",
        "hohmann",
        "bi-elliptic",
        "plane-change"
      ]
    },
    "r1_km": {
      "type": "array",
      "description": "lambert: departure position [x,y,z].",
      "items": {
        "type": "number"
      }
    },
    "r2_km": {
      "type": "array",
      "description": "lambert: arrival position [x,y,z].",
      "items": {
        "type": "number"
      }
    },
    "radius1_km": {
      "type": "number",
      "description": "hohmann/bi-elliptic: initial circular-orbit radius."
    },
    "radius2_km": {
      "type": "number",
      "description": "hohmann/bi-elliptic: final circular-orbit radius."
    },
    "tof_s": {
      "type": "number"
    },
    "prograde": {
      "type": "boolean",
      "description": "lambert: transfer direction about +z (default true)."
    },
    "max_revolutions": {
      "type": "integer",
      "description": "lambert: largest revolution count (default 0)."
    },
    "v1_km_s": {
      "type": "array",
      "items": {
        "type": "number"
      }
    },
    "v2_km_s": {
      "type": "array",
      "items": {
        "type": "number"
      }
    },
    "rb_km": {
      "type": "number"
    },
    "speed_km_s": {
      "type": "number"
    },
    "delta_inclination_deg": {
      "type": "number"
    },
    "mu_km3_s2": {
      "type": "number"
    }
  },
  "required": [
    "mode"
  ]
}
```

来源：[`packages/aerospace/tool-astrodynamics/src/index.ts`](../packages/aerospace/tool-astrodynamics/src/index.ts)

随可选的 `@astro-one/aerospace` bundle 发布，插件管理器默认将其关闭。所有 Config 上限都是必填项；本目录使用 bundle 中的值，这些上限只出现在失败消息中，不出现在 schema 中。


<a id="astro-onetool-gnss"></a>

## `@astro-one/tool-gnss`

### `gnss_position`

由工作区中的 RINEX 3 文件计算接收机位置。mode=spp（默认）基于单频伪距（GPS L1 C/A、Galileo E1、BeiDou B1I）进行单点定位，采用 Klobuchar 与 Saastamoinen 改正、分星座钟差和 RAIM 故障排除。mode=rtk 相对基准站进行短基线载波相位 RTK（需要 base_obs_path 与已测定的 ECEF base_position_m；流动站与基准站必须有共同历元），当 ratio 检验达到 ratio_threshold（默认 3）时接受 LAMBDA 整周模糊度固定。返回平均位置、东/北/天离散度、固定率、DOP、RAIM 排除项以及逐历元行（历元很多时仅返回最前面的历元）。

```json
{
  "type": "object",
  "properties": {
    "rover_obs_path": {
      "type": "string",
      "description": "RINEX 3 observation file of the receiver to position."
    },
    "nav_path": {
      "type": "string",
      "description": "RINEX 3 navigation file (mixed or per-constellation)."
    },
    "mode": {
      "type": "string",
      "enum": [
        "spp",
        "rtk"
      ]
    },
    "base_obs_path": {
      "type": "string"
    },
    "base_position_m": {
      "type": "array",
      "items": {
        "type": "number"
      }
    },
    "rtk_mode": {
      "type": "string",
      "description": "kinematic (default) re-estimates the rover every epoch.",
      "enum": [
        "kinematic",
        "static"
      ]
    },
    "systems": {
      "type": "array",
      "description": "Constellations to use (default all three).",
      "items": {
        "type": "string",
        "enum": [
          "gps",
          "galileo",
          "beidou"
        ]
      }
    },
    "elevation_mask_deg": {
      "type": "number"
    },
    "code_sigma_m": {
      "type": "number",
      "description": "Zenith code sigma (default 0.3 m)."
    },
    "phase_sigma_m": {
      "type": "number",
      "description": "Zenith phase sigma for RTK (default 0.003 m)."
    },
    "ratio_threshold": {
      "type": "number"
    },
    "raim": {
      "type": "boolean",
      "description": "Fault detection and exclusion (default true)."
    }
  },
  "required": [
    "rover_obs_path",
    "nav_path"
  ]
}
```

来源：[`packages/aerospace/tool-gnss/src/index.ts`](../packages/aerospace/tool-gnss/src/index.ts)

### `gnss_visibility`

由 RINEX 3 导航文件规划 GNSS 观测：针对一个测站和时间窗口，在每个 step_s（默认 600）列出高于 elevation_mask_deg（默认 10）的卫星及其方位角/仰角，以及可见几何的 GDOP/PDOP/HDOP/VDOP。

```json
{
  "type": "object",
  "properties": {
    "nav_path": {
      "type": "string"
    },
    "station": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "lat_deg": {
          "type": "number"
        },
        "lon_deg": {
          "type": "number"
        },
        "alt_m": {
          "type": "number"
        }
      },
      "required": [
        "lat_deg",
        "lon_deg",
        "alt_m"
      ]
    },
    "start": {
      "type": "string",
      "description": "ISO 8601 UTC instant."
    },
    "end": {
      "type": "string"
    },
    "step_s": {
      "type": "number"
    },
    "elevation_mask_deg": {
      "type": "number"
    },
    "systems": {
      "type": "array",
      "description": "Constellations to use (default all three).",
      "items": {
        "type": "string",
        "enum": [
          "gps",
          "galileo",
          "beidou"
        ]
      }
    }
  },
  "required": [
    "nav_path",
    "station",
    "start",
    "end"
  ]
}
```

来源：[`packages/aerospace/tool-gnss/src/index.ts`](../packages/aerospace/tool-gnss/src/index.ts)

随可选的 `@astro-one/aerospace` bundle 发布。两个工具都通过 ctx.fs 读取相对于调用会话工作区的 RINEX 3 文件。


<a id="astro-onetool-remote-sensing"></a>

## `@astro-one/tool-remote-sensing`

### `rs_change_detect`

检测同一网格上两幅已配准影像之间的变化。method=cva（变化矢量分析）使用 bands 中各角色反射率差的欧氏模；method=index 使用光谱指数差的绝对值（例如用 nbr 评估火烧程度、用 ndvi 评估植被损失），并报告带符号的平均变化。除非给出 threshold，变化阈值采用 Otsu 自动阈值。返回变化比例与面积，以及最大的连通变化区域（8 连通，至少 min_region_pixels）及其像素与地图边界框。

```json
{
  "type": "object",
  "properties": {
    "before_path": {
      "type": "string"
    },
    "after_path": {
      "type": "string"
    },
    "method": {
      "type": "string",
      "enum": [
        "cva",
        "index"
      ]
    },
    "index": {
      "type": "string",
      "enum": [
        "ndvi",
        "ndwi",
        "mndwi",
        "ndbi",
        "nbr",
        "ndre",
        "ndsi",
        "evi",
        "savi"
      ]
    },
    "bands": {
      "type": "object",
      "description": "One-based band number of each spectral role in the file, for example {\"red\": 4, \"nir\": 8}.",
      "additionalProperties": false,
      "properties": {
        "blue": {
          "type": "integer"
        },
        "green": {
          "type": "integer"
        },
        "red": {
          "type": "integer"
        },
        "rededge": {
          "type": "integer"
        },
        "nir": {
          "type": "integer"
        },
        "swir1": {
          "type": "integer"
        },
        "swir2": {
          "type": "integer"
        }
      }
    },
    "scale": {
      "type": "number",
      "description": "Reflectance = DN × scale + offset (for example 0.0001 for Sentinel-2 L2A, 2.75e-5 for Landsat C2 L2)."
    },
    "offset": {
      "type": "number",
      "description": "Reflectance offset (for example -0.1 for Sentinel-2 L2A baseline 04.00+, -0.2 for Landsat C2 L2)."
    },
    "threshold": {
      "type": "number"
    },
    "min_region_pixels": {
      "type": "integer",
      "description": "Smallest reported region (default 10)."
    }
  },
  "required": [
    "before_path",
    "after_path",
    "method",
    "bands"
  ]
}
```

来源：[`packages/aerospace/tool-remote-sensing/src/index.ts`](../packages/aerospace/tool-remote-sensing/src/index.ts)

### `rs_spectral_index`

对多光谱影像计算光谱指数并汇总：ndvi（植被）、ndwi（开阔水体，McFeeters）、mndwi（水体，Xu）、ndbi（建成区）、nbr（火烧）、ndre（红边叶绿素）、ndsi（积雪）、evi 与 savi（土壤调节植被）。在 bands 中把每个所需波段角色映射到从 1 开始的波段号（对于每个文件一个波段的产品，还要在 band_paths 中给出文件）。返回计数、均值、标准差、最小值、最大值、百分位数、[-1, 1] 区间上的直方图、可选的 class_breaks 区间面积比例以及地理参考。无数据像素会被排除。

```json
{
  "type": "object",
  "properties": {
    "index": {
      "type": "string",
      "enum": [
        "ndvi",
        "ndwi",
        "mndwi",
        "ndbi",
        "nbr",
        "ndre",
        "ndsi",
        "evi",
        "savi"
      ]
    },
    "path": {
      "type": "string",
      "description": "Raster file (GeoTIFF/COG, PNG, JPEG)."
    },
    "bands": {
      "type": "object",
      "description": "One-based band number of each spectral role in the file, for example {\"red\": 4, \"nir\": 8}.",
      "additionalProperties": false,
      "properties": {
        "blue": {
          "type": "integer"
        },
        "green": {
          "type": "integer"
        },
        "red": {
          "type": "integer"
        },
        "rededge": {
          "type": "integer"
        },
        "nir": {
          "type": "integer"
        },
        "swir1": {
          "type": "integer"
        },
        "swir2": {
          "type": "integer"
        }
      }
    },
    "band_paths": {
      "type": "object",
      "description": "Per-role file paths for products delivered one band per file (Landsat, Sentinel-2 as GeoTIFF); a role listed here reads band 1 of that file unless bands names another.",
      "additionalProperties": false,
      "properties": {
        "blue": {
          "type": "string"
        },
        "green": {
          "type": "string"
        },
        "red": {
          "type": "string"
        },
        "rededge": {
          "type": "string"
        },
        "nir": {
          "type": "string"
        },
        "swir1": {
          "type": "string"
        },
        "swir2": {
          "type": "string"
        }
      }
    },
    "scale": {
      "type": "number",
      "description": "Reflectance = DN × scale + offset (for example 0.0001 for Sentinel-2 L2A, 2.75e-5 for Landsat C2 L2)."
    },
    "offset": {
      "type": "number",
      "description": "Reflectance offset (for example -0.1 for Sentinel-2 L2A baseline 04.00+, -0.2 for Landsat C2 L2)."
    },
    "class_breaks": {
      "type": "array",
      "description": "Ascending thresholds; fractions are reported for each interval between consecutive breaks plus the open ends.",
      "items": {
        "type": "number"
      }
    },
    "histogram_bins": {
      "type": "integer",
      "description": "Histogram bins over [-1, 1] (default 20)."
    }
  },
  "required": [
    "index"
  ]
}
```

来源：[`packages/aerospace/tool-remote-sensing/src/index.ts`](../packages/aerospace/tool-remote-sensing/src/index.ts)

随可选的 `@astro-one/aerospace` bundle 发布且不带检测器，因此本页展示 rs_spectral_index 与 rs_change_detect。配置了 `detector` 的部署还会获得 rs_detect_objects，其描述会列出配置的类别名称。


<a id="astro-onetool-todo"></a>

## `@astro-one/tool-todo`

### `todo_write`

记录并更新当前工作的结构化任务列表。每次调用都要发送**完整列表**，它会**替换**之前的列表，不支持局部更新或逐项编辑。请用它规划多步骤工作并展示进度：开始前为每个具体步骤添加一项 todo。将当前正在处理的每项 todo 标记为 `in_progress`；确实并行运行时（例如并发 subagent 或后台命令）可同时标记多项，顺序工作则标记 1 项。只要工作尚未完成，就应至少有一项任务为 `in_progress`。某项 todo 完成后立即标记为 `completed`，不要批量标记完成；只有全部工作完成后，才可以没有 `in_progress` 项。简单的单步骤任务无需使用列表。状态：`pending`（未开始）、`in_progress`（正在处理）、`completed`（已完成）。

```json
{
  "type": "object",
  "properties": {
    "todos": {
      "type": "array",
      "description": "The COMPLETE task list, replacing any previous list.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "content": {
            "type": "string",
            "description": "What the task is — a short imperative line."
          },
          "status": {
            "type": "string",
            "description": "pending (not started) | in_progress (now) | completed (done).",
            "enum": [
              "pending",
              "in_progress",
              "completed"
            ]
          }
        },
        "required": [
          "content",
          "status"
        ]
      }
    }
  },
  "required": [
    "todos"
  ]
}
```

来源：[`packages/todo/tool-todo/src/index.ts`](../packages/todo/tool-todo/src/index.ts)

todo_write 是会话所有的状态；UI 将最新的 todo/write 事件渲染为检查清单。`allowParallelInProgress` 是没有默认值的必填项，因此本目录明确选择 `true`，对应描述允许同时存在多个 `in_progress` 项。选择 `false` 的部署会获得同一工具，但描述会要求只能有 1 个活动任务。

<a id="astro-onetool-workflow"></a>

## `@astro-one/tool-workflow`

### `workflow`

运行用于大规模编排 subagent 的 JavaScript 工作流脚本。当工作会分散到许多相互独立的部分时，请使用此工具，例如审查大量文件、执行迁移、开展多角度研究或对发现进行对抗式验证；此时应将编排写成脚本，而不是逐轮委派。

工作流的身份通过 `meta` 参数以 JSON 形式传入：必填的 `name`（简短 kebab-case）和 `description` 字符串，以及可选的 `whenToUse` 字符串和 `phases` 数组（`{title, detail?, provider?, model?}`）。`script` 参数只能是纯 JavaScript **函数体**，不能是 TypeScript，也不能包含 `export const meta` 语句；meta 是参数而非代码。脚本支持顶层 await；请以 `return <value>` 结尾，该值必须可以 JSON 序列化，并作为此工具的结果。

脚本函数体提供以下钩子：

- `agent(prompt, opts?): Promise<any>`：运行一个 subagent 直至完成。不提供 `opts.schema` 时，解析为子级最终文本；提供 `opts.schema` 时，它必须是以对象为根、且**只能**使用 type/properties/required/additionalProperties/items/enum/const/oneOf 的 JSON Schema，不支持 pattern/format/数值边界，此时解析为通过校验的对象。子级失败时解析为 `null`，可使用 `.filter(Boolean)` 过滤。其他选项包括 `label`（显示名称）、`phase`（进度组），以及相互独立的 `provider`／`model` LLM（大语言模型）目标覆盖项，两者可单独提供。其他任何选项（`effort`／`isolation`／`agentType`）都会明确报错。
- `pipeline(items, ...stages): Promise<any[]>`：让每个条目分别经过各阶段，阶段之间**没有**屏障；多阶段工作优先使用它。每个阶段接收 `(prev, item, index)`。普通的阶段异常会将该**条目**变为 `null`，并跳过它的剩余阶段。
- `parallel(thunks): Promise<any[]>`：并发运行零参数函数并等待**全部**完成。它会形成屏障，仅当某个阶段确实需要汇总全部先前结果时使用。抛出异常的 thunk 解析为 `null`。
- `phase(title)`：开始一个进度阶段；`log(message)`：说明进度；`args`：工具调用的 `args` 输入，原样提供。

如果误用钩子（参数错误、未知选项、不受支持的 schema、触发上限），抛出的错误**总会**终止脚本，绝不会退化为单个条目的 `null`。

约束：并发上限和 agent 总数上限均会生效；不提供文件系统、网络、定时器或 Node.js API。具体工作由 agent 完成，脚本只负责编排。该运行默认在前台执行：整个脚本完成后，调用才会返回。长时间运行请设置 `run_in_background: true`：调用会立刻返回任务 id，运行在后台继续编排，其返回值随任务的完成播报送达（用 `job_output` 查看进展，用 `job_kill` 停止）。

```json
{
  "type": "object",
  "properties": {
    "script": {
      "type": "string",
      "description": "The plain-JS workflow script body (top-level await allowed; NO `export const meta` statement; end with `return <json-value>`)."
    },
    "meta": {
      "type": "object",
      "description": "The workflow identity block (plain JSON — never code).",
      "additionalProperties": true,
      "properties": {
        "name": {
          "type": "string",
          "description": "Short kebab-case workflow name."
        },
        "description": {
          "type": "string",
          "description": "One-line description of what the workflow does."
        },
        "whenToUse": {
          "type": "string",
          "description": "Optional guidance on when this workflow applies."
        },
        "phases": {
          "type": "array",
          "description": "Optional phase declarations matched by phase() calls.",
          "items": {
            "type": "object",
            "additionalProperties": true,
            "properties": {
              "title": {
                "type": "string",
                "description": "The phase title phase() calls match by exact string."
              },
              "detail": {
                "type": "string",
                "description": "Optional one-line description of the phase."
              },
              "provider": {
                "type": "string",
                "description": "Optional provider override this phase is expected to use."
              },
              "model": {
                "type": "string",
                "description": "Optional model override this phase is expected to use."
              }
            },
            "required": [
              "title"
            ]
          }
        }
      },
      "required": [
        "name",
        "description"
      ]
    },
    "args": {
      "type": "object",
      "description": "Optional JSON input exposed to the script as the `args` global (wrap a bare list as a field, e.g. {\"files\": [...]}).",
      "additionalProperties": true
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run as a background job: return a job id immediately instead of waiting; the return value arrives with the completion notice."
    }
  },
  "required": [
    "script",
    "meta"
  ]
}
```

来源：[`packages/workflow/tool-workflow/src/index.ts`](../packages/workflow/tool-workflow/src/index.ts)

<a id="astro-onetool-workspace-dependencies"></a>

## `@astro-one/tool-workspace-dependencies`

### `load_workspace_dependencies`

获取随包附带的 Python 和库目录的绝对路径，以及随包 Python 发行版的版本。payload 提供 Node.js 和 pnpm 时才返回对应路径。Python 含 numpy、pandas、python-docx、python-pptx、openpyxl、Pillow、lxml 与 XlsxWriter。除非用户或工作区指令选择了别的环境，Office 文件请使用这些库。返回 Node.js 和 pnpm 路径时，用该 Node 可执行文件和 pnpm 脚本路径运行 pnpm。本工具不改 PATH，也不改包管理器设置。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/skill/tool-workspace-dependencies/src/index.ts`](../packages/skill/tool-workspace-dependencies/src/index.ts)

<a id="astro-onetool-web"></a>

## `@astro-one/tool-web`

### `web_fetch`

获取指定 HTTP(S) URL 的内容，并将其解码为文本后返回。

```json
{
  "type": "object",
  "properties": {
    "url": {
      "type": "string",
      "description": "The HTTP(S) URL to fetch."
    }
  },
  "required": [
    "url"
  ]
}
```

来源：[`packages/web/tool-web/src/index.ts`](../packages/web/tool-web/src/index.ts)

### `web_search`

在 Web 上搜索最新信息。在必填的 `queries` 数组中提供 1–4 个查询。返回可选的摘要答案和来源 URL 列表。

```json
{
  "type": "object",
  "properties": {
    "queries": {
      "type": "array",
      "description": "Required search queries; accepts 1–4 items and merges their results.",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "queries"
  ]
}
```

来源：[`packages/web/tool-web/src/index.ts`](../packages/web/tool-web/src/index.ts)

web_search 和 web_fetch 将提供方选择置于 ctx.web 之后，使模型可见 schema 在更换后端时保持稳定。
