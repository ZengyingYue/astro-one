# Orbin 轨道根数预测

基于Informer模型的轨道六根数预测模型。

## 功能

- 从观测数据预测卫星轨道六根数
- 支持位置(x, y, z)和速度(vx, vy, vz)预测
- 使用三模型集成预测

## 文件结构

```
orbin/
├── src/
│   ├── __init__.py
│   └── predictor.py    # 推理预测器
├── models/
│   └── triple_ensemble_models.pth
├── data/
│   └── *.csv          # Demo数据
├── requirements.txt
└── README.md
```

## 安装依赖

```bash
pip install -r requirements.txt
```

## 使用方法

### Python API

```python
from src.predictor import OrbitPredictor

# 初始化预测器
predictor = OrbitPredictor(
    model_dir="models",
    data_dir="data",
    device="cpu"
)

# 执行预测
results = predictor.predict("output.csv", max_rows=200)
```

### 命令行

```bash
python src/predictor.py --data_dir data --output results.csv --max_rows 200
```

## 输入数据格式

CSV文件，包含以下列：
- Time_UTCG_: 时间
- Azimuth_deg_: 方位角
- Elevation_deg_: 高度角
- Range_km_: 距离
- eci_x_m, eci_y_m, eci_z_m: 卫星ECI位置
- obs_vector_x, obs_vector_y, obs_vector_z: 观测向量

## 输出格式

- x_km_pred, y_km_pred, z_km_pred: 预测的位置
- vx_km/s_pred, vy_km/s_pred, vz_km/s_pred: 预测的速度
- (可选) x_km_true, y_km_true, ... : 真实值（用于对比）

## 注意事项

Orbin模块依赖于原始的训练模块1021_best.py。请确保该文件位于正确的位置：
- 相对于tools/orbin/，应该在../../orbin/1021_best.py
