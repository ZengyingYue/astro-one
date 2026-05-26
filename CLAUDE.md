# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

astro-one is an ultra-lightweight aerospace AI assistant framework based on nanobot (from HKUDS). It provides core agent functionality with support for multiple LLM providers and chat channels.

## Common Commands

```bash
# Install
pip install -e .           # Development install
pip install -e ".[dev]"     # Install with dev dependencies

# Build
python -m build            # Build wheel and sdist

# Lint & Format
ruff check astro_one/      # Lint code
ruff format astro_one/     # Format code

# Tests
pytest tests/              # Run all tests
pytest tests/test_commands.py   # Run specific test file
pytest tests/ -k "test_name"   # Run tests matching pattern

# CLI Commands
astroone onboard          # Initialize config and workspace
astroone agent -m "Hello" # Send message to agent
astroone agent            # Interactive chat mode
astroone agent --stream   # Interactive mode with streaming
astroone gateway          # Start gateway (connect to chat platforms)
astroone status           # Show status
astroone channels login   # Login to channels (e.g., WhatsApp)
astroone provider login   # Login to providers (e.g., OpenAI Codex)
```

## Branch Strategy

| Branch   | Purpose                    | Stability                |
|----------|----------------------------|--------------------------|
| `main`   | Stable releases            | Production-ready         |
| `nightly`| Experimental features      | May have bugs            |

- **Target `nightly`** for new features, refactoring, or API changes
- **Target `main`** for bug fixes, documentation, or minor tweaks

## Architecture

The project follows a modular architecture:

```
astro_one/
├── agent/           # Core AI agent logic
│   ├── loop.py     # Main agent loop (LLM ↔ tool execution)
│   ├── context.py  # Prompt builder
│   ├── memory.py   # Persistent memory with consolidation
│   ├── skills.py   # Skills loader
│   ├── subagent.py # Background task execution
│   └── tools/      # Built-in tools
├── channels/       # Chat platform integrations (Telegram, Discord, Feishu, Slack, QQ, WhatsApp, etc.)
├── providers/      # LLM providers via LiteLLM (OpenAI, Claude, Ollama, etc.)
├── bus/            # Message routing (pub/sub)
├── cron/           # Scheduled tasks
├── heartbeat/      # Periodic wake-up tasks
├── session/        # Conversation sessions with history
├── config/         # Configuration management
├── cli/            # CLI commands (Typer-based)
└── skills/         # Bundled skills (github, weather, tmux, cron, etc.)
```

### Core Flow

1. **Message arrives** via Channels (Telegram, Discord, Feishu, etc.) or CLI
2. **AgentLoop** receives message from MessageBus
3. **ContextBuilder** builds prompt from history, memory, skills
4. **LLM Provider** generates response (may request tool calls)
5. **ToolRegistry** executes tools (shell, filesystem, web, MCP, etc.)
6. **Response** sent back via MessageBus to channel

### Key Concepts

- **Providers**: LLM backends configured in `~/.astro_one/config.json` under `providers`. Use `provider: "ollama"` with `apiBase: "http://localhost:11434"` for local models.
- **Channels**: Chat platforms configured in `config.json` under `channels`. Enable by setting `enabled: true`.
- **Skills**: Extension modules in `astro_one/skills/` with `SKILL.md` containing YAML frontmatter and markdown instructions.
- **Tools**: Agent capabilities in `astro_one/agent/tools/`. Includes:
  - `shell` - Execute shell commands
  - `filesystem` - Read/write/list files
  - `web` - Web search and fetch
  - `mcp` - Model Context Protocol tools
  - `cron` - Schedule tasks
  - `message` - Send notifications (Feishu, DingTalk, Slack)
  - `mlf_tool` - Maneuver detection (orbital maneuvers)
  - `iod_tool` - Initial orbit determination
  - `orbin_tool` - Orbit prediction

### Configuration

- Config file: `~/.astro_one/config.json`
- Workspace: `~/.astro_one/workspace/`
- Templates: `astro_one/templates/` (SOUL.md, AGENTS.md, USER.md, HEARTBEAT.md, TOOLS.md)

## Code Style

- **Line length**: 100 characters
- **Python**: 3.11+
- **Linting**: `ruff` with rules E, F, I, N, W (E501 ignored)
- **Async**: uses `asyncio`; pytest with `asyncio_mode = "auto"`
- **Philosophy**: Simple, clear, decoupled, honest, durable

## Deployment

### Docker (Recommended)
```bash
docker compose up -d astro-one-gateway
```

### Multiple Instances
```bash
astroone onboard --config ~/.astro-one-telegram/config.json --workspace ~/.astro-one-telegram/workspace
astroone gateway --config ~/.astro-one-telegram/config.json
```

### Local Ollama Setup
```json
{
  "agents": { "defaults": { "model": "qwen3.5:27b", "provider": "ollama" } },
  "providers": { "ollama": { "apiBase": "http://localhost:11434" } }
}
```
