"""Spawn tool for creating background subagents."""

from typing import TYPE_CHECKING, Any

from astro_one.agent.tools.base import Tool

if TYPE_CHECKING:
    from astro_one.agent.subagent import SubagentManager


class SpawnTool(Tool):
    """Tool to spawn a subagent for background task execution."""

    @classmethod
    def enabled(cls, ctx: Any) -> bool:
        return getattr(ctx, "subagent_manager", None) is not None

    @classmethod
    def create(cls, ctx: Any) -> Tool:
        return cls(ctx.subagent_manager)

    def __init__(self, manager: "SubagentManager"):
        self._manager = manager
        self._origin_channel = "cli"
        self._origin_chat_id = "direct"
        self._session_key = "cli:direct"

    def set_context(self, channel: Any, chat_id: str | None = None) -> None:
        """Set the origin context for subagent announcements."""
        if hasattr(channel, "channel") and hasattr(channel, "chat_id"):
            ctx = channel
            self._origin_channel = ctx.channel
            self._origin_chat_id = ctx.chat_id
            self._session_key = ctx.session_key or f"{ctx.channel}:{ctx.chat_id}"
            return

        self._origin_channel = str(channel)
        self._origin_chat_id = str(chat_id or "")
        self._session_key = f"{self._origin_channel}:{self._origin_chat_id}"

    @property
    def name(self) -> str:
        return "spawn"

    @property
    def description(self) -> str:
        return (
            "Spawn a subagent to handle a task in the background. "
            "Use this for complex or time-consuming tasks that can run independently. "
            "The subagent will complete the task and report back when done."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "The task for the subagent to complete",
                },
                "label": {
                    "type": "string",
                    "description": "Optional short label for the task (for display)",
                },
            },
            "required": ["task"],
        }

    async def execute(self, task: str, label: str | None = None, **kwargs: Any) -> str:
        """Spawn a subagent to execute the given task."""
        return await self._manager.spawn(
            task=task,
            label=label,
            origin_channel=self._origin_channel,
            origin_chat_id=self._origin_chat_id,
            session_key=self._session_key,
        )
