# 航天算法推理工具集

本目录包含三个独立的航天领域推理模型，可单独使用进行轨道机动检测、轨道初定和轨道根数预测。

## 目录结构

```
tools/
├── mlf/           # 液体状态机轨道机动检测
├── iod/           # 轨道初定
├── orbin/         # 轨道根数预测
└── README.md
```

## 模块说明

### 1. MLF - 液体状态机轨道机动检测

基于液体状态机(Liquid State Machine)的卫星轨道机动检测模型。

**功能：**
- 从卫星轨道参数数据预测机动状态
- 输出机动概率和预测机动时间

**使用方法：**
```python
from mlf.src.predictor import MLFPredictor

predictor = MLFPredictor(device='cpu')
results = predictor.predict('data/demo.csv')
```

### 2. IOD - 轨道初定

基于Transformer的初始轨道确定(Initial Orbit Determination)模型。

**功能：**
- 从观测数据和方向向量预测卫星方向向量
- 可选：预测卫星状态（位置和速度）

**使用方法：**
```python
from iod.src.predictor import IODPredictor

predictor = IODPredictor(device='cpu')
predictions = predictor.predict_from_csv('data/demo.csv')
predictions, states = predictor.predict_from_csv('data/demo.csv', return_states=True)
```

### 3. Orbin - 轨道根数预测

基于Informer模型的轨道六根数预测模型。

**功能：**
- 从观测数据预测卫星轨道六根数
- 支持位置(x, y, z)和速度(vx, vy, vz)预测
- 使用三模型集成预测

**使用方法：**
```python
from orbin.src.predictor import OrbitPredictor

predictor = OrbitPredictor(device='cpu')
results = predictor.predict('output.csv')
```

## 安装依赖

每个模块都有自己的requirements.txt，可以单独安装：

```bash
# MLF
pip install -r mlf/requirements.txt

# IOD
pip install -r iod/requirements.txt

# Orbin
pip install -r orbin/requirements.txt
```

## 测试验证

所有模块都已通过测试验证：

- **MLF**: ✓ 模型加载成功，预测功能正常
- **IOD**: ✓ 模型加载成功，预测功能正常
- **Orbin**: ✓ 模型加载成功，预测功能正常
