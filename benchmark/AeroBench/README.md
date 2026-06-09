# AeroBench — astro-one 航天垂直领域专项测评基准

## 概述

AeroBench 是针对 **astro-one** 航天 AI Agent 框架的专项基准测评工具，覆盖三项航天核心任务：

| 任务 | 工具 | 模型 | 核心指标 |
|------|------|------|----------|
| **MLF** 轨道机动检测 | `mlf_maneuver_detection` | 液体状态机 (LSM) | Accuracy, F1, ROC-AUC, 机动时间MAE |
| **IOD** 轨道初定 | `iod_orbit_determination` | Transformer | 位置RMSE, 速度RMSE, 方向余弦相似度 |
| **Orbin** 轨道预测 | `orbin_orbit_prediction` | Informer 集成 | 位置RMSE, 倾角误差, 轨道周期偏差 |

## 目录结构

```
benchmark/AeroBench/
├── datasets/
│   ├── __init__.py
│   └── generator.py     # 数据集生成器（真实性+合成）
├── metrics/
│   ├── __init__.py
│   └── evaluator.py     # 评估指标计算 (MLF/IOD/Orbin/综合)
├── runners/
│   ├── __init__.py
│   └── bench_runner.py  # 基准测试运行器（CLI入口）
├── reports/             # 测评报告输出目录
├── main.py              # 主入口
└── README.md
```

## 快速开始

```bash
# 在项目根目录下运行

# 模拟模式（快速，不依赖真实模型）
python -m benchmark.AeroBench.main --mode tool-sim --print-metrics

# 真实模型模式（需要 tools/ 目录下的模型文件）
python -m benchmark.AeroBench.main --mode tool-direct --device cpu --print-metrics

# 指定任务和样本数
python -m benchmark.AeroBench.main --mode tool-sim --tasks mlf iod --max-samples 300

# 保存 JSON 报告
python -m benchmark.AeroBench.main --mode tool-sim --output reports/result.json
```

### 参数说明

| 参数 | 选项 | 说明 |
|------|------|------|
| `--mode` | `tool-sim`, `tool-direct` | 模拟基线 / 真实模型 |
| `--tasks` | `mlf`, `iod`, `orbin` | 测试任务列表（可多选） |
| `--max-samples` | int (默认200) | 每任务最大样本数 |
| `--seed` | int (默认42) | 随机种子 |
| `--device` | `cpu`, `cuda` | 计算设备 |
| `--output` | path | JSON 报告输出路径 |
| `--print-metrics` | flag | 打印详细指标 |

## 数据集

### 数据来源
- **真实数据**: 从 `tools/mlf/data/`、`tools/iod/data/`、`tools/orbin/data/` 截取
- **合成数据**: 基于物理模型（二体动力学、轨道参数统计分布）程序化生成

### 数据集属性

#### MLF 数据集
- 23 维轨道参数特征（倾角、RAAN、偏心率等）
- 机动/非机动二分类标签
- 机动时间标注（天）

#### IOD 数据集
- 观测者 ECI 坐标 + 方向向量
- Ground truth: 卫星 ECI 位置 + 速度
- 各向同性噪声模拟

#### Orbin 数据集
- 方位角/高度角/距离 观测数据
- Ground truth: ECI 位置 + 速度
- 含二体动力学传播一致性校验

## 测评指标

### MLF — 轨道机动检测
| 指标 | 含义 | 方向 |
|------|------|------|
| accuracy | 整体准确率 | ↑ |
| precision | 机动类精确率 | ↑ |
| recall | 机动类召回率 | ↑ |
| f1_score | 机动类F1 | ↑ |
| false_alarm_rate | 虚警率(FPR) | ↓ |
| roc_auc | ROC曲线下面积 | ↑ |
| maneuver_time_mae | 机动时间MAE(天) | ↓ |

### IOD — 轨道初定
| 指标 | 含义 | 方向 |
|------|------|------|
| position_rmse_km | 位置预测RMSE | ↓ |
| position_mae_km | 位置预测MAE | ↓ |
| velocity_rmse_km_s | 速度预测RMSE | ↓ |
| direction_cosine_sim | 方向向量余弦相似度 | ↑ |
| altitude_rmse_km | 高度预测RMSE | ↓ |

### Orbin — 轨道预测
| 指标 | 含义 | 方向 |
|------|------|------|
| position_rmse_km | 位置预测RMSE | ↓ |
| inclination_error_deg | 倾角预测误差 | ↓ |
| semi_major_axis_error_km | 半长轴预测误差 | ↓ |
| orbital_period_rel_error_pct | 轨道周期相对误差(%) | ↓ |
| prediction_stability_km | 预测稳定性 | ↓ |

## 综合评分

跨任务综合评分 = 各任务评分的算术平均（0-100），各项指标通过归一化后加权。

## 运行模式对比

| 特性 | tool-sim | tool-direct |
|------|----------|-------------|
| 速度 | 极快 (<1s) | 较慢 (模型加载+推理) |
| 依赖 | numpy only | torch + 模型文件 |
| 用途 | 快速验证、CI集成 | 精度评估、模型对比 |
| 评分 | baseline参考值 | 真实模型性能 |

## 扩展指南

### 添加新指标
编辑 `metrics/evaluator.py`，在对应 Evaluator 的 `evaluate()` 方法中添加新的 `MetricResult`。

### 添加新数据集
编辑 `datasets/generator.py`，实现新的 Generator 类并调用 `generate_all_datasets()`。

### 添加新运行模式
编辑 `runners/bench_runner.py`，在 Runner 类中添加新方法（如 `run_agent_full()`）。
