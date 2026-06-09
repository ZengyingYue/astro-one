import asyncio
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest
from prompt_toolkit.formatted_text import HTML

from astro_one.cli import commands


@pytest.fixture
def mock_prompt_session():
    """Mock the global prompt session."""
    mock_session = MagicMock()
    mock_session.prompt_async = AsyncMock()
    with patch("astro_one.cli.commands._PROMPT_SESSION", mock_session), \
         patch("astro_one.cli.commands.patch_stdout"):
        yield mock_session


@pytest.mark.asyncio
async def test_read_interactive_input_async_returns_input(mock_prompt_session):
    """Test that _read_interactive_input_async returns the user input from prompt_session."""
    mock_prompt_session.prompt_async.return_value = "hello world"

    result = await commands._read_interactive_input_async()
    
    assert result == "hello world"
    mock_prompt_session.prompt_async.assert_called_once()
    args, _ = mock_prompt_session.prompt_async.call_args
    assert isinstance(args[0], HTML)  # Verify HTML prompt is used


@pytest.mark.asyncio
async def test_read_interactive_input_async_handles_eof(mock_prompt_session):
    """Test that EOFError converts to KeyboardInterrupt."""
    mock_prompt_session.prompt_async.side_effect = EOFError()

    with pytest.raises(KeyboardInterrupt):
        await commands._read_interactive_input_async()


def test_init_prompt_session_creates_session():
    """Test that _init_prompt_session initializes the global session."""
    # Ensure global is None before test
    commands._PROMPT_SESSION = None
    
    with patch("astro_one.cli.commands.PromptSession") as MockSession, \
         patch("astro_one.cli.commands.FileHistory") as MockHistory, \
         patch("pathlib.Path.home") as mock_home:
        
        mock_home.return_value = MagicMock()
        
        commands._init_prompt_session()
        
        assert commands._PROMPT_SESSION is not None
        MockSession.assert_called_once()
        _, kwargs = MockSession.call_args
        assert kwargs["multiline"] is False
        assert kwargs["enable_open_in_editor"] is False


def test_thinking_spinner_pause_stops_and_restarts():
    """Pause should stop the active spinner and restart it afterward."""
    spinner = MagicMock()

    with patch.object(commands.console, "status", return_value=spinner):
        thinking = commands.ThinkingSpinner(enabled=True)
        with thinking:
            with thinking.pause():
                pass

    assert spinner.method_calls == [
        call.start(),
        call.stop(),
        call.start(),
        call.stop(),
    ]


def test_print_cli_progress_line_pauses_spinner_before_printing():
    """CLI progress output should pause spinner to avoid garbled lines."""
    order: list[str] = []
    spinner = MagicMock()
    spinner.start.side_effect = lambda: order.append("start")
    spinner.stop.side_effect = lambda: order.append("stop")

    with patch.object(commands.console, "status", return_value=spinner), \
         patch.object(commands.console, "print", side_effect=lambda *_args, **_kwargs: order.append("print")):
        thinking = commands.ThinkingSpinner(enabled=True)
        with thinking:
            commands._print_cli_progress_line("tool running", thinking)

    assert order == ["start", "stop", "print", "start", "stop"]


def test_streamed_final_fallback_buffers_content_when_no_delta_streamed():
    """A streamed turn with only reasoning deltas should still print the final content."""
    renderer = MagicMock()
    renderer.streamed = False

    result = commands._streamed_final_fallback(
        "我是 astro_one。",
        {"_streamed": True, "latency_ms": 12},
        renderer,
    )

    assert result == ("我是 astro_one。", {"latency_ms": 12})


def test_streamed_final_fallback_ignores_content_after_delta_streamed():
    """Avoid duplicating final content when the live renderer already printed deltas."""
    renderer = MagicMock()
    renderer.streamed = True

    result = commands._streamed_final_fallback(
        "already rendered",
        {"_streamed": True},
        renderer,
    )

    assert result is None


@pytest.mark.asyncio
async def test_print_interactive_progress_line_pauses_spinner_before_printing():
    """Interactive progress output should also pause spinner cleanly."""
    order: list[str] = []
    spinner = MagicMock()
    spinner.start.side_effect = lambda: order.append("start")
    spinner.stop.side_effect = lambda: order.append("stop")

    async def fake_print(_text: str) -> None:
        order.append("print")

    with patch.object(commands.console, "status", return_value=spinner), \
         patch("astro_one.cli.commands._print_interactive_line", side_effect=fake_print):
        thinking = commands.ThinkingSpinner(enabled=True)
        with thinking:
            await commands._print_interactive_progress_line("tool running", thinking)

    assert order == ["start", "stop", "print", "start", "stop"]
