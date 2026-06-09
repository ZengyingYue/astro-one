from astro_one.providers.openai_compat_provider import OpenAICompatProvider


def test_sanitize_messages_preserves_one_tool_message_per_tool_call() -> None:
    provider = OpenAICompatProvider(default_model="deepseek-v4-pro")

    messages = [
        {"role": "user", "content": "check two things"},
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": "call_a",
                    "type": "function",
                    "function": {"name": "first_tool", "arguments": "{}"},
                },
                {
                    "id": "call_b",
                    "type": "function",
                    "function": {"name": "second_tool", "arguments": "{}"},
                },
            ],
        },
        {"role": "tool", "tool_call_id": "call_a", "name": "first_tool", "content": "first"},
        {"role": "tool", "tool_call_id": "call_b", "name": "second_tool", "content": "second"},
        {"role": "user", "content": "continue"},
    ]

    sanitized = provider._sanitize_messages(messages)

    tool_messages = [message for message in sanitized if message["role"] == "tool"]
    assert len(tool_messages) == 2
    assert [message["tool_call_id"] for message in tool_messages] == ["call_a", "call_b"]
