"""Shell execution tool."""

import asyncio
import os
import re
from pathlib import Path
from typing import Any

from pydantic import Field

from astro_one.agent.tools.base import Tool
from astro_one.agent.tools.exec_session import (
    DEFAULT_EXEC_SESSION_MANAGER,
    DEFAULT_MAX_OUTPUT_CHARS,
    DEFAULT_YIELD_MS,
    MAX_OUTPUT_CHARS,
    MAX_YIELD_MS,
    ExecSessionManager,
    clamp_session_int,
    format_session_poll,
)
from astro_one.config.schema import Base


_IS_WINDOWS = os.name == "nt"


class ExecToolConfig(Base):
    """Configuration for shell execution tools."""

    enable: bool = True
    timeout: int = 60
    working_dir: str | None = None
    deny_patterns: list[str] = Field(default_factory=list)
    allow_patterns: list[str] = Field(default_factory=list)
    restrict_to_workspace: bool = False
    path_append: str = ""


class ExecTool(Tool):
    """Tool to execute shell commands."""

    _scopes = {"core", "subagent"}
    config_key = "exec"

    @classmethod
    def config_cls(cls):
        return ExecToolConfig

    @classmethod
    def enabled(cls, ctx: Any) -> bool:
        return ctx.config.exec.enable

    @classmethod
    def create(cls, ctx: Any) -> Tool:
        cfg = ctx.config.exec
        return cls(
            timeout=cfg.timeout,
            working_dir=cfg.working_dir or str(ctx.workspace),
            deny_patterns=cfg.deny_patterns or None,
            allow_patterns=cfg.allow_patterns or None,
            restrict_to_workspace=cfg.restrict_to_workspace or ctx.config.restrict_to_workspace,
            path_append=cfg.path_append,
        )

    def __init__(
        self,
        timeout: int = 60,
        working_dir: str | None = None,
        deny_patterns: list[str] | None = None,
        allow_patterns: list[str] | None = None,
        restrict_to_workspace: bool = False,
        path_append: str = "",
        exec_session_manager: ExecSessionManager | None = None,
    ):
        self.timeout = timeout
        self.working_dir = working_dir
        self.deny_patterns = deny_patterns or [
            r"\brm\s+-[rf]{1,2}\b",          # rm -r, rm -rf, rm -fr
            r"\bdel\s+/[fq]\b",              # del /f, del /q
            r"\brmdir\s+/s\b",               # rmdir /s
            r"(?:^|[;&|]\s*)format\b",       # format (as standalone command only)
            r"\b(mkfs|diskpart)\b",          # disk operations
            r"\bdd\s+if=",                   # dd
            r">\s*/dev/sd",                  # write to disk
            r"\b(shutdown|reboot|poweroff)\b",  # system power
            r":\(\)\s*\{.*\};\s*:",          # fork bomb
        ]
        self.allow_patterns = allow_patterns or []
        self.restrict_to_workspace = restrict_to_workspace
        self.path_append = path_append
        self._exec_session_manager = exec_session_manager or DEFAULT_EXEC_SESSION_MANAGER

    @property
    def name(self) -> str:
        return "exec"

    _MAX_TIMEOUT = 600
    _MAX_OUTPUT = 10_000

    @property
    def description(self) -> str:
        return (
            "Execute a shell command and return its output. For long-running commands, "
            "interactive programs, dev servers, or web apps, pass yield_time_ms so exec "
            "returns a running session_id instead of blocking; then use write_stdin to "
            "poll or terminate the session. Use with caution."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The shell command to execute",
                },
                "working_dir": {
                    "type": "string",
                    "description": "Optional working directory for the command",
                },
                "timeout": {
                    "type": "integer",
                    "description": (
                        "Timeout in seconds. Increase for long-running commands "
                        "like compilation or installation (default 60, max 600). "
                        "Do not use a large timeout to run servers; use yield_time_ms."
                    ),
                    "minimum": 1,
                    "maximum": 600,
                },
                "yield_time_ms": {
                    "type": "integer",
                    "description": (
                        "Start the command as a managed session and return after this many "
                        "milliseconds with recent output plus a session_id if still running. "
                        "Use for web servers, dev servers, watchers, and interactive commands."
                    ),
                    "minimum": 0,
                    "maximum": 30000,
                },
                "max_output_chars": {
                    "type": "integer",
                    "description": (
                        "Maximum output characters to return when yield_time_ms is used "
                        "(default 10000, max 50000)."
                    ),
                    "minimum": 1000,
                    "maximum": 50000,
                },
                "max_output_tokens": {
                    "type": "integer",
                    "description": (
                        "Compatibility alias for max_output_chars. The runtime uses a "
                        "character budget."
                    ),
                    "minimum": 1000,
                    "maximum": 50000,
                },
            },
            "required": ["command"],
        }

    async def execute(
        self, command: str, working_dir: str | None = None,
        timeout: int | None = None,
        yield_time_ms: int | None = None,
        max_output_chars: int | None = None,
        max_output_tokens: int | None = None,
        **kwargs: Any,
    ) -> str:
        cwd = working_dir or self.working_dir or os.getcwd()
        guard_error = self._guard_command(command, cwd)
        if guard_error:
            return guard_error

        effective_timeout = min(timeout or self.timeout, self._MAX_TIMEOUT)

        env = os.environ.copy()
        if self.path_append:
            env["PATH"] = env.get("PATH", "") + os.pathsep + self.path_append

        try:
            if yield_time_ms is not None:
                if max_output_chars is None:
                    max_output_chars = max_output_tokens
                session_id, poll = await self._exec_session_manager.start(
                    command=command,
                    cwd=cwd,
                    env=env,
                    timeout=effective_timeout,
                    shell_program=None,
                    login=False,
                    yield_time_ms=clamp_session_int(
                        yield_time_ms,
                        DEFAULT_YIELD_MS,
                        0,
                        MAX_YIELD_MS,
                    ),
                    max_output_chars=clamp_session_int(
                        max_output_chars,
                        DEFAULT_MAX_OUTPUT_CHARS,
                        1000,
                        MAX_OUTPUT_CHARS,
                    ),
                )
                return format_session_poll(session_id, poll)

            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd,
                env=env,
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=effective_timeout,
                )
            except asyncio.TimeoutError:
                process.kill()
                try:
                    await asyncio.wait_for(process.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    pass
                return f"错误：命令执行超时（{effective_timeout} 秒）"

            output_parts = []

            if stdout:
                output_parts.append(stdout.decode("utf-8", errors="replace"))

            if stderr:
                stderr_text = stderr.decode("utf-8", errors="replace")
                if stderr_text.strip():
                    output_parts.append(f"STDERR:\n{stderr_text}")

            output_parts.append(f"\nExit code: {process.returncode}")

            result = "\n".join(output_parts) if output_parts else "(no output)"

            # Head + tail truncation to preserve both start and end of output
            max_len = self._MAX_OUTPUT
            if len(result) > max_len:
                half = max_len // 2
                result = (
                    result[:half]
                    + f"\n\n... ({len(result) - max_len:,} chars truncated) ...\n\n"
                    + result[-half:]
                )

            return result

        except Exception as e:
            return f"执行命令出错：{str(e)}"

    def _guard_command(self, command: str, cwd: str) -> str | None:
        """Best-effort safety guard for potentially destructive commands."""
        cmd = command.strip()
        lower = cmd.lower()

        for pattern in self.deny_patterns:
            if re.search(pattern, lower):
                return "错误：命令被安全守卫拦截（检测到危险模式）"

        if self.allow_patterns:
            if not any(re.search(p, lower) for p in self.allow_patterns):
                return "错误：命令被安全守卫拦截（不在白名单中）"

        from astro_one.security.network import contains_internal_url
        if contains_internal_url(cmd):
            return "错误：命令被安全守卫拦截（检测到内部/私有 URL）"

        if self.restrict_to_workspace:
            if "..\\" in cmd or "../" in cmd:
                return "错误：命令被安全守卫拦截（检测到路径遍历）"

            cwd_path = Path(cwd).resolve()

            for raw in self._extract_absolute_paths(cmd):
                try:
                    expanded = os.path.expandvars(raw.strip())
                    p = Path(expanded).expanduser().resolve()
                except Exception:
                    continue
                if p.is_absolute() and cwd_path not in p.parents and p != cwd_path:
                    return "错误：命令被安全守卫拦截（路径超出工作目录）"

        return None

    @staticmethod
    def _extract_absolute_paths(command: str) -> list[str]:
        win_paths = re.findall(r"[A-Za-z]:\\[^\s\"'|><;]+", command)   # Windows: C:\...
        posix_paths = re.findall(r"(?:^|[\s|>'\"])(/[^\s\"'>;|<]+)", command) # POSIX: /absolute only
        home_paths = re.findall(r"(?:^|[\s|>'\"])(~[^\s\"'>;|<]*)", command) # POSIX/Windows home shortcut: ~
        return win_paths + posix_paths + home_paths
