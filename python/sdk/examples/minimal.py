#!/usr/bin/env python3
"""Run one minimal-agent turn through the bundled Python SDK runtime."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from astro_one import AstroOne


def main() -> None:
    """Parse one task and print the agent's final response."""
    parser = argparse.ArgumentParser()
    configured_home = os.environ.get("ASTRO_ONE_HOME", "")
    parser.add_argument("prompt", help="Task for the minimal agent")
    parser.add_argument("--workspace", type=Path, default=Path.cwd())
    parser.add_argument(
        "--astro-one-home",
        type=Path,
        default=Path(configured_home) if configured_home.strip() else None,
    )
    parser.add_argument("--profile", default="sdk-minimal")
    parser.add_argument("--session-id")
    parser.add_argument("--provider", default="deepseek-official")
    parser.add_argument("--model", default=os.environ.get("ASTRO_ONE_MODEL", "deepseek-v4-flash"))
    parser.add_argument("--max-tokens", type=int)
    args = parser.parse_args()
    if args.astro_one_home is None:
        parser.error("--astro-one-home or a non-empty ASTRO_ONE_HOME is required")

    workspace = args.workspace.resolve()
    astro_one_home = args.astro_one_home.resolve()
    with AstroOne(
        provider=args.provider,
        model=args.model,
        max_tokens=args.max_tokens,
        cwd=str(workspace),
        astro_one_home=str(astro_one_home),
        profile=args.profile,
    ) as harness:
        result = harness.run(args.prompt, session_id=args.session_id)
    print(result.final_response)


if __name__ == "__main__":
    main()
