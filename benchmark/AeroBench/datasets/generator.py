"""航天测评数据集生成器

为 MLF（轨道机动检测）、IOD（轨道初定）、Orbin（轨道预测）三项任务
生成带标注的测试数据集。支持从现有工具数据截取和程序化合成两种模式。
"""

from __future__ import annotations

import math
import os
import random
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

# ---- 路径工具 ----

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_TOOLS_DIR = _PROJECT_ROOT / "tools"


def _find_tools_dir() -> Path:
    candidate = _TOOLS_DIR
    if candidate.exists():
        return candidate
    # Fallback: search from CWD
    for p in Path.cwd().parents:
        d = p / "tools"
        if d.exists():
            return d
    raise FileNotFoundError("无法定位 tools 目录，请确保在 astro-one 项目根目录下运行")


# ============================================================================
# 数据类定义
# ============================================================================


@dataclass
class MLFSample:
    """MLF 机动检测样本"""

    satellite_id: int
    features: np.ndarray  # shape: (23,), 轨道参数
    label: int  # 0=no_maneuver, 1=maneuver
    maneuver_time_days: float  # 真实机动时间（天）
    metadata: dict = field(default_factory=dict)


@dataclass
class IODSample:
    """IOD 轨道初定样本"""

    observation_id: int
    relative_time_s: float
    observer_eci: np.ndarray  # (3,)
    direction_vector: np.ndarray  # (3,)
    satellite_eci_true: np.ndarray  # (3,) ground truth
    satellite_velocity_true: np.ndarray  # (3,) ground truth
    metadata: dict = field(default_factory=dict)


@dataclass
class OrbinSample:
    """Orbin 轨道预测样本"""

    timestamp: str
    azimuth_deg: float
    elevation_deg: float
    range_km: float
    eci_position_true: np.ndarray  # (3,)
    eci_velocity_true: np.ndarray | None = None  # (3,) 可选
    metadata: dict = field(default_factory=dict)


@dataclass
class AeroDataset:
    """航天测评数据集"""

    name: str
    task: str  # "mlf" | "iod" | "orbin"
    samples: list[MLFSample | IODSample | OrbinSample]
    train_ratio: float = 0.7
    description: str = ""

    def split(self) -> tuple[list, list]:
        """划分训练/测试集"""
        n = len(self.samples)
        n_train = int(n * self.train_ratio)
        indices = list(range(n))
        random.shuffle(indices)
        train = [self.samples[i] for i in indices[:n_train]]
        test = [self.samples[i] for i in indices[n_train:]]
        return train, test

    @property
    def size(self) -> int:
        return len(self.samples)


# ============================================================================
# MLF 数据集生成器
# ============================================================================


class MLFDatasetGenerator:
    """MLF 轨道机动检测数据集生成器

    基于 tools/mlf/data/ 中的原始数据截取并合成带标注的测试样本。
    同时支持程序化合成含机动信号的样本。
    """

    def __init__(self, tools_dir: Path | None = None, seed: int = 42):
        self.tools_dir = tools_dir or _find_tools_dir()
        self.mlf_dir = self.tools_dir / "mlf"
        self.rng = np.random.RandomState(seed)

    def from_demo_data(self, max_samples: int = 200) -> AeroDataset:
        """从 demo_data.csv 截取样本，合成机动/非机动标注"""
        demo_path = self.mlf_dir / "data" / "demo_data.csv"
        if not demo_path.exists():
            raise FileNotFoundError(f"MLF demo 数据不存在: {demo_path}")

        raw = np.loadtxt(demo_path, delimiter=",", skiprows=0)
        if raw.ndim == 1:
            raw = raw.reshape(1, -1)
        if raw.shape[1] < 23:
            raise ValueError(f"MLF 数据格式不符合预期: 需要 ≥23 列，实际 {raw.shape[1]} 列")

        samples: list[MLFSample] = []
        for i in range(min(max_samples, raw.shape[0])):
            # 第1列是 satellite_id，第2-24列是轨道参数特征
            sat_id = int(raw[i, 0])
            features = raw[i, 1:24].astype(np.float64)

            # 合成标签: 基于轨道参数中的半长轴变化量判断机动
            # 第12列是半长轴相关参数, 变化>阈值则标记为机动
            # demo数据第12列（0-indexed: 11）为半长轴值
            is_maneuver = 0
            maneuver_time = 999.0
            if i < raw.shape[0] - 1:
                delta_a = abs(float(raw[i + 1, 11]) - float(raw[i, 11]))
                # 半长轴变化 > 0.01 米 判定为机动
                is_maneuver = 1 if delta_a > 0.01 else 0
                maneuver_time = float(i + 1) * 10.0 / 86400.0  # 归一化为天

            samples.append(
                MLFSample(
                    satellite_id=sat_id,
                    features=features,
                    label=is_maneuver,
                    maneuver_time_days=maneuver_time,
                    metadata={"source": "demo_data.csv", "row": i},
                )
            )
        return AeroDataset(
            name="MLF-Demo",
            task="mlf",
            samples=samples,
            description=f"从 demo_data.csv 截取的 {len(samples)} 个机动检测样本",
        )

    def synthetic_maneuver_dataset(
        self, n_samples: int = 500, maneuver_ratio: float = 0.3
    ) -> AeroDataset:
        """程序化合成机动检测数据集

        生成含已知机动信号的轨道参数序列：
        - 非机动轨道: 平稳传播（微小噪声）
        - 机动轨道: 在随机时间点注入半长轴/倾角/RAAN 跳变
        """
        samples: list[MLFSample] = []
        n_maneuver = int(n_samples * maneuver_ratio)

        # 参考轨道参数（基于 demo 数据统计）
        base_params = np.array(
            [
                0.0,
                4.0,  # step
                92.5,  # inclination
                90.0,  # RAAN
                0.0288,  # eccentricity
                170.0,  # arg_perigee
                191.5,  # mean_anomaly
                0.0,
                0.0,
                6645100.0,  # semi_major_axis
                0.0,
                0.0,
                0.0,
                92.5,
                90.0,
                0.0288,
                170.0,
                191.5,
                0.0,
                0.0,
                6645100.0,
                0.0,
                0.0,
            ]
        )
        if len(base_params) < 23:
            base_params = np.pad(base_params, (0, max(0, 23 - len(base_params))))

        for i in range(n_samples):
            sat_id = self.rng.randint(10000, 99999)
            noise = self.rng.normal(0, 0.0001, size=23)
            features = base_params[:23] + noise
            is_maneuver = 0
            maneuver_time = 999.0

            if i < n_maneuver:
                is_maneuver = 1
                # 模拟机动: 在随机天数的位置注入轨道参数变化
                maneuver_time = self.rng.uniform(0.5, 30.0)
                # 半长轴跳变
                features[9] += self.rng.uniform(-500, 500)
                # 倾角跳变
                features[2] += self.rng.uniform(-0.1, 0.1)
                # RAAN 跳变
                features[3] += self.rng.uniform(-0.05, 0.05)

            # 添加序列间微小趋势变化（模拟时间演进）
            features[9] += i * self.rng.uniform(-0.01, 0.01)

            samples.append(
                MLFSample(
                    satellite_id=sat_id,
                    features=features,
                    label=is_maneuver,
                    maneuver_time_days=maneuver_time,
                    metadata={"source": "synthetic", "idx": i},
                )
            )

        self.rng.shuffle(samples)
        return AeroDataset(
            name="MLF-Synthetic",
            task="mlf",
            samples=samples,
            description=f"程序化合成的 {n_samples} 个样本（机动率 {maneuver_ratio:.0%}）",
        )

    def from_benchmark_csv(self, csv_path: str | None = None) -> AeroDataset:
        """从预生成的 benchmark CSV 文件加载 MLF 数据集"""
        if csv_path is None:
            csv_path = str(Path(__file__).resolve().parent / "mlf_benchmark.csv")
        p = Path(csv_path)
        if not p.exists():
            raise FileNotFoundError(f"MLF benchmark CSV 不存在: {p}")

        raw = np.loadtxt(p, delimiter=",", skiprows=1)
        if raw.ndim == 1:
            raw = raw.reshape(1, -1)
        samples: list[MLFSample] = []
        for i in range(raw.shape[0]):
            samples.append(MLFSample(
                satellite_id=int(raw[i, 0]),
                features=raw[i, 4:27].astype(np.float64),
                label=int(raw[i, 2]),
                maneuver_time_days=float(raw[i, 3]),
                metadata={"source": str(p.name), "row": i},
            ))
        return AeroDataset(
            name=f"MLF-{p.stem}",
            task="mlf",
            samples=samples,
            description=f"从 {p.name} 加载的 {len(samples)} 个样本",
        )


# ============================================================================
# IOD 数据集生成器
# ============================================================================


class IODDatasetGenerator:
    """IOD 轨道初定数据集生成器"""

    def __init__(self, tools_dir: Path | None = None, seed: int = 42):
        self.tools_dir = tools_dir or _find_tools_dir()
        self.iod_dir = self.tools_dir / "iod"
        self.rng = np.random.RandomState(seed)

    def from_demo_data(self, max_samples: int = 300) -> AeroDataset:
        """从 demo_input.csv 截取带 ground truth 的观测样本"""
        demo_path = self.iod_dir / "data" / "demo_input.csv"
        if not demo_path.exists():
            raise FileNotFoundError(f"IOD demo 数据不存在: {demo_path}")

        raw = np.loadtxt(demo_path, delimiter=",", skiprows=1)
        if raw.ndim == 1:
            raw = raw.reshape(1, -1)
        expected_cols = 21
        if raw.shape[1] < expected_cols:
            raise ValueError(
                f"IOD 数据格式不符合预期: 需要 ≥{expected_cols} 列, 实际 {raw.shape[1]} 列"
            )

        samples: list[IODSample] = []
        for i in range(min(max_samples, raw.shape[0])):
            rel_time = float(raw[i, 1])
            # Observer ECI: columns 5,6,7 (0-indexed)
            obs_eci = raw[i, 5:8].astype(np.float64)
            # Direction vector: columns 8,9,10
            dir_vec = raw[i, 8:11].astype(np.float64)
            # Ground truth satellite ECI: columns 14,15,16
            sat_eci = raw[i, 14:17].astype(np.float64)
            # Ground truth velocity: columns 17,18,19
            sat_vel = raw[i, 17:20].astype(np.float64)

            samples.append(
                IODSample(
                    observation_id=i,
                    relative_time_s=rel_time,
                    observer_eci=obs_eci,
                    direction_vector=dir_vec,
                    satellite_eci_true=sat_eci,
                    satellite_velocity_true=sat_vel,
                    metadata={"source": "demo_input.csv", "row": i},
                )
            )
        return AeroDataset(
            name="IOD-Demo",
            task="iod",
            samples=samples,
            description=f"从 demo_input.csv 截取的 {len(samples)} 个轨道初定样本",
        )

    def synthetic_observation_dataset(
        self, n_samples: int = 400
    ) -> AeroDataset:
        """合成带噪声的观测数据集，用于鲁棒性测试"""
        # 基于 demo 数据的统计参数
        obs_eci_base = np.array([4889.0, 1925.0, 3603.8])
        dir_vec_base = np.array([0.83, -0.37, 0.42])
        sat_eci_base = np.array([13149.0, 40037.0, 990.0])
        sat_vel_base = np.array([-2.92, 0.96, -0.098])

        samples: list[IODSample] = []
        for i in range(n_samples):
            noise_level = 1.0 + 0.5 * self.rng.randn()  # 观测噪声水平
            obs_noise = self.rng.normal(0, 5, size=3) * noise_level
            dir_noise = self.rng.normal(0, 0.005, size=3) * noise_level
            sat_noise = self.rng.normal(0, 10, size=3) * noise_level
            vel_noise = self.rng.normal(0, 0.001, size=3) * noise_level

            # 模拟卫星运动
            t = i * 1.0
            sat_eci = sat_eci_base + sat_vel_base * t + sat_noise

            samples.append(
                IODSample(
                    observation_id=i,
                    relative_time_s=t,
                    observer_eci=obs_eci_base + obs_noise,
                    direction_vector=dir_vec_base + dir_noise,
                    satellite_eci_true=sat_eci,
                    satellite_velocity_true=sat_vel_base + vel_noise,
                    metadata={"source": "synthetic", "noise_level": noise_level},
                )
            )
        return AeroDataset(
            name="IOD-Synthetic",
            task="iod",
            samples=samples,
            description=f"合成的 {n_samples} 个含噪观测样本",
        )

    def from_benchmark_csv(self, csv_path: str | None = None) -> AeroDataset:
        """从预生成的 benchmark CSV 文件加载 IOD 数据集"""
        if csv_path is None:
            csv_path = str(Path(__file__).resolve().parent / "iod_benchmark.csv")
        p = Path(csv_path)
        if not p.exists():
            raise FileNotFoundError(f"IOD benchmark CSV 不存在: {p}")

        raw = np.loadtxt(p, delimiter=",", skiprows=1)
        if raw.ndim == 1:
            raw = raw.reshape(1, -1)
        samples: list[IODSample] = []
        for i in range(raw.shape[0]):
            samples.append(IODSample(
                observation_id=i,
                relative_time_s=float(raw[i, 0]),
                observer_eci=raw[i, 4:7].astype(np.float64),
                direction_vector=raw[i, 7:10].astype(np.float64),
                satellite_eci_true=raw[i, 10:13].astype(np.float64),
                satellite_velocity_true=raw[i, 13:16].astype(np.float64),
                metadata={"source": str(p.name), "noise_level": float(raw[i, 16])},
            ))
        return AeroDataset(
            name=f"IOD-{p.stem}",
            task="iod",
            samples=samples,
            description=f"从 {p.name} 加载的 {len(samples)} 个样本",
        )


# ============================================================================
# Orbin 数据集生成器
# ============================================================================


class OrbinDatasetGenerator:
    """Orbin 轨道根数预测数据集生成器"""

    def __init__(self, tools_dir: Path | None = None, seed: int = 42):
        self.tools_dir = tools_dir or _find_tools_dir()
        self.orbin_dir = self.tools_dir / "orbin"
        self.rng = np.random.RandomState(seed)

    def from_benchmark_csv(self, csv_path: str | None = None) -> AeroDataset:
        """从预生成的 benchmark CSV 文件加载 Orbin 数据集"""
        if csv_path is None:
            csv_path = str(Path(__file__).resolve().parent / "orbin_benchmark.csv")
        p = Path(csv_path)
        if not p.exists():
            raise FileNotFoundError(f"Orbin benchmark CSV 不存在: {p}")

        raw = np.loadtxt(p, delimiter=",", skiprows=1)
        if raw.ndim == 1:
            raw = raw.reshape(1, -1)
        samples: list[OrbinSample] = []
        for i in range(raw.shape[0]):
            samples.append(OrbinSample(
                timestamp=f"t{int(raw[i, 0])}-{int(raw[i, 1])}",
                azimuth_deg=float(raw[i, 2]),
                elevation_deg=float(raw[i, 3]),
                range_km=float(raw[i, 4]),
                eci_position_true=raw[i, 11:14].astype(np.float64),
                eci_velocity_true=raw[i, 14:17].astype(np.float64),
                metadata={
                    "source": str(p.name),
                    "track_id": int(raw[i, 0]),
                    "future_pos": raw[i, 17:20].astype(np.float64),
                    "future_vel": raw[i, 20:23].astype(np.float64),
                },
            ))
        return AeroDataset(
            name=f"Orbin-{p.stem}",
            task="orbin",
            samples=samples,
            description=f"从 {p.name} 加载的 {len(samples)} 个样本",
        )

    def from_raw_data(self, max_samples: int = 300) -> AeroDataset:
        """从 orbin/data/*.csv 截取样本"""
        data_dir = self.orbin_dir / "data"
        csv_files = sorted(data_dir.glob("*.csv"))
        if not csv_files:
            raise FileNotFoundError(f"Orbin 数据目录无 CSV 文件: {data_dir}")

        samples: list[OrbinSample] = []
        for csv_f in csv_files:
            raw = np.loadtxt(csv_f, delimiter=",", skiprows=1)
            if raw.ndim == 1:
                raw = raw.reshape(1, -1)
            n = min(max_samples // len(csv_files), raw.shape[0])
            for i in range(n):
                # 列: Time_UTCG_, Azimuth, Elevation, Range, x, y, z, vx, vy, vz, eci_x, eci_y, eci_z, obs_x, obs_y, obs_z
                samples.append(
                    OrbinSample(
                        timestamp=str(raw[i, 0]) if raw.shape[1] > 0 else f"t{i}",
                        azimuth_deg=float(raw[i, 1]),
                        elevation_deg=float(raw[i, 2]),
                        range_km=float(raw[i, 3]),
                        eci_position_true=raw[i, 4:7].astype(np.float64),
                        eci_velocity_true=(
                            raw[i, 7:10].astype(np.float64) if raw.shape[1] >= 10 else None
                        ),
                        metadata={"source": csv_f.name, "row": i},
                    )
                )
            if len(samples) >= max_samples:
                break

        return AeroDataset(
            name="Orbin-Real",
            task="orbin",
            samples=samples[:max_samples],
            description=f"从 {len(csv_files)} 个真实观测文件截取的 {len(samples[:max_samples])} 个样本",
        )

    def synthetic_prediction_dataset(
        self, n_samples: int = 400, n_steps: int = 50
    ) -> AeroDataset:
        """合成轨道预测数据集

        基于二体轨道动力学传播一段弧段，生成连续的观测-预测对。
        """
        mu_earth = 3.986004418e5  # km³/s²
        r_earth = 6371.0

        def _orbit_propagate(r0, v0, dt_s):
            """简化的二体轨道传播 (Kepler)"""
            # 使用数值传播（RK4单步）
            h = max(1.0, dt_s)
            n_steps_rk = max(1, int(dt_s / h))

            r, v = r0.copy(), v0.copy()
            for _ in range(n_steps_rk):
                r_mag = np.sqrt(np.sum(r**2))
                acc = -mu_earth * r / (r_mag**3)
                # RK4
                k1v = acc * h
                k1r = v * h
                k2v = (-mu_earth * (r + 0.5 * k1r) / np.sum((r + 0.5 * k1r) ** 2) ** 1.5) * h
                k2r = (v + 0.5 * k1v) * h
                k3v = (-mu_earth * (r + 0.5 * k2r) / np.sum((r + 0.5 * k2r) ** 2) ** 1.5) * h
                k3r = (v + 0.5 * k2v) * h
                k4v = (-mu_earth * (r + k3r) / np.sum((r + k3r) ** 2) ** 1.5) * h
                k4r = (v + k3v) * h
                v = v + (k1v + 2 * k2v + 2 * k3v + k4v) / 6
                r = r + (k1r + 2 * k2r + 2 * k3r + k4r) / 6
            return r, v

        # 初始轨道（LEO 圆轨道 ~400km）
        alt = 400.0
        r0 = np.array([r_earth + alt, 0.0, 0.0])  # km
        v0 = np.array([0.0, np.sqrt(mu_earth / (r_earth + alt)), 0.0])  # km/s

        samples: list[OrbinSample] = []
        # 生成多条轨道
        n_tracks = max(5, n_samples // n_steps)
        for track in range(n_tracks):
            # 随机轨道面扰动
            rot_angle = self.rng.uniform(0, 2 * np.pi)
            cos_a, sin_a = np.cos(rot_angle), np.sin(rot_angle)
            rot = np.array([[cos_a, -sin_a, 0], [sin_a, cos_a, 0], [0, 0, 1]])
            r_init = rot @ r0 + self.rng.normal(0, 10, 3)
            v_init = rot @ v0 + self.rng.normal(0, 0.01, 3)

            r_current, v_current = r_init, v_init
            for step in range(n_steps):
                dt = 60.0  # 60秒步长
                r_next, v_next = _orbit_propagate(r_current, v_current, dt)

                # 计算观测几何
                r_mag = np.sqrt(np.sum(r_next**2))
                az = np.degrees(math.atan2(r_next[1], r_next[0]))
                el = np.degrees(math.asin(max(-1, min(1, r_next[2] / r_mag))))

                samples.append(
                    OrbinSample(
                        timestamp=f"synth_t{track * n_steps + step}",
                        azimuth_deg=az % 360,
                        elevation_deg=el,
                        range_km=r_mag,
                        eci_position_true=r_next,
                        eci_velocity_true=v_next,
                        metadata={
                            "source": "synthetic",
                            "track": track,
                            "step": step,
                        },
                    )
                )
                r_current, v_current = r_next, v_next

            if len(samples) >= n_samples:
                break

        self.rng.shuffle(samples)
        return AeroDataset(
            name="Orbin-Synthetic",
            task="orbin",
            samples=samples[:n_samples],
            description=f"基于二体动力学的 {len(samples[:n_samples])} 个合成轨道预测样本",
        )


# ============================================================================
# 便捷函数
# ============================================================================


def generate_all_datasets(
    tools_dir: Path | None = None, seed: int = 42, max_per_task: int = 300,
    *, prefer_csv: bool = True
) -> dict[str, AeroDataset]:
    """生成全部三类任务的测评数据集

    Args:
        prefer_csv: 优先使用预生成的 benchmark CSV 文件，不存在则回退到合成。

    Returns:
        dict with keys "mlf", "iod", "orbin"
    """
    random.seed(seed)
    np.random.seed(seed)

    datasets: dict[str, AeroDataset] = {}

    # MLF
    try:
        mlf_gen = MLFDatasetGenerator(tools_dir, seed=seed)
        if prefer_csv:
            csv_path = Path(__file__).resolve().parent / "mlf_benchmark.csv"
            if csv_path.exists():
                datasets["mlf"] = mlf_gen.from_benchmark_csv(str(csv_path))
                print(f"[MLF] 从 CSV 加载 {datasets['mlf'].size} 个样本")
            else:
                datasets["mlf"] = mlf_gen.synthetic_maneuver_dataset(
                    n_samples=max_per_task, maneuver_ratio=0.3
                )
                print(f"[MLF] 合成生成 {datasets['mlf'].size} 个样本")
        else:
            datasets["mlf"] = mlf_gen.synthetic_maneuver_dataset(
                n_samples=max_per_task, maneuver_ratio=0.3
            )
            print(f"[MLF] 合成生成 {datasets['mlf'].size} 个样本")
    except Exception as e:
        print(f"[MLF] 数据集生成失败: {e}")

    # IOD
    try:
        iod_gen = IODDatasetGenerator(tools_dir, seed=seed)
        if prefer_csv:
            csv_path = Path(__file__).resolve().parent / "iod_benchmark.csv"
            if csv_path.exists():
                datasets["iod"] = iod_gen.from_benchmark_csv(str(csv_path))
                print(f"[IOD] 从 CSV 加载 {datasets['iod'].size} 个样本")
            else:
                datasets["iod"] = iod_gen.synthetic_observation_dataset(
                    n_samples=max_per_task
                )
                print(f"[IOD] 合成生成 {datasets['iod'].size} 个样本")
        else:
            datasets["iod"] = iod_gen.synthetic_observation_dataset(
                n_samples=max_per_task
            )
            print(f"[IOD] 合成生成 {datasets['iod'].size} 个样本")
    except Exception as e:
        print(f"[IOD] 数据集生成失败: {e}")

    # Orbin
    try:
        orbin_gen = OrbinDatasetGenerator(tools_dir, seed=seed)
        if prefer_csv:
            csv_path = Path(__file__).resolve().parent / "orbin_benchmark.csv"
            if csv_path.exists():
                datasets["orbin"] = orbin_gen.from_benchmark_csv(str(csv_path))
                print(f"[Orbin] 从 CSV 加载 {datasets['orbin'].size} 个样本")
            else:
                datasets["orbin"] = orbin_gen.synthetic_prediction_dataset(
                    n_samples=max_per_task, n_steps=50
                )
                print(f"[Orbin] 合成生成 {datasets['orbin'].size} 个样本")
        else:
            datasets["orbin"] = orbin_gen.synthetic_prediction_dataset(
                n_samples=max_per_task, n_steps=50
            )
            print(f"[Orbin] 合成生成 {datasets['orbin'].size} 个样本")
    except Exception as e:
        print(f"[Orbin] 数据集生成失败: {e}")

    return datasets
