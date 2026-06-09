from __future__ import annotations

import pytest

from astro_one.agent.loop import AgentLoop
from astro_one.agent.runner import AgentRunner, AgentRunSpec
from astro_one.agent.tools.base import Tool
from astro_one.agent.tools.registry import ToolRegistry
from astro_one.bus.queue import MessageBus
from astro_one.config.schema import Config
from astro_one.providers.base import GenerationSettings, LLMResponse, ToolCallRequest


class _NoopTool(Tool):
    @property
    def name(self) -> str:
        return "noop"

    @property
    def description(self) -> str:
        return "No-op test tool."

    @property
    def parameters(self) -> dict:
        return {"type": "object", "properties": {}}

    async def execute(self) -> str:
        return "ok"


class _ScriptedProvider:
    def __init__(self, tool_turns: int) -> None:
        self.calls = 0
        self.tool_turns = tool_turns
        self.generation = GenerationSettings()

    async def chat_with_retry(self, **kwargs) -> LLMResponse:
        self.calls += 1
        if self.calls <= self.tool_turns:
            return LLMResponse(
                content="",
                tool_calls=[ToolCallRequest(id=f"call_{self.calls}", name="noop", arguments={})],
            )
        return LLMResponse(content="done")


@pytest.mark.asyncio
async def test_runner_treats_none_max_iterations_as_unbounded() -> None:
    tools = ToolRegistry()
    tools.register(_NoopTool())
    provider = _ScriptedProvider(tool_turns=3)

    result = await AgentRunner(provider).run(AgentRunSpec(
        initial_messages=[{"role": "user", "content": "keep going"}],
        tools=tools,
        model="test-model",
        max_iterations=None,
        max_tool_result_chars=1000,
    ))

    assert result.stop_reason == "completed"
    assert result.final_content == "done"
    assert provider.calls == 4


def test_agent_loop_from_config_ignores_legacy_max_tool_iterations(tmp_path) -> None:
    config = Config()
    config.agents.defaults.workspace = str(tmp_path)
    config.agents.defaults.max_tool_iterations = 40
    provider = _ScriptedProvider(tool_turns=0)
    provider.get_default_model = lambda: "test-model"

    loop = AgentLoop.from_config(config, bus=MessageBus(), provider=provider)

    assert loop.max_iterations is None
    assert loop.subagents.max_iterations is None
