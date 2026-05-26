"""MLF 轨道机动检测工具 - 基于液体状态机的卫星轨道机动检测"""

import os
import sys
from pathlib import Path
from typing import Any

# 动态定位 tools 目录 (只在需要时计算)
def _get_mlf_dir():
    _package_dir = Path(__file__).parent.parent.parent  # astro_one/
    _tools_dir = _package_dir.parent / "tools"  # 项目根目录/tools
    return _tools_dir / "mlf"

from astro_one.agent.tools.base import Tool


class MLFManeuverDetectionTool(Tool):
    """MLF 轨道机动检测工具

    基于液体状态机(Liquid State Machine)的卫星轨道机动检测模型。
    用于从卫星轨道参数数据预测机动状态，输出机动概率和预测机动时间。

    输入数据格式: CSV文件，包含卫星轨道参数（倾角、RAAN、偏心率等23维特征）
    """

    def __init__(self):
        self.tools_dir = _get_mlf_dir().parent
        self.mlf_dir = _get_mlf_dir()

    @property
    def name(self) -> str:
        return "mlf_maneuver_detection"

    @property
    def description(self) -> str:
        return (
            "MLF轨道机动检测 - 基于液体状态机的卫星轨道机动检测。"
            "输入CSV文件（包含卫星轨道参数），输出机动检测结果："
            "prediction(maneuver/no_maneuver)、maneuver_prob(机动概率)、"
            "maneuver_time_days(预测机动时间)。"
            "用于检测卫星是否发生轨道机动，并预测机动时间。"
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "csv_file": {
                    "type": "string",
                    "description": "输入CSV文件路径，包含卫星轨道参数数据。如果不提供，将使用demo数据进行演示。",
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
        output_file: str = None,
        device: str = "cpu",
        **kwargs: Any,
    ) -> str:
        """执行轨道机动检测"""
        try:
            # 如果没有提供CSV文件，使用demo数据
            if not csv_file:
                csv_file = str(self.mlf_dir / "data" / "demo_data.csv")
                output_file = str(self.mlf_dir / "results.csv")

            # 检查文件是否存在
            if not os.path.exists(csv_file):
                return f"Error: 输入文件不存在: {csv_file}"

            # 确保MLF路径在sys.path最前面
            mlf_src = str(self.mlf_dir / "src")
            if mlf_src not in sys.path:
                sys.path.insert(0, mlf_src)

            # 使用 importlib 动态导入，避免 sys.path 冲突
            import importlib.util
            mlf_src = str(self.mlf_dir / "src")
            predictor_path = os.path.join(mlf_src, "predictor.py")
            spec = importlib.util.spec_from_file_location("mlf_predictor", predictor_path)
            predictor_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(predictor_module)
            MLFPredictor = predictor_module.MLFPredictor

            # 初始化预测器
            predictor = MLFPredictor(
                model_path=str(self.mlf_dir / "models" / "sat_model.pth"),
                processor_path=str(self.mlf_dir / "models" / "sat_processor.pkl"),
                device=device,
            )

            # 执行预测
            results = predictor.predict(csv_file, output_file)

            # 生成分析报告
            analysis = self._analyze_results(results)

            return f"""## MLF 轨道机动检测结果

### 检测概要
{analysis['summary']}

### 详细结果
{results.to_string(index=False)}

### 军事分析
{analysis['military_analysis']}

### 结果文件
{output_file if output_file else '未保存'}"""

        except Exception as e:
            return f"Error: 轨道机动检测失败: {str(e)}"

    def _analyze_results(self, results) -> dict:
        """分析检测结果"""
        total = len(results)
        maneuver_count = (results['prediction'] == 'maneuver').sum()
        no_maneuver_count = (results['prediction'] == 'no_maneuver').sum()

        summary = f"""总样本数: {total}
预测机动: {maneuver_count} ({maneuver_count/total*100:.1f}%)
预测未机动: {no_maneuver_count} ({no_maneuver_count/total*100:.1f}%)"""

        # 军事分析
        high_prob_maneuver = results[results['maneuver_prob'] > 0.8]
        medium_prob_maneuver = results[(results['maneuver_prob'] > 0.5) & (results['maneuver_prob'] <= 0.8)]
        low_prob_maneuver = results[(results['maneuver_prob'] > 0.3) & (results['maneuver_prob'] <= 0.5)]
        top_targets = results.sort_values("maneuver_prob", ascending=False).head(5)
        max_prob = float(results["maneuver_prob"].max()) if total else 0.0
        min_time = float(high_prob_maneuver["maneuver_time_days"].min()) if len(high_prob_maneuver) else None
        risk_level = "高" if len(high_prob_maneuver) else ("中" if len(medium_prob_maneuver) else "低")
        if min_time is not None and min_time <= 3:
            risk_level = "高"

        military_analysis = f"""
**态势等级**: {risk_level}
- 最高机动概率: {max_prob:.2%}
- 概率分层: 高置信 {len(high_prob_maneuver)} 个，中置信 {len(medium_prob_maneuver)} 个，低置信关注 {len(low_prob_maneuver)} 个
- 最近高置信机动窗口: {f'{min_time:.1f} 天内' if min_time is not None else '未形成高置信窗口'}

**高置信度机动目标 ({len(high_prob_maneuver)}个):**
"""

        if len(high_prob_maneuver) > 0:
            for _, row in high_prob_maneuver.iterrows():
                military_analysis += f"""- 卫星 {int(row['satellite_id'])}: 机动概率 {row['maneuver_prob']:.2%}, 预计 {row['maneuver_time_days']:.1f} 天后机动
"""
        else:
            military_analysis += "无\n"

        military_analysis += f"""
**中置信度机动目标 ({len(medium_prob_maneuver)}个):**
"""

        if len(medium_prob_maneuver) > 0:
            for _, row in medium_prob_maneuver.iterrows():
                military_analysis += f"""- 卫星 {int(row['satellite_id'])}: 机动概率 {row['maneuver_prob']:.2%}, 需持续监视
"""
        else:
            military_analysis += "无\n"

        military_analysis += """
**优先处置清单:**
"""
        for _, row in top_targets.iterrows():
            military_analysis += (
                f"- 卫星 {int(row['satellite_id'])}: 概率 {row['maneuver_prob']:.2%}, "
                f"预测窗口 T+{row['maneuver_time_days']:.1f} 天，"
                f"{'立即列入重点跟踪' if row['maneuver_prob'] > 0.8 else '保持增强监视'}\n"
            )

        military_analysis += """
**意图研判:**
1. 高概率且时间窗口较近的目标，优先按轨道转移、规避/反跟踪、抵近操作准备三类假设复核。
2. 中概率目标不宜直接定性为机动，应结合历史星历残差、轨道面变化和任务区覆盖需求做交叉验证。
3. 若同一轨道面或同一星座出现集中机动信号，需要上升为编队/星座级态势事件处理。

**监视与处置建议:**
1. 高置信目标按预测窗口前后 24-48 小时加密测轨，确保机动前后目标身份连续。
2. 对中置信目标建立二次确认队列，优先补充雷达/光学多源观测并更新机动概率。
3. 输出告警时保留“不确定性”标记，避免把模型概率直接等同于敌意行为结论。
4. 机动后立即重算轨道根数和过境窗口，用于后续抵近风险、覆盖区变化和碰撞规避评估。
"""

        return {
            "summary": summary,
            "military_analysis": military_analysis,
        }
