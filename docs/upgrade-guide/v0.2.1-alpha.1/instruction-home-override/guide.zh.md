---
kind: upgrade-guide
description: "`agent-instructions` 行不再接受 `astroOneHome`；指令加载始终从 `$ASTRO_ONE_HOME` 或 `~/.astro-one` 解析 harness home。"
---

# 指令加载只解析一个 harness home

[English](guide.md) | 中文

## 变更

`@astro-one/agent-instructions` 移除了 `astroOneHome` 配置字段。该插件通过 `@astro-one/home-paths` 的 `resolveAstroOneHome()` 解析 harness home，与 harness 其他消费方一致：`$ASTRO_ONE_HOME` 已设置且非空白时以它为准，否则使用 `~/.astro-one`，并展开波浪号。

`cordis.yml`、profile patch 或 `--patch` overlay 中 `agent-instructions` 行上残留的 `astroOneHome` 不再有任何效果：该行会保留这个多余键，插件忽略它，指令加载跟随进程 home。其他 provider（如 `astro-one-skill-filesystem`、`astro-one-shell-env`）保留各自的 home 字段；本次删除只覆盖指令加载器。

## 迁移

1. 从 `cordis.yml`、`$ASTRO_ONE_HOME/cordis.patch.yml`、`$ASTRO_ONE_HOME/profiles/<profile>/cordis.patch.yml` 以及任何 `--patch` overlay 的 `agent-instructions` 行中删除 `astroOneHome`。
2. 若该覆盖原本指向非默认 home，改为在进程中导出 `ASTRO_ONE_HOME`，让所有 harness 消费方读取同一个 home。
3. 用 `astro-one --profile <profile> --dump-config` 确认 `agent-instructions` 行只剩其余字段，并确认新会话的首次请求在该文件存在时显示 `Instructions from: $ASTRO_ONE_HOME/AGENTS.md`（或 `~/.astro-one/AGENTS.md`）。
