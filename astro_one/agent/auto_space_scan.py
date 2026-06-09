"""Background scanner for aerospace tool hot folders."""

from __future__ import annotations

import asyncio
import csv
import inspect
import json
import shutil
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from loguru import logger


ReportCallback = Callable[[str], Any]


@dataclass(frozen=True)
class SpaceToolSpec:
    folder: str
    tool_name: str
    param_kind: str


SPACE_TOOL_SPECS = (
    SpaceToolSpec("mlf", "mlf_maneuver_detection", "csv_file"),
    SpaceToolSpec("iod", "iod_orbit_determination", "iod_csv"),
    SpaceToolSpec("orbin", "orbin_orbit_prediction", "data_dir"),
)
GENERATED_CSV_NAMES = {"results.csv"}
IOD_REQUIRED_COLUMNS = frozenset({
    "relative time (s)",
    "observer longitude",
    "observer latitude",
    "observer altitude",
    "observer eci x",
    "observer eci y",
    "observer eci z",
    "direction vector x",
    "direction vector y",
    "direction vector z",
})
ORBIN_REQUIRED_COLUMNS = frozenset({
    "time_utcg_",
    "azimuth_deg_",
    "elevation_deg_",
    "range_km_",
    "eci_x_m",
    "eci_y_m",
    "eci_z_m",
    "obs_vector_x",
    "obs_vector_y",
    "obs_vector_z",
})


class AutoSpaceScanService:
    """Poll data folders and run matching aerospace tools."""

    def __init__(
        self,
        data_root: Path,
        tools: Any,
        on_report: ReportCallback | None = None,
        poll_interval_s: float = 10.0,
        provider: Any | Callable[[], Any] | None = None,
        model: str | Callable[[], str | None] | None = None,
        min_file_age_s: float = 2.0,
    ) -> None:
        self.data_root = Path(data_root)
        self.tools = tools
        self.on_report = on_report
        self.poll_interval_s = poll_interval_s
        self.provider = provider
        self.model = model
        self.min_file_age_s = min_file_age_s
        self._task: asyncio.Task | None = None
        self._running = False

    def start(self) -> None:
        """Start background polling."""
        if self._task and not self._task.done():
            return
        self._running = True
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        """Stop background polling."""
        self._running = False
        if not self._task:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    async def _run(self) -> None:
        while self._running:
            try:
                await self.scan_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Auto space scan failed")
            await asyncio.sleep(self.poll_interval_s)

    async def scan_once(self) -> int:
        """Run one scan cycle. Returns number of files handled."""
        handled = 0
        reports: list[str] = []

        for spec in SPACE_TOOL_SPECS:
            folder = self.data_root / spec.folder
            if not folder.exists():
                continue
            for file in self._iter_data_files(folder, self.min_file_age_s):
                handled += 1
                ok, report, artifacts = await self._handle_file(spec, file)
                reports.append(report)
                self._move_file(file, folder / ("processed" if ok else "failed"))
                for artifact in artifacts:
                    if artifact.exists():
                        self._move_file(artifact, folder / ("processed" if ok else "failed"))

        if reports:
            await self._emit_report(self._format_report(reports))
        return handled

    @staticmethod
    def _iter_data_files(folder: Path, min_file_age_s: float = 0) -> list[Path]:
        now = time.time()
        return sorted(
            file
            for file in folder.iterdir()
            if (
                file.is_file()
                and file.suffix.lower() == ".csv"
                and file.name.lower() not in GENERATED_CSV_NAMES
                and not file.stem.lower().endswith(".repaired")
                and now - file.stat().st_mtime >= min_file_age_s
            )
        )

    async def _handle_file(self, spec: SpaceToolSpec, file: Path) -> tuple[bool, str, list[Path]]:
        params = self._build_params(spec, file)
        self._ensure_output_parent(params)
        result = await self.tools.execute(spec.tool_name, params)
        ok = not (isinstance(result, str) and result.lstrip().lower().startswith("error"))
        if ok:
            return (
                True,
                f"### {spec.folder}: {file.name} - 成功\n\n工具：`{spec.tool_name}`\n\n{result}",
                [],
            )

        repaired = await self._try_intelligent_repair(spec, file, str(result))
        if repaired is None:
            return (
                False,
                f"### {spec.folder}: {file.name} - 失败\n\n工具：`{spec.tool_name}`\n\n{result}",
                [],
            )
        repair_spec, repair_file, reason = repaired
        retry_params = self._build_params(repair_spec, repair_file)
        self._ensure_output_parent(retry_params)
        retry_result = await self.tools.execute(repair_spec.tool_name, retry_params)
        retry_ok = not (
            isinstance(retry_result, str) and retry_result.lstrip().lower().startswith("error")
        )
        status = "成功" if retry_ok else "失败"
        report = (
            f"### {spec.folder}: {file.name} - 智能修正{status}\n\n"
            f"首次工具：`{spec.tool_name}`\n\n"
            f"首次错误：{result}\n\n"
            f"修正策略：{reason}\n\n"
            f"重试工具：`{repair_spec.tool_name}`\n\n"
            f"{retry_result}"
        )
        return retry_ok, report, [repair_file]

    @staticmethod
    def _build_params(spec: SpaceToolSpec, file: Path) -> dict[str, Any]:
        output_file = AutoSpaceScanService._output_file_for(spec, file)
        if spec.param_kind == "iod_csv":
            return {
                "csv_file": str(file),
                "return_states": True,
                "output_file": str(output_file),
                "device": "cpu",
            }
        if spec.param_kind == "csv_file":
            return {"csv_file": str(file), "output_file": str(output_file), "device": "cpu"}
        if spec.param_kind == "data_dir":
            return {"data_dir": str(file.parent), "output_file": str(output_file), "device": "cpu"}
        return {}

    @staticmethod
    def _output_file_for(spec: SpaceToolSpec, file: Path) -> Path:
        return file.parent / "processed" / "outputs" / f"{file.stem}.{spec.folder}.results.csv"

    @staticmethod
    def _ensure_output_parent(params: dict[str, Any]) -> None:
        output_file = params.get("output_file")
        if output_file:
            Path(str(output_file)).parent.mkdir(parents=True, exist_ok=True)

    async def _try_intelligent_repair(
        self, spec: SpaceToolSpec, file: Path, error: str
    ) -> tuple[SpaceToolSpec, Path, str] | None:
        """Ask the LLM for a bounded retry decision after a tool failure."""
        column_reroute = self._try_column_reroute(spec, file)
        if column_reroute is not None:
            return column_reroute

        provider = self._current_provider()
        if not provider:
            return None
        decision = await self._ask_repair_decision(spec, file, error)
        if not decision or decision.get("action") != "retry":
            return None
        repair_spec = self._spec_for_tool(str(decision.get("tool") or ""))
        if repair_spec is None:
            return None
        repaired_file = file
        csv_content = decision.get("csv_content")
        if isinstance(csv_content, str) and csv_content.strip():
            repaired_file = file.with_name(f"{file.stem}.repaired.csv")
            repaired_file.write_text(csv_content, encoding="utf-8")
        reason = str(decision.get("reason") or "模型建议重试")
        return repair_spec, repaired_file, reason

    def _try_column_reroute(
        self, spec: SpaceToolSpec, file: Path
    ) -> tuple[SpaceToolSpec, Path, str] | None:
        """Reroute misplaced CSVs by matching their header against known tool schemas."""
        detected = self._detect_csv_tool(file)
        if detected is None or detected.tool_name == spec.tool_name:
            return None
        return detected, file, f"CSV列匹配 {detected.tool_name}，自动改用对应航天工具"

    @classmethod
    def _detect_csv_tool(cls, file: Path) -> SpaceToolSpec | None:
        headers = cls._read_csv_headers(file)
        if not headers:
            return None
        normalized = {header.strip().lower() for header in headers if header.strip()}
        if IOD_REQUIRED_COLUMNS.issubset(normalized):
            return cls._spec_for_tool("iod_orbit_determination")
        if ORBIN_REQUIRED_COLUMNS.issubset(normalized):
            return cls._spec_for_tool("orbin_orbit_prediction")
        return None

    @staticmethod
    def _read_csv_headers(file: Path) -> list[str]:
        try:
            with file.open("r", encoding="utf-8-sig", errors="replace", newline="") as handle:
                return next(csv.reader(handle), [])
        except Exception:
            logger.debug("Could not read CSV header for {}", file)
            return []

    async def _ask_repair_decision(
        self, spec: SpaceToolSpec, file: Path, error: str
    ) -> dict[str, Any] | None:
        sample = file.read_text(encoding="utf-8", errors="replace")[:4000]
        prompt = f"""你是航天数据路由与CSV修复助手。
用户系统把数据文件放入了 {spec.folder} 文件夹，但工具执行失败。

可用工具：
- mlf_maneuver_detection：轨道机动检测，输入轨道参数CSV。
- iod_orbit_determination：初始轨道确定，输入观测数据CSV。
- orbin_orbit_prediction：轨道预测，输入观测数据目录。

请只返回 JSON，不要返回 markdown。格式：
{{
  "action": "retry" 或 "fail",
  "tool": "mlf_maneuver_detection" 或 "iod_orbit_determination" 或 "orbin_orbit_prediction",
  "reason": "简短原因",
  "csv_content": "如果能安全修复为CSV则给出完整CSV文本，否则为空字符串"
}}

错误：
{error}

文件名：{file.name}
文件内容前4000字符：
{sample}
"""
        response = await self._current_provider().chat_with_retry(
            messages=[
                {"role": "system", "content": "你只返回严格 JSON。"},
                {"role": "user", "content": prompt},
            ],
            model=self._current_model(),
        )
        content = response.content or ""
        try:
            return json.loads(self._extract_json(content))
        except Exception:
            logger.warning("Auto space scan repair decision was not valid JSON: {}", content[:200])
            return None

    @staticmethod
    def _extract_json(content: str) -> str:
        text = content.strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:].strip()
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end >= start:
            return text[start:end + 1]
        return text

    def _current_provider(self) -> Any | None:
        return self.provider() if callable(self.provider) else self.provider

    def _current_model(self) -> str | None:
        return self.model() if callable(self.model) else self.model

    @staticmethod
    def _spec_for_tool(tool_name: str) -> SpaceToolSpec | None:
        for spec in SPACE_TOOL_SPECS:
            if spec.tool_name == tool_name:
                return spec
        return None

    @staticmethod
    def _move_file(file: Path, target_dir: Path) -> Path:
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / file.name
        if target.exists():
            stem, suffix = file.stem, file.suffix
            i = 1
            while target.exists():
                target = target_dir / f"{stem}_{i}{suffix}"
                i += 1
        shutil.move(str(file), str(target))
        return target

    async def _emit_report(self, report: str) -> None:
        if not self.on_report:
            return
        result = self.on_report(report)
        if inspect.isawaitable(result):
            await result

    @staticmethod
    def _format_report(reports: list[str]) -> str:
        return "## 自动航天数据扫描结果\n\n" + "\n\n---\n\n".join(reports)
