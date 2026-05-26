# IOD 轨道初定

基于Transformer的初始轨道确定(Initial Orbit Determination)模型。

## 功能

- 从观测数据和方向向量预测卫星方向向量
- 可选：预测卫星状态（位置和速度）

## 文件结构

```
iod/
├── src/
│   ├── __init__.py
│   ├── models.py       # 模型定义
│   └── predictor.py    # 推理预测器
├── models/
│   ├── encoder_model.pth
│   └── decoder_model.pth
├── scalers/
│   ├── encoder_input_scaler.pkl
│   ├── encoder_output_scaler.pkl
│   ├── decoder_input_scaler.pkl
│   └── decoder_output_scaler.pkl
├── data/
│   └── demo_input.csv  # Demo数据
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
from src.predictor import IODPredictor

# 初始化预测器
predictor = IODPredictor(device="cpu")

# 预测（仅方向向量）
predictions = predictor.predict_from_csv("data/demo_input.csv")

# 预测（包含卫星状态）
predictions, states = predictor.predict_from_csv("data/demo_input.csv", return_states=True)
```

### 命令行

```bash
# 仅方向向量
python src/predictor.py --input data/demo_input.csv --output results.csv

# 包含卫星状态
python src/predictor.py --input data/demo_input.csv --output results.csv --return_states
```

## 输入数据格式

CSV文件，包含以下列：
- Relative Time (s): 相对时间
- Observer Longitude/Latitude/Altitude: 观测者位置
- Observer ECI X/Y/Z: 观测者ECI坐标
- Direction Vector X/Y/Z: 方向向量

## 输出格式

- Direction Vector X/Y/Z: 预测的方向向量
- Satellite ECI X/Y/Z (km): 卫星位置（仅当return_states=True）
- Satellite Velocity X/Y/Z (km/s): 卫星速度（仅当return_states=True）
