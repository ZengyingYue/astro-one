"""CLI commands for astro_one."""

import asyncio
from contextlib import contextmanager, nullcontext
from dataclasses import dataclass
import os
import re
import select
import signal
import sys
from pathlib import Path
from typing import Any

# Disable model cost map fetching before litellm is imported
os.environ["LITELLM_MODEL_COST_MAP"] = "false"

# Force UTF-8 encoding for Windows console
if sys.platform == "win32":
    os.environ["PYTHONIOENCODING"] = "utf-8"
    # Re-open stdout/stderr with UTF-8 encoding
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    # Also set ANSI mode for Windows
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
    except Exception:
        pass

import typer
from loguru import logger

# Remove default handler and re-add with unified astro_one format
logger.remove()
_log_handler_id = logger.add(
    sys.stderr,
    format=(
        "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
        "<level>{level: <5}</level> | "
        "<cyan>{extra[channel]}</cyan> | "
        "<level>{message}</level>"
    ),
    level="INFO",
    colorize=None,
    filter=lambda record: record["extra"].setdefault("channel", "-") or True,
)

from prompt_toolkit import print_formatted_text
from prompt_toolkit import PromptSession
from prompt_toolkit.formatted_text import ANSI, HTML
from prompt_toolkit.history import FileHistory
from prompt_toolkit.patch_stdout import patch_stdout
from prompt_toolkit.application import run_in_terminal
from rich.console import Console
from rich.markdown import Markdown
from rich.table import Table
from rich.text import Text

from astro_one import __logo__, __version__
from astro_one.agent.auto_space_scan import AutoSpaceScanService
from astro_one.cli.stream import StreamRenderer, ThinkingSpinner
from astro_one.config.loader import save_config
from astro_one.config.paths import get_workspace_path
from astro_one.config.schema import Config
from astro_one.utils.helpers import sync_workspace_templates

app = typer.Typer(
    name="astro_one",
    context_settings={"help_option_names": ["-h", "--help"]},
    help=f"{__logo__} astro_one - Personal AI Assistant",
    no_args_is_help=True,
)

console = Console(force_terminal=True)
EXIT_COMMANDS = {"exit", "quit", "/exit", "/quit", ":q"}
DEEPSEEK_V4_PRO_MODEL = "deepseek-v4-pro"
DEFAULT_SPACE_DATA_ROOT = Path.home() / "Desktop" / "astro_one" / "data"
DEFAULT_SPACE_SCAN_INTERVAL_S = 10.0
_REASONING_FLUSH_RE = re.compile(r"(?<!\d)(?<=[。！？.!?；;])\s+|\n{2,}")

# ---------------------------------------------------------------------------
# CLI input: prompt_toolkit for editing, paste, history, and display
# ---------------------------------------------------------------------------

_PROMPT_SESSION: PromptSession | None = None
_SAVED_TERM_ATTRS = None  # original termios settings, restored on exit


def _sanitize_surrogates(text: str) -> str:
    """Reconstruct surrogate pairs into real characters; replace lone surrogates."""
    return text.encode("utf-16-le", errors="surrogatepass").decode("utf-16-le", errors="replace")


class SafeFileHistory(FileHistory):
    """FileHistory subclass that sanitizes surrogate characters on write."""

    def store_string(self, string: str) -> None:
        super().store_string(_sanitize_surrogates(string))


def _flush_pending_tty_input() -> None:
    """Drop unread keypresses typed while the model was generating output."""
    try:
        fd = sys.stdin.fileno()
        if not os.isatty(fd):
            return
    except Exception:
        return

    try:
        import termios
        termios.tcflush(fd, termios.TCIFLUSH)
        return
    except Exception:
        pass

    try:
        while True:
            ready, _, _ = select.select([fd], [], [], 0)
            if not ready:
                break
            if not os.read(fd, 4096):
                break
    except Exception:
        return


def _restore_terminal() -> None:
    """Restore terminal to its original state (echo, line buffering, etc.)."""
    if _SAVED_TERM_ATTRS is None:
        return
    try:
        import termios
        termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, _SAVED_TERM_ATTRS)
    except Exception:
        pass


def _init_prompt_session() -> None:
    """Create the prompt_toolkit session with persistent file history."""
    global _PROMPT_SESSION, _SAVED_TERM_ATTRS

    # Save terminal state so we can restore it on exit
    try:
        import termios
        _SAVED_TERM_ATTRS = termios.tcgetattr(sys.stdin.fileno())
    except Exception:
        pass

    from astro_one.config.paths import get_cli_history_path

    history_file = get_cli_history_path()
    history_file.parent.mkdir(parents=True, exist_ok=True)

    _PROMPT_SESSION = PromptSession(
        history=SafeFileHistory(str(history_file)),
        enable_open_in_editor=False,
        multiline=False,   # Enter submits (single line mode)
    )


def _make_console() -> Console:
    return Console(file=sys.stdout)


def _render_interactive_ansi(render_fn) -> str:
    """Render Rich output to ANSI so prompt_toolkit can print it safely."""
    ansi_console = Console(
        force_terminal=True,
        color_system=console.color_system or "standard",
        width=console.width,
    )
    with ansi_console.capture() as capture:
        render_fn(ansi_console)
    return capture.get()


def _print_agent_response(response: str, render_markdown: bool, metadata: dict | None = None, show_header: bool = True) -> None:
    """Render assistant response with consistent terminal styling."""
    console_out = _make_console()
    content = response or ""
    body = _response_renderable(content, render_markdown, metadata)
    if show_header:
        console_out.print()
        console_out.print(f"[cyan]{__logo__} astro_one[/cyan]")
    console_out.print(body)
    console_out.print()


def _response_renderable(content: str, render_markdown: bool, metadata: dict | None = None):
    """Render plain-text command output without markdown collapsing newlines."""
    if not render_markdown:
        return Text(content)
    if (metadata or {}).get("render_as") == "text":
        return Text(content)
    return Markdown(content)


async def _print_interactive_line(text: str) -> None:
    """Print async interactive updates with prompt_toolkit-safe Rich styling."""
    def _write() -> None:
        ansi = _render_interactive_ansi(
            lambda c: c.print(f"  [dim]↳ {text}[/dim]")
        )
        print_formatted_text(ANSI(ansi), end="")

    await run_in_terminal(_write)


async def _print_interactive_response(response: str, render_markdown: bool, metadata: dict | None = None) -> None:
    """Print async interactive replies with prompt_toolkit-safe Rich styling."""
    def _write() -> None:
        content = response or ""
        ansi = _render_interactive_ansi(
            lambda c: (
                c.print(),
                c.print(f"[cyan]{__logo__} astro_one[/cyan]"),
                c.print(_response_renderable(content, render_markdown, metadata)),
                c.print(),
            )
        )
        print_formatted_text(ANSI(ansi), end="")

    await run_in_terminal(_write)


def _streamed_final_fallback(
    content: str,
    metadata: dict | None,
    renderer: StreamRenderer | None,
) -> tuple[str, dict] | None:
    """Return final content to print when a streamed turn produced no answer deltas."""
    if not content or not (metadata or {}).get("_streamed"):
        return None
    if renderer is not None and renderer.streamed:
        return None
    clean_meta = dict(metadata or {})
    clean_meta.pop("_streamed", None)
    return content, clean_meta


class ReasoningProgressBuffer:
    """Collect small reasoning deltas and print readable sentence-sized chunks."""

    def __init__(
        self,
        printer,
        thinking: ThinkingSpinner | None = None,
        renderer: StreamRenderer | None = None,
    ) -> None:
        self._printer = printer
        self._thinking = thinking
        self._renderer = renderer
        self._buffer = ""
        self._started = False

    @staticmethod
    def _normalize(text: str) -> str:
        return re.sub(r"\s+", " ", text).strip()

    def is_bound_to(self, renderer: StreamRenderer | None) -> bool:
        return self._renderer is renderer

    async def feed(self, text: str) -> None:
        if not text:
            return
        self._buffer += text
        parts = _REASONING_FLUSH_RE.split(self._buffer)
        if len(parts) <= 1 and len(self._normalize(self._buffer)) < 90:
            return
        for part in parts[:-1]:
            await self.flush(part)
        self._buffer = parts[-1]

    async def flush(self, text: str | None = None) -> None:
        chunk = self._normalize(self._buffer if text is None else text)
        if text is None:
            self._buffer = ""
        if not chunk:
            return
        if not self._started:
            self._started = True
            await self._printer("思考：", self._thinking, self._renderer)
        await self._printer(chunk, self._thinking, self._renderer)


def _print_cli_progress_line(text: str, thinking: ThinkingSpinner | None, renderer: StreamRenderer | None = None) -> None:
    """Print a CLI progress line, pausing the spinner if needed."""
    if not text.strip():
        return
    target = renderer.console if renderer else console
    pause = renderer.pause_spinner() if renderer else (thinking.pause() if thinking else nullcontext())
    with pause:
        if renderer:
            renderer.ensure_header()
        target.print(f"  [dim]↳ {text}[/dim]")


async def _print_interactive_progress_line(text: str, thinking: ThinkingSpinner | None, renderer: StreamRenderer | None = None) -> None:
    """Print an interactive progress line, pausing the spinner if needed."""
    if not text.strip():
        return
    if renderer:
        with renderer.pause_spinner():
            renderer.ensure_header()
            renderer.console.print(f"  [dim]↳ {text}[/dim]")
    else:
        with thinking.pause() if thinking else nullcontext():
            await _print_interactive_line(text)


async def _print_cli_progress_line_async(
    text: str,
    thinking: ThinkingSpinner | None,
    renderer: StreamRenderer | None = None,
) -> None:
    _print_cli_progress_line(text, thinking, renderer)


def _is_exit_command(command: str) -> bool:
    """Return True when input should end interactive chat."""
    return command.lower() in EXIT_COMMANDS


async def _read_interactive_input_async() -> str:
    """Read user input using prompt_toolkit (handles paste, history, display).

    prompt_toolkit natively handles:
    - Multiline paste (bracketed paste mode)
    - History navigation (up/down arrows)
    - Clean display (no ghost characters or artifacts)
    """
    if _PROMPT_SESSION is None:
        raise RuntimeError("Call _init_prompt_session() first")
    try:
        with patch_stdout():
            return await _PROMPT_SESSION.prompt_async(
                HTML("<b fg='ansiblue'>你：</b> "),
            )
    except EOFError as exc:
        raise KeyboardInterrupt from exc


def version_callback(value: bool):
    if value:
        console.print(f"{__logo__} astro_one v{__version__}")
        raise typer.Exit()


@app.callback()
def main(
    version: bool = typer.Option(
        None, "--version", "-v", callback=version_callback, is_eager=True
    ),
):
    """astro_one - Personal AI Assistant."""
    pass


# ============================================================================
# Onboard / Setup
# ============================================================================


@app.command()
def onboard(
    workspace: str | None = typer.Option(None, "--workspace", "-w", help="Workspace directory"),
    config: str | None = typer.Option(None, "--config", "-c", help="Path to config file"),
    wizard: bool = typer.Option(False, "--wizard", help="Use interactive configuration wizard"),
):
    """Initialize astro_one configuration and workspace."""
    from astro_one.config.loader import get_config_path, load_config, save_config, set_config_path
    from astro_one.config.schema import Config

    if config:
        config_path = Path(config).expanduser().resolve()
        set_config_path(config_path)
        console.print(f"[dim]正在使用配置：{config_path}[/dim]")
    else:
        config_path = get_config_path()

    def _apply_workspace_override(loaded: Config) -> Config:
        if workspace:
            loaded.agents.defaults.workspace = workspace
        return loaded

    # Create or update config
    if config_path.exists():
        if wizard:
            config = _apply_workspace_override(load_config(config_path))
        else:
            console.print(f"[yellow]配置已存在于 {config_path}[/yellow]")
            console.print("  [bold]y[/bold] = 覆盖为默认值（现有值将丢失）")
            console.print("  [bold]N[/bold] = 刷新配置，保留现有值并添加新字段")
            if typer.confirm("覆盖？"):
                config = _apply_workspace_override(Config())
                save_config(config, config_path)
                console.print(f"[green]✓[/green] 配置已重置为默认值：{config_path}")
            else:
                config = _apply_workspace_override(load_config(config_path))
                save_config(config, config_path)
                console.print(f"[green]✓[/green] 配置已刷新：{config_path}（保留现有值）")
    else:
        config = _apply_workspace_override(Config())
        if not wizard:
            save_config(config, config_path)
            console.print(f"[green]✓[/green] 已创建配置：{config_path}")

    # Run interactive wizard if enabled
    if wizard:
        from astro_one.cli.onboard import run_onboard

        try:
            result = run_onboard(initial_config=config)
            if not result.should_save:
                console.print("[yellow]配置已取消，未保存任何更改。[/yellow]")
                return

            config = result.config
            save_config(config, config_path)
            console.print(f"[green]✓[/green] 配置已保存至：{config_path}")
        except Exception as e:
            console.print(f"[red]✗[/red] 配置过程中出错：{e}")
            console.print("[yellow]请重新运行 'astroone onboard' 完成设置。[/yellow]")
            raise typer.Exit(1)

    console.print("[dim]配置模板现使用 `maxTokens` + `contextWindowTokens`；`memoryWindow` 不再是运行时设置。[/dim]")

    _onboard_plugins(config_path)

    # Create workspace, preferring the configured workspace path.
    workspace_path = get_workspace_path(config.workspace_path)
    if not workspace_path.exists():
        workspace_path.mkdir(parents=True, exist_ok=True)
        console.print(f"[green]✓[/green] 已创建工作区：{workspace_path}")

    sync_workspace_templates(workspace_path)

    agent_cmd = 'astroone agent -m "Hello!"'
    gateway_cmd = "astroone gateway"
    if config:
        agent_cmd += f" --config {config_path}"
        gateway_cmd += f" --config {config_path}"

    console.print(f"\n{__logo__} astro_one 已就绪！")
    console.print("\n下一步：")
    if wizard:
        console.print(f"  1. 聊天：[cyan]{agent_cmd}[/cyan]")
        console.print(f"  2. 启动网关：[cyan]{gateway_cmd}[/cyan]")
    else:
        console.print(f"  1. 在 [cyan]{config_path}[/cyan] 中添加你的 API 密钥")
        console.print("     获取密钥：https://openrouter.ai/keys")
        console.print(f"  2. 聊天：[cyan]{agent_cmd}[/cyan]")
    console.print("\n[dim]想要 Telegram/WhatsApp？查看：https://github.com/HKUDS/astro_one#-chat-apps[/dim]")


def _merge_missing_defaults(existing: Any, defaults: Any) -> Any:
    """Recursively fill in missing values from defaults without overwriting user config."""
    if not isinstance(existing, dict) or not isinstance(defaults, dict):
        return existing

    merged = dict(existing)
    for key, value in defaults.items():
        if key not in merged:
            merged[key] = value
        else:
            merged[key] = _merge_missing_defaults(merged[key], value)
    return merged


def _onboard_plugins(config_path: Path) -> None:
    """Inject default config for all discovered channels (built-in + plugins)."""
    import json

    from astro_one.channels.registry import discover_all

    all_channels = discover_all()
    if not all_channels:
        return

    with open(config_path, encoding="utf-8") as f:
        data = json.load(f)

    channels = data.setdefault("channels", {})
    for name, cls in all_channels.items():
        if name not in channels:
            channels[name] = cls.default_config()
        else:
            channels[name] = _merge_missing_defaults(channels[name], cls.default_config())

    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _make_provider(config: Config):
    """Create the appropriate LLM provider from config."""
    from astro_one.providers.base import GenerationSettings
    from astro_one.providers.openai_codex_provider import OpenAICodexProvider
    from astro_one.providers.azure_openai_provider import AzureOpenAIProvider

    model = config.agents.defaults.model
    provider_name = config.get_provider_name(model)
    p = config.get_provider(model)

    # OpenAI Codex (OAuth)
    if provider_name == "openai_codex" or model.startswith("openai-codex/"):
        provider = OpenAICodexProvider(default_model=model)
    # Custom: direct OpenAI-compatible endpoint, bypasses LiteLLM
    elif provider_name == "custom":
        from astro_one.providers.custom_provider import CustomProvider
        provider = CustomProvider(
            api_key=p.api_key if p else "no-key",
            api_base=config.get_api_base(model) or "http://localhost:8000/v1",
            default_model=model,
            extra_headers=p.extra_headers if p else None,
        )
    # Azure OpenAI: direct Azure OpenAI endpoint with deployment name
    elif provider_name == "azure_openai":
        if not p or not p.api_key or not p.api_base:
            console.print("[red]错误：Azure OpenAI 需要 api_key 和 api_base[/red]")
            console.print("请在 ~/.astro-one/config.json 的 providers.azure_openai 区块中设置")
            console.print("使用 model 字段指定 deployment 名称。")
            raise typer.Exit(1)
        provider = AzureOpenAIProvider(
            api_key=p.api_key,
            api_base=p.api_base,
            default_model=model,
        )
    else:
        from astro_one.providers.litellm_provider import LiteLLMProvider
        from astro_one.providers.registry import find_by_name
        spec = find_by_name(provider_name)
        if not model.startswith("bedrock/") and not (p and p.api_key) and not (spec and (spec.is_oauth or spec.is_local)):
            console.print("[red]错误：未配置 API 密钥[/red]")
            console.print("请在 ~/.astro-one/config.json 的 providers 区块中设置")
            raise typer.Exit(1)
        provider = LiteLLMProvider(
            api_key=p.api_key if p else None,
            api_base=config.get_api_base(model),
            default_model=model,
            extra_headers=p.extra_headers if p else None,
            provider_name=provider_name,
        )

    defaults = config.agents.defaults
    provider.generation = GenerationSettings(
        temperature=defaults.temperature,
        max_tokens=defaults.max_tokens,
        reasoning_effort=defaults.reasoning_effort,
    )
    return provider


@dataclass
class ModelCommandResult:
    """Result returned by the live model switcher."""

    content: str
    provider: Any | None = None
    model: str | None = None


def _configured_secret(value: str | None) -> bool:
    """Return True when a provider key looks intentionally configured."""
    if not value:
        return False
    lowered = value.strip().lower()
    return lowered not in {"your_api_key", "your_deepseek_api_key", "sk-...", "placeholder"}


async def _list_ollama_models(api_base: str | None) -> list[str]:
    """List locally installed Ollama models via /api/tags."""
    import httpx

    base = (api_base or "http://127.0.0.1:11434").rstrip("/")
    async with httpx.AsyncClient(timeout=5.0, trust_env=False) as client:
        response = await client.get(f"{base}/api/tags")
        response.raise_for_status()
        data = response.json()
    models = data.get("models", [])
    names = [m.get("name") for m in models if isinstance(m, dict) and m.get("name")]
    return sorted(names)


def _make_model_switcher(config: Config):
    """Create a slash-command handler for listing and switching runtime models."""

    async def _switch(command: str) -> ModelCommandResult:
        raw = command.strip()
        parts = raw.split()
        action = parts[1].lower() if len(parts) > 1 else ""

        async def _ollama_listing() -> str:
            try:
                models = await _list_ollama_models(config.providers.ollama.api_base)
            except Exception as exc:
                return f"无法连接本地 Ollama：{exc}"
            if not models:
                return "本地 Ollama 暂未返回可用模型。"
            current = config.agents.defaults.model
            lines = []
            for name in models:
                marker = "（当前）" if (
                    config.agents.defaults.provider == "ollama" and name == current
                ) else ""
                lines.append(f"- {name}{marker}")
            return "\n".join(lines)

        if raw.lower() == "/models" or action in {"list", "ls"}:
            ollama_models = await _ollama_listing()
            return ModelCommandResult(
                content=(
                    "可切换模型：\n\n"
                    "在线：\n"
                    f"- DeepSeek V4 Pro: `{DEEPSEEK_V4_PRO_MODEL}`（命令：`/model deepseek`）\n\n"
                    "本地 Ollama：\n"
                    f"{ollama_models}\n\n"
                    "切换用法：`/model ollama <模型名>`"
                )
            )

        if raw.lower() == "/model" or action in {"current", "status"}:
            return ModelCommandResult(
                content=(
                    f"当前 provider：`{config.agents.defaults.provider}`\n"
                    f"当前模型：`{config.agents.defaults.model}`\n\n"
                    "可用命令：\n"
                    "- `/models` 查看在线和本地 Ollama 模型\n"
                    "- `/model deepseek` 切换到在线 DeepSeek V4 Pro\n"
                    "- `/model ollama <模型名>` 切换到本地 Ollama 模型"
                )
            )

        if action in {"deepseek", "deepseek-v4-pro", "v4", "v4-pro"}:
            if not _configured_secret(config.providers.deepseek.api_key):
                return ModelCommandResult(
                    content=(
                        "DeepSeek API key 尚未配置。请先在配置文件的 "
                        "`providers.deepseek.apiKey` 中填入有效密钥。"
                    )
                )
            config.agents.defaults.provider = "deepseek"
            config.agents.defaults.model = DEEPSEEK_V4_PRO_MODEL
            save_config(config)
            provider = _make_provider(config)
            return ModelCommandResult(
                content=f"已切换到在线 DeepSeek V4 Pro：`{DEEPSEEK_V4_PRO_MODEL}`",
                provider=provider,
                model=DEEPSEEK_V4_PRO_MODEL,
            )

        if action == "ollama":
            if len(parts) < 3:
                return ModelCommandResult(
                    content="请指定 Ollama 模型名，例如：`/model ollama qwen3.5:27b`"
                )
            model = parts[2]
            try:
                models = await _list_ollama_models(config.providers.ollama.api_base)
            except Exception as exc:
                return ModelCommandResult(content=f"无法连接本地 Ollama：{exc}")
            if model not in models:
                available = ", ".join(models) if models else "无"
                return ModelCommandResult(
                    content=f"本地 Ollama 未找到模型 `{model}`。可用模型：{available}"
                )
            config.agents.defaults.provider = "ollama"
            config.agents.defaults.model = model
            save_config(config)
            provider = _make_provider(config)
            return ModelCommandResult(
                content=f"已切换到本地 Ollama 模型：`{model}`",
                provider=provider,
                model=model,
            )

        return ModelCommandResult(
            content=(
                "无法识别模型命令。\n\n"
                "可用命令：`/models`、`/model deepseek`、`/model ollama <模型名>`"
            )
        )

    return _switch


def _model_display(config: Config) -> tuple[str, str]:
    """Return (resolved_model_name, preset_tag) for display strings."""
    resolved = config.resolve_preset()
    name = config.agents.defaults.model_preset
    tag = f" (preset: {name})" if name else ""
    return resolved.model, tag


def _load_runtime_config(config: str | None = None, workspace: str | None = None) -> Config:
    """Load config and optionally override the active workspace."""
    from astro_one.config.loader import load_config, set_config_path

    config_path = None
    if config:
        config_path = Path(config).expanduser().resolve()
        if not config_path.exists():
            console.print(f"[red]错误：配置文件未找到：{config_path}[/red]")
            raise typer.Exit(1)
        set_config_path(config_path)
        console.print(f"[dim]正在使用配置：{config_path}[/dim]")

    loaded = load_config(config_path)
    if workspace:
        loaded.agents.defaults.workspace = workspace
    return loaded


def _print_deprecated_memory_window_notice(config: Config) -> None:
    """Warn when running with old memoryWindow-only config."""
    if config.agents.defaults.should_warn_deprecated_memory_window:
        console.print(
            "[yellow]提示：[/yellow] 检测到已弃用的 `memoryWindow` 配置，但缺少 "
            "`contextWindowTokens`。`memoryWindow` 将被忽略；请运行 "
            "[cyan]astroone onboard[/cyan] 刷新配置模板。"
        )


def _migrate_cron_store(config: "Config") -> None:
    """One-time migration: move legacy global cron store into the workspace."""
    from astro_one.config.paths import get_cron_dir

    legacy_path = get_cron_dir() / "jobs.json"
    new_path = config.workspace_path / "cron" / "jobs.json"
    if legacy_path.is_file() and not new_path.exists():
        new_path.parent.mkdir(parents=True, exist_ok=True)
        import shutil as _shutil

        _shutil.move(str(legacy_path), str(new_path))


# ============================================================================
# OpenAI-Compatible API Server
# ============================================================================


@app.command()
def serve(
    port: int | None = typer.Option(None, "--port", "-p", help="API server port"),
    host: str | None = typer.Option(None, "--host", "-H", help="Bind address"),
    timeout: float | None = typer.Option(None, "--timeout", "-t", help="Per-request timeout (seconds)"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Show astro_one runtime logs"),
    workspace: str | None = typer.Option(None, "--workspace", "-w", help="Workspace directory"),
    config: str | None = typer.Option(None, "--config", "-c", help="Path to config file"),
):
    """Start the OpenAI-compatible API server (/v1/chat/completions)."""
    try:
        from aiohttp import web  # noqa: F401
    except ImportError:
        console.print("[red]aiohttp 未安装。请运行：pip install 'astro-one-ai[api]'[/red]")
        raise typer.Exit(1)

    from loguru import logger

    from astro_one.api.server import create_app
    from astro_one.bus.queue import MessageBus
    from astro_one.session.manager import SessionManager

    if verbose:
        logger.enable("astro_one")
    else:
        logger.disable("astro_one")

    runtime_config = _load_runtime_config(config, workspace)
    api_cfg = runtime_config.api
    host = host if host is not None else api_cfg.host
    port = port if port is not None else api_cfg.port
    timeout = timeout if timeout is not None else api_cfg.timeout
    sync_workspace_templates(runtime_config.workspace_path)
    bus = MessageBus()
    session_manager = SessionManager(runtime_config.workspace_path)

    # Create agent via from_config factory
    from astro_one.agent.loop import AgentLoop
    try:
        agent_loop = AgentLoop.from_config(
            runtime_config, bus,
            session_manager=session_manager,
        )
    except ValueError as exc:
        console.print(f"[red]错误：{exc}[/red]")
        raise typer.Exit(1) from exc

    model_name, preset_tag = _model_display(runtime_config)
    console.print(f"{__logo__} 正在启动 OpenAI 兼容 API 服务器")
    console.print(f"  [cyan]端点[/cyan] : http://{host}:{port}/v1/chat/completions")
    console.print(f"  [cyan]模型[/cyan]    : {model_name}{preset_tag}")
    console.print("  [cyan]会话[/cyan]  : api:default")
    console.print(f"  [cyan]超时[/cyan]  : {timeout}s")
    if host in {"0.0.0.0", "::"}:
        console.print(
            "[yellow]警告：[/yellow] API 绑定在所有网络接口上。"
            "仅在可信网络边界、防火墙或反向代理后使用。"
        )
    console.print()

    api_app = create_app(agent_loop, model_name=model_name, request_timeout=timeout)

    async def on_startup(_app):
        await agent_loop._connect_mcp()

    async def on_cleanup(_app):
        await agent_loop.close_mcp()

    api_app.on_startup.append(on_startup)
    api_app.on_cleanup.append(on_cleanup)

    web.run_app(api_app, host=host, port=port, print=lambda msg: logger.info(msg))


# ============================================================================
# Gateway / Server
# ============================================================================


@app.command()
def gateway(
    port: int | None = typer.Option(None, "--port", "-p", help="Gateway port"),
    workspace: str | None = typer.Option(None, "--workspace", "-w", help="Workspace directory"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Verbose output"),
    config: str | None = typer.Option(None, "--config", "-c", help="Path to config file"),
):
    """Start the astro_one gateway."""
    from astro_one.agent.loop import AgentLoop
    from astro_one.bus.queue import MessageBus
    from astro_one.channels.manager import ChannelManager
    from astro_one.config.paths import get_cron_dir
    from astro_one.cron.service import CronService
    from astro_one.cron.types import CronJob
    from astro_one.heartbeat.service import HeartbeatService
    from astro_one.providers.factory import build_provider_snapshot, load_provider_snapshot
    from astro_one.session.manager import SessionManager

    if verbose:
        import logging
        logging.basicConfig(level=logging.DEBUG)

    cfg = _load_runtime_config(config, workspace)
    _print_deprecated_memory_window_notice(cfg)
    port = port if port is not None else cfg.gateway.port

    console.print(f"{__logo__} 正在启动 astro_one 网关 v{__version__}，端口 {port}...")
    sync_workspace_templates(cfg.workspace_path)
    bus = MessageBus()

    try:
        provider_snapshot = build_provider_snapshot(cfg)
    except ValueError as exc:
        console.print(f"[red]错误：{exc}[/red]")
        raise typer.Exit(1) from exc
    session_manager = SessionManager(cfg.workspace_path)

    _migrate_cron_store(cfg)

    # Create cron service with workspace-scoped store
    cron_store_path = cfg.workspace_path / "cron" / "jobs.json"
    cron = CronService(cron_store_path)

    # Create agent with cron service via from_config
    agent = AgentLoop.from_config(
        cfg, bus,
        provider=provider_snapshot.provider,
        model=provider_snapshot.model,
        context_window_tokens=provider_snapshot.context_window_tokens,
        cron_service=cron,
        session_manager=session_manager,
        provider_snapshot_loader=load_provider_snapshot,
        provider_signature=provider_snapshot.signature,
    )

    # Set model switcher for runtime model switching
    agent.model_switcher = _make_model_switcher(cfg)

    # Set cron callback (needs agent)
    async def on_cron_job(job: CronJob) -> str | None:
        """Execute a cron job through the agent."""
        from astro_one.agent.tools.cron import CronTool
        from astro_one.agent.tools.message import MessageTool
        from astro_one.utils.evaluator import evaluate_response

        reminder_note = (
            "The scheduled time has arrived. Deliver this reminder to the user now, "
            "as a brief and natural message in their language.\n\n"
            f"Reminder: {job.payload.message}"
        )

        cron_tool = agent.tools.get("cron")
        cron_token = None
        if isinstance(cron_tool, CronTool):
            cron_token = cron_tool.set_cron_context(True)
        try:
            resp = await agent.process_direct(
                reminder_note,
                session_key=f"cron:{job.id}",
                channel=job.payload.channel or "cli",
                chat_id=job.payload.to or "direct",
            )
        finally:
            if isinstance(cron_tool, CronTool) and cron_token is not None:
                cron_tool.reset_cron_context(cron_token)

        response = resp.content if hasattr(resp, 'content') else (resp or "")

        message_tool = agent.tools.get("message")
        if isinstance(message_tool, MessageTool) and message_tool._sent_in_turn:
            return response

        if job.payload.deliver and job.payload.to and response:
            should_notify = await evaluate_response(
                response, job.payload.message, agent.provider, agent.model,
            )
            if should_notify:
                from astro_one.bus.events import OutboundMessage
                await bus.publish_outbound(OutboundMessage(
                    channel=job.payload.channel or "cli",
                    chat_id=job.payload.to,
                    content=response,
                ))
        return response
    cron.on_job = on_cron_job

    # Create channel manager
    channels = ChannelManager(cfg, bus, session_manager=session_manager)

    def _pick_heartbeat_target() -> tuple[str, str]:
        """Pick a routable channel/chat target for heartbeat-triggered messages."""
        enabled = set(channels.enabled_channels)
        for item in session_manager.list_sessions():
            key = item.get("key") or ""
            if ":" not in key:
                continue
            channel, chat_id = key.split(":", 1)
            if channel in {"cli", "system"}:
                continue
            if channel in enabled and chat_id:
                return channel, chat_id
        return "cli", "direct"

    # Create heartbeat service
    heartbeat_preamble = (
        "[Your response will be delivered directly to the user's messaging app. "
        "Output ONLY the final user-facing message. Never reference internal "
        "files (HEARTBEAT.md, AWARENESS.md, etc.), your instructions, or your "
        "decision process. If nothing needs reporting, respond with just "
        "'All clear.' and nothing else.]\n\n"
    )

    async def on_heartbeat_execute(tasks: str) -> str:
        """Phase 2: execute heartbeat tasks through the full agent loop."""
        channel, chat_id = _pick_heartbeat_target()

        async def _silent(*_args, **_kwargs):
            pass

        resp = await agent.process_direct(
            heartbeat_preamble + tasks,
            session_key="heartbeat",
            channel=channel,
            chat_id=chat_id,
            on_progress=_silent,
        )
        return resp.content if hasattr(resp, 'content') else (resp or "")

    async def on_heartbeat_notify(response: str) -> None:
        """Deliver a heartbeat response to the user's channel."""
        from astro_one.bus.events import OutboundMessage
        channel, chat_id = _pick_heartbeat_target()
        if channel == "cli":
            return
        await bus.publish_outbound(OutboundMessage(channel=channel, chat_id=chat_id, content=response))

    async def on_space_scan_report(report: str) -> None:
        from astro_one.bus.events import OutboundMessage
        channel, chat_id = _pick_heartbeat_target()
        if channel == "cli":
            console.print(Markdown(report))
            return
        await bus.publish_outbound(OutboundMessage(channel=channel, chat_id=chat_id, content=report))

    hb_cfg = cfg.gateway.heartbeat
    heartbeat = HeartbeatService(
        workspace=cfg.workspace_path,
        provider=agent.provider,
        model=agent.model,
        on_execute=on_heartbeat_execute,
        on_notify=on_heartbeat_notify,
        interval_s=hb_cfg.interval_s,
        enabled=hb_cfg.enabled,
    )
    space_scan = AutoSpaceScanService(
        data_root=DEFAULT_SPACE_DATA_ROOT,
        tools=agent.tools,
        on_report=on_space_scan_report,
        poll_interval_s=DEFAULT_SPACE_SCAN_INTERVAL_S,
        provider=lambda: agent.provider,
        model=lambda: agent.model,
    )

    if channels.enabled_channels:
        console.print(f"[green]✓[/green] 已启用频道：{', '.join(channels.enabled_channels)}")
    else:
        console.print("[yellow]警告：未启用任何频道[/yellow]")

    cron_status = cron.status()
    if cron_status["jobs"] > 0:
        console.print(f"[green]✓[/green] 定时任务：{cron_status['jobs']} 个待执行任务")

    console.print(f"[green]✓[/green] 心跳：每 {hb_cfg.interval_s} 秒")
    console.print(f"[green]✓[/green] 自动航天数据扫描：{DEFAULT_SPACE_DATA_ROOT}")

    async def run():
        try:
            await cron.start()
            await heartbeat.start()
            space_scan.start()
            await asyncio.gather(
                agent.run(),
                channels.start_all(),
            )
        except KeyboardInterrupt:
            console.print("\n正在关闭...")
        except Exception:
            import traceback
            console.print("\n[red]错误：网关意外崩溃[/red]")
            console.print(traceback.format_exc())
        finally:
            await agent.close_mcp()
            await space_scan.stop()
            heartbeat.stop()
            cron.stop()
            agent.stop()
            await channels.stop_all()
            flushed = agent.sessions.flush_all()
            if flushed:
                logger.info("已刷新 {} 个会话至磁盘", flushed)

    asyncio.run(run())


# ============================================================================
# Agent Commands
# ============================================================================


@app.command()
def agent(
    message: str = typer.Option(None, "--message", "-m", help="Message to send to the agent"),
    session_id: str = typer.Option("cli:direct", "--session", "-s", help="Session ID"),
    workspace: str | None = typer.Option(None, "--workspace", "-w", help="Workspace directory"),
    config: str | None = typer.Option(None, "--config", "-c", help="Config file path"),
    markdown: bool = typer.Option(True, "--markdown/--no-markdown", help="Render assistant output as Markdown"),
    logs: bool = typer.Option(False, "--logs/--no-logs", help="Show astro_one runtime logs during chat"),
    stream: bool = typer.Option(False, "--stream/--no-stream", help="Enable streaming output"),
):
    """Interact with the agent directly."""
    from loguru import logger

    from astro_one.agent.loop import AgentLoop
    from astro_one.bus.queue import MessageBus
    from astro_one.config.paths import get_cron_dir
    from astro_one.cron.service import CronService
    from astro_one.providers.factory import build_provider_snapshot

    config_obj = _load_runtime_config(config, workspace)
    _print_deprecated_memory_window_notice(config_obj)
    sync_workspace_templates(config_obj.workspace_path)

    bus = MessageBus()

    _migrate_cron_store(config_obj)

    # Create cron service with workspace-scoped store
    cron_store_path = config_obj.workspace_path / "cron" / "jobs.json"
    cron = CronService(cron_store_path)

    if logs:
        logger.enable("astro_one")
    else:
        logger.disable("astro_one")

    # Create agent via from_config
    try:
        provider_snapshot = build_provider_snapshot(config_obj)
    except ValueError as exc:
        console.print(f"[red]错误：{exc}[/red]")
        raise typer.Exit(1) from exc

    agent_loop = AgentLoop.from_config(
        config_obj, bus,
        provider=provider_snapshot.provider,
        model=provider_snapshot.model,
        context_window_tokens=provider_snapshot.context_window_tokens,
        cron_service=cron,
    )
    agent_loop.model_switcher = _make_model_switcher(config_obj)

    if message:
        # Single message mode — direct call, no bus needed
        async def run_once():
            renderer = StreamRenderer(
                render_markdown=markdown,
                bot_name=config_obj.agents.defaults.bot_name,
                bot_icon=config_obj.agents.defaults.bot_icon,
            )

            def _make_progress():
                reasoning_buffer = ReasoningProgressBuffer(
                    _print_cli_progress_line_async,
                    None,
                    renderer,
                )

                async def _cli_progress(
                    content: str,
                    *,
                    tool_hint: bool = False,
                    reasoning: bool = False,
                    reasoning_end: bool = False,
                    **_kwargs: Any,
                ) -> None:
                    ch = agent_loop.channels_config
                    if ch and tool_hint and not ch.send_tool_hints:
                        return
                    if ch and not tool_hint and not ch.send_progress:
                        return
                    if reasoning_end:
                        await reasoning_buffer.flush()
                        return
                    if reasoning:
                        await reasoning_buffer.feed(content)
                        return
                    _print_cli_progress_line(content, None, renderer)
                return _cli_progress

            response = await agent_loop.process_direct(
                message, session_id,
                on_progress=_make_progress(),
                on_stream=renderer.on_delta,
                on_stream_end=renderer.on_end,
            )
            if not renderer.streamed:
                await renderer.close()
                print_kwargs: dict[str, Any] = {}
                if renderer.header_printed:
                    print_kwargs["show_header"] = False
                content = response.content if hasattr(response, 'content') else (response or "")
                metadata = response.metadata if hasattr(response, 'metadata') else None
                _print_agent_response(
                    content,
                    render_markdown=markdown,
                    metadata=metadata,
                    **print_kwargs,
                )
            await agent_loop.close_mcp()

        asyncio.run(run_once())
    else:
        # Interactive mode — route through bus like other channels
        from astro_one.bus.events import InboundMessage
        _init_prompt_session()
        _model, _preset_tag = _model_display(config_obj)
        console.print(f"{__logo__} 交互模式 [bold blue]({_model})[/bold blue]{_preset_tag} — 输入 [bold]exit[/bold] 或 [bold]Ctrl+C[/bold] 退出\n")

        if ":" in session_id:
            cli_channel, cli_chat_id = session_id.split(":", 1)
        else:
            cli_channel, cli_chat_id = "cli", session_id

        def _handle_signal(signum, frame):
            sig_name = signal.Signals(signum).name
            _restore_terminal()
            console.print(f"\n收到 {sig_name}，再见！")
            sys.exit(0)

        signal.signal(signal.SIGINT, _handle_signal)
        signal.signal(signal.SIGTERM, _handle_signal)
        if hasattr(signal, 'SIGHUP'):
            signal.signal(signal.SIGHUP, _handle_signal)
        if hasattr(signal, 'SIGPIPE'):
            signal.signal(signal.SIGPIPE, signal.SIG_IGN)

        async def run_interactive():
            bus_task = asyncio.create_task(agent_loop.run())
            turn_done = asyncio.Event()
            turn_done.set()
            turn_response: list[tuple[str, dict]] = []
            renderer: StreamRenderer | None = None
            reasoning_buffer: ReasoningProgressBuffer | None = None

            async def _consume_outbound():
                nonlocal reasoning_buffer
                while True:
                    try:
                        msg = await asyncio.wait_for(bus.consume_outbound(), timeout=1.0)

                        if msg.metadata.get("_stream_delta"):
                            if renderer:
                                await renderer.on_delta(msg.content)
                            continue
                        if msg.metadata.get("_stream_end"):
                            if renderer:
                                await renderer.on_end(
                                    resuming=msg.metadata.get("_resuming", False),
                                )
                            continue
                        if msg.metadata.get("_streamed"):
                            fallback = _streamed_final_fallback(
                                msg.content,
                                msg.metadata,
                                renderer,
                            )
                            if fallback:
                                turn_response.append(fallback)
                            turn_done.set()
                            continue

                        if msg.metadata.get("_progress"):
                            if reasoning_buffer is None or not reasoning_buffer.is_bound_to(renderer):
                                reasoning_buffer = ReasoningProgressBuffer(
                                    _print_interactive_progress_line,
                                    None,
                                    renderer,
                                )
                            is_tool_hint = msg.metadata.get("_tool_hint", False)
                            ch = agent_loop.channels_config
                            if ch and is_tool_hint and not ch.send_tool_hints:
                                pass
                            elif ch and not is_tool_hint and not ch.send_progress:
                                pass
                            elif msg.metadata.get("_reasoning_end"):
                                await reasoning_buffer.flush()
                            elif msg.metadata.get("_reasoning_delta"):
                                await reasoning_buffer.feed(msg.content)
                            else:
                                await _print_interactive_progress_line(msg.content, None, renderer)
                            continue

                        if not turn_done.is_set():
                            if msg.content:
                                turn_response.append((msg.content, dict(msg.metadata or {})))
                            turn_done.set()
                        elif msg.content:
                            await _print_interactive_response(
                                msg.content,
                                render_markdown=markdown,
                                metadata=msg.metadata,
                            )

                    except asyncio.TimeoutError:
                        continue
                    except asyncio.CancelledError:
                        break

            outbound_task = asyncio.create_task(_consume_outbound())

            async def _scan_report_outbound(report: str) -> None:
                from astro_one.bus.events import OutboundMessage
                await bus.publish_outbound(OutboundMessage(
                    channel=cli_channel,
                    chat_id=cli_chat_id,
                    content=report,
                ))

            space_scan = AutoSpaceScanService(
                data_root=DEFAULT_SPACE_DATA_ROOT,
                tools=agent_loop.tools,
                on_report=_scan_report_outbound,
                poll_interval_s=DEFAULT_SPACE_SCAN_INTERVAL_S,
                provider=lambda: agent_loop.provider,
                model=lambda: agent_loop.model,
            )
            space_scan.start()

            try:
                while True:
                    try:
                        _flush_pending_tty_input()
                        if renderer:
                            renderer.stop_for_input()
                        user_input = _sanitize_surrogates(await _read_interactive_input_async())
                        command = user_input.strip()
                        if not command:
                            continue

                        if _is_exit_command(command):
                            _restore_terminal()
                            console.print("\n再见！")
                            break

                        turn_done.clear()
                        turn_response.clear()
                        renderer = StreamRenderer(
                            render_markdown=markdown,
                            bot_name=config_obj.agents.defaults.bot_name,
                            bot_icon=config_obj.agents.defaults.bot_icon,
                        )

                        await bus.publish_inbound(InboundMessage(
                            channel=cli_channel,
                            sender_id="user",
                            chat_id=cli_chat_id,
                            content=user_input,
                            metadata={"_wants_stream": True},
                        ))

                        await turn_done.wait()

                        if turn_response:
                            content, meta = turn_response[0]
                            if content and not meta.get("_streamed"):
                                if renderer:
                                    await renderer.close()
                                print_kwargs: dict[str, Any] = {}
                                if renderer and renderer.header_printed:
                                    print_kwargs["show_header"] = False
                                _print_agent_response(
                                    content,
                                    render_markdown=markdown,
                                    metadata=meta,
                                    **print_kwargs,
                                )
                        elif renderer and not renderer.streamed:
                            await renderer.close()
                    except KeyboardInterrupt:
                        _restore_terminal()
                        console.print("\n再见！")
                        break
                    except EOFError:
                        _restore_terminal()
                        console.print("\n再见！")
                        break
            finally:
                agent_loop.stop()
                await space_scan.stop()
                outbound_task.cancel()
                await asyncio.gather(bus_task, outbound_task, return_exceptions=True)
                await agent_loop.close_mcp()

        asyncio.run(run_interactive())


# ============================================================================
# Channel Commands
# ============================================================================


channels_app = typer.Typer(help="Manage channels")
app.add_typer(channels_app, name="channels")


@channels_app.command("status")
def channels_status():
    """Show channel status."""
    from astro_one.channels.registry import discover_all
    from astro_one.config.loader import load_config

    config = load_config()

    table = Table(title="Channel Status")
    table.add_column("Channel", style="cyan")
    table.add_column("Enabled", style="green")

    for name, cls in sorted(discover_all().items()):
        section = getattr(config.channels, name, None)
        if section is None:
            enabled = False
        elif isinstance(section, dict):
            enabled = section.get("enabled", False)
        else:
            enabled = getattr(section, "enabled", False)
        table.add_row(
            cls.display_name,
            "[green]✓[/green]" if enabled else "[dim]✗[/dim]",
        )

    console.print(table)


def _get_bridge_dir() -> Path:
    """Get the bridge directory, setting it up if needed."""
    import shutil
    import subprocess

    from astro_one.config.paths import get_bridge_install_dir

    user_bridge = get_bridge_install_dir()

    if (user_bridge / "dist" / "index.js").exists():
        return user_bridge

    npm_path = shutil.which("npm")
    if not npm_path:
        console.print("[red]npm not found. Please install Node.js >= 18.[/red]")
        raise typer.Exit(1)

    pkg_bridge = Path(__file__).parent.parent / "bridge"
    src_bridge = Path(__file__).parent.parent.parent / "bridge"

    source = None
    if (pkg_bridge / "package.json").exists():
        source = pkg_bridge
    elif (src_bridge / "package.json").exists():
        source = src_bridge

    if not source:
        console.print("[red]Bridge source not found.[/red]")
        console.print("Try reinstalling: pip install --force-reinstall astro-one-ai")
        raise typer.Exit(1)

    console.print(f"{__logo__} Setting up bridge...")

    user_bridge.parent.mkdir(parents=True, exist_ok=True)
    if user_bridge.exists():
        shutil.rmtree(user_bridge)
    shutil.copytree(source, user_bridge, ignore=shutil.ignore_patterns("node_modules", "dist"))

    try:
        console.print("  Installing dependencies...")
        subprocess.run([npm_path, "install"], cwd=user_bridge, check=True, capture_output=True)

        console.print("  Building...")
        subprocess.run([npm_path, "run", "build"], cwd=user_bridge, check=True, capture_output=True)

        console.print("[green]✓[/green] Bridge ready\n")
    except subprocess.CalledProcessError as e:
        console.print(f"[red]Build failed: {e}[/red]")
        if e.stderr:
            console.print(f"[dim]{e.stderr.decode()[:500]}[/dim]")
        raise typer.Exit(1)

    return user_bridge


@channels_app.command("login")
def channels_login(
    channel_name: str = typer.Argument(..., help="Channel name (e.g. weixin, whatsapp)"),
    force: bool = typer.Option(False, "--force", "-f", help="Force re-authentication even if already logged in"),
    config_path: str | None = typer.Option(None, "--config", "-c", help="Path to config file"),
):
    """Authenticate with a channel via QR code or other interactive login."""
    from astro_one.channels.registry import discover_all
    from astro_one.config.loader import load_config, set_config_path

    resolved_config_path = Path(config_path).expanduser().resolve() if config_path else None
    if resolved_config_path is not None:
        set_config_path(resolved_config_path)

    config = load_config(resolved_config_path)
    channel_cfg = getattr(config.channels, channel_name, None) or {}

    all_channels = discover_all()
    if channel_name not in all_channels:
        available = ", ".join(all_channels.keys())
        console.print(f"[red]未知频道：{channel_name}[/red]  可用：{available}")
        raise typer.Exit(1)

    console.print(f"{__logo__} {all_channels[channel_name].display_name} 登录\n")

    channel_cls = all_channels[channel_name]
    channel = channel_cls(channel_cfg, bus=None)

    success = asyncio.run(channel.login(force=force))

    if not success:
        raise typer.Exit(1)


# ============================================================================
# Plugin Commands
# ============================================================================

plugins_app = typer.Typer(help="Manage channel plugins")
app.add_typer(plugins_app, name="plugins")


@plugins_app.command("list")
def plugins_list():
    """List all discovered channels (built-in and plugins)."""
    from astro_one.channels.registry import discover_all, discover_channel_names
    from astro_one.config.loader import load_config

    config = load_config()
    builtin_names = set(discover_channel_names())
    all_channels = discover_all()

    table = Table(title="Channel Plugins")
    table.add_column("Name", style="cyan")
    table.add_column("Source", style="magenta")
    table.add_column("Enabled", style="green")

    for name in sorted(all_channels):
        cls = all_channels[name]
        source = "builtin" if name in builtin_names else "plugin"
        section = getattr(config.channels, name, None)
        if section is None:
            enabled = False
        elif isinstance(section, dict):
            enabled = section.get("enabled", False)
        else:
            enabled = getattr(section, "enabled", False)
        table.add_row(
            cls.display_name,
            source,
            "[green]yes[/green]" if enabled else "[dim]no[/dim]",
        )

    console.print(table)


# ============================================================================
# Status Commands
# ============================================================================


@app.command()
def status():
    """Show astro_one status."""
    from astro_one.config.loader import get_config_path, load_config

    config_path = get_config_path()
    config = load_config()
    workspace = config.workspace_path

    console.print(f"{__logo__} astro-one Status\n")

    console.print(f"Config: {config_path} {'[green]✓[/green]' if config_path.exists() else '[red]✗[/red]'}")
    console.print(f"Workspace: {workspace} {'[green]✓[/green]' if workspace.exists() else '[red]✗[/red]'}")

    if config_path.exists():
        from astro_one.providers.registry import PROVIDERS

        _model, _preset_tag = _model_display(config)
        console.print(f"Model: {_model}{_preset_tag}")

        for spec in PROVIDERS:
            p = getattr(config.providers, spec.name, None)
            if p is None:
                continue
            if spec.is_oauth:
                console.print(f"{spec.label}: [green]✓ (OAuth)[/green]")
            elif spec.is_local:
                if p.api_base:
                    console.print(f"{spec.label}: [green]✓ {p.api_base}[/green]")
                else:
                    console.print(f"{spec.label}：[dim]未设置[/dim]")
            else:
                has_key = bool(p.api_key)
                console.print(f"{spec.label}：{'[green]✓[/green]' if has_key else '[dim]未设置[/dim]'}")


# ============================================================================
# OAuth Login
# ============================================================================

provider_app = typer.Typer(help="Manage providers")
app.add_typer(provider_app, name="provider")


_LOGIN_HANDLERS: dict[str, callable] = {}


def _register_login(name: str):
    def decorator(fn):
        _LOGIN_HANDLERS[name] = fn
        return fn
    return decorator


@provider_app.command("login")
def provider_login(
    provider: str = typer.Argument(..., help="OAuth provider (e.g. 'openai-codex', 'github-copilot')"),
):
    """Authenticate with an OAuth provider."""
    from astro_one.providers.registry import PROVIDERS

    key = provider.replace("-", "_")
    spec = next((s for s in PROVIDERS if s.name == key and s.is_oauth), None)
    if not spec:
        names = ", ".join(s.name.replace("_", "-") for s in PROVIDERS if s.is_oauth)
        console.print(f"[red]未知的 OAuth provider：{provider}[/red]  支持：{names}")
        raise typer.Exit(1)

    handler = _LOGIN_HANDLERS.get(spec.name)
    if not handler:
        console.print(f"[red]Login not implemented for {spec.label}[/red]")
        raise typer.Exit(1)

    console.print(f"{__logo__} OAuth 登录 - {spec.label}\n")
    handler()


@_register_login("openai_codex")
def _login_openai_codex() -> None:
    try:
        from oauth_cli_kit import get_token, login_oauth_interactive
        token = None
        try:
            token = get_token()
        except Exception:
            pass
        if not (token and token.access):
            console.print("[cyan]正在启动交互式 OAuth 登录...[/cyan]\n")
            token = login_oauth_interactive(
                print_fn=lambda s: console.print(s),
                prompt_fn=lambda s: typer.prompt(s),
            )
        if not (token and token.access):
            console.print("[red]✗ 认证失败[/red]")
            raise typer.Exit(1)
        console.print(f"[green]✓ 已通过 OpenAI Codex 认证[/green]  [dim]{token.account_id}[/dim]")
    except ImportError:
        console.print("[red]未安装 oauth_cli_kit。请运行：pip install oauth-cli-kit[/red]")
        raise typer.Exit(1)


@_register_login("github_copilot")
def _login_github_copilot() -> None:
    import asyncio

    console.print("[cyan]正在启动 GitHub Copilot 设备流程...[/cyan]\n")

    async def _trigger():
        from litellm import acompletion
        await acompletion(model="github_copilot/gpt-4o", messages=[{"role": "user", "content": "hi"}], max_tokens=1)

    try:
        asyncio.run(_trigger())
        console.print("[green]✓ 已通过 GitHub Copilot 认证[/green]")
    except Exception as e:
        console.print(f"[red]认证错误：{e}[/red]")
        raise typer.Exit(1)


if __name__ == "__main__":
    app()
