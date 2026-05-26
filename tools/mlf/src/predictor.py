"""
MLF 轨道机动检测预测器
用于从卫星轨道参数数据预测机动状态
"""

import os
import sys
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from typing import Dict, List, Tuple, Optional, Any
import joblib
from datetime import datetime
import warnings

# 添加src目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mlf import MLF

warnings.filterwarnings('ignore')

# 全局参数
TimeStep = 4


class DataProcessor:
    """数据预处理器"""

    def __init__(self):
        self.feature_scaler = None
        self.feature_columns = None

    def load_processor(self, processor_path: str) -> bool:
        """加载预训练的预处理器"""
        try:
            processor = joblib.load(processor_path)
            if hasattr(processor, 'feature_scaler'):
                self.feature_scaler = processor.feature_scaler
            if hasattr(processor, 'feature_columns'):
                self.feature_columns = processor.feature_columns
            print(f"预处理器已加载: {processor_path}")
            return True
        except Exception as e:
            print(f"加载预处理器失败: {e}")
            # 使用默认特征 - 23个特征与模型输入匹配
            self.feature_columns = None
            self.feature_scaler = None
            return False

    def load_csv_data(self, file_path: str) -> Optional[pd.DataFrame]:
        """加载CSV格式的数据"""
        try:
            encodings = ['utf-8', 'gbk', 'gb2312', 'latin-1']
            data = None

            for encoding in encodings:
                try:
                    data = pd.read_csv(file_path, encoding=encoding)
                    break
                except UnicodeDecodeError:
                    continue

            if data is None:
                raise ValueError("无法读取CSV文件")

            print(f"数据形状: {data.shape}")
            return data
        except Exception as e:
            print(f"加载CSV文件失败: {e}")
            return None

    def create_features(self, data: pd.DataFrame) -> pd.DataFrame:
        """创建特征 - 确保23个特征列"""
        features = pd.DataFrame()

        try:
            if len(data.columns) >= 23:
                # 标准23列格式 - 直接使用所有列作为特征（不包括卫星ID）
                # 模型需要23维输入
                for i in range(min(23, len(data.columns))):
                    features[f'feat_{i}'] = pd.to_numeric(data.iloc[:, i], errors='coerce').fillna(0)
            else:
                # 简化格式 - 填充到23列
                features['satellite_id'] = range(len(data))
                numeric_columns = data.select_dtypes(include=[np.number]).columns
                col_idx = 0
                for col in numeric_columns:
                    if col_idx < 22:  # 保留23列（包括satellite_id）
                        features[f'feat_{col_idx}'] = pd.to_numeric(data[col], errors='coerce').fillna(0)
                        col_idx += 1

                # 填充剩余列
                while col_idx < 23:
                    features[f'feat_{col_idx}'] = 0
                    col_idx += 1

            features = features.fillna(0)
            return features

        except Exception as e:
            print(f"创建特征时出错: {e}")
            return pd.DataFrame()

    def transform(self, data: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """转换数据用于预测"""
        features = self.create_features(data)

        # 提取satellite_id（如果存在）
        if 'satellite_id' in features.columns:
            satellite_ids = features['satellite_id'].values
            feature_data = features.drop(['satellite_id'], axis=1)
        else:
            satellite_ids = np.arange(len(features))
            feature_data = features

        # 确保正好23列
        feature_cols = [col for col in feature_data.columns if col.startswith('feat_')]
        if len(feature_cols) < 23:
            for i in range(len(feature_cols), 23):
                feature_data[f'feat_{i}'] = 0

        # 选择前23个特征
        feature_data = feature_data[[f'feat_{i}' for i in range(23)]]

        # 标准化
        if self.feature_scaler is not None:
            try:
                scaled_features = self.feature_scaler.transform(feature_data)
            except:
                print("标准化失败，使用原始特征")
                scaled_features = feature_data.values
        else:
            scaled_features = feature_data.values

        return scaled_features, satellite_ids


class ManeuverPredictionSNN(nn.Module):
    """基于SNN的卫星机动预测网络"""

    def __init__(self, input_size: int, hidden_sizes: List[int] = None, dropout_rate: float = 0.3):
        super(ManeuverPredictionSNN, self).__init__()

        if hidden_sizes is None:
            hidden_sizes = [128, 64, 32]

        self.input_size = input_size
        self.hidden_sizes = hidden_sizes
        self.dropout_rate = dropout_rate

        layers = []
        prev_size = input_size

        for hidden_size in hidden_sizes:
            linear_layer = nn.Linear(prev_size, hidden_size)
            lif_layer = MLF()
            dropout_layer = nn.Dropout(dropout_rate) if dropout_rate > 0 else nn.Identity()

            layers.append(linear_layer)
            layers.append(lif_layer)
            layers.append(dropout_layer)

            prev_size = hidden_size

        self.cls_head = nn.Linear(prev_size, 2)
        self.reg_head = nn.Linear(prev_size, 1)

        self.layers = nn.ModuleList(layers)

    def forward(self, x):
        batch_size = x.size(0)
        x = x.repeat(TimeStep, 1)

        for layer in self.layers:
            x = layer(x)

        x = x.view(TimeStep, batch_size, -1)
        x = x.mean(dim=0)

        logits = self.cls_head(x)
        delta_t_pred = self.reg_head(x).squeeze(-1)
        return logits, delta_t_pred


class MLFPredictor:
    """MLF轨道机动检测预测器"""

    def __init__(self, model_path: str = None, processor_path: str = None,
                 device: str = None):
        """
        初始化预测器

        Args:
            model_path: 模型文件路径
            processor_path: 预处理器文件路径
            device: 计算设备 ('cpu' 或 'cuda')
        """
        # 设置设备
        if device is None:
            device = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.device = torch.device(device)

        # 默认路径
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if model_path is None:
            model_path = os.path.join(base_dir, "models", "sat_model.pth")
        if processor_path is None:
            processor_path = os.path.join(base_dir, "models", "sat_processor.pkl")

        self.model = None
        self.processor = DataProcessor()

        # 加载模型和预处理器
        self.load_model(model_path)
        self.processor.load_processor(processor_path)

    def load_model(self, filepath: str) -> bool:
        """加载预训练模型"""
        try:
            checkpoint = torch.load(filepath, map_location=self.device)

            if 'model_architecture' in checkpoint:
                arch = checkpoint['model_architecture']
                input_size = arch.get('input_size', 20)
                hidden_sizes = arch.get('hidden_sizes', [128, 64, 32])
            else:
                input_size = 20
                hidden_sizes = [128, 64, 32]
                print("警告：使用默认模型架构")

            self.model = ManeuverPredictionSNN(input_size, hidden_sizes).to(self.device)
            self.model.load_state_dict(checkpoint['model_state_dict'])
            self.model.eval()

            print(f"模型已加载: {filepath}")
            return True

        except Exception as e:
            print(f"加载模型失败: {e}")
            return False

    def predict(self, csv_file: str, output_file: str = None) -> pd.DataFrame:
        """
        预测CSV文件中的数据

        Args:
            csv_file: 输入CSV文件路径
            output_file: 输出结果文件路径

        Returns:
            预测结果DataFrame
        """
        print("=" * 60)
        print("MLF 轨道机动检测预测")
        print("=" * 60)

        # 加载数据
        data = self.processor.load_csv_data(csv_file)
        if data is None:
            raise ValueError("数据加载失败")

        # 数据预处理
        X, satellite_ids = self.processor.transform(data)

        # 预测
        if self.model is None:
            raise ValueError("模型未加载")

        self.model.eval()
        with torch.no_grad():
            X_tensor = torch.FloatTensor(X).to(self.device)
            logits, dt_pred = self.model(X_tensor)
            probabilities = torch.softmax(logits, dim=1)
            _, predicted = torch.max(logits, 1)

        predicted = predicted.cpu().numpy()
        probabilities = probabilities.cpu().numpy()
        dt_pred = dt_pred.cpu().numpy()

        # 整理结果
        results = pd.DataFrame()
        results['satellite_id'] = satellite_ids
        results['prediction'] = ['maneuver' if p == 1 else 'no_maneuver' for p in predicted]
        results['maneuver_prob'] = probabilities[:, 1]
        results['no_maneuver_prob'] = probabilities[:, 0]
        results['maneuver_time_days'] = dt_pred
        results['maneuver_time_hours'] = dt_pred * 24
        results['maneuver_time_minutes'] = dt_pred * 24 * 60

        # 输出统计
        maneuver_count = np.sum(predicted == 1)
        total_count = len(predicted)
        print(f"\n总样本数: {total_count}")
        print(f"预测机动: {maneuver_count} ({maneuver_count/total_count*100:.2f}%)")
        print(f"预测未机动: {total_count - maneuver_count}")

        # 保存结果
        if output_file is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_file = os.path.join(os.path.dirname(csv_file), f"mlf_prediction_{timestamp}.csv")

        results.to_csv(output_file, index=False)
        print(f"\n结果已保存: {output_file}")

        return results


def main():
    """主函数 - 演示使用方法"""
    import argparse

    parser = argparse.ArgumentParser(description='MLF轨道机动检测预测')
    parser.add_argument('--input', '-i', type=str, required=True, help='输入CSV文件')
    parser.add_argument('--output', '-o', type=str, default=None, help='输出CSV文件')
    parser.add_argument('--model', '-m', type=str, default=None, help='模型文件路径')
    parser.add_argument('--processor', '-p', type=str, default=None, help='预处理器文件路径')
    parser.add_argument('--device', '-d', type=str, default='cpu', choices=['cpu', 'cuda'], help='计算设备')

    args = parser.parse_args()

    predictor = MLFPredictor(
        model_path=args.model,
        processor_path=args.processor,
        device=args.device
    )

    results = predictor.predict(args.input, args.output)
    print("\n预测结果预览:")
    print(results.head())


if __name__ == "__main__":
    main()
