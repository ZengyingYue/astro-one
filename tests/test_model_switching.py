from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from astro_one.agent.loop import AgentLoop
from astro_one.bus.events import InboundMessage
from astro_one.bus.queue import MessageBus
from astro_one.providers.base import LLMResponse
from astro_one.config.schema import Config


class _ProviderFactory:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def __call__(self, config: Config) -> object:
        self.calls.append((config.agents.defaults.provider, config.agents.defaults.model))
        return _provider(config.agents.defaults.model)


@dataclass
class _SwitchResult:
    content: str
    provider: object | None = None
    model: str | None = None


def _provider(name: str) -> MagicMock:
    provider = MagicMock()
    provider.get_default_model.return_value = name
    provider.chat_with_retry = AsyncMock(return_value=LLMResponse(content="should not call"))
    return provider


def test_model_command_switches_live_agent_provider_and_model(tmp_path: Path) -> None:
    async def run() -> None:
        bus = MessageBus()
        initial_provider = _provider("qwen3.5:27b")
        deepseek_provider = _provider("deepseek-v4-pro")

        async def switcher(command: str) -> _SwitchResult:
            assert command == "/model deepseek"
            return _SwitchResult(
                content="已切换到 DeepSeek V4 Pro",
                provider=deepseek_provider,
                model="deepseek-v4-pro",
            )

        loop = AgentLoop(
            bus=bus,
            provider=initial_provider,
            workspace=tmp_path,
            model="qwen3.5:27b",
            model_switcher=switcher,
        )

        response = await loop._process_message(
            InboundMessage(channel="cli", sender_id="user", chat_id="direct", content="/model deepseek")
        )

        assert response is not None
        assert "DeepSeek V4 Pro" in response.content
        assert loop.provider is deepseek_provider
        assert loop.model == "deepseek-v4-pro"
        assert loop.subagents.provider is deepseek_provider
        assert loop.subagents.model == "deepseek-v4-pro"
        assert loop.consolidator.provider is deepseek_provider
        assert loop.consolidator.model == "deepseek-v4-pro"
        assert loop.dream.provider is deepseek_provider
        assert loop.dream.model == "deepseek-v4-pro"
        initial_provider.chat_with_retry.assert_not_awaited()

    asyncio.run(run())


def test_models_command_returns_switcher_listing_without_calling_llm(tmp_path: Path) -> None:
    async def run() -> None:
        provider = _provider("qwen3.5:27b")

        async def switcher(command: str) -> _SwitchResult:
            assert command == "/models"
            return _SwitchResult(content="Ollama: qwen3.5:27b\n在线: deepseek-v4-pro")

        loop = AgentLoop(
            bus=MessageBus(),
            provider=provider,
            workspace=tmp_path,
            model="qwen3.5:27b",
            model_switcher=switcher,
        )

        response = await loop._process_message(
            InboundMessage(channel="cli", sender_id="user", chat_id="direct", content="/models")
        )

        assert response is not None
        assert "qwen3.5:27b" in response.content
        assert "deepseek-v4-pro" in response.content
        provider.chat_with_retry.assert_not_awaited()

    asyncio.run(run())


def test_model_switcher_switches_to_deepseek_v4_pro_and_saves_config(monkeypatch) -> None:
    from astro_one.cli.commands import _make_model_switcher

    config = Config()
    config.providers.deepseek.api_key = "deepseek-key"
    saved: list[tuple[str, str]] = []
    factory = _ProviderFactory()

    monkeypatch.setattr("astro_one.cli.commands.save_config", lambda cfg: saved.append(
        (cfg.agents.defaults.provider, cfg.agents.defaults.model)
    ))
    monkeypatch.setattr("astro_one.cli.commands._make_provider", factory)

    switcher = _make_model_switcher(config)
    result = asyncio.run(switcher("/model deepseek"))

    assert result.model == "deepseek-v4-pro"
    assert result.provider is not None
    assert "deepseek-v4-pro" in result.content
    assert saved == [("deepseek", "deepseek-v4-pro")]
    assert factory.calls == [("deepseek", "deepseek-v4-pro")]


def test_model_switcher_lists_and_switches_ollama_models(monkeypatch) -> None:
    from astro_one.cli.commands import _make_model_switcher

    config = Config()
    config.providers.ollama.api_base = "http://127.0.0.1:11434"
    saved: list[tuple[str, str]] = []
    factory = _ProviderFactory()

    async def fake_list(_api_base: str | None) -> list[str]:
        return ["qwen3.5:27b", "llama3.2"]

    monkeypatch.setattr("astro_one.cli.commands._list_ollama_models", fake_list)
    monkeypatch.setattr("astro_one.cli.commands.save_config", lambda cfg: saved.append(
        (cfg.agents.defaults.provider, cfg.agents.defaults.model)
    ))
    monkeypatch.setattr("astro_one.cli.commands._make_provider", factory)

    switcher = _make_model_switcher(config)
    listing = asyncio.run(switcher("/models"))
    switched = asyncio.run(switcher("/model ollama llama3.2"))

    assert "qwen3.5:27b" in listing.content
    assert "llama3.2" in listing.content
    assert switched.model == "llama3.2"
    assert switched.provider is not None
    assert saved == [("ollama", "llama3.2")]
    assert factory.calls == [("ollama", "llama3.2")]
