"""Orbin 轨道根数预测工具 - 基于Informer的轨道六根数预测"""

import os
import sys
from pathlib import Path
from typing import Any

# 动态定位 tools 目录 (只在需要时计算)
def _get_orbin_dir():
    _package_dir = Path(__file__).parent.parent.parent  # astro_one/
    _tools_dir = _package_dir.parent / "tools"  # 项目根目录/tools
    return _tools_dir / "orbin"

from astro_one.agent.tools.base import Tool


class OrbitPredictionTool(Tool):
    """Orbit 轨道根数预测工具

    基于Informer模型的轨道六根数预测模型。
    从观测数据预测卫星的轨道位置和速度。

    输入数据格式: CSV文件，包含：
    - 时间 (UTCG)
    - 方位角、高度角、距离
    - 卫星ECI位置
    - 观测向量
    """

    def __init__(self):
        self.tools_dir = _get_orbin_dir().parent
        self.orbin_dir = _get_orbin_dir()

    @property
    def name(self) -> str:
        return "orbin_orbit_prediction"

    @property
    def description(self) -> str:
        return (
            "Orbit轨道根数预测 - 基于Informer的轨道六根数预测。"
            "输入观测数据CSV文件，输出预测的卫星位置(km)和速度(km/s)。"
            "使用三模型集成预测，提高准确性。"
            "用于预测卫星未来轨道位置。"
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "data_dir": {
                    "type": "string",
                    "description": "观测数据CSV文件所在目录。如果不提供，将使用demo数据进行演示。",
                },
                "csv_file": {
                    "type": "string",
                    "description": "单个观测数据CSV文件路径（可选）",
                },
                "output_file": {
                    "type": "string",
                    "description": "输出结果CSV文件路径（可选）",
                },
                "max_rows": {
                    "type": "integer",
                    "description": "最大输出行数",
                    "default": 50,
                    "minimum": 1,
                    "maximum": 500,
                },
                "device": {
                    "type": "string",
                    "description": "计算设备",
                    "enum": ["cpu", "cuda"],
                    "default": "cpu",
                },
            },
            "required": [],
        }

    async def execute(
        self,
        data_dir: str = None,
        csv_file: str = None,
        output_file: str = None,
        max_rows: int = 50,
        device: str = "cpu",
        **kwargs: Any,
    ) -> str:
        """执行轨道预测"""
        try:
            # 如果没有提供数据目录，使用demo数据
            if not data_dir:
                data_dir = str(self.orbin_dir / "data")

            # 检查目录是否存在
            if not os.path.exists(data_dir):
                return f"Error: 数据目录不存在: {data_dir}"

            # 添加 orbin 目录到 sys.path，让 train_module 能找到 1021_best.py
            orbin_dir_path = str(self.orbin_dir)
            if orbin_dir_path not in sys.path:
                sys.path.insert(0, orbin_dir_path)

            # 使用 importlib 动态导入，避免 sys.path 冲突
            import importlib.util
            orbin_src = str(self.orbin_dir / "src")
            predictor_path = os.path.join(orbin_src, "predictor.py")
            spec = importlib.util.spec_from_file_location("orbin_predictor", predictor_path)
            predictor_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(predictor_module)
            OrbitPredictor = predictor_module.OrbitPredictor

            # 初始化预测器
            predictor = OrbitPredictor(
                model_dir=str(self.orbin_dir / "models"),
                data_dir=data_dir,
                device=device,
            )

            # 确定输出文件
            if not output_file:
                output_file = str(self.orbin_dir / "results.csv")

            # 执行预测
            results = predictor.predict(output_file=output_file, max_rows=max_rows)

            # 生成分析报告
            analysis = self._analyze_results(results)

            return f"""## Orbit 轨道根数预测结果

### 预测概要
{analysis['summary']}

### 位置预测 (km)
{analysis['position']}

### 速度预测 (km/s)
{analysis['velocity']}

### 预测精度分析
{analysis['accuracy']}

### 军事分析
{analysis['military_analysis']}

### 结果文件
{output_file}"""

        except Exception as e:
            return f"Error: 轨道预测失败: {str(e)}"

    def _analyze_results(self, results) -> dict:
        """分析预测结果"""
        import numpy as np

        # 提取预测值和真实值（如果有）
        pred_cols = [col for col in results.columns if col.endswith('_pred')]
        true_cols = [col for col in results.columns if col.endswith('_true')]

        summary = f"预测样本数: {len(results)}"

        # 位置预测
        x_pred = results['x_km_pred'].values
        y_pred = results['y_km_pred'].values
        z_pred = results['z_km_pred'].values

        position = f"""X (km)          Y (km)          Z (km)
{'-'*45}
{x_pred[0]:15.2f}  {y_pred[0]:15.2f}  {z_pred[0]:15.2f} (首点)
{x_pred[len(x_pred)//2]:15.2f}  {y_pred[len(y_pred)//2]:15.2f}  {z_pred[len(z_pred)//2]:15.2f} (中点)
{x_pred[-1]:15.2f}  {y_pred[-1]:15.2f}  {z_pred[-1]:15.2f} (末点)"""

        # 速度预测
        vx_pred = results['vx_km/s_pred'].values
        vy_pred = results['vy_km/s_pred'].values
        vz_pred = results['vz_km/s_pred'].values

        velocity = f"""Vx (km/s)      Vy (km/s)      Vz (km/s)
{'-'*45}
{vx_pred[0]:13.4f}  {vy_pred[0]:13.4f}  {vz_pred[0]:13.4f} (首点)
{vx_pred[len(vx_pred)//2]:13.4f}  {vy_pred[len(vy_pred)//2]:13.4f}  {vz_pred[len(vz_pred)//2]:13.4f} (中点)
{vx_pred[-1]:13.4f}  {vy_pred[-1]:13.4f}  {vz_pred[-1]:13.4f} (末点)"""

        # 精度分析
        accuracy = ""
        if true_cols:
            rmse = {}
            for pred_col in pred_cols:
                feat = pred_col.replace('_pred', '')
                true_col = feat + '_true'
                if true_col in results.columns:
                    rmse[feat] = np.sqrt(((results[pred_col] - results[true_col]) ** 2).mean())

            accuracy = "**均方根误差 (RMSE):**\n"
            for feat, err in rmse.items():
                if 'km' in feat and '/s' not in feat:
                    accuracy += f"- {feat}: {err:.2f} km\n"
                else:
                    accuracy += f"- {feat}: {err:.4f} km/s\n"
        else:
            accuracy = "无真实值对比数据"

        # 军事分析
        # 计算轨道参数
        r = np.sqrt(x_pred**2 + y_pred**2 + z_pred**2)
        r_earth = 6371.0
        altitudes = r - r_earth

        avg_alt = np.mean(altitudes)
        speeds = np.sqrt(vx_pred**2 + vy_pred**2 + vz_pred**2)
        avg_vel = np.mean(speeds)
        alt_std = float(np.std(altitudes))
        alt_span = float(altitudes.max() - altitudes.min())
        speed_std = float(np.std(speeds))
        r_vec = np.column_stack([x_pred, y_pred, z_pred])
        v_vec = np.column_stack([vx_pred, vy_pred, vz_pred])
        h_vec = np.cross(r_vec, v_vec)
        h_norm = np.linalg.norm(h_vec, axis=1)
        inc = np.degrees(np.arccos(np.clip(h_vec[:, 2] / np.maximum(h_norm, 1e-9), -1, 1)))
        avg_inc = float(np.mean(inc))

        if avg_alt < 500:
            orbit_type = "低地球轨道 (LEO)"
            description = "适合高分辨率观测和快速再访，预测误差会较快影响过境窗口"
        elif avg_alt < 2000:
            orbit_type = "中地球轨道 (MEO)"
            description = "覆盖范围广，常见于导航、通信增强和区域服务轨道"
        elif avg_alt < 36000:
            orbit_type = "高椭圆轨道 (HEO)"
            description = "可能对特定区域形成长驻留覆盖，应关注远地点驻留方向"
        else:
            orbit_type = "地球同步轨道 (GEO)"
            description = "可对固定区域形成持续覆盖，应关注定点保持和漂移趋势"

        # 计算轨道周期（简化估算）
        mu = 3.986e14  # 地球引力常数 m^3/s^2
        r_m = np.mean(r) * 1000  # 转换为米
        period = 2 * np.pi * np.sqrt(r_m**3 / mu) / 60  # 周期（分钟）
        confidence = "高" if true_cols and alt_std < 20 and speed_std < 0.05 else ("中" if alt_std < 80 else "低")
        tracking_priority = "一级" if avg_alt < 2000 or confidence == "低" else ("二级" if avg_alt < 36000 else "三级")

        military_analysis = f"""
**轨道类型判断**: {orbit_type}
**平均轨道高度**: {avg_alt:.1f} km
**平均速度**: {avg_vel:.3f} km/s
**平均倾角估计**: {avg_inc:.2f}°
**预估轨道周期**: {period:.1f} 分钟
**预测可信度**: {confidence}
**跟踪优先级**: {tracking_priority}

**轨道特性**:
- {description}
- 高度离散度 {alt_std:.1f} km，预测段高度跨度 {alt_span:.1f} km，速度离散度 {speed_std:.4f} km/s。
- 轨道高度{'稳定' if alt_std < 10 else '存在可见变化'}，需要结合历史轨道确定是否为正常摄动、模型误差或机动迹象。

**军事应用研判:**
1. 预测位置可直接用于未来过境窗口、地面站可见性和目标保持计划，LEO/MEO 目标应优先保证短周期连续跟踪。
2. 若预测可信度为低或高度/速度离散异常，需警惕输入观测质量问题、目标误关联或机动后轨道未收敛。
3. 对 GEO/高轨目标，重点评估经度漂移、定点保持和覆盖区域变化；对 LEO 目标，重点评估再访频次和重点区域覆盖。

**监视与处置建议:**
1. 以当前预测轨迹生成 24-72 小时跟踪计划，并在首个可见窗口完成实测校正。
2. 将预测残差超过阈值的目标推送到机动检测链路，形成“预测偏离-机动确认”的闭环。
3. 对高优先级目标叠加碰撞/抵近筛查，优先检查同轨道面、相近高度和相近相位目标。
4. 报告中保留预测可信度，避免把单模型外推结果直接作为确定态势结论。
"""

        return {
            "summary": summary,
            "position": position,
            "velocity": velocity,
            "accuracy": accuracy,
            "military_analysis": military_analysis,
        }
