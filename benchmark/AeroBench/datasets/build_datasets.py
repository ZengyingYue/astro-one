"""AeroBench 实际数据集生成脚本

基于 tools/ 下的真实观测/仿真数据截取和程序化扩充，
为 MLF、IOD、Orbin 三项任务生成带 ground truth 标注的 CSV 数据集。

运行方式：
    cd benchmark/AeroBench && python datasets/build_datasets.py
"""

from __future__ import annotations

import math
import os
import sys
from pathlib import Path
from typing import Any

import numpy as np

# 定位项目根目录
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_TOOLS_DIR = _PROJECT_ROOT / "tools"
_OUTPUT_DIR = Path(__file__).resolve().parent

SEED = 42
rng = np.random.RandomState(SEED)


def _header(text: str) -> None:
    print(f"\n{'='*55}")
    print(f"  {text}")
    print(f"{'='*55}")


# ════════════════════════════════════════════════════════════════
# MLF — 轨道机动检测数据集
# ════════════════════════════════════════════════════════════════

def build_mlf_dataset() -> None:
    """基于 demo_data.csv 真实参数分布，生成带机动/非机动标注的测试数据集。

    输出: mlf_benchmark.csv (含 23 维轨道参数 + ground truth 机动标签)
    """
    _header("MLF 轨道机动检测数据集")

    demo_path = _TOOLS_DIR / "mlf" / "data" / "demo_data.csv"
    if not demo_path.exists():
        print("[SKIP] mlf/demo_data.csv 不存在")
        return

    raw = np.loadtxt(demo_path, delimiter=",", skiprows=0)
    if raw.ndim == 1:
        raw = raw.reshape(1, -1)
    n_rows, n_cols = raw.shape
    feature_dim = min(n_cols, 23)

    print(f"  源数据: {n_rows} 行, {n_cols} 列, 取前 {feature_dim} 维作为特征")

    # 从真实数据中提取统计分布
    base_features = raw[:, :feature_dim].astype(np.float64)
    feat_mean = np.mean(base_features, axis=0)
    feat_std = np.std(base_features, axis=0)
    feat_std = np.where(feat_std < 1e-6, 1.0, feat_std)

    # 哪些特征的变化指示机动 (半长轴 idx≈9, 倾角 idx≈2, RAAN idx≈3)
    MANEUVER_SENSITIVE_IDX = [2, 3, 9]  # inclination, RAAN, semi_major_axis

    records: list[dict[str, Any]] = []
    # 为每颗卫星生成一段轨道参数序列
    n_satellites = 80
    time_steps_per_sat = 10

    for sat_id in range(1, n_satellites + 1):
        # 随机选一个真实样本作为基准
        template_idx = rng.randint(0, n_rows)
        base = base_features[template_idx].copy()

        # 45% 的卫星发生机动（提高机动比例确保基准测试有意义）
        is_maneuver_sat = rng.rand() < 0.45
        # 机动在序列中段发生（第3-7步之间随机），持续2-3步
        maneuver_start = rng.randint(3, 7) if is_maneuver_sat else -1
        maneuver_duration = rng.randint(2, 4) if is_maneuver_sat else 0

        for step in range(time_steps_per_sat):
            # 基础轨道参数 + 小幅随机噪声
            noise = rng.normal(0, 0.0001, size=feature_dim) * feat_std * 0.001
            feat = base + noise

            # 时间演进微调
            drift = np.zeros(feature_dim)
            drift[9] = step * rng.uniform(-0.05, 0.05)  # 半长轴自然漂移
            drift[2] = step * rng.uniform(-0.0001, 0.0001)
            drift[3] = step * rng.uniform(-0.00005, 0.00005)

            label = 0
            maneuver_time_days = 999.0

            in_maneuver = (is_maneuver_sat
                           and maneuver_start <= step < maneuver_start + maneuver_duration)
            if in_maneuver:
                label = 1
                maneuver_time_days = float(step) * 10.0 / 86400.0
                # 注入机动信号（逐渐增强的轨道参数变化）
                progress = (step - maneuver_start + 1) / maneuver_duration
                feat[9] += rng.uniform(80, 600) * progress  # 半长轴
                feat[2] += rng.uniform(0.01, 0.10) * progress  # 倾角
                feat[3] += rng.uniform(0.005, 0.05) * progress  # RAAN
            elif is_maneuver_sat and step >= maneuver_start + maneuver_duration:
                # 机动后稳定轨道
                label = 0
                feat[9] += rng.uniform(80, 600)
                feat[2] += rng.uniform(0.01, 0.10)
                feat[3] += rng.uniform(0.005, 0.05)

            feat += drift
            feat = np.clip(feat, feat_mean - 4 * feat_std, feat_mean + 4 * feat_std)

            records.append({
                "satellite_id": sat_id,
                "step": step,
                "label": label,
                "maneuver_time_days": maneuver_time_days,
                "features": feat.copy(),
            })

    # 写入 CSV（带 header）
    output_path = _OUTPUT_DIR / "mlf_benchmark.csv"
    feature_cols = [f"feat_{i}" for i in range(feature_dim)]
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("satellite_id,step,label,maneuver_time_days," + ",".join(feature_cols) + "\n")
        for r in records:
            vals = [str(r["satellite_id"]), str(r["step"]),
                    str(r["label"]), f"{r['maneuver_time_days']:.6f}"]
            vals += [f"{v:.10f}" for v in r["features"]]
            f.write(",".join(vals) + "\n")

    n_maneuver = sum(1 for r in records if r["label"] == 1)
    print(f"  生成 {len(records)} 个样本 (机动={n_maneuver}, 非机动={len(records)-n_maneuver})")
    print(f"  保存到: {output_path}")


# ════════════════════════════════════════════════════════════════
# IOD — 轨道初定数据集
# ════════════════════════════════════════════════════════════════

def build_iod_dataset() -> None:
    """基于 demo_input.csv 真实观测数据扩充，生成带 ground truth 的轨道初定数据集。

    输出: iod_benchmark.csv (观测数据 + 真实卫星位置/速度)
    """
    _header("IOD 轨道初定数据集")

    demo_path = _TOOLS_DIR / "iod" / "data" / "demo_input.csv"
    if not demo_path.exists():
        print("[SKIP] iod/demo_input.csv 不存在")
        return

    # IOD demo CSV 含时间字符串列，用 pandas 读取
    import pandas as pd
    df = pd.read_csv(demo_path)
    # demo_input.csv 列结构:
    # 0:Time, 1:Relative Time (s), 2:Observer Longitude, 3:Observer Latitude,
    # 4:Observer Altitude, 5-7:Observer ECI X/Y/Z, 8-10:Direction Vector X/Y/Z,
    # 11:Distance, 12:Elevation, 13:Azimuth,
    # 14-16:Satellite ECI X/Y/Z (GT), 17-19:Satellite Velocity X/Y/Z (GT)
    raw = df.values
    n_rows = raw.shape[0]
    print(f"  源数据: {n_rows} 行")

    # 取数值列 (跳过第0列时间字符串)
    numeric_data = np.array(df.iloc[:, 1:].values, dtype=np.float64)
    obs_eci_data = numeric_data[:, 4:7]   # Observer ECI
    dir_vec_data = numeric_data[:, 7:10]  # Direction Vector
    sat_eci_data = numeric_data[:, 13:16] # Satellite ECI (GT)
    sat_vel_data = numeric_data[:, 16:19] # Satellite Velocity (GT)
    obs_lon = numeric_data[:, 1]          # Observer Longitude
    obs_lat = numeric_data[:, 2]          # Observer Latitude
    obs_alt = numeric_data[:, 3]          # Observer Altitude
    rel_time = numeric_data[:, 0]         # Relative Time (s)

    # 统计每个维度的噪声水平
    records: list[dict[str, Any]] = []
    for i in range(n_rows):
        # 基础真值
        base_sat_eci = sat_eci_data[i].copy()
        base_sat_vel = sat_vel_data[i].copy()
        base_obs_eci = obs_eci_data[i].copy()
        base_dir_vec = dir_vec_data[i].copy()

        # 在基础真值上生成 5 个不同噪声水平的变体
        noise_levels = [0.0, 0.5, 1.0, 2.0, 5.0]
        for nl in noise_levels:
            # 对观测数据加噪（模拟实际观测误差）
            obs_noise_scale = 10.0 * nl  # 观测者位置误差 (m级)
            dir_noise_scale = 0.002 * nl  # 方向向量误差
            sat_noise_scale = 50.0 * nl   # 卫星位置误差 (m级) - 用于不同难度级别

            obs_eci_noisy = base_obs_eci + rng.normal(0, obs_noise_scale, 3)
            dir_vec_noisy = base_dir_vec + rng.normal(0, dir_noise_scale, 3)
            # 归一化方向向量
            dir_norm = np.sqrt(np.sum(dir_vec_noisy**2))
            if dir_norm > 1e-12:
                dir_vec_noisy /= dir_norm

            # Ground truth 也加入微小偏差模拟不同轨道弧段
            sat_eci_gt = base_sat_eci + rng.normal(0, sat_noise_scale, 3)
            sat_vel_gt = base_sat_vel + rng.normal(0, sat_noise_scale * 0.001, 3)

            records.append({
                "relative_time_s": float(rel_time[i]) + nl * rng.uniform(-5, 5),
                "obs_lon": float(obs_lon[i]),
                "obs_lat": float(obs_lat[i]),
                "obs_alt": float(obs_alt[i]),
                "obs_eci_x": obs_eci_noisy[0],
                "obs_eci_y": obs_eci_noisy[1],
                "obs_eci_z": obs_eci_noisy[2],
                "dir_vec_x": dir_vec_noisy[0],
                "dir_vec_y": dir_vec_noisy[1],
                "dir_vec_z": dir_vec_noisy[2],
                "sat_eci_x_true": sat_eci_gt[0],
                "sat_eci_y_true": sat_eci_gt[1],
                "sat_eci_z_true": sat_eci_gt[2],
                "sat_vel_x_true": sat_vel_gt[0],
                "sat_vel_y_true": sat_vel_gt[1],
                "sat_vel_z_true": sat_vel_gt[2],
                "noise_level": nl,
            })

    output_path = _OUTPUT_DIR / "iod_benchmark.csv"
    header = (
        "relative_time_s,obs_lon,obs_lat,obs_alt,"
        "obs_eci_x,obs_eci_y,obs_eci_z,"
        "dir_vec_x,dir_vec_y,dir_vec_z,"
        "sat_eci_x_true,sat_eci_y_true,sat_eci_z_true,"
        "sat_vel_x_true,sat_vel_y_true,sat_vel_z_true,"
        "noise_level"
    )
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(header + "\n")
        for r in records:
            f.write(
                f"{r['relative_time_s']:.3f},{r['obs_lon']:.6f},{r['obs_lat']:.6f},{r['obs_alt']:.3f},"
                f"{r['obs_eci_x']:.6f},{r['obs_eci_y']:.6f},{r['obs_eci_z']:.6f},"
                f"{r['dir_vec_x']:.10f},{r['dir_vec_y']:.10f},{r['dir_vec_z']:.10f},"
                f"{r['sat_eci_x_true']:.6f},{r['sat_eci_y_true']:.6f},{r['sat_eci_z_true']:.6f},"
                f"{r['sat_vel_x_true']:.10f},{r['sat_vel_y_true']:.10f},{r['sat_vel_z_true']:.10f},"
                f"{r['noise_level']:.1f}\n"
            )

    print(f"  生成 {len(records)} 个样本 "
          f"(源数据 {n_rows} 行 × {len([0.0,0.5,1.0,2.0,5.0])} 噪声级)")
    print(f"  保存到: {output_path}")


# ════════════════════════════════════════════════════════════════
# Orbin — 轨道预测数据集
# ════════════════════════════════════════════════════════════════

def build_orbin_dataset() -> None:
    """基于真实观测数据 + 二体动力学传播，生成轨道预测数据集。

    输出: orbin_benchmark.csv (观测弧段 + 未来位置/速度真值)
    """
    _header("Orbin 轨道预测数据集")

    # 尝试从真实数据获取初始轨道
    data_dir = _TOOLS_DIR / "orbin" / "data"
    csv_files = sorted(data_dir.glob("*.csv"))
    real_positions: list[np.ndarray] = []
    real_velocities: list[np.ndarray] = []

    for csv_f in csv_files:
        try:
            raw = np.loadtxt(csv_f, delimiter=",", skiprows=1)
            if raw.ndim == 1:
                raw = raw.reshape(1, -1)
            if raw.shape[1] >= 10:
                for i in range(raw.shape[0]):
                    real_positions.append(raw[i, 4:7].astype(np.float64))
                    real_velocities.append(raw[i, 7:10].astype(np.float64))
        except Exception:
            continue

    if real_positions:
        print(f"  从真实数据提取 {len(real_positions)} 个初始状态")
    else:
        print("  真实数据不可用，使用 LEO 标准轨道")

    mu = 3.986004418e5  # km³/s²

    def rk4_propagate(r0, v0, dt, steps=1):
        """RK4 轨道传播"""
        r, v = r0.copy(), v0.copy()
        h = dt / steps
        for _ in range(steps):
            r_mag = math.sqrt(r[0]**2 + r[1]**2 + r[2]**2)
            a0 = -mu * r / (r_mag**3)
            k1r, k1v = v * h, a0 * h

            r_mag = math.sqrt((r[0]+0.5*k1r[0])**2 + (r[1]+0.5*k1r[1])**2 + (r[2]+0.5*k1r[2])**2)
            a1 = -mu * (r + 0.5*k1r) / (r_mag**3)
            k2r, k2v = (v + 0.5*k1v) * h, a1 * h

            r_mag = math.sqrt((r[0]+0.5*k2r[0])**2 + (r[1]+0.5*k2r[1])**2 + (r[2]+0.5*k2r[2])**2)
            a2 = -mu * (r + 0.5*k2r) / (r_mag**3)
            k3r, k3v = (v + 0.5*k2v) * h, a2 * h

            r_mag = math.sqrt((r[0]+k3r[0])**2 + (r[1]+k3r[1])**2 + (r[2]+k3r[2])**2)
            a3 = -mu * (r + k3r) / (r_mag**3)
            k4r, k4v = (v + k3v) * h, a3 * h

            v = v + (k1v + 2*k2v + 2*k3v + k4v) / 6.0
            r = r + (k1r + 2*k2r + 2*k3r + k4r) / 6.0
        return r, v

    records: list[dict[str, Any]] = []
    r_earth = 6371.0

    # 生成多条轨道弧段
    n_tracks = 20
    steps_per_track = 20
    predict_horizon_steps = 5  # 预测未来5步

    for track in range(n_tracks):
        # 选择初始轨道状态
        if real_positions and track < len(real_positions):
            idx = track % len(real_positions)
            r0 = real_positions[idx].copy()
            v0 = real_velocities[idx].copy()
        else:
            # LEO 圆轨道 ~500km
            alt = 500.0 + rng.uniform(-50, 50)
            r0 = np.array([r_earth + alt, 0.0, 0.0])
            v_circ = math.sqrt(mu / (r_earth + alt))
            v0 = np.array([0.0, v_circ, 0.0])

        # 随机轨道面旋转
        angle = rng.uniform(0, 2 * math.pi)
        c, s = math.cos(angle), math.sin(angle)
        rot = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
        r0 = rot @ r0 + rng.normal(0, 5, 3)
        v0 = rot @ v0 + rng.normal(0, 0.005, 3)

        # 传播整条轨道
        dt = 60.0  # 60 秒步长
        total_steps = steps_per_track + predict_horizon_steps + 5  # 额外留 margin
        positions = [r0.copy()]
        velocities = [v0.copy()]
        r_cur, v_cur = r0.copy(), v0.copy()
        for _ in range(total_steps):
            r_cur, v_cur = rk4_propagate(r_cur, v_cur, dt)
            positions.append(r_cur.copy())
            velocities.append(v_cur.copy())

        # 生成样本：使用前 steps_per_track 步作为观测弧段，
        # 后续 predict_horizon_steps 步作为预测目标（ground truth）
        max_offset = min(5, total_steps - steps_per_track - predict_horizon_steps)
        for offset in range(0, max_offset):
            start = offset
            end_obs = start + steps_per_track

            # 观测弧段的数据（模拟地面站观测）
            for i in range(start, end_obs):
                r = positions[i]
                v = velocities[i]
                r_mag = np.sqrt(np.sum(r**2))
                az = math.degrees(math.atan2(r[1], r[0])) % 360
                el = math.degrees(math.asin(max(-1.0, min(1.0, r[2] / max(r_mag, 1e-9)))))
                rng_km = r_mag

                # 预测目标：观测弧段后 predict_horizon_steps 步
                future_idx = min(end_obs + (i - start), len(positions) - 1)
                future_r = positions[future_idx]
                future_v = velocities[future_idx]

                records.append({
                    "track_id": track,
                    "time_step": i,
                    "azimuth_deg": round(az, 3),
                    "elevation_deg": round(el, 3),
                    "range_km": round(rng_km, 6),
                    "eci_x_m": round(r[0] * 1000, 3),
                    "eci_y_m": round(r[1] * 1000, 3),
                    "eci_z_m": round(r[2] * 1000, 3),
                    "obs_vector_x": 0.0,
                    "obs_vector_y": 0.0,
                    "obs_vector_z": 0.0,
                    # Ground truth: 当前状态
                    "x_km_true": r[0],
                    "y_km_true": r[1],
                    "z_km_true": r[2],
                    "vx_km_s_true": v[0],
                    "vy_km_s_true": v[1],
                    "vz_km_s_true": v[2],
                    # 预测目标: 未来的状态
                    "x_km_future": future_r[0],
                    "y_km_future": future_r[1],
                    "z_km_future": future_r[2],
                    "vx_km_s_future": future_v[0],
                    "vy_km_s_future": future_v[1],
                    "vz_km_s_future": future_v[2],
                })

    # Shuffle
    rng.shuffle(records)

    # 限制总数
    max_records = 600
    records = records[:max_records]

    output_path = _OUTPUT_DIR / "orbin_benchmark.csv"
    header = (
        "track_id,time_step,azimuth_deg,elevation_deg,range_km,"
        "eci_x_m,eci_y_m,eci_z_m,obs_vector_x,obs_vector_y,obs_vector_z,"
        "x_km_true,y_km_true,z_km_true,"
        "vx_km_s_true,vy_km_s_true,vz_km_s_true,"
        "x_km_future,y_km_future,z_km_future,"
        "vx_km_s_future,vy_km_s_future,vz_km_s_future"
    )
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(header + "\n")
        for r in records:
            f.write(
                f"{r['track_id']},{r['time_step']},"
                f"{r['azimuth_deg']:.3f},{r['elevation_deg']:.3f},{r['range_km']:.6f},"
                f"{r['eci_x_m']:.3f},{r['eci_y_m']:.3f},{r['eci_z_m']:.3f},"
                f"{r['obs_vector_x']:.6f},{r['obs_vector_y']:.6f},{r['obs_vector_z']:.6f},"
                f"{r['x_km_true']:.6f},{r['y_km_true']:.6f},{r['z_km_true']:.6f},"
                f"{r['vx_km_s_true']:.6f},{r['vy_km_s_true']:.6f},{r['vz_km_s_true']:.6f},"
                f"{r['x_km_future']:.6f},{r['y_km_future']:.6f},{r['z_km_future']:.6f},"
                f"{r['vx_km_s_future']:.6f},{r['vy_km_s_future']:.6f},{r['vz_km_s_future']:.6f}\n"
            )

    print(f"  生成 {len(records)} 个样本 ({n_tracks} 条轨道 × 滑动窗口)")
    print(f"  保存到: {output_path}")


# ════════════════════════════════════════════════════════════════
# 总入口
# ════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    os.makedirs(str(_OUTPUT_DIR), exist_ok=True)

    build_mlf_dataset()
    build_iod_dataset()
    build_orbin_dataset()

    print(f"\n{'='*55}")
    print("  所有数据集生成完成！")
    print(f"  输出目录: {_OUTPUT_DIR}")
    print(f"{'='*55}")
