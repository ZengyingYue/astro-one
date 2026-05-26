"""IOD 轨道初定工具 - 基于Transformer的初始轨道确定"""

import os
import sys
from pathlib import Path
from typing import Any

# 动态定位 tools 目录 (只在需要时计算)
def _get_iod_dir():
    _package_dir = Path(__file__).parent.parent.parent  # astro_one/
    _tools_dir = _package_dir.parent / "tools"  # 项目根目录/tools
    return _tools_dir / "iod"

from astro_one.agent.tools.base import Tool


class IODOrbitDeterminationTool(Tool):
    """IOD 轨道初定工具

    基于Transformer的初始轨道确定(Initial Orbit Determination)模型。
    从观测数据和方向向量预测卫星的方向向量、位置和速度。

    输入数据格式: CSV文件，包含：
    - 相对时间 (s)
    - 观测者经纬度高度
    - 观测者ECI坐标
    - 方向向量 X/Y/Z
    """

    def __init__(self):
        self.tools_dir = _get_iod_dir().parent
        self.iod_dir = _get_iod_dir()

    @property
    def name(self) -> str:
        return "iod_orbit_determination"

    @property
    def description(self) -> str:
        return (
            "IOD轨道初定 - 基于Transformer的初始轨道确定。"
            "输入CSV文件（包含观测数据：时间、观测者位置、方向向量），"
            "输出预测的方向向量、卫星ECI位置(km)和速度(km/s)。"
            "用于从地基观测数据确定卫星初始轨道。"
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "csv_file": {
                    "type": "string",
                    "description": "输入CSV文件路径，包含观测数据。如果不提供，将使用demo数据进行演示。",
                },
                "return_states": {
                    "type": "boolean",
                    "description": "是否返回卫星状态（位置和速度）",
                    "default": True,
                },
                "output_file": {
                    "type": "string",
                    "description": "输出结果CSV文件路径（可选）",
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
        csv_file: str = None,
        return_states: bool = True,
        output_file: str = None,
        device: str = "cpu",
        **kwargs: Any,
    ) -> str:
        """执行轨道初定"""
        try:
            # 如果没有提供CSV文件，使用demo数据
            if not csv_file:
                csv_file = str(self.iod_dir / "data" / "demo_input.csv")

            # 检查文件是否存在
            if not csv_file or not os.path.exists(csv_file):
                return f"Error: 输入文件不存在: {csv_file}"

            # 使用 importlib 动态导入，避免 sys.path 冲突
            import importlib.util
            iod_src = str(self.iod_dir / "src")
            predictor_path = os.path.join(iod_src, "predictor.py")
            spec = importlib.util.spec_from_file_location("iod_predictor", predictor_path)
            predictor_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(predictor_module)
            IODPredictor = predictor_module.IODPredictor

            # 初始化预测器
            predictor = IODPredictor(
                model_dir=str(self.iod_dir / "models"),
                device=device,
            )

            # 执行预测
            predictions, states = predictor.predict_from_csv(
                csv_file,
                return_states=return_states,
            )

            # 生成分析报告
            analysis = self._analyze_results(predictions, states)

            # 保存结果（如果需要）
            if output_file:
                import pandas as pd
                result_df = pd.DataFrame({
                    'Direction Vector X': predictions[:, 0],
                    'Direction Vector Y': predictions[:, 1],
                    'Direction Vector Z': predictions[:, 2],
                    'Satellite ECI X (km)': states[:, 0],
                    'Satellite ECI Y (km)': states[:, 1],
                    'Satellite ECI Z (km)': states[:, 2],
                    'Satellite Velocity X (km/s)': states[:, 3],
                    'Satellite Velocity Y (km/s)': states[:, 4],
                    'Satellite Velocity Z (km/s)': states[:, 5],
                })
                result_df.to_csv(output_file, index=False)

            return f"""## IOD 轨道初定结果

### 轨道确定概要
{analysis['summary']}

### 卫星位置 (ECI坐标系, km)
{analysis['position']}

### 卫星速度 (ECI坐标系, km/s)
{analysis['velocity']}

### 军事分析
{analysis['military_analysis']}

### 结果文件
{output_file if output_file else '未保存'}"""

        except Exception as e:
            return f"Error: 轨道初定失败: {str(e)}"

    def _analyze_results(self, predictions, states) -> dict:
        """分析轨道初定结果"""
        import numpy as np

        # 计算轨道参数
        x, y, z = states[:, 0], states[:, 1], states[:, 2]
        vx, vy, vz = states[:, 3], states[:, 4], states[:, 5]

        # 位置统计
        pos_mean = np.mean(np.sqrt(x**2 + y**2 + z**2))
        pos_min = np.min(np.sqrt(x**2 + y**2 + z**2))
        pos_max = np.max(np.sqrt(x**2 + y**2 + z**2))

        # 速度统计
        vel_mean = np.mean(np.sqrt(vx**2 + vy**2 + vz**2))

        # 轨道高度估算 (假设地球半径6371km)
        r_earth = 6371.0
        altitudes = np.sqrt(x**2 + y**2 + z**2) - r_earth

        summary = f"""位置范围: {pos_min:.1f} - {pos_max:.1f} km
平均地心距离: {pos_mean:.1f} km
平均速度: {vel_mean:.3f} km/s
轨道高度范围: {altitudes.min():.1f} - {altitudes.max():.1f} km"""

        # 位置表格
        position = f"""X (km)     Y (km)     Z (km)
{'-'*40}
{x[0]:10.2f}  {y[0]:10.2f}  {z[0]:10.2f} (首点)
{x[len(x)//2]:10.2f}  {y[len(y)//2]:10.2f}  {z[len(z)//2]:10.2f} (中点)
{x[-1]:10.2f}  {y[-1]:10.2f}  {z[-1]:10.2f} (末点)"""

        # 速度表格
        velocity = f"""Vx (km/s)  Vy (km/s)  Vz (km/s)
{'-'*40}
{vx[0]:10.4f}  {vy[0]:10.4f}  {vz[0]:10.4f} (首点)
{vx[len(vx)//2]:10.4f}  {vy[len(vy)//2]:10.4f}  {vz[len(vz)//2]:10.4f} (中点)
{vx[-1]:10.4f}  {vy[-1]:10.4f}  {vz[-1]:10.4f} (末点)"""

        # 军事分析
        avg_alt = np.mean(altitudes)
        alt_span = float(altitudes.max() - altitudes.min())
        r_vec = states[:, 0:3]
        v_vec = states[:, 3:6]
        h_vec = np.cross(r_vec, v_vec)
        h_norm = np.linalg.norm(h_vec, axis=1)
        inclinations = np.degrees(np.arccos(np.clip(h_vec[:, 2] / np.maximum(h_norm, 1e-9), -1, 1)))
        avg_inc = float(np.mean(inclinations))
        speed_std = float(np.std(np.sqrt(vx**2 + vy**2 + vz**2)))

        if avg_alt < 500:
            orbit_type = "低地球轨道 (LEO)"
            description = "具备高分辨率观测潜力，过境窗口短，轨道保持和再访计划对任务价值影响大"
        elif avg_alt < 2000:
            orbit_type = "中地球轨道 (MEO)"
            description = "覆盖范围较广，常见于导航、增强通信和区域服务任务"
        elif avg_alt < 36000:
            orbit_type = "高椭圆轨道 (HEO)"
            description = "可能承担长驻留通信、监测或区域覆盖任务，需要关注远地点驻留区域"
        else:
            orbit_type = "地球同步轨道 (GEO)"
            description = "具备固定区域持续覆盖能力，需关注东西漂移和定点保持状态"

        custody_risk = "高" if alt_span > 100 or speed_std > 0.08 else ("中" if alt_span > 30 else "低")
        inclination_note = (
            "近赤道/低倾角，区域持续覆盖属性较强"
            if avg_inc < 15
            else "中高倾角，具备较强纬向覆盖能力"
            if avg_inc < 70
            else "近极轨/高倾角，适合全球再访和广域侦察"
        )

        military_analysis = f"""
**轨道类型判断**: {orbit_type}
**平均轨道高度**: {avg_alt:.1f} km
**平均倾角估计**: {avg_inc:.2f}°
**目标保持风险**: {custody_risk}

**轨道特性分析**:
- {description}
- {inclination_note}
- 高度变化幅度约 {alt_span:.1f} km，速度离散度约 {speed_std:.4f} km/s，可作为初定质量和后续跟踪压力的参考。

**军事应用研判:**
1. 若为 LEO/近极轨目标，应优先评估对重点区域的再访周期、成像窗口和短时突防观测能力。
2. 若为 MEO/GEO/高轨目标，应重点关注区域覆盖、通信中继、导航增强或预警监视等持续服务价值。
3. 当前结果属于初轨确定，不能单独作为意图判定结论；需与编目轨道、历史观测残差和载荷线索联合研判。

**监视与处置建议:**
1. 在下一过境周期安排至少两站/多时段复测，降低单段初轨带来的目标丢失风险。
2. 将该初轨送入轨道预测链路，快速生成未来 24-72 小时可观测窗口。
3. 对目标保持风险为中高的样本，优先补充角度/测距观测并检查输入时间戳、站址和方向向量格式。
4. 若与已知目标轨道差异异常，标记为可能的新目标、误关联或机动后轨道，进入人工复核队列。
"""

        return {
            "summary": summary,
            "position": position,
            "velocity": velocity,
            "military_analysis": military_analysis,
        }
