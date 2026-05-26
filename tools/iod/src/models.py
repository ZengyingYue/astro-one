"""
IOD (Initial Orbit Determination) 轨道初定模型定义
包含Encoder Transformer和Decoder MLP的定义
"""

import torch
import torch.nn as nn
import numpy as np


class PositionalEncoding(nn.Module):
    """位置编码类"""
    def __init__(self, d_model, max_len=500):
        super(PositionalEncoding, self).__init__()
        position = torch.arange(0, max_len).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2) * (-np.log(10000.0) / d_model))

        pe = torch.zeros(max_len, d_model)
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)

        pe = pe.unsqueeze(0)
        self.register_buffer('pe', pe)

    def forward(self, x):
        x = x + self.pe[:, :x.size(1), :]
        return x


class EncodeTransformer(nn.Module):
    """Transformer编码器模型，用于从观测数据预测卫星状态"""
    def __init__(self, input_dim=10, output_dim=6, d_model=128, nhead=8, num_layers=4, dim_feedforward=512):
        super(EncodeTransformer, self).__init__()

        self.d_model = d_model
        self.input_fc = nn.Linear(input_dim, d_model)
        self.pos_encoder = PositionalEncoding(d_model)

        encoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=nhead, dim_feedforward=dim_feedforward)
        self.transformer_encoder = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.fc_out = nn.Linear(d_model, output_dim)

    def forward(self, src):
        src = self.input_fc(src) * np.sqrt(self.d_model)
        src = self.pos_encoder(src)
        src = src.permute(1, 0, 2)
        output = self.transformer_encoder(src)
        output = output.permute(1, 0, 2)
        output = self.fc_out(output)
        return output


class TimeStepMLP(nn.Module):
    """MLP用于处理每个时间步的输入到输出转换"""
    def __init__(self, input_dim, hidden_dim, output_dim):
        super(TimeStepMLP, self).__init__()

        self.mlp = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, output_dim)
        )

    def forward(self, x):
        return self.mlp(x)


class DecoderMLP(nn.Module):
    """Decoder MLP，每个时间步有相同的MLP结构"""
    def __init__(self, combined_input_dim=13, hidden_dim=64, output_dim=3, sequence_length=30):
        super(DecoderMLP, self).__init__()

        self.sequence_length = sequence_length
        self.mlp = TimeStepMLP(combined_input_dim, hidden_dim, output_dim)

    def forward(self, combined_input):
        if len(combined_input.shape) == 4:
            combined_input = combined_input.squeeze(1)

        batch_size, sequence_length, combined_input_dim = combined_input.shape
        combined_input_flat = combined_input.view(batch_size * sequence_length, combined_input_dim)
        outputs_flat = self.mlp(combined_input_flat)
        outputs = outputs_flat.view(batch_size, sequence_length, -1)

        return outputs


class CombinedModel(nn.Module):
    """组合模型：Encoder Transformer + Decoder MLP"""
    def __init__(self, encoder_transformer, decoder_mlp, observer_dim=7,
                 decoder_input_scaler=None, encode_transformer_output_scaler=None, device='cpu'):
        super(CombinedModel, self).__init__()
        self.encoder_transformer = encoder_transformer
        self.decoder_mlp = decoder_mlp
        self.observer_dim = observer_dim
        self.decoder_input_scaler = decoder_input_scaler
        self.encode_transformer_output_scaler = encode_transformer_output_scaler

        if decoder_input_scaler is not None:
            self.scaler_mean = torch.tensor(self.decoder_input_scaler.mean_, dtype=torch.float32).to(device)
            self.scaler_std = torch.tensor(self.decoder_input_scaler.scale_, dtype=torch.float32).to(device)
        else:
            self.scaler_mean = None
            self.scaler_std = None

        if encode_transformer_output_scaler is not None:
            self.encode_transformer_scaler_mean = torch.tensor(self.encode_transformer_output_scaler.mean_, dtype=torch.float32).to(device)
            self.encode_transformer_scaler_std = torch.tensor(self.encode_transformer_output_scaler.scale_, dtype=torch.float32).to(device)
        else:
            self.encode_transformer_scaler_mean = None
            self.encode_transformer_scaler_std = None

        self.device = device

    def forward(self, encode_transformer_inputs, decoder_inputs):
        encoder_outputs = self.encoder_transformer(encode_transformer_inputs)

        if self.encode_transformer_scaler_mean is not None:
            encoder_outputs = (encoder_outputs * self.encode_transformer_scaler_std) + self.encode_transformer_scaler_mean

        combined_inputs = torch.cat([decoder_inputs, encoder_outputs], dim=-1)

        batch_size, seq_len, _ = combined_inputs.shape
        combined_inputs_flat = combined_inputs.view(-1, 13)

        if self.scaler_mean is not None:
            combined_inputs_flat_normalized = (combined_inputs_flat - self.scaler_mean) / self.scaler_std
        else:
            combined_inputs_flat_normalized = combined_inputs_flat

        combined_inputs_normalized = combined_inputs_flat_normalized.view(batch_size, seq_len, 13)
        outputs = self.decoder_mlp(combined_inputs_normalized)

        return outputs
