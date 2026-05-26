from __future__ import annotations

import asyncio
from pathlib import Path


class FakeTools:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    async def execute(self, name: str, params: dict) -> str:
        self.calls.append((name, params))
        return f"result from {name}"


class FakeProvider:
    def __init__(self, content: str) -> None:
        self.content = content
        self.calls: list[list[dict]] = []

    async def chat_with_retry(self, *, messages, **kwargs):
        from astro_one.providers.base import LLMResponse

        self.calls.append(messages)
        return LLMResponse(content=self.content)


def test_scan_once_runs_matching_tools_and_moves_files(tmp_path: Path) -> None:
    async def run() -> None:
        from astro_one.agent.auto_space_scan import AutoSpaceScanService

        data_root = tmp_path / "data"
        mlf_file = data_root / "mlf" / "maneuver.csv"
        iod_file = data_root / "iod" / "iod.csv"
        orbin_file = data_root / "orbin" / "track.csv"
        for file in (mlf_file, iod_file, orbin_file):
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text("demo", encoding="utf-8")

        reports: list[str] = []
        tools = FakeTools()
        service = AutoSpaceScanService(
            data_root=data_root,
            tools=tools,
            on_report=reports.append,
            poll_interval_s=0.01,
            min_file_age_s=0,
        )

        processed = await service.scan_once()

        assert processed == 3
        assert [call[0] for call in tools.calls] == [
            "mlf_maneuver_detection",
            "iod_orbit_determination",
            "orbin_orbit_prediction",
        ]
        assert tools.calls[0][1]["csv_file"] == str(mlf_file)
        assert tools.calls[1][1]["csv_file"] == str(iod_file)
        assert tools.calls[1][1]["return_states"] is True
        assert tools.calls[2][1]["data_dir"] == str(orbin_file.parent)
        assert not mlf_file.exists()
        assert (data_root / "mlf" / "processed" / "maneuver.csv").exists()
        assert len(reports) == 1
        assert "自动航天数据扫描" in reports[0]
        assert "mlf_maneuver_detection" in reports[0]

    asyncio.run(run())


def test_scan_once_moves_failed_files_to_failed_dir(tmp_path: Path) -> None:
    async def run() -> None:
        from astro_one.agent.auto_space_scan import AutoSpaceScanService

        class FailingTools(FakeTools):
            async def execute(self, name: str, params: dict) -> str:
                self.calls.append((name, params))
                return "Error: bad input"

        data_root = tmp_path / "data"
        file = data_root / "iod" / "bad.csv"
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text("bad", encoding="utf-8")
        reports: list[str] = []

        service = AutoSpaceScanService(
            data_root=data_root,
            tools=FailingTools(),
            on_report=reports.append,
            poll_interval_s=0.01,
            min_file_age_s=0,
        )

        processed = await service.scan_once()

        assert processed == 1
        assert not file.exists()
        assert (data_root / "iod" / "failed" / "bad.csv").exists()
        assert "失败" in reports[0]

    asyncio.run(run())


def test_scan_once_uses_llm_repair_decision_after_tool_failure(tmp_path: Path) -> None:
    async def run() -> None:
        from astro_one.agent.auto_space_scan import AutoSpaceScanService

        class RetryTools(FakeTools):
            async def execute(self, name: str, params: dict) -> str:
                self.calls.append((name, params))
                if len(self.calls) == 1:
                    return "Error: wrong columns"
                return f"result from {name}"

        provider = FakeProvider(
            """
            {
              "action": "retry",
              "tool": "iod_orbit_determination",
              "reason": "The data is observation data in the wrong folder.",
              "csv_content": "time,x,y,z\\n0,1,2,3\\n"
            }
            """
        )
        data_root = tmp_path / "data"
        file = data_root / "mlf" / "misplaced.csv"
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text("messy", encoding="utf-8")
        tools = RetryTools()
        reports: list[str] = []

        service = AutoSpaceScanService(
            data_root=data_root,
            tools=tools,
            on_report=reports.append,
            poll_interval_s=0.01,
            provider=provider,
            model="deepseek-v4-pro",
            min_file_age_s=0,
        )

        processed = await service.scan_once()

        assert processed == 1
        assert [call[0] for call in tools.calls] == [
            "mlf_maneuver_detection",
            "iod_orbit_determination",
        ]
        repaired_path = Path(tools.calls[1][1]["csv_file"])
        assert repaired_path.name == "misplaced.repaired.csv"
        assert not file.exists()
        assert (data_root / "mlf" / "processed" / "misplaced.csv").exists()
        assert (data_root / "mlf" / "processed" / "misplaced.repaired.csv").exists()
        assert "智能修正" in reports[0]
        assert provider.calls

    asyncio.run(run())


def test_scan_once_does_not_reprocess_tool_output_csv(tmp_path: Path) -> None:
    async def run() -> None:
        from astro_one.agent.auto_space_scan import AutoSpaceScanService

        class OutputWritingTools(FakeTools):
            async def execute(self, name: str, params: dict) -> str:
                self.calls.append((name, params))
                output_file = params.get("output_file")
                assert output_file, "scanner must keep tool outputs outside watched input root"
                Path(output_file).parent.mkdir(parents=True, exist_ok=True)
                Path(output_file).write_text("generated", encoding="utf-8")
                return f"result from {name}"

        data_root = tmp_path / "data"
        file = data_root / "mlf" / "maneuver.csv"
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text("input", encoding="utf-8")
        tools = OutputWritingTools()
        service = AutoSpaceScanService(
            data_root=data_root,
            tools=tools,
            poll_interval_s=0.01,
            min_file_age_s=0,
        )

        first = await service.scan_once()
        second = await service.scan_once()

        assert first == 1
        assert second == 0
        assert len(tools.calls) == 1
        output_file = Path(tools.calls[0][1]["output_file"])
        assert output_file.exists()
        assert output_file.parent == data_root / "mlf" / "processed" / "outputs"

    asyncio.run(run())


def test_scan_once_creates_tool_output_directory(tmp_path: Path) -> None:
    async def run() -> None:
        from astro_one.agent.auto_space_scan import AutoSpaceScanService

        class DirectoryCheckingTools(FakeTools):
            async def execute(self, name: str, params: dict) -> str:
                self.calls.append((name, params))
                output_file = Path(params["output_file"])
                assert output_file.parent.exists()
                output_file.write_text("generated", encoding="utf-8")
                return f"result from {name}"

        data_root = tmp_path / "data"
        file = data_root / "orbin" / "sample.csv"
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text("input", encoding="utf-8")
        tools = DirectoryCheckingTools()
        service = AutoSpaceScanService(data_root=data_root, tools=tools, min_file_age_s=0)

        processed = await service.scan_once()

        assert processed == 1
        output_file = Path(tools.calls[0][1]["output_file"])
        assert output_file.parent == data_root / "orbin" / "processed" / "outputs"
        assert output_file.exists()

    asyncio.run(run())


def test_scan_once_waits_for_recent_files_to_stabilize(tmp_path: Path) -> None:
    async def run() -> None:
        from astro_one.agent.auto_space_scan import AutoSpaceScanService

        data_root = tmp_path / "data"
        file = data_root / "orbin" / "copying.csv"
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text("partial", encoding="utf-8")
        tools = FakeTools()
        service = AutoSpaceScanService(
            data_root=data_root,
            tools=tools,
            poll_interval_s=0.01,
            min_file_age_s=60,
        )

        processed = await service.scan_once()

        assert processed == 0
        assert tools.calls == []
        assert file.exists()

    asyncio.run(run())
