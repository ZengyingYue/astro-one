"""Base LLM provider interface."""

import asyncio
import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from loguru import logger


@dataclass
class ToolCallRequest:
    """A tool call request from the LLM."""
    id: str
    name: str
    arguments: dict[str, Any]
    extra_content: dict[str, Any] | None = None
    provider_specific_fields: dict[str, Any] | None = None
    function_provider_specific_fields: dict[str, Any] | None = None

    def to_openai_tool_call(self) -> dict[str, Any]:
        """Serialize to an OpenAI-style tool_call payload."""
        tool_call = {
            "id": self.id,
            "type": "function",
            "function": {
                "name": self.name,
                "arguments": json.dumps(self.arguments, ensure_ascii=False),
            },
        }
        if self.extra_content:
            tool_call["extra_content"] = self.extra_content
        if self.provider_specific_fields:
            tool_call["provider_specific_fields"] = self.provider_specific_fields
        if self.function_provider_specific_fields:
            tool_call["function"]["provider_specific_fields"] = self.function_provider_specific_fields
        return tool_call


@dataclass
class LLMResponse:
    """Response from an LLM provider."""
    content: str | None
    tool_calls: list[ToolCallRequest] = field(default_factory=list)
    finish_reason: str = "stop"
    usage: dict[str, int] = field(default_factory=dict)
    reasoning_content: str | None = None  # Kimi, DeepSeek-R1 etc.
    thinking_blocks: list[dict] | None = None  # Anthropic extended thinking
    retry_after: float | None = None
    error_kind: str | None = None
    error_type: str | None = None
    error_code: str | None = None
    error_status_code: int | None = None
    error_should_retry: bool | None = None
    error_retry_after_s: float | None = None

    @property
    def has_tool_calls(self) -> bool:
        """Check if response contains tool calls."""
        return len(self.tool_calls) > 0

    @property
    def should_execute_tools(self) -> bool:
        """Whether the agent should execute returned tool calls."""
        return self.finish_reason != "error" and self.has_tool_calls


@dataclass(frozen=True)
class GenerationSettings:
    """Default generation parameters for LLM calls.

    Stored on the provider so every call site inherits the same defaults
    without having to pass temperature / max_tokens / reasoning_effort
    through every layer.  Individual call sites can still override by
    passing explicit keyword arguments to chat() / chat_with_retry().
    """

    temperature: float = 0.7
    max_tokens: int = 4096
    reasoning_effort: str | None = None


class LLMProvider(ABC):
    """
    Abstract base class for LLM providers.

    Implementations should handle the specifics of each provider's API
    while maintaining a consistent interface.
    """

    _CHAT_RETRY_DELAYS = (1, 2, 4)
    _TRANSIENT_ERROR_MARKERS = (
        "429",
        "rate limit",
        "500",
        "502",
        "503",
        "504",
        "overloaded",
        "timeout",
        "timed out",
        "connection",
        "server error",
        "temporarily unavailable",
    )
    _IMAGE_UNSUPPORTED_MARKERS = (
        "image_url is only supported",
        "does not support image",
        "images are not supported",
        "image input is not supported",
        "image_url is not supported",
        "unsupported image input",
    )
    _TOOLS_UNSUPPORTED_MARKERS = (
        "does not support tools",
        "tools are not supported",
        "tools is not supported",
        "tool use is not supported",
        "tool calling is not supported",
        "does not support function calling",
        "function calling is not supported",
        "tool_choice is not supported",
    )

    _SENTINEL = object()

    def __init__(self, api_key: str | None = None, api_base: str | None = None):
        self.api_key = api_key
        self.api_base = api_base
        self.generation: GenerationSettings = GenerationSettings()

    @staticmethod
    def _sanitize_empty_content(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Replace empty text content that causes provider 400 errors.

        Empty content can appear when MCP tools return nothing. Most providers
        reject empty-string content or empty text blocks in list content.
        """
        result: list[dict[str, Any]] = []
        for msg in messages:
            content = msg.get("content")

            if isinstance(content, str) and not content:
                clean = dict(msg)
                clean["content"] = None if (msg.get("role") == "assistant" and msg.get("tool_calls")) else "(empty)"
                result.append(clean)
                continue

            if isinstance(content, list):
                filtered = [
                    item for item in content
                    if not (
                        isinstance(item, dict)
                        and item.get("type") in ("text", "input_text", "output_text")
                        and not item.get("text")
                    )
                ]
                if len(filtered) != len(content):
                    clean = dict(msg)
                    if filtered:
                        clean["content"] = filtered
                    elif msg.get("role") == "assistant" and msg.get("tool_calls"):
                        clean["content"] = None
                    else:
                        clean["content"] = "(empty)"
                    result.append(clean)
                    continue

            if isinstance(content, dict):
                clean = dict(msg)
                clean["content"] = [content]
                result.append(clean)
                continue

            result.append(msg)
        return result

    @staticmethod
    def _sanitize_request_messages(
        messages: list[dict[str, Any]],
        allowed_keys: frozenset[str],
    ) -> list[dict[str, Any]]:
        """Keep only provider-safe message keys and normalize assistant content."""
        sanitized = []
        for msg in messages:
            clean = {k: v for k, v in msg.items() if k in allowed_keys}
            if clean.get("role") == "assistant" and "content" not in clean:
                clean["content"] = None
            sanitized.append(clean)
        return sanitized

    @staticmethod
    def _merge_content(left: Any, right: Any) -> Any:
        if left is None or left == "":
            return right
        if right is None or right == "":
            return left
        if isinstance(left, str) and isinstance(right, str):
            return f"{left}\n\n{right}"
        left_list = left if isinstance(left, list) else [{"type": "text", "text": str(left)}]
        right_list = right if isinstance(right, list) else [{"type": "text", "text": str(right)}]
        return [*left_list, *right_list]

    @classmethod
    def _enforce_role_alternation(cls, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Merge adjacent same-role messages for providers that reject them."""
        result: list[dict[str, Any]] = []
        for msg in messages:
            if not result or result[-1].get("role") != msg.get("role"):
                result.append(dict(msg))
                continue
            prev = result[-1]
            if prev.get("role") == "tool":
                result.append(dict(msg))
                continue
            if prev.get("role") == "assistant" and (prev.get("tool_calls") or msg.get("tool_calls")):
                result.append(dict(msg))
                continue
            prev["content"] = cls._merge_content(prev.get("content"), msg.get("content"))
        return result

    @abstractmethod
    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        reasoning_effort: str | None = None,
        tool_choice: str | dict[str, Any] | None = None,
    ) -> LLMResponse:
        """
        Send a chat completion request.

        Args:
            messages: List of message dicts with 'role' and 'content'.
            tools: Optional list of tool definitions.
            model: Model identifier (provider-specific).
            max_tokens: Maximum tokens in response.
            temperature: Sampling temperature.
            tool_choice: Tool selection strategy ("auto", "required", or specific tool dict).

        Returns:
            LLMResponse with content and/or tool calls.
        """
        pass

    @classmethod
    def _is_transient_error(cls, content: str | None) -> bool:
        err = (content or "").lower()
        return any(marker in err for marker in cls._TRANSIENT_ERROR_MARKERS)

    @classmethod
    def _is_image_unsupported_error(cls, content: str | None) -> bool:
        err = (content or "").lower()
        return any(marker in err for marker in cls._IMAGE_UNSUPPORTED_MARKERS)

    @classmethod
    def _is_tools_unsupported_error(cls, content: str | None) -> bool:
        err = (content or "").lower()
        return any(marker in err for marker in cls._TOOLS_UNSUPPORTED_MARKERS)

    @staticmethod
    def _strip_image_content(messages: list[dict[str, Any]]) -> list[dict[str, Any]] | None:
        """Replace image_url blocks with text placeholder. Returns None if no images found."""
        found = False
        result = []
        for msg in messages:
            content = msg.get("content")
            if isinstance(content, list):
                new_content = []
                for b in content:
                    if isinstance(b, dict) and b.get("type") == "image_url":
                        new_content.append({"type": "text", "text": "[image omitted]"})
                        found = True
                    else:
                        new_content.append(b)
                result.append({**msg, "content": new_content})
            else:
                result.append(msg)
        return result if found else None

    @staticmethod
    def _extract_retry_after_from_headers(headers: Any) -> float | None:
        """Extract Retry-After seconds from a provider response headers object."""
        if not headers:
            return None
        value = None
        try:
            value = headers.get("retry-after") or headers.get("Retry-After")
        except Exception:
            return None
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _extract_retry_after(text: str | None) -> float | None:
        """Extract a retry-after hint from provider error text when present."""
        if not text:
            return None
        import re

        match = re.search(r"retry[-_ ]?after[:= ]+(\d+(?:\.\d+)?)", text, re.I)
        if not match:
            return None
        try:
            return float(match.group(1))
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _extract_error_type_code(payload: Any) -> tuple[str | None, str | None]:
        """Extract provider error type/code from common JSON error payload shapes."""
        data = payload
        if isinstance(payload, str):
            try:
                data = json.loads(payload)
            except Exception:
                return None, None
        if not isinstance(data, dict):
            return None, None

        err = data.get("error")
        if isinstance(err, dict):
            error_type = err.get("type") or err.get("error_type")
            error_code = err.get("code") or err.get("error_code")
            return (
                str(error_type) if error_type is not None else None,
                str(error_code) if error_code is not None else None,
            )

        error_type = data.get("type") or data.get("error_type")
        error_code = data.get("code") or data.get("error_code")
        return (
            str(error_type) if error_type is not None else None,
            str(error_code) if error_code is not None else None,
        )

    async def _safe_chat(self, **kwargs: Any) -> LLMResponse:
        """Call chat() and convert unexpected exceptions to error responses."""
        try:
            return await self.chat(**kwargs)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            return LLMResponse(content=f"Error calling LLM: {exc}", finish_reason="error")

    async def chat_with_retry(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        model: str | None = None,
        max_tokens: object = _SENTINEL,
        temperature: object = _SENTINEL,
        reasoning_effort: object = _SENTINEL,
        tool_choice: str | dict[str, Any] | None = None,
        stream: bool = False,
        on_chunk: Optional[Callable] = None,
        retry_mode: str | None = None,
        on_retry_wait: Optional[Callable[[str], Any]] = None,
    ) -> LLMResponse:
        """Call chat() with retry on transient provider failures.

        Parameters default to ``self.generation`` when not explicitly passed,
        so callers no longer need to thread temperature / max_tokens /
        reasoning_effort through every layer.
        """
        if max_tokens is self._SENTINEL:
            max_tokens = self.generation.max_tokens
        if temperature is self._SENTINEL:
            temperature = self.generation.temperature
        if reasoning_effort is self._SENTINEL:
            reasoning_effort = self.generation.reasoning_effort

        kw: dict[str, Any] = dict(
            messages=messages, tools=tools, model=model,
            max_tokens=max_tokens, temperature=temperature,
            reasoning_effort=reasoning_effort, tool_choice=tool_choice,
        )

        for attempt, delay in enumerate(self._CHAT_RETRY_DELAYS, start=1):
            response = await self._safe_chat(**kw)

            if response.finish_reason != "error":
                return response

            if kw.get("tools") and self._is_tools_unsupported_error(response.content):
                logger.warning("Model does not support tools, retrying without tool definitions")
                return await self._safe_chat(**{**kw, "tools": None, "tool_choice": None})

            if not self._is_transient_error(response.content):
                if self._is_image_unsupported_error(response.content):
                    stripped = self._strip_image_content(messages)
                    if stripped is not None:
                        logger.warning("Model does not support image input, retrying without images")
                        return await self._safe_chat(**{**kw, "messages": stripped})
                return response

            logger.warning(
                "LLM transient error (attempt {}/{}), retrying in {}s: {}",
                attempt, len(self._CHAT_RETRY_DELAYS), delay,
                (response.content or "")[:120].lower(),
            )
            if on_retry_wait is not None:
                await on_retry_wait(f"模型调用暂时失败，{delay} 秒后重试...")
            await asyncio.sleep(delay)

        return await self._safe_chat(**kw)

    async def _safe_chat_stream(self, **kwargs: Any) -> LLMResponse:
        """Call chat_stream() when available, otherwise fall back to chat()."""
        try:
            chat_stream = getattr(self, "chat_stream", None)
            if callable(chat_stream):
                return await chat_stream(**kwargs)
            kwargs.pop("on_content_delta", None)
            kwargs.pop("on_thinking_delta", None)
            kwargs.pop("on_tool_call_delta", None)
            return await self.chat(**kwargs)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            return LLMResponse(content=f"Error calling LLM: {exc}", finish_reason="error")

    async def chat_stream_with_retry(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        model: str | None = None,
        max_tokens: object = _SENTINEL,
        temperature: object = _SENTINEL,
        reasoning_effort: object = _SENTINEL,
        tool_choice: str | dict[str, Any] | None = None,
        on_content_delta: Optional[Callable[[str], Any]] = None,
        on_thinking_delta: Optional[Callable[[str], Any]] = None,
        on_tool_call_delta: Optional[Callable[[dict[str, Any]], Any]] = None,
        retry_mode: str | None = None,
        on_retry_wait: Optional[Callable[[str], Any]] = None,
    ) -> LLMResponse:
        """Call streaming chat with the same retry policy as chat_with_retry()."""
        if max_tokens is self._SENTINEL:
            max_tokens = self.generation.max_tokens
        if temperature is self._SENTINEL:
            temperature = self.generation.temperature
        if reasoning_effort is self._SENTINEL:
            reasoning_effort = self.generation.reasoning_effort

        kw: dict[str, Any] = dict(
            messages=messages,
            tools=tools,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            reasoning_effort=reasoning_effort,
            tool_choice=tool_choice,
            on_content_delta=on_content_delta,
            on_thinking_delta=on_thinking_delta,
            on_tool_call_delta=on_tool_call_delta,
        )

        for attempt, delay in enumerate(self._CHAT_RETRY_DELAYS, start=1):
            response = await self._safe_chat_stream(**kw)
            if response.finish_reason != "error":
                return response
            if kw.get("tools") and self._is_tools_unsupported_error(response.content):
                logger.warning("Model does not support tools, retrying stream without tool definitions")
                return await self._safe_chat_stream(
                    **{**kw, "tools": None, "tool_choice": None, "on_tool_call_delta": None}
                )
            if not self._is_transient_error(response.content):
                return response
            logger.warning(
                "LLM stream transient error (attempt {}/{}), retrying in {}s: {}",
                attempt, len(self._CHAT_RETRY_DELAYS), delay,
                (response.content or "")[:120].lower(),
            )
            if on_retry_wait is not None:
                await on_retry_wait(f"模型流式调用暂时失败，{delay} 秒后重试...")
            await asyncio.sleep(delay)

        return await self._safe_chat_stream(**kw)

    @abstractmethod
    def get_default_model(self) -> str:
        """Get the default model for this provider."""
        pass
