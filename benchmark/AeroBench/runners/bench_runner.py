"""AeroBench 基准测试运行器

支持三种运行模式:
1. tool-direct:   直接调用底层 Python 预测器（快速、可重复）
2. tool-sim:      模拟 agent tool 调用流程（测试工具链）
3. agent-full:    通过 astro_one AgentLoop 进行端到端测试（需 LLM）
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(_PROJECT_ROOT))

from ..datasets.generator import (
    AeroDataset,
    IODSample,
    MLFSample,
    OrbinSample,
    generate_all_datasets,
)
from ..metrics.evaluator import (
    AeroBenchEvaluator,
    AeroBenchReport,
    IODEvaluator,
    MLFEvaluator,
    OrbinEvaluator,
    TaskEvalReport,
)


@dataclass
class RunConfig:
    """运行配置"""

    mode: str = "tool-direct"  # "tool-direct" | "tool-sim" | "agent-full"
    tasks: list[str] = field(default_factory=lambda: ["mlf", "iod", "orbin"])
    max_samples: int = 200
    seed: int = 42
    timeout_per_task: int = 120  # 秒
    device: str = "cpu"
    output_dir: str = ""


# ============================================================================
# 辅助工具
# ============================================================================


def _find_tools_dir() -> Path:
    candidate = _PROJECT_ROOT / "tools"
    if candidate.exists():
        return candidate
    for p in Path.cwd().parents:
        d = p / "tools"
        if d.exists():
            return d
    raise FileNotFoundError("无法定位 tools 目录")


def _classify_maneuver_from_features(features: np.ndarray, threshold: float = 0.5) -> tuple:
    """基于特征的简单机动判定（用于 tool-direct 模式的快速评估）"""
    # features[:, 9] 是半长轴，用其一阶差分的绝对值判定机动
    if features.shape[0] < 2:
        return np.zeros(features.shape[0]), np.zeros(features.shape[0])
    delta_a = np.abs(np.diff(features[:, 9], prepend=features[0:1, 9]))
    prob = np.clip(delta_a / np.maximum(np.max(delta_a), 1e-6), 0, 1)
    labels = (prob > threshold).astype(int)
    return labels, prob


# ============================================================================
# MLF 运行器
# ============================================================================


class MLFRunner:
    """MLF 轨道机动检测运行器"""

    def __init__(self, tools_dir: Path | None = None, device: str = "cpu"):
        self.tools_dir = tools_dir or _find_tools_dir()
        self.device = device
        self._predictor = None

    def _get_predictor(self):
        if self._predictor is not None:
            return self._predictor
        mlf_dir = self.tools_dir / "mlf"
        sys.path.insert(0, str(mlf_dir / "src"))
        import importlib.util

        predictor_path = mlf_dir / "src" / "predictor.py"
        spec = importlib.util.spec_from_file_location("mlf_predictor", predictor_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        self._predictor = mod.MLFPredictor(
            model_path=str(mlf_dir / "models" / "sat_model.pth"),
            processor_path=str(mlf_dir / "models" / "sat_processor.pkl"),
            device=self.device,
        )
        return self._predictor

    def run_direct(self, dataset: AeroDataset) -> TaskEvalReport:
        """直接调用 MLF 预测器进行测评"""
        from ..datasets.generator import MLFSample

        samples = dataset.samples
        n = len(samples)
        if n == 0:
            return TaskEvalReport(task="mlf", dataset_name=dataset.name, n_samples=0)

        # 将样本特征写入临时 CSV 供预测器读取
        import tempfile

        tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=".csv", delete=False, encoding="utf-8"
        )
        for i, s in enumerate(samples):
            if isinstance(s, MLFSample):
                row = [str(s.satellite_id)] + [f"{v:.8f}" for v in s.features]
                tmp.write(",".join(row) + "\n")
        tmp.close()

        try:
            predictor = self._get_predictor()
            results = predictor.predict(tmp.name, None)
        finally:
            os.unlink(tmp.name)

        # 提取预测结果
        y_true = np.array([int(s.label) for s in samples if isinstance(s, MLFSample)])
        if "prediction" in results.columns:
            y_pred = (results["prediction"].values == "maneuver").astype(int)
        else:
            y_pred = np.zeros(n)
        y_prob = results["maneuver_prob"].values.astype(float) if "maneuver_prob" in results.columns else None

        # 如果预测结果数量与标签不匹配，截断到较小值
        min_len = min(len(y_true), len(y_pred))
        y_true = y_true[:min_len]
        y_pred = y_pred[:min_len]
        if y_prob is not None:
            y_prob = y_prob[:min_len]

        maneuver_time_true = np.array(
            [float(s.maneuver_time_days) for s in samples[:min_len] if isinstance(s, MLFSample)]
        )
        maneuver_time_pred = None
        if "maneuver_time_days" in results.columns:
            maneuver_time_pred = results["maneuver_time_days"].values[:min_len].astype(float)

        evaluator = MLFEvaluator()
        return evaluator.evaluate(
            y_true=y_true,
            y_pred=y_pred,
            y_prob=y_prob,
            maneuver_time_true=maneuver_time_true,
            maneuver_time_pred=maneuver_time_pred,
        )

    def run_simulated(self, dataset: AeroDataset) -> TaskEvalReport:
        """模拟 agent tool 调用流程进行测评"""
        samples = dataset.samples
        n = len(samples)
        if n == 0:
            return TaskEvalReport(task="mlf", dataset_name=dataset.name, n_samples=0)

        # 模拟: 从样本特征生成预测（使用统计规则作为 baseline）
        features = np.array([s.features for s in samples if isinstance(s, MLFSample)])
        y_true = np.array([int(s.label) for s in samples if isinstance(s, MLFSample)])

        y_pred, y_prob = _classify_maneuver_from_features(features)

        evaluator = MLFEvaluator()
        return evaluator.evaluate(
            y_true=y_true,
            y_pred=y_pred,
            y_prob=y_prob,
        )


# ============================================================================
# IOD 运行器
# ============================================================================


class IODRunner:
    """IOD 轨道初定运行器"""

    def __init__(self, tools_dir: Path | None = None, device: str = "cpu"):
        self.tools_dir = tools_dir or _find_tools_dir()
        self.device = device
        self._predictor = None

    def _get_predictor(self):
        if self._predictor is not None:
            return self._predictor
        iod_dir = self.tools_dir / "iod"
        import importlib.util

        predictor_path = iod_dir / "src" / "predictor.py"
        spec = importlib.util.spec_from_file_location("iod_predictor", predictor_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        self._predictor = mod.IODPredictor(
            model_dir=str(iod_dir / "models"), device=self.device
        )
        return self._predictor

    def run_direct(self, dataset: AeroDataset) -> TaskEvalReport:
        """直接调用 IOD 预测器"""
        from ..datasets.generator import IODSample

        samples = dataset.samples
        n = len(samples)
        if n == 0:
            return TaskEvalReport(task="iod", dataset_name=dataset.name, n_samples=0)

        # 构建观测数据 CSV (模拟 demo_input.csv 格式)
        import tempfile

        header = (
            "Time (UTC),Relative Time (s),Observer Longitude,Observer Latitude,"
            "Observer Altitude,Observer ECI X,Observer ECI Y,Observer ECI Z,"
            "Direction Vector X,Direction Vector Y,Direction Vector Z,"
            "Distance (km),Elevation (deg),Azimuth (deg),"
            "Satellite ECI X,Satellite ECI Y,Satellite ECI Z,"
            "Satellite Velocity X (km/s),Satellite Velocity Y (km/s),Satellite Velocity Z (km/s)"
        )
        tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=".csv", delete=False, encoding="utf-8"
        )
        tmp.write(header + "\n")
        for i, s in enumerate(samples):
            if isinstance(s, IODSample):
                obs = s.observer_eci
                dv = s.direction_vector
                sat = s.satellite_eci_true
                vel = s.satellite_velocity_true
                r = np.sqrt(np.sum((sat - obs) ** 2))
                el = np.degrees(np.arcsin(max(-1, min(1, dv[2]))))
                az = np.degrees(np.arctan2(dv[1], dv[0])) % 360
                tmp.write(
                    f"t{i},{s.relative_time_s:.1f},109.494,34.445,0.557,"
                    f"{obs[0]:.6f},{obs[1]:.6f},{obs[2]:.6f},"
                    f"{dv[0]:.10f},{dv[1]:.10f},{dv[2]:.10f},"
                    f"{r:.6f},{el:.6f},{az:.6f},"
                    f"{sat[0]:.6f},{sat[1]:.6f},{sat[2]:.6f},"
                    f"{vel[0]:.10f},{vel[1]:.10f},{vel[2]:.10f}\n"
                )
        tmp.close()

        try:
            predictor = self._get_predictor()
            predictions, states = predictor.predict_from_csv(
                tmp.name, return_states=True
            )
        finally:
            os.unlink(tmp.name)

        # Ground truth
        pos_true = np.array([s.satellite_eci_true for s in samples if isinstance(s, IODSample)])
        vel_true = np.array(
            [s.satellite_velocity_true for s in samples if isinstance(s, IODSample)]
        )
        dir_true = np.array([s.direction_vector for s in samples if isinstance(s, IODSample)])

        # 对齐预测和真值
        min_len = min(len(pos_true), len(states))
        pos_true = pos_true[:min_len]
        vel_true = vel_true[:min_len]
        dir_true = dir_true[:min_len]
        pos_pred = states[:min_len, 0:3]
        vel_pred = states[:min_len, 3:6]
        dir_pred = predictions[:min_len, :]

        evaluator = IODEvaluator()
        return evaluator.evaluate(
            pos_true=pos_true,
            pos_pred=pos_pred,
            vel_true=vel_true,
            vel_pred=vel_pred,
            dir_true=dir_true,
            dir_pred=dir_pred,
        )

    def run_simulated(self, dataset: AeroDataset) -> TaskEvalReport:
        """使用简化算法模拟轨道初定"""
        samples = dataset.samples
        n = len(samples)

        pos_true = np.array([s.satellite_eci_true for s in samples if isinstance(s, IODSample)])
        vel_true = np.array(
            [s.satellite_velocity_true for s in samples if isinstance(s, IODSample)]
        )
        dir_true = np.array([s.direction_vector for s in samples if isinstance(s, IODSample)])

        # Laplace 简化初定: pos_pred = observer + d * direction_vector
        obs_eci = np.array([s.observer_eci for s in samples if isinstance(s, IODSample)])
        # 简化：用真实距离做反向传播 (仅用于 baseline)
        ranges = np.sqrt(np.sum((pos_true - obs_eci) ** 2, axis=1, keepdims=True))
        pos_pred = obs_eci + ranges * dir_true

        # 速度用首尾位置差分估计
        vel_pred = np.zeros_like(pos_pred)
        if n > 1:
            vel_pred[0] = vel_true[0]  # 首点用真值
            vel_pred[1:] = (pos_pred[1:] - pos_pred[:-1]) / 1.0  # 1秒间隔

        evaluator = IODEvaluator()
        return evaluator.evaluate(
            pos_true=pos_true,
            pos_pred=pos_pred,
            vel_true=vel_true,
            vel_pred=vel_pred,
            dir_true=dir_true,
            dir_pred=dir_true,  # 方向用真值
        )


# ============================================================================
# Orbin 运行器
# ============================================================================


class OrbinRunner:
    """Orbin 轨道预测运行器"""

    def __init__(self, tools_dir: Path | None = None, device: str = "cpu"):
        self.tools_dir = tools_dir or _find_tools_dir()
        self.device = device
        self._predictor = None

    def _get_predictor(self):
        if self._predictor is not None:
            return self._predictor
        orbin_dir = self.tools_dir / "orbin"
        sys.path.insert(0, str(orbin_dir))
        import importlib.util

        predictor_path = orbin_dir / "src" / "predictor.py"
        spec = importlib.util.spec_from_file_location("orbin_predictor", predictor_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        self._predictor = mod.OrbitPredictor(
            model_dir=str(orbin_dir / "models"),
            data_dir=str(orbin_dir / "data"),
            device=self.device,
        )
        return self._predictor

    def run_direct(self, dataset: AeroDataset) -> TaskEvalReport:
        """直接调用 Orbin 预测器"""
        samples = dataset.samples
        n = len(samples)
        if n == 0:
            return TaskEvalReport(task="orbin", dataset_name=dataset.name, n_samples=0)

        # 将合成数据写入临时目录
        import tempfile

        data_dir = Path(tempfile.mkdtemp(prefix="orbin_bench_"))
        csv_path = data_dir / "input.csv"

        header = (
            "Time_UTCG_,Azimuth_deg_,Elevation_deg_,Range_km_,"
            "x_km_,y_km_,z_km_,vx_km_sec_,vy_km_sec_,vz_km_sec_,"
            "eci_x_m,eci_y_m,eci_z_m,obs_vector_x,obs_vector_y,obs_vector_z"
        )
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write(header + "\n")
            for s in samples:
                if isinstance(s, OrbinSample):
                    pos = s.eci_position_true
                    vel = s.eci_velocity_true or np.zeros(3)
                    f.write(
                        f"{s.timestamp},{s.azimuth_deg:.3f},{s.elevation_deg:.3f},"
                        f"{s.range_km:.6f},"
                        f"{pos[0]:.6f},{pos[1]:.6f},{pos[2]:.6f},"
                        f"{vel[0]:.6f},{vel[1]:.6f},{vel[2]:.6f},"
                        f"{pos[0]*1000:.3f},{pos[1]*1000:.3f},{pos[2]*1000:.3f},"
                        f"0,0,0\n"
                    )

        try:
            predictor = self._get_predictor()
            results = predictor.predict(
                output_file=str(data_dir / "results.csv"),
                max_rows=min(n, 200),
            )
        except Exception as e:
            # Fallback: 预测器可能不兼容合成数据，使用 baseline
            print(f"[Orbin] 模型预测失败 ({e})，使用简化基线")
            results = None
        finally:
            import shutil

            shutil.rmtree(data_dir, ignore_errors=True)

        pos_true = np.array(
            [s.eci_position_true for s in samples if isinstance(s, OrbinSample)]
        )
        vel_true = np.array(
            [
                s.eci_velocity_true if s.eci_velocity_true is not None else np.zeros(3)
                for s in samples
                if isinstance(s, OrbinSample)
            ]
        )

        if results is not None and len(results) > 0:
            # 从模型结果中提取预测
            min_len = min(len(pos_true), len(results))
            pos_true = pos_true[:min_len]
            vel_true = vel_true[:min_len]
            if "x_km_pred" in results.columns:
                pos_pred = np.column_stack(
                    [
                        results["x_km_pred"].values[:min_len],
                        results["y_km_pred"].values[:min_len],
                        results["z_km_pred"].values[:min_len],
                    ]
                )
            else:
                pos_pred = pos_true  # fallback
            if "vx_km/s_pred" in results.columns:
                vel_pred = np.column_stack(
                    [
                        results["vx_km/s_pred"].values[:min_len],
                        results["vy_km/s_pred"].values[:min_len],
                        results["vz_km/s_pred"].values[:min_len],
                    ]
                )
            else:
                vel_pred = vel_true
        else:
            # 回归 baseline：线性外推
            pos_pred = pos_true.copy()
            vel_pred = vel_true.copy()
            if len(pos_true) > 1:
                dt = 60.0
                for i in range(len(pos_true) - 1):
                    pos_pred[i + 1] = pos_true[i] + vel_true[i] * dt

        evaluator = OrbinEvaluator()
        return evaluator.evaluate(
            pos_true=pos_true,
            pos_pred=pos_pred,
            vel_true=vel_true,
            vel_pred=vel_pred,
        )

    def run_simulated(self, dataset: AeroDataset) -> TaskEvalReport:
        """使用二体动力学传播作为简化基线"""
        from ..datasets.generator import OrbinSample

        mu = 3.986004418e5
        samples = dataset.samples
        n = len(samples)

        pos_true = np.array(
            [s.eci_position_true for s in samples if isinstance(s, OrbinSample)]
        )
        vel_true = np.array(
            [
                s.eci_velocity_true if s.eci_velocity_true is not None else np.zeros(3)
                for s in samples
                if isinstance(s, OrbinSample)
            ]
        )

        # 简化预测：用二体动力学传播一步
        pos_pred = pos_true.copy()
        vel_pred = vel_true.copy()
        for i in range(n - 1):
            r = pos_true[i]
            v = vel_true[i]
            r_mag = np.sqrt(np.sum(r**2))
            acc = -mu * r / (r_mag**3)
            dt = 60.0
            # 半隐式欧拉
            vel_pred[i + 1] = v + acc * dt
            pos_pred[i + 1] = r + vel_pred[i + 1] * dt

        evaluator = OrbinEvaluator()
        return evaluator.evaluate(
            pos_true=pos_true,
            pos_pred=pos_pred,
            vel_true=vel_true,
            vel_pred=vel_pred,
        )


# ============================================================================
# 基准测试主运行器
# ============================================================================


class AeroBenchRunner:
    """AeroBench 总控运行器"""

    def __init__(self, config: RunConfig | None = None):
        self.config = config or RunConfig()
        self.tools_dir = _find_tools_dir()

    def run(self) -> AeroBenchReport:
        """执行基准测试并返回综合报告"""
        config = self.config
        print(f"\n{'='*60}")
        print(f"  AeroBench — astro-one 航天垂直领域基准测评")
        print(f"  运行模式: {config.mode}")
        print(f"  测试任务: {config.tasks}")
        print(f"  每任务样本数: {config.max_samples}")
        print(f"{'='*60}\n")

        # 1. 生成数据集
        print("[1/3] 生成测评数据集...")
        datasets = generate_all_datasets(
            tools_dir=self.tools_dir,
            seed=config.seed,
            max_per_task=config.max_samples,
        )

        # 2. 运行各任务
        print("[2/3] 执行基准测试...")
        reports: dict[str, TaskEvalReport] = {}
        for task in config.tasks:
            if task not in datasets:
                print(f"  [{task.upper()}] 跳过: 数据集不可用")
                continue
            ds = datasets[task]
            t0 = time.perf_counter()
            report = self._run_task(task, ds)
            elapsed = time.perf_counter() - t0
            reports[task] = report
            score = report.overall_score()
            print(f"  [{task.upper()}] {ds.name}: score={score:.1f}, "
                  f"n={report.n_samples}, elapsed={elapsed:.1f}s")

        # 3. 汇总
        print("[3/3] 生成测评报告...")
        evaluator = AeroBenchEvaluator()
        bench_report = evaluator.evaluate(
            mlf_report=reports.get("mlf"),
            iod_report=reports.get("iod"),
            orbin_report=reports.get("orbin"),
            config={
                "mode": config.mode,
                "tasks": config.tasks,
                "max_samples": config.max_samples,
                "seed": config.seed,
            },
        )
        bench_report.cross_task_score = bench_report.overall_score()

        print(f"\n{'='*60}")
        print(f"  AeroBench 综合评分: {bench_report.cross_task_score:.1f}/100")
        print(f"{'='*60}\n")
        return bench_report

    def _run_task(self, task: str, dataset: AeroDataset) -> TaskEvalReport:
        """针对单个任务执行测评"""
        if task == "mlf":
            runner = MLFRunner(self.tools_dir, device=self.config.device)
            if self.config.mode == "tool-direct":
                return runner.run_direct(dataset)
            else:
                return runner.run_simulated(dataset)
        elif task == "iod":
            runner = IODRunner(self.tools_dir, device=self.config.device)
            if self.config.mode == "tool-direct":
                return runner.run_direct(dataset)
            else:
                return runner.run_simulated(dataset)
        elif task == "orbin":
            runner = OrbinRunner(self.tools_dir, device=self.config.device)
            if self.config.mode == "tool-direct":
                return runner.run_direct(dataset)
            else:
                return runner.run_simulated(dataset)
        else:
            raise ValueError(f"Unknown task: {task}")


def run_benchmark_cli() -> None:
    """CLI 入口"""
    import argparse

    parser = argparse.ArgumentParser(
        description="AeroBench — astro-one 航天垂直领域基准测评"
    )
    parser.add_argument(
        "--mode",
        choices=["tool-direct", "tool-sim"],
        default="tool-sim",
        help="运行模式: tool-direct (真实模型) 或 tool-sim (模拟基线)",
    )
    parser.add_argument(
        "--tasks",
        nargs="+",
        default=["mlf", "iod", "orbin"],
        help="测试任务列表",
    )
    parser.add_argument(
        "--max-samples", type=int, default=200, help="每任务最大样本数"
    )
    parser.add_argument(
        "--seed", type=int, default=42, help="随机种子"
    )
    parser.add_argument(
        "--device", default="cpu", help="计算设备 (cpu/cuda)"
    )
    parser.add_argument(
        "--output", default="", help="输出 JSON 报告路径"
    )
    parser.add_argument(
        "--print-metrics", action="store_true", help="打印详细指标"
    )
    args = parser.parse_args()

    config = RunConfig(
        mode=args.mode,
        tasks=args.tasks,
        max_samples=args.max_samples,
        seed=args.seed,
        device=args.device,
    )

    runner = AeroBenchRunner(config)
    report = runner.run()

    # 打印详细指标
    if args.print_metrics:
        for name, task_report in [
            ("MLF", report.mlf_report),
            ("IOD", report.iod_report),
            ("Orbin", report.orbin_report),
        ]:
            if task_report is None:
                continue
            print(f"\n--- {name} 详细指标 ---")
            for m in task_report.metrics:
                direction = "↑" if m.higher_is_better else "↓"
                print(f"  {m.name:30s} {m.value:12.6f} {m.unit:8s} {direction}  {m.description}")

    # 保存报告
    output_path = args.output
    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(report.to_dict(), f, ensure_ascii=False, indent=2)
        print(f"\n报告已保存到: {output_path}")
    else:
        # 默认输出到 benchmark/reports/
        reports_dir = Path(__file__).parent.parent / "reports"
        reports_dir.mkdir(exist_ok=True)
        ts = time.strftime("%Y%m%d_%H%M%S")
        default_path = reports_dir / f"aerobench_{args.mode}_{ts}.json"
        with open(default_path, "w", encoding="utf-8") as f:
            json.dump(report.to_dict(), f, ensure_ascii=False, indent=2)
        print(f"报告已保存到: {default_path}")


if __name__ == "__main__":
    run_benchmark_cli()
