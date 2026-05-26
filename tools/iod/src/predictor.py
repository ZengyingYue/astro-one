"""
IOD (Initial Orbit Determination) 轨道初定预测器
从观测数据和方向向量预测卫星的方向向量和状态
"""

import os
import sys
import torch
import pandas as pd
import numpy as np
import joblib
from pathlib import Path
from typing import Tuple, Optional, Dict, Any
import warnings

# 添加src目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from models import EncodeTransformer, DecoderMLP, CombinedModel

warnings.filterwarnings('ignore')


class IODPredictor:
    """IOD模型预测器"""

    def __init__(self, model_dir: str = None, device: str = 'cpu'):
        """
        初始化预测器

        Args:
            model_dir: 模型文件目录，默认为当前脚本所在目录
            device: 计算设备，'cpu' 或 'cuda'
        """
        if model_dir is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            model_dir = os.path.join(base_dir, "models")

        self.model_dir = Path(model_dir).resolve()

        # 设置设备
        if device == 'cuda' and not torch.cuda.is_available():
            print("CUDA不可用，使用CPU")
            device = 'cpu'
        self.device = torch.device(device)

        # 加载标准化器
        scaler_dir = self.model_dir.parent / 'scalers'
        self.encoder_input_scaler = joblib.load(scaler_dir / 'encoder_input_scaler.pkl')
        self.encoder_output_scaler = joblib.load(scaler_dir / 'encoder_output_scaler.pkl')
        self.decoder_input_scaler = joblib.load(scaler_dir / 'decoder_input_scaler.pkl')
        self.decoder_output_scaler = joblib.load(scaler_dir / 'decoder_output_scaler.pkl')

        # 初始化模型
        encoder_transformer = EncodeTransformer(
            input_dim=10,
            output_dim=6,
            d_model=128,
            nhead=8,
            num_layers=4,
            dim_feedforward=512
        )

        decoder_mlp = DecoderMLP(
            combined_input_dim=13,
            hidden_dim=64,
            output_dim=3
        )

        # 加载模型权重
        encoder_transformer.load_state_dict(torch.load(self.model_dir / 'encoder_model.pth', map_location=self.device))
        decoder_mlp.load_state_dict(torch.load(self.model_dir / 'decoder_model.pth', map_location=self.device))

        # 冻结decoder参数
        for param in decoder_mlp.parameters():
            param.requires_grad = False

        # 创建组合模型
        self.model = CombinedModel(
            encoder_transformer=encoder_transformer,
            decoder_mlp=decoder_mlp,
            observer_dim=7,
            decoder_input_scaler=self.decoder_input_scaler,
            encode_transformer_output_scaler=self.encoder_output_scaler,
            device=self.device
        )

        self.model.to(self.device)
        self.model.eval()

        print(f"IOD模型加载完成，使用设备: {self.device}")

    def predict_from_csv(self, csv_path: str, return_states: bool = False) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        """
        从CSV文件读取数据并进行预测

        Args:
            csv_path: CSV文件路径
            return_states: 是否返回中间状态（卫星状态）

        Returns:
            predictions: 预测的方向向量 (seq_len, 3)
            states (可选): 预测的卫星状态 (seq_len, 6)
        """
        data = pd.read_csv(csv_path)

        # 提取Encoder输入特征 (10维)
        encoder_input_features = data[[
            'Relative Time (s)',
            'Observer Longitude',
            'Observer Latitude',
            'Observer Altitude',
            'Observer ECI X',
            'Observer ECI Y',
            'Observer ECI Z',
            'Direction Vector X',
            'Direction Vector Y',
            'Direction Vector Z'
        ]].values

        # 提取Decoder输入特征 (7维)
        decoder_input_features = data[[
            'Relative Time (s)',
            'Observer Longitude',
            'Observer Latitude',
            'Observer Altitude',
            'Observer ECI X',
            'Observer ECI Y',
            'Observer ECI Z'
        ]].values

        return self.predict(encoder_input_features, decoder_input_features, return_states)

    def predict(self, encoder_inputs: np.ndarray, decoder_inputs: np.ndarray,
                return_states: bool = False) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        """
        进行预测

        Args:
            encoder_inputs: Encoder输入 (seq_len, 10) numpy数组
            decoder_inputs: Decoder输入 (seq_len, 7) numpy数组
            return_states: 是否返回中间状态（卫星状态）

        Returns:
            predictions: 预测的方向向量 (seq_len, 3)
            states (可选): 预测的卫星状态 (seq_len, 6)
        """
        # 确保是2D数组
        if encoder_inputs.ndim == 1:
            encoder_inputs = encoder_inputs.reshape(1, -1)
        if decoder_inputs.ndim == 1:
            decoder_inputs = decoder_inputs.reshape(1, -1)

        # 标准化输入
        encoder_inputs_normalized = self.encoder_input_scaler.transform(encoder_inputs)

        # 转换为张量
        encoder_inputs_tensor = torch.tensor(
            encoder_inputs_normalized,
            dtype=torch.float32
        ).unsqueeze(0).to(self.device)

        decoder_inputs_tensor = torch.tensor(
            decoder_inputs,
            dtype=torch.float32
        ).unsqueeze(0).to(self.device)

        # 推理
        with torch.no_grad():
            encoder_outputs = self.model.encoder_transformer(encoder_inputs_tensor)

            batch_size, seq_len_model, _ = encoder_outputs.shape
            encoder_outputs_flat = encoder_outputs.cpu().numpy().reshape(-1, 6)
            encoder_outputs_inverse = self.encoder_output_scaler.inverse_transform(encoder_outputs_flat)

            predictions_tensor = self.model(encoder_inputs_tensor, decoder_inputs_tensor)
            predictions_flat = predictions_tensor.cpu().numpy().reshape(-1, 3)
            predictions = self.decoder_output_scaler.inverse_transform(predictions_flat)

        if return_states:
            return predictions, encoder_outputs_inverse
        else:
            return predictions


def main():
    """主函数 - 演示使用方法"""
    import argparse

    parser = argparse.ArgumentParser(description='IOD轨道初定预测')
    parser.add_argument('--input', '-i', type=str, required=True, help='输入CSV文件路径')
    parser.add_argument('--output', '-o', type=str, default=None, help='输出CSV文件路径')
    parser.add_argument('--model_dir', '-m', type=str, default=None, help='模型目录路径')
    parser.add_argument('--device', '-d', type=str, default='cpu', choices=['cpu', 'cuda'], help='计算设备')
    parser.add_argument('--return_states', '-r', action='store_true', help='是否返回卫星状态')

    args = parser.parse_args()

    # 初始化预测器
    predictor = IODPredictor(model_dir=args.model_dir, device=args.device)

    # 进行预测
    if args.return_states:
        predictions, states = predictor.predict_from_csv(args.input, return_states=True)

        print(f"\n方向向量形状: {predictions.shape}")
        print(f"卫星状态形状: {states.shape}")

        # 保存结果
        if args.output:
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
            result_df.to_csv(args.output, index=False)
            print(f"结果已保存到: {args.output}")
        else:
            print("\n前5个时间步的预测结果:")
            print(pd.DataFrame({
                'Direction X': predictions[:5, 0],
                'Direction Y': predictions[:5, 1],
                'Direction Z': predictions[:5, 2],
                'Satellite X (km)': states[:5, 0],
                'Satellite Y (km)': states[:5, 1],
                'Satellite Z (km)': states[:5, 2],
            }))
    else:
        predictions = predictor.predict_from_csv(args.input)
        print(f"\n预测完成！形状: {predictions.shape}")

        if args.output:
            result_df = pd.DataFrame({
                'Direction Vector X': predictions[:, 0],
                'Direction Vector Y': predictions[:, 1],
                'Direction Vector Z': predictions[:, 2],
            })
            result_df.to_csv(args.output, index=False)
            print(f"结果已保存到: {args.output}")
        else:
            print("\n前5个时间步的预测结果:")
            print(pd.DataFrame({
                'Direction X': predictions[:5, 0],
                'Direction Y': predictions[:5, 1],
                'Direction Z': predictions[:5, 2],
            }))


if __name__ == '__main__':
    main()
