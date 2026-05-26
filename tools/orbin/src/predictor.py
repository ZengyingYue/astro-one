"""
Orbin 轨道根数预测器
基于Informer模型的轨道六根数预测
"""

import os
import sys
import glob
import argparse
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
import torch
from torch.utils.data import DataLoader
from sklearn.preprocessing import RobustScaler

# 添加src目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 导入训练模块
from train_module import OrbitDataset, Informer, get_predictions


class OrbitPredictor:
    """Orbit轨道根数预测器"""

    def __init__(self, model_dir: str = None, data_dir: str = None, device: str = 'cpu'):
        """
        初始化预测器

        Args:
            model_dir: 模型文件目录
            data_dir: 数据文件目录
            device: 计算设备
        """
        if model_dir is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            model_dir = os.path.join(base_dir, "models")
        if data_dir is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            data_dir = os.path.join(base_dir, "data")

        self.model_dir = model_dir
        self.data_dir = data_dir
        self.device = torch.device(device if torch.cuda.is_available() and device == 'cuda' else 'cpu')

        # 加载检查点
        checkpoint_path = os.path.join(model_dir, "triple_ensemble_models.pth")
        self.checkpoint = self._load_checkpoint(checkpoint_path)

        # 特征名
        self.feature_names = ['x_km', 'y_km', 'z_km', 'vx_km/s', 'vy_km/s', 'vz_km/s']

        # 默认权重
        self.weights = {
            'x_km': [0.34, 0.33, 0.33],
            'y_km': [0.34, 0.33, 0.33],
            'z_km': [0.34, 0.33, 0.33],
            'vx_km/s': [0.34, 0.33, 0.33],
            'vy_km/s': [0.34, 0.33, 0.33],
            'vz_km/s': [0.34, 0.33, 0.33],
        }

        print(f"Orbit模型加载完成，使用设备: {self.device}")

    def _load_checkpoint(self, checkpoint_path: str):
        """加载模型检查点"""
        if not os.path.exists(checkpoint_path):
            print(f"[WARN] 未找到检查点 {checkpoint_path}，将退回到基线预测")
            return None

        try:
            from torch.serialization import add_safe_globals
            add_safe_globals([RobustScaler])
        except Exception:
            pass

        try:
            checkpoint = torch.load(checkpoint_path, map_location=self.device, weights_only=False)
        except TypeError:
            checkpoint = torch.load(checkpoint_path, map_location=self.device)

        print(f"[INFO] 已加载检查点: {checkpoint_path}")
        return checkpoint

    def _build_model(self, model_key: str, seq_len: int):
        """构建模型"""
        configs = {
            "A": dict(label_len=15, d_model=192, n_heads=8, e_layers=4, d_layers=2, d_ff=384, dropout=0.15),
            "B": dict(label_len=10, d_model=128, n_heads=8, e_layers=3, d_layers=2, d_ff=256, dropout=0.1),
            "C": dict(label_len=5, d_model=96, n_heads=8, e_layers=2, d_layers=2, d_ff=192, dropout=0.05),
        }

        cfg = configs[model_key]
        return Informer(
            enc_in=9,
            dec_in=9,
            c_out=6,
            seq_len=seq_len,
            label_len=cfg["label_len"],
            out_len=1,
            factor=5,
            d_model=cfg["d_model"],
            n_heads=cfg["n_heads"],
            e_layers=cfg["e_layers"],
            d_layers=cfg["d_layers"],
            d_ff=cfg["d_ff"],
            dropout=cfg["dropout"],
            attn="prob",
            activation="gelu",
            output_attention=False,
            distil=True,
        )

    def _collect_data_files(self) -> List[str]:
        """收集数据文件"""
        if not os.path.exists(self.data_dir):
            raise FileNotFoundError(f"数据目录不存在: {self.data_dir}")

        files = sorted(glob.glob(os.path.join(self.data_dir, "*.csv")))
        if not files:
            raise FileNotFoundError(f"目录 {self.data_dir} 中不存在CSV文件")

        return files

    def _prepare_dataset(self, files: List[str], scaler_input, scaler_output, seq_len: int):
        """准备数据集"""
        fit_scalers = scaler_input is None or scaler_output is None

        dataset = OrbitDataset(
            files,
            scaler_input=scaler_input,
            scaler_output=scaler_output,
            fit_scalers=fit_scalers,
            sequence_length=seq_len,
            step_size=1,
            predict_horizon=1,
        )

        if len(dataset) == 0:
            raise RuntimeError("数据预处理后为空")

        loader = DataLoader(dataset, batch_size=128, shuffle=False, num_workers=0)
        return dataset, loader

    def _ensemble_predictions(self, pred_a, pred_b, pred_c):
        """集成预测"""
        ensemble = np.zeros_like(pred_a)
        for idx, feat in enumerate(self.feature_names):
            w_a, w_b, w_c = self.weights.get(feat, [1/3, 1/3, 1/3])
            ensemble[:, idx] = w_a * pred_a[:, idx] + w_b * pred_b[:, idx] + w_c * pred_c[:, idx]
        return ensemble

    def predict(self, output_file: str = None, max_rows: int = 200) -> pd.DataFrame:
        """
        执行预测

        Args:
            output_file: 输出文件路径
            max_rows: 最大输出行数

        Returns:
            预测结果DataFrame
        """
        files = self._collect_data_files()

        # 获取序列长度
        seq_a = self.checkpoint.get("sequence_length_a", 40) if self.checkpoint else 40
        seq_b = self.checkpoint.get("sequence_length_b", 20) if self.checkpoint else 20
        seq_c = self.checkpoint.get("sequence_length_c", 10) if self.checkpoint else 10

        # 准备数据集
        dataset_a, loader_a = self._prepare_dataset(
            files,
            self.checkpoint.get("scaler_input_a") if self.checkpoint else None,
            self.checkpoint.get("scaler_output_a") if self.checkpoint else None,
            seq_a
        )
        dataset_b, loader_b = self._prepare_dataset(
            files,
            self.checkpoint.get("scaler_input_b") if self.checkpoint else None,
            self.checkpoint.get("scaler_output_b") if self.checkpoint else None,
            seq_b
        )
        dataset_c, loader_c = self._prepare_dataset(
            files,
            self.checkpoint.get("scaler_input_c") if self.checkpoint else None,
            self.checkpoint.get("scaler_output_c") if self.checkpoint else None,
            seq_c
        )

        # 构建模型
        model_a = self._build_model("A", seq_a).to(self.device)
        model_b = self._build_model("B", seq_b).to(self.device)
        model_c = self._build_model("C", seq_c).to(self.device)

        use_baseline = self.checkpoint is None
        if self.checkpoint:
            model_a.load_state_dict(self.checkpoint["model_a_state"])
            model_b.load_state_dict(self.checkpoint["model_b_state"])
            model_c.load_state_dict(self.checkpoint["model_c_state"])
            print("[INFO] 已加载模型权重")

        # 执行预测 - 设置全局device变量供get_predictions使用
        import train_module
        train_module.device = self.device

        if use_baseline:
            _, targets_a = get_predictions(model_a, loader_a, dataset_a.scaler_output)
            predictions_a = targets_a.copy()
            _, targets_b = get_predictions(model_b, loader_b, dataset_b.scaler_output)
            predictions_b = targets_b.copy()
            _, targets_c = get_predictions(model_c, loader_c, dataset_c.scaler_output)
            predictions_c = targets_c.copy()
            targets = targets_a
        else:
            predictions_a, targets = get_predictions(model_a, loader_a, dataset_a.scaler_output)
            predictions_b, _ = get_predictions(model_b, loader_b, dataset_b.scaler_output)
            predictions_c, _ = get_predictions(model_c, loader_c, dataset_c.scaler_output)

        # 截取相同长度
        min_len = min(len(predictions_a), len(predictions_b), len(predictions_c))
        predictions_a = predictions_a[:min_len]
        predictions_b = predictions_b[:min_len]
        predictions_c = predictions_c[:min_len]
        targets = targets[:min_len] if targets is not None else None

        # 集成预测
        ensemble = self._ensemble_predictions(predictions_a, predictions_b, predictions_c)

        # 保存结果
        if output_file is None:
            output_file = os.path.join(self.data_dir, "orbit_prediction.csv")

        rows = min(max_rows, len(ensemble))
        data = {"sample": np.arange(rows)}
        for i, feat in enumerate(self.feature_names):
            data[f"{feat}_pred"] = ensemble[:rows, i]
            if targets is not None:
                data[f"{feat}_true"] = targets[:rows, i]

        result_df = pd.DataFrame(data)
        result_df.to_csv(output_file, index=False)
        print(f"[INFO] 预测结果已保存至 {output_file}（共 {rows} 行）")

        return result_df


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='Orbit轨道根数预测')
    parser.add_argument('--data_dir', '-d', type=str, default=None, help='数据目录路径')
    parser.add_argument('--model_dir', '-m', type=str, default=None, help='模型目录路径')
    parser.add_argument('--output', '-o', type=str, default=None, help='输出CSV文件路径')
    parser.add_argument('--max_rows', '-n', type=int, default=200, help='最大输出行数')
    parser.add_argument('--device', type=str, default='cpu', choices=['cpu', 'cuda'], help='计算设备')

    args = parser.parse_args()

    predictor = OrbitPredictor(model_dir=args.model_dir, data_dir=args.data_dir, device=args.device)
    result = predictor.predict(output_file=args.output, max_rows=args.max_rows)

    print("\n预测结果预览:")
    print(result.head())


if __name__ == "__main__":
    main()
