# MLF 轨道机动检测

基于液体状态机(Liquid State Machine)的卫星轨道机动检测模型。

## 功能

- 从卫星轨道参数数据预测机动状态
- 输出机动概率和预测机动时间

## 文件结构

```
mlf/
├── src/
│   ├── __init__.py
│   ├── mlf.py          # MLF核心模块
│   └── predictor.py    # 推理预测器
├── models/
│   ├── sat_model.pth   # 训练好的模型
│   └── sat_processor.pkl
├── data/
│   └── demo_data.xlsx  # Demo数据
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
from src.predictor import MLFPredictor

# 初始化预测器
predictor = MLFPredictor(
    model_path="models/sat_model.pth",
    processor_path="models/sat_processor.pkl",
    device="cpu"
)

# 预测
results = predictor.predict("data/demo_data.csv", "output.csv")
```

### 命令行

```bash
python src/predictor.py --input data/demo_data.csv --output results.csv --device cpu
```

## 输入数据格式

CSV文件，包含以下列（至少包含23列，与训练数据格式一致）：
- 卫星ID
- 轨道参数（倾角、RAAN、偏心率、升交点赤经等）
- 变轨前后参数

## 输出格式

- satellite_id: 卫星ID
- prediction: 预测结果 (maneuver/no_maneuver)
- maneuver_prob: 机动概率
- no_maneuver_prob: 未机动概率
- maneuver_time_days: 预测机动时间(天)
