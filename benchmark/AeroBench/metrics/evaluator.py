"""航天基准测评指标计算模块

覆盖三类任务的核心评估指标：
- MLF: 精确率/召回率/F1/ROC-AUC/机动时间MAE
- IOD:  位置RMSE/速度RMSE/方向向量余弦相似度
- Orbin: 位置预测RMSE/速度预测RMSE/轨道周期偏差/倾角偏差
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np


# ============================================================================
# 通用指标工具
# ============================================================================


def _safe_divide(a: float, b: float) -> float:
    return a / b if b != 0 else 0.0


@dataclass
class MetricResult:
    """单条指标结果"""

    name: str
    value: float
    unit: str = ""
    higher_is_better: bool = True
    description: str = ""


@dataclass
class TaskEvalReport:
    """单任务测评报告"""

    task: str  # "mlf" | "iod" | "orbin"
    dataset_name: str
    n_samples: int
    metrics: list[MetricResult] = field(default_factory=list)
    raw_details: dict[str, Any] = field(default_factory=dict)

    def summary_dict(self) -> dict[str, Any]:
        return {
            "task": self.task,
            "dataset": self.dataset_name,
            "n_samples": self.n_samples,
            "metrics": {m.name: round(m.value, 6) for m in self.metrics},
        }

    def overall_score(self) -> float:
        """聚合为单一分数 (0-100)"""
        if not self.metrics:
            return 0.0
        # 对所有指标做 min-max 归一化映射到 [0,1]
        scores = []
        for m in self.metrics:
            # higher_is_better: 越高越好
            v = m.value
            if m.higher_is_better:
                scores.append(np.clip(v, 0, 1))
            else:
                # 越低越好 -> 取 1-v (假设 v 已经在合理范围)
                scores.append(max(0.0, 1.0 - min(v, 1.0)))
        return round(np.mean(scores) * 100, 2)


# ============================================================================
# MLF (轨道机动检测) 指标
# ============================================================================


class MLFEvaluator:
    """MLF 轨道机动检测评估器

    指标:
    - Accuracy: 整体准确率
    - Precision: 机动类精确率
    - Recall: 机动类召回率
    - F1: 机动类 F1 分数
    - Maneuver Time MAE: 机动时间预测平均绝对误差 (天)
    - False Alarm Rate: 虚警率
    """

    def evaluate(
        self,
        y_true: np.ndarray,  # (N,) 0/1
        y_pred: np.ndarray,  # (N,) 0/1
        y_prob: np.ndarray | None = None,  # (N,) 机动概率
        maneuver_time_true: np.ndarray | None = None,
        maneuver_time_pred: np.ndarray | None = None,
        **kwargs: Any,
    ) -> TaskEvalReport:
        n = len(y_true)
        if n == 0:
            return TaskEvalReport(task="mlf", dataset_name="empty", n_samples=0)

        # 混淆矩阵
        tp = int(np.sum((y_true == 1) & (y_pred == 1)))
        fp = int(np.sum((y_true == 0) & (y_pred == 1)))
        fn = int(np.sum((y_true == 1) & (y_pred == 0)))
        tn = int(np.sum((y_true == 0) & (y_pred == 0)))

        accuracy = _safe_divide(tp + tn, n)
        precision = _safe_divide(tp, tp + fp)
        recall = _safe_divide(tp, tp + fn)
        f1 = _safe_divide(2 * precision * recall, precision + recall)
        false_alarm_rate = _safe_divide(fp, fp + tn)  # FPR

        metrics = [
            MetricResult("accuracy", accuracy, "", True, "整体准确率"),
            MetricResult("precision", precision, "", True, "机动类精确率"),
            MetricResult("recall", recall, "", True, "机动类召回率"),
            MetricResult("f1_score", f1, "", True, "机动类 F1 分数"),
            MetricResult("false_alarm_rate", false_alarm_rate, "", False, "虚警率 (FPR)"),
        ]

        # ROC-AUC
        if y_prob is not None and len(np.unique(y_true)) > 1:
            auc = self._roc_auc(y_true, y_prob)
            metrics.append(MetricResult("roc_auc", auc, "", True, "ROC 曲线下面积"))

        # 机动时间 MAE
        time_mae = None
        if maneuver_time_true is not None and maneuver_time_pred is not None:
            mask = y_true == 1
            if mask.sum() > 0:
                time_mae = float(
                    np.mean(np.abs(maneuver_time_true[mask] - maneuver_time_pred[mask]))
                )
                metrics.append(
                    MetricResult("maneuver_time_mae", time_mae, "天", False, "机动时间MAE")
                )

        return TaskEvalReport(
            task="mlf",
            dataset_name="MLF Test",
            n_samples=n,
            metrics=metrics,
            raw_details={
                "confusion_matrix": {"tp": tp, "fp": fp, "fn": fn, "tn": tn},
                "maneuver_time_mae": time_mae,
            },
        )

    @staticmethod
    def _roc_auc(y_true: np.ndarray, y_prob: np.ndarray) -> float:
        """手动计算 ROC-AUC (避免依赖 sklearn)"""
        order = np.argsort(y_prob)[::-1]
        y_true_sorted = y_true[order]
        n_pos = int(np.sum(y_true == 1))
        n_neg = int(np.sum(y_true == 0))
        if n_pos == 0 or n_neg == 0:
            return 0.5

        tpr, fpr = [], []
        tp = fp = 0
        for i, label in enumerate(y_true_sorted):
            if label == 1:
                tp += 1
            else:
                fp += 1
            tpr.append(tp / n_pos)
            fpr.append(fp / n_neg)

        # Trapezoidal integration
        auc = 0.0
        for i in range(1, len(fpr)):
            auc += (fpr[i] - fpr[i - 1]) * (tpr[i] + tpr[i - 1]) / 2
        return float(auc)


# ============================================================================
# IOD (轨道初定) 指标
# ============================================================================


class IODEvaluator:
    """IOD 轨道初定评估器

    指标:
    - Position RMSE (km): 卫星位置预测的均方根误差
    - Velocity RMSE (km/s): 卫星速度预测的均方根误差
    - Direction Cosine Similarity: 方向向量余弦相似度
    - Position MAE (km): 位置平均绝对误差
    - Altitude Error (km): 轨道高度误差
    """

    def evaluate(
        self,
        pos_true: np.ndarray,  # (N, 3)
        pos_pred: np.ndarray,  # (N, 3)
        vel_true: np.ndarray | None = None,  # (N, 3)
        vel_pred: np.ndarray | None = None,  # (N, 3)
        dir_true: np.ndarray | None = None,  # (N, 3)
        dir_pred: np.ndarray | None = None,  # (N, 3)
        **kwargs: Any,
    ) -> TaskEvalReport:
        n = pos_true.shape[0]
        if n == 0:
            return TaskEvalReport(task="iod", dataset_name="empty", n_samples=0)

        # 位置误差
        pos_errors = np.sqrt(np.sum((pos_true - pos_pred) ** 2, axis=1))
        pos_rmse = float(np.sqrt(np.mean(pos_errors**2)))
        pos_mae = float(np.mean(pos_errors))

        metrics = [
            MetricResult("position_rmse_km", pos_rmse, "km", False, "位置预测 RMSE"),
            MetricResult("position_mae_km", pos_mae, "km", False, "位置预测 MAE"),
        ]

        # 速度误差
        if vel_true is not None and vel_pred is not None:
            vel_errors = np.sqrt(np.sum((vel_true - vel_pred) ** 2, axis=1))
            vel_rmse = float(np.sqrt(np.mean(vel_errors**2)))
            vel_mae = float(np.mean(vel_errors))
            metrics.append(
                MetricResult("velocity_rmse_km_s", vel_rmse, "km/s", False, "速度预测 RMSE")
            )
            metrics.append(
                MetricResult("velocity_mae_km_s", vel_mae, "km/s", False, "速度预测 MAE")
            )

        # 方向余弦相似度
        if dir_true is not None and dir_pred is not None:
            dot = np.sum(dir_true * dir_pred, axis=1)
            norm_t = np.sqrt(np.sum(dir_true**2, axis=1))
            norm_p = np.sqrt(np.sum(dir_pred**2, axis=1))
            cos_sim = dot / np.maximum(norm_t * norm_p, 1e-12)
            cos_sim = np.clip(cos_sim, -1, 1)  # Clip for numerical safety
            mean_cos = float(np.mean(cos_sim))
            metrics.append(
                MetricResult("direction_cosine_sim", mean_cos, "", True, "方向向量余弦相似度")
            )

        # 轨道高度误差
        r_earth = 6371.0
        alt_true = np.sqrt(np.sum(pos_true**2, axis=1)) - r_earth
        alt_pred = np.sqrt(np.sum(pos_pred**2, axis=1)) - r_earth
        alt_rmse = float(np.sqrt(np.mean((alt_true - alt_pred) ** 2)))
        alt_mae = float(np.mean(np.abs(alt_true - alt_pred)))
        metrics.append(MetricResult("altitude_rmse_km", alt_rmse, "km", False, "轨道高度 RMSE"))
        metrics.append(MetricResult("altitude_mae_km", alt_mae, "km", False, "轨道高度 MAE"))

        return TaskEvalReport(
            task="iod",
            dataset_name="IOD Test",
            n_samples=n,
            metrics=metrics,
            raw_details={
                "pos_rmse_km": pos_rmse,
                "pos_mae_km": pos_mae,
                "alt_rmse_km": alt_rmse,
            },
        )


# ============================================================================
# Orbin (轨道预测) 指标
# ============================================================================


class OrbinEvaluator:
    """Orbin 轨道预测评估器

    指标:
    - Position RMSE (km): 预测位置 RMSE
    - Velocity RMSE (km/s): 预测速度 RMSE
    - Inclination Error (deg): 倾角预测误差
    - Orbital Period Error (%): 轨道周期相对误差
    - Semi-major Axis Error (km): 半长轴误差
    - Prediction Stability: 预测稳定性 (连续预测的方差)
    """

    def evaluate(
        self,
        pos_true: np.ndarray,  # (N, 3)
        pos_pred: np.ndarray,  # (N, 3)
        vel_true: np.ndarray | None = None,
        vel_pred: np.ndarray | None = None,
        **kwargs: Any,
    ) -> TaskEvalReport:
        n = pos_true.shape[0]
        if n == 0:
            return TaskEvalReport(task="orbin", dataset_name="empty", n_samples=0)

        # 位置误差
        pos_errors = np.sqrt(np.sum((pos_true - pos_pred) ** 2, axis=1))
        pos_rmse = float(np.sqrt(np.mean(pos_errors**2)))
        pos_mae = float(np.mean(pos_errors))

        metrics = [
            MetricResult("position_rmse_km", pos_rmse, "km", False, "位置预测 RMSE"),
            MetricResult("position_mae_km", pos_mae, "km", False, "位置预测 MAE"),
        ]

        # 速度误差
        vel_rmse = None
        if vel_true is not None and vel_pred is not None:
            vel_errors = np.sqrt(np.sum((vel_true - vel_pred) ** 2, axis=1))
            vel_rmse = float(np.sqrt(np.mean(vel_errors**2)))
            vel_mae = float(np.mean(vel_errors))
            metrics.append(
                MetricResult("velocity_rmse_km_s", vel_rmse, "km/s", False, "速度预测 RMSE")
            )
            metrics.append(
                MetricResult("velocity_mae_km_s", vel_mae, "km/s", False, "速度预测 MAE")
            )

        # 轨道参数分析
        # 倾角
        inc_true = self._compute_inclination(pos_true, vel_true if vel_true is not None else None)
        inc_pred = self._compute_inclination(pos_pred, vel_pred if vel_pred is not None else None)
        if inc_true is not None and inc_pred is not None:
            inc_err = float(np.mean(np.abs(inc_true - inc_pred)))
            metrics.append(
                MetricResult("inclination_error_deg", inc_err, "deg", False, "倾角预测误差")
            )

        # 半长轴
        sma_true = self._compute_semi_major_axis(pos_true, vel_true)
        sma_pred = self._compute_semi_major_axis(pos_pred, vel_pred)
        if sma_true is not None and sma_pred is not None:
            sma_err = float(np.mean(np.abs(sma_true - sma_pred)))
            metrics.append(
                MetricResult("semi_major_axis_error_km", sma_err, "km", False, "半长轴预测误差")
            )

        # 轨道周期相对误差
        if sma_true is not None and sma_pred is not None:
            mu = 3.986004418e5
            period_true = 2 * np.pi * np.sqrt((sma_true**3) / mu)
            period_pred = 2 * np.pi * np.sqrt((sma_pred**3) / mu)
            period_rel_err = float(
                np.mean(np.abs(period_true - period_pred) / np.abs(period_true)) * 100
            )
            metrics.append(
                MetricResult(
                    "orbital_period_rel_error_pct",
                    period_rel_err,
                    "%",
                    False,
                    "轨道周期相对误差",
                )
            )

        # 预测稳定性 (连续位置预测的一阶差分的标准差)
        if n > 1:
            pred_delta = np.sqrt(np.sum(np.diff(pos_pred, axis=0) ** 2, axis=1))
            stability = float(np.std(pred_delta))
            metrics.append(
                MetricResult(
                    "prediction_stability_km",
                    stability,
                    "km",
                    False,
                    "预测稳定性（越低越好）",
                )
            )

        return TaskEvalReport(
            task="orbin",
            dataset_name="Orbin Test",
            n_samples=n,
            metrics=metrics,
            raw_details={
                "pos_rmse_km": pos_rmse,
                "pos_mae_km": pos_mae,
                "vel_rmse_km_s": vel_rmse,
            },
        )

    @staticmethod
    def _compute_inclination(
        pos: np.ndarray, vel: np.ndarray | None
    ) -> np.ndarray | None:
        """从位置/速度计算倾角 (度)"""
        if vel is None:
            return None
        h = np.cross(pos, vel)
        h_norm = np.linalg.norm(h, axis=1)
        inc = np.degrees(
            np.arccos(np.clip(h[:, 2] / np.maximum(h_norm, 1e-12), -1.0, 1.0))
        )
        return inc

    @staticmethod
    def _compute_semi_major_axis(
        pos: np.ndarray, vel: np.ndarray | None
    ) -> np.ndarray | None:
        """从位置/速度计算半长轴 (km)"""
        if vel is None:
            return None
        mu = 3.986004418e5
        r = np.sqrt(np.sum(pos**2, axis=1))
        v2 = np.sum(vel**2, axis=1)
        # 能量方程: a = -mu / (v² - 2*mu/r) * 注意符号: E = v²/2 - mu/r
        energy = v2 / 2.0 - mu / r
        sma = np.where(np.abs(energy) > 1e-12, -mu / (2.0 * energy), np.inf)
        # 排除无界轨道 (a<0 或 a→∞)
        sma = np.where(sma > 0, sma, np.nan)
        return sma


# ============================================================================
# 综合评估器
# ============================================================================


@dataclass
class AeroBenchReport:
    """AeroBench 综合测评报告"""

    mlf_report: TaskEvalReport | None = None
    iod_report: TaskEvalReport | None = None
    orbin_report: TaskEvalReport | None = None
    cross_task_score: float = 0.0  # 跨任务综合评分
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "cross_task_score": self.cross_task_score,
            "metadata": self.metadata,
        }
        if self.mlf_report:
            d["mlf"] = self.mlf_report.summary_dict()
        if self.iod_report:
            d["iod"] = self.iod_report.summary_dict()
        if self.orbin_report:
            d["orbin"] = self.orbin_report.summary_dict()
        return d

    def overall_score(self) -> float:
        """跨任务综合评分"""
        scores = []
        for r in [self.mlf_report, self.iod_report, self.orbin_report]:
            if r is not None:
                scores.append(r.overall_score())
        return round(np.mean(scores), 2) if scores else 0.0


class AeroBenchEvaluator:
    """综合评估器：对三项任务的测评结果进行汇总分析"""

    def evaluate(
        self,
        mlf_report: TaskEvalReport | None = None,
        iod_report: TaskEvalReport | None = None,
        orbin_report: TaskEvalReport | None = None,
        **kwargs: Any,
    ) -> AeroBenchReport:
        scores = []
        if mlf_report:
            scores.append(mlf_report.overall_score())
        if iod_report:
            scores.append(iod_report.overall_score())
        if orbin_report:
            scores.append(orbin_report.overall_score())

        return AeroBenchReport(
            mlf_report=mlf_report,
            iod_report=iod_report,
            orbin_report=orbin_report,
            cross_task_score=round(np.mean(scores), 2) if scores else 0.0,
            metadata=kwargs,
        )


# ============================================================================
# 便捷函数：计算成功率与任务完成度
# ============================================================================


def compute_task_success_rate(
    results: list[dict[str, Any]],
    threshold: float = 0.7,
) -> float:
    """计算任务成功率

    当任务指标中的关键得分 >= threshold 时视为成功。
    """
    if not results:
        return 0.0
    success = sum(
        1
        for r in results
        if r.get("score", 0) >= threshold
    )
    return success / len(results)
