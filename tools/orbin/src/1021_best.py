import os
import pandas as pd
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from sklearn.preprocessing import RobustScaler
import glob
from tqdm import tqdm
import warnings
import math

warnings.filterwarnings('ignore')

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Current device: {device}")

torch.manual_seed(3407)
np.random.seed(3407)


class OrbitDataset(Dataset):
    """Orbit dataset class with segment-based sequences"""

    def __init__(self, file_list, scaler_input=None, scaler_output=None, fit_scalers=False,
                 sequence_length=30, predict_horizon=1, step_size=1):  # step_size改为1进行密集采样
        self.file_list = file_list
        self.scaler_input = scaler_input
        self.scaler_output = scaler_output
        self.sequence_length = max(10, min(60, int(sequence_length // 10) * 10))
        self.predict_horizon = predict_horizon
        self.step_size = max(1, int(step_size))

        self.input_features = [
            'Azimuth_deg_', 'Elevation_deg_', 'Range_km_',
            'eci_x_m', 'eci_y_m', 'eci_z_m',
            'obs_vector_x', 'obs_vector_y', 'obs_vector_z'
        ]
        self.output_features = ['x_km_', 'y_km_', 'z_km_', 'vx_km_sec_', 'vy_km_sec_', 'vz_km_sec_']

        self.input_sequences = []
        self.target_sequences = []
        self.segment_info = []

        self._load_and_process_segments(fit_scalers)

    def _safe_parse_time(self, time_str):
        try:
            if isinstance(time_str, str):
                time_str = ' '.join(time_str.split())
                time_formats = ['%Y/%m/%d %H:%M:%S', '%Y/%m/%d  %H:%M:%S', '%Y-%m-%d %H:%M:%S',
                                '%Y/%m/%d %H:%M', '%Y-%m-%d %H:%M']
                for fmt in time_formats:
                    try:
                        return pd.to_datetime(time_str, format=fmt)
                    except:
                        continue
                return pd.to_datetime(time_str, errors='coerce')
            else:
                return pd.to_datetime(time_str, errors='coerce')
        except:
            return pd.NaT

    def _load_and_process_segments(self, fit_scalers):
        all_input_data = []
        all_output_data = []

        for file_path in tqdm(self.file_list, desc="Loading segment data"):
            try:
                df = pd.read_csv(file_path, on_bad_lines='skip')

                required_cols = [
                    'Time_UTCG_', 'Azimuth_deg_', 'Elevation_deg_', 'Range_km_',
                    'eci_x_m', 'eci_y_m', 'eci_z_m', 'obs_vector_x', 'obs_vector_y', 'obs_vector_z',
                    'x_km_', 'y_km_', 'z_km_', 'vx_km_sec_', 'vy_km_sec_', 'vz_km_sec_'
                ]

                if not all(col in df.columns for col in required_cols):
                    continue

                df['Time_UTCG_'] = df['Time_UTCG_'].apply(self._safe_parse_time)
                df = df.dropna(subset=['Time_UTCG_'])

                if len(df) < self.sequence_length + self.predict_horizon:
                    continue

                df = df.sort_values('Time_UTCG_').reset_index(drop=True)

                inputs = df[self.input_features].values.astype(np.float32)
                outputs = df[self.output_features].values.astype(np.float32)
                inputs[:, 3:6] /= 1000.0
                inputs = np.nan_to_num(inputs, nan=0.0)
                outputs = np.nan_to_num(outputs, nan=0.0)

                all_input_data.append(inputs)
                all_output_data.append(outputs)
            except:
                continue

        if not all_input_data:
            return

        combined_inputs = np.concatenate(all_input_data, axis=0)
        combined_outputs = np.concatenate(all_output_data, axis=0)

        if fit_scalers:
            self.scaler_input = RobustScaler()
            self.scaler_output = RobustScaler()
            self.scaler_input.fit(combined_inputs)
            self.scaler_output.fit(combined_outputs)

        for inputs, outputs in zip(all_input_data, all_output_data):
            if self.scaler_input:
                inputs = self.scaler_input.transform(inputs)
            if self.scaler_output:
                outputs = self.scaler_output.transform(outputs)

            for i in range(0, len(inputs) - self.sequence_length - self.predict_horizon + 1, self.step_size):
                end_idx = i + self.sequence_length
                target_idx = end_idx + self.predict_horizon - 1
                if target_idx < len(outputs):
                    self.input_sequences.append(inputs[i:end_idx])
                    self.target_sequences.append(outputs[target_idx])

        if self.input_sequences:
            self.input_sequences = np.array(self.input_sequences, dtype=np.float32)
            self.target_sequences = np.array(self.target_sequences, dtype=np.float32)

    def __len__(self):
        return len(self.input_sequences)

    def __getitem__(self, idx):
        return torch.FloatTensor(self.input_sequences[idx]), torch.FloatTensor(self.target_sequences[idx])


# ================ Informer Model Components ================

class ProbMask:
    def __init__(self, B, H, L, index, scores, device="cpu"):
        _mask = torch.ones(L, scores.shape[-1], dtype=torch.bool).to(device).triu(1)
        _mask_ex = _mask[None, None, :].expand(B, H, L, scores.shape[-1])
        indicator = _mask_ex[torch.arange(B)[:, None, None],
                             torch.arange(H)[None, :, None], index, :].to(device)
        self._mask = indicator.view(scores.shape).to(device)

    @property
    def mask(self):
        return self._mask


class ProbAttention(nn.Module):
    def __init__(self, mask_flag=True, factor=5, scale=None, attention_dropout=0.1, output_attention=False):
        super(ProbAttention, self).__init__()
        self.factor = factor
        self.scale = scale
        self.mask_flag = mask_flag
        self.output_attention = output_attention
        self.dropout = nn.Dropout(attention_dropout)

    def _prob_QK(self, Q, K, sample_k, n_top):
        B, H, L_K, E = K.shape
        _, _, L_Q, _ = Q.shape
        K_expand = K.unsqueeze(-3).expand(B, H, L_Q, L_K, E)
        index_sample = torch.randint(L_K, (L_Q, sample_k))
        K_sample = K_expand[:, :, torch.arange(L_Q).unsqueeze(1), index_sample, :]
        Q_K_sample = torch.matmul(Q.unsqueeze(-2), K_sample.transpose(-2, -1)).squeeze(-2)
        M = Q_K_sample.max(-1)[0] - torch.div(Q_K_sample.sum(-1), L_K)
        M_top = M.topk(n_top, sorted=False)[1]
        Q_reduce = Q[torch.arange(B)[:, None, None], torch.arange(H)[None, :, None], M_top, :]
        Q_K = torch.matmul(Q_reduce, K.transpose(-2, -1))
        return Q_K, M_top

    def _get_initial_context(self, V, L_Q):
        B, H, L_V, D = V.shape
        if not self.mask_flag:
            V_sum = V.mean(dim=-2)
            contex = V_sum.unsqueeze(-2).expand(B, H, L_Q, V_sum.shape[-1]).clone()
        else:
            assert(L_Q == L_V)
            contex = V.cumsum(dim=-2)
        return contex

    def _update_context(self, context_in, V, scores, index, L_Q, attn_mask):
        B, H, L_V, D = V.shape
        if self.mask_flag:
            attn_mask = ProbMask(B, H, L_Q, index, scores, device=V.device)
            scores.masked_fill_(attn_mask.mask, -np.inf)
        attn = torch.softmax(scores, dim=-1)
        context_in[torch.arange(B)[:, None, None], torch.arange(H)[None, :, None], index, :] = torch.matmul(attn, V).type_as(context_in)
        if self.output_attention:
            attns = (torch.ones([B, H, L_V, L_V])/L_V).type_as(attn).to(attn.device)
            attns[torch.arange(B)[:, None, None], torch.arange(H)[None, :, None], index, :] = attn
            return (context_in, attns)
        else:
            return (context_in, None)

    def forward(self, queries, keys, values, attn_mask):
        B, L_Q, H, D = queries.shape
        _, L_K, _, _ = keys.shape
        queries = queries.transpose(2,1)
        keys = keys.transpose(2,1)
        values = values.transpose(2,1)
        U_part = self.factor * np.ceil(np.log(L_K)).astype('int').item()
        u = self.factor * np.ceil(np.log(L_Q)).astype('int').item()
        U_part = U_part if U_part<L_K else L_K
        u = u if u<L_Q else L_Q
        scores_top, index = self._prob_QK(queries, keys, sample_k=U_part, n_top=u)
        scale = self.scale or 1./math.sqrt(D)
        if scale is not None:
            scores_top = scores_top * scale
        context = self._get_initial_context(values, L_Q)
        context, attn = self._update_context(context, values, scores_top, index, L_Q, attn_mask)
        return context.transpose(2,1).contiguous(), attn


class AttentionLayer(nn.Module):
    def __init__(self, attention, d_model, n_heads, d_keys=None, d_values=None):
        super(AttentionLayer, self).__init__()
        d_keys = d_keys or (d_model//n_heads)
        d_values = d_values or (d_model//n_heads)
        self.inner_attention = attention
        self.query_projection = nn.Linear(d_model, d_keys * n_heads)
        self.key_projection = nn.Linear(d_model, d_keys * n_heads)
        self.value_projection = nn.Linear(d_model, d_values * n_heads)
        self.out_projection = nn.Linear(d_values * n_heads, d_model)
        self.n_heads = n_heads

    def forward(self, queries, keys, values, attn_mask):
        B, L, _ = queries.shape
        _, S, _ = keys.shape
        H = self.n_heads
        queries = self.query_projection(queries).view(B, L, H, -1)
        keys = self.key_projection(keys).view(B, S, H, -1)
        values = self.value_projection(values).view(B, S, H, -1)
        out, attn = self.inner_attention(queries, keys, values, attn_mask)
        out = out.view(B, L, -1)
        return self.out_projection(out), attn


class TokenEmbedding(nn.Module):
    def __init__(self, c_in, d_model):
        super().__init__()
        self.tokenConv = nn.Linear(c_in, d_model)

    def forward(self, x):
        return self.tokenConv(x)


class PositionalEmbedding(nn.Module):
    def __init__(self, d_model, max_len=5000):
        super().__init__()
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-np.log(10000.0) / d_model))
        pe = torch.zeros(max_len, d_model)
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        pe = pe.unsqueeze(0)
        self.register_buffer('pe', pe)

    def forward(self, x):
        return self.pe[:, :x.size(1), :]


class DataEmbedding(nn.Module):
    def __init__(self, c_in, d_model, dropout=0.1):
        super().__init__()
        self.value_embedding = TokenEmbedding(c_in, d_model)
        self.position_embedding = PositionalEmbedding(d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        x = self.value_embedding(x)
        x = x + self.position_embedding(x)
        return self.dropout(x)


class ConvLayer(nn.Module):
    def __init__(self, c_in):
        super(ConvLayer, self).__init__()
        self.downConv = nn.Conv1d(in_channels=c_in, out_channels=c_in, kernel_size=3,
                                  padding=1, padding_mode='circular')
        self.norm = nn.BatchNorm1d(c_in)
        self.activation = nn.ELU()
        self.maxPool = nn.MaxPool1d(kernel_size=3, stride=2, padding=1)

    def forward(self, x):
        x = self.downConv(x.permute(0, 2, 1))
        x = self.norm(x)
        x = self.activation(x)
        x = self.maxPool(x)
        x = x.transpose(1,2)
        return x


class EncoderLayer(nn.Module):
    def __init__(self, attention, d_model, d_ff=None, dropout=0.1, activation="relu"):
        super(EncoderLayer, self).__init__()
        d_ff = d_ff or 4*d_model
        self.attention = attention
        self.conv1 = nn.Conv1d(in_channels=d_model, out_channels=d_ff, kernel_size=1)
        self.conv2 = nn.Conv1d(in_channels=d_ff, out_channels=d_model, kernel_size=1)
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)
        self.activation = nn.ReLU() if activation == "relu" else nn.GELU()

    def forward(self, x, attn_mask=None):
        new_x, attn = self.attention(x, x, x, attn_mask=attn_mask)
        x = x + self.dropout(new_x)
        y = x = self.norm1(x)
        y = self.dropout(self.activation(self.conv1(y.transpose(-1,1))))
        y = self.dropout(self.conv2(y).transpose(-1,1))
        return self.norm2(x+y), attn


class Encoder(nn.Module):
    def __init__(self, attn_layers, conv_layers=None, norm_layer=None):
        super(Encoder, self).__init__()
        self.attn_layers = nn.ModuleList(attn_layers)
        self.conv_layers = nn.ModuleList(conv_layers) if conv_layers is not None else None
        self.norm = norm_layer

    def forward(self, x, attn_mask=None):
        attns = []
        if self.conv_layers is not None:
            for attn_layer, conv_layer in zip(self.attn_layers, self.conv_layers):
                x, attn = attn_layer(x, attn_mask=attn_mask)
                x = conv_layer(x)
                attns.append(attn)
            x, attn = self.attn_layers[-1](x, attn_mask=attn_mask)
            attns.append(attn)
        else:
            for attn_layer in self.attn_layers:
                x, attn = attn_layer(x, attn_mask=attn_mask)
                attns.append(attn)
        if self.norm is not None:
            x = self.norm(x)
        return x, attns


class DecoderLayer(nn.Module):
    def __init__(self, self_attention, cross_attention, d_model, d_ff=None, dropout=0.1, activation="relu"):
        super(DecoderLayer, self).__init__()
        d_ff = d_ff or 4*d_model
        self.self_attention = self_attention
        self.cross_attention = cross_attention
        self.conv1 = nn.Conv1d(in_channels=d_model, out_channels=d_ff, kernel_size=1)
        self.conv2 = nn.Conv1d(in_channels=d_ff, out_channels=d_model, kernel_size=1)
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.norm3 = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)
        self.activation = nn.ReLU() if activation == "relu" else nn.GELU()

    def forward(self, x, cross, x_mask=None, cross_mask=None):
        x = x + self.dropout(self.self_attention(x, x, x, attn_mask=x_mask)[0])
        x = self.norm1(x)
        x = x + self.dropout(self.cross_attention(x, cross, cross, attn_mask=cross_mask)[0])
        y = x = self.norm2(x)
        y = self.dropout(self.activation(self.conv1(y.transpose(-1,1))))
        y = self.dropout(self.conv2(y).transpose(-1,1))
        return self.norm3(x+y)


class Decoder(nn.Module):
    def __init__(self, layers, norm_layer=None):
        super(Decoder, self).__init__()
        self.layers = nn.ModuleList(layers)
        self.norm = norm_layer

    def forward(self, x, cross, x_mask=None, cross_mask=None):
        for layer in self.layers:
            x = layer(x, cross, x_mask=x_mask, cross_mask=cross_mask)
        if self.norm is not None:
            x = self.norm(x)
        return x


class Informer(nn.Module):
    def __init__(self, enc_in, dec_in, c_out, seq_len, label_len, out_len,
                 factor=5, d_model=512, n_heads=8, e_layers=3, d_layers=2, d_ff=512,
                 dropout=0.0, attn='prob', activation='gelu', output_attention=False, distil=True):
        super(Informer, self).__init__()
        self.pred_len = out_len
        self.label_len = label_len
        self.attn = attn
        self.output_attention = output_attention

        self.enc_embedding = DataEmbedding(enc_in, d_model, dropout)
        self.dec_embedding = DataEmbedding(dec_in, d_model, dropout)

        Attn = ProbAttention if attn=='prob' else None

        self.encoder = Encoder(
            [EncoderLayer(AttentionLayer(Attn(False, factor, attention_dropout=dropout, output_attention=output_attention),
                                        d_model, n_heads), d_model, d_ff, dropout=dropout, activation=activation)
             for l in range(e_layers)],
            [ConvLayer(d_model) for l in range(e_layers-1)] if distil else None,
            norm_layer=torch.nn.LayerNorm(d_model)
        )

        self.decoder = Decoder(
            [DecoderLayer(
                AttentionLayer(Attn(True, factor, attention_dropout=dropout, output_attention=False), d_model, n_heads),
                AttentionLayer(Attn(False, factor, attention_dropout=dropout, output_attention=False), d_model, n_heads),
                d_model, d_ff, dropout=dropout, activation=activation)
             for l in range(d_layers)],
            norm_layer=torch.nn.LayerNorm(d_model)
        )

        self.projection = nn.Linear(d_model, c_out, bias=True)

    def forward(self, x_enc, x_dec):
        enc_out = self.enc_embedding(x_enc)
        enc_out, attns = self.encoder(enc_out, attn_mask=None)
        dec_out = self.dec_embedding(x_dec)
        dec_out = self.decoder(dec_out, enc_out, x_mask=None, cross_mask=None)
        dec_out = self.projection(dec_out)
        return dec_out[:, -self.pred_len:, :]


def load_and_process_data(data_dir):
    """Split dataset by segments"""
    csv_files = glob.glob(os.path.join(data_dir, "*.csv"))
    csv_files.sort()

    if len(csv_files) < 3:
        return [], [], []

    test_files = [csv_files[-1]]
    remaining_files = csv_files[:-1]
    train_end = int(len(remaining_files) * 0.8)
    train_files = remaining_files[:train_end]
    val_files = remaining_files[train_end:]

    print(f"Train: {len(train_files)}, Val: {len(val_files)}, Test: {len(test_files)}")
    return train_files, val_files, test_files


def train_model_custom(model, train_loader, val_loader, feature_weights, num_epochs=300, model_name="Model"):
    """Train model with custom feature weights"""
    model = model.to(device)
    weights_tensor = torch.tensor(feature_weights, dtype=torch.float32).to(device)

    def weighted_mse_loss(predictions, targets):
        mse_per_feature = ((predictions - targets) ** 2).mean(dim=0)
        return (mse_per_feature * weights_tensor).mean()

    # 使用更小的学习率和更长的训练周期
    optimizer = optim.AdamW(model.parameters(), lr=3e-4, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingWarmRestarts(optimizer, T_0=25, T_mult=2, eta_min=1e-6)

    train_losses, val_losses = [], []
    best_val_loss = float('inf')
    best_model_state = None
    patience_counter = 0

    for epoch in range(num_epochs):
        model.train()
        train_loss = 0.0
        for inputs, targets in train_loader:
            inputs, targets = inputs.to(device), targets.to(device)
            optimizer.zero_grad()
            x_enc, x_dec = inputs, inputs[:, -model.label_len:, :]
            outputs = model(x_enc, x_dec).squeeze(1)
            loss = weighted_mse_loss(outputs, targets)
            loss.backward()
            # 更严格的梯度裁剪
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=0.5)
            optimizer.step()
            train_loss += loss.item()

        scheduler.step()

        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for inputs, targets in val_loader:
                inputs, targets = inputs.to(device), targets.to(device)
                x_enc, x_dec = inputs, inputs[:, -model.label_len:, :]
                outputs = model(x_enc, x_dec).squeeze(1)
                val_loss += weighted_mse_loss(outputs, targets).item()

        train_loss /= len(train_loader)
        val_loss /= len(val_loader)
        train_losses.append(train_loss)
        val_losses.append(val_loss)

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_model_state = model.state_dict().copy()
            patience_counter = 0
        else:
            patience_counter += 1

        if (epoch + 1) % 25 == 0:
            print(f"[{model_name}] Epoch {epoch+1}: Train={train_loss:.6f}, Val={val_loss:.6f}")

        # 更长的耐心值
        if patience_counter >= 50:
            print(f"[{model_name}] Early stopping at epoch {epoch+1}")
            break

    if best_model_state:
        model.load_state_dict(best_model_state)
        print(f"[{model_name}] Best val loss: {best_val_loss:.6f}")

    return train_losses, val_losses


def get_predictions(model, test_loader, scaler_output):
    """Get predictions from a model"""
    model.eval()
    all_predictions, all_targets = [], []

    with torch.no_grad():
        for inputs, targets in test_loader:
            inputs, targets = inputs.to(device), targets.to(device)
            x_enc, x_dec = inputs, inputs[:, -model.label_len:, :]
            outputs = model(x_enc, x_dec).squeeze(1)
            all_predictions.append(outputs.cpu().numpy())
            all_targets.append(targets.cpu().numpy())

    predictions = np.vstack(all_predictions)
    targets = np.vstack(all_targets)

    if scaler_output:
        predictions = scaler_output.inverse_transform(predictions)
        targets = scaler_output.inverse_transform(targets)

    return predictions, targets


def evaluate_predictions(predictions, targets, feature_names, model_name):
    """Evaluate and print prediction metrics"""
    mse = np.mean((predictions - targets) ** 2, axis=0)
    rmse = np.sqrt(mse)
    mae = np.mean(np.abs(predictions - targets), axis=0)
    rel_error = np.mean(np.abs(predictions - targets) / (np.abs(targets) + 1e-8) * 100, axis=0)

    print("\n" + "="*80)
    print(f"{model_name} Evaluation Results")
    print("="*80)
    print(f"{'Feature':<10} {'RMSE':<12} {'MAE':<12} {'Rel Error(%)':<15}")
    print("-"*80)

    for i, feat in enumerate(feature_names):
        print(f"{feat:<10} {rmse[i]:<12.4f} {mae[i]:<12.4f} {rel_error[i]:<15.2f}")

    print("-"*80)
    print(f"{'Average':<10} {np.mean(rmse):<12.4f} {np.mean(mae):<12.4f} {np.mean(rel_error):<15.2f}")
    print("="*80)


def plot_ensemble_comparison(ensemble_pred, targets, pred_a, pred_b, pred_c, feature_names, save_dir):
    """Plot comparison of ensemble vs individual models - separate plots for x&vx, y&vy, z&vz"""
    times = np.arange(len(targets))

    # 定义三组特征对：位置和对应的速度
    feature_groups = [
        (['x_km', 'vx_km/s'], [0, 3], 'X Direction'),
        (['y_km', 'vy_km/s'], [1, 4], 'Y Direction'),
        (['z_km', 'vz_km/s'], [2, 5], 'Z Direction')
    ]

    for group_names, indices, group_title in feature_groups:
        # 创建每组的单独图形
        fig, axes = plt.subplots(2, 1, figsize=(16, 10))

        for j, (feat_name, feat_idx) in enumerate(zip(group_names, indices)):
            ax = axes[j]

            # 绘制所有预测线
            ax.plot(times, targets[:, feat_idx], 'b-', label='Ground Truth', linewidth=2.5, alpha=0.8)
            ax.plot(times, ensemble_pred[:, feat_idx], 'r-', label='Ensemble', linewidth=2.5, alpha=0.9)
            ax.plot(times, pred_a[:, feat_idx], 'g--', label='Model A (seq=40)', linewidth=1.5, alpha=0.6)
            ax.plot(times, pred_b[:, feat_idx], 'm--', label='Model B (seq=20)', linewidth=1.5, alpha=0.6)
            ax.plot(times, pred_c[:, feat_idx], 'c--', label='Model C (seq=10)', linewidth=1.5, alpha=0.6)

            # 设置标签和标题
            ax.set_xlabel('Time Step', fontsize=14)
            ax.set_ylabel(feat_name, fontsize=14)
            ax.set_title(f'{feat_name} Prediction Comparison', fontsize=16, fontweight='bold')
            ax.legend(fontsize=12, loc='upper right')
            ax.grid(True, alpha=0.3)

            # 计算并显示RMSE
            rmse_ensemble = np.sqrt(np.mean((ensemble_pred[:, feat_idx] - targets[:, feat_idx]) ** 2))
            rmse_a = np.sqrt(np.mean((pred_a[:, feat_idx] - targets[:, feat_idx]) ** 2))
            rmse_b = np.sqrt(np.mean((pred_b[:, feat_idx] - targets[:, feat_idx]) ** 2))
            rmse_c = np.sqrt(np.mean((pred_c[:, feat_idx] - targets[:, feat_idx]) ** 2))

            textstr = f'RMSE:\nEnsemble: {rmse_ensemble:.4f}\nModel A: {rmse_a:.4f}\nModel B: {rmse_b:.4f}\nModel C: {rmse_c:.4f}'
            ax.text(0.02, 0.98, textstr, transform=ax.transAxes, fontsize=10,
                    verticalalignment='top', bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8))

        # 添加总标题
        fig.suptitle(f'{group_title} - Position and Velocity Comparison', fontsize=18, fontweight='bold', y=0.95)

        # 调整布局
        plt.tight_layout()
        plt.subplots_adjust(top=0.92)

        # 保存各组的图
        filename = f'ensemble_comparison_{group_title.lower().replace(" ", "_")}.png'
        plt.savefig(os.path.join(save_dir, filename), dpi=300, bbox_inches='tight')
        plt.close()

        print(f"Saved {group_title} comparison plot: {filename}")

    print("All ensemble comparison plots saved successfully!")


def main():
    """Main function with THREE model ensemble strategy"""
    data_dir = "16908bighuduan_vector_4d_segments"
    save_dir = "triple_ensemble_results"

    train_files, val_files, test_files = load_and_process_data(data_dir)
    if not train_files:
        return

    print("\n" + "="*80)
    print("TRIPLE ENSEMBLE PREDICTION STRATEGY")
    print("="*80)
    print("Training THREE specialized models:")
    print("  Model A (seq=40): Long-term XY-plane and velocity expert")
    print("  Model B (seq=20): Balanced model for all features")  
    print("  Model C (seq=10): Short-term Z-direction specialist")
    print("  Final: Feature-wise weighted ensemble")
    print("="*80 + "\n")

    # ============ Train Model A: Long-term XY and Velocity Expert ============
    print("\n>>> Training Model A: Long-term XY-Velocity Expert (seq=40, step=1)")
    sequence_length_a = 40
    step_size_a = 1  # 密集采样

    train_dataset_a = OrbitDataset(train_files, fit_scalers=True,
                                   sequence_length=sequence_length_a, step_size=step_size_a)
    val_dataset_a = OrbitDataset(val_files, train_dataset_a.scaler_input,
                                train_dataset_a.scaler_output, False, sequence_length_a, 1, step_size_a)
    test_dataset_a = OrbitDataset(test_files, train_dataset_a.scaler_input,
                                  train_dataset_a.scaler_output, False, sequence_length_a, 1, step_size_a)

    print(f"Model A datasets - Train: {len(train_dataset_a)}, Val: {len(val_dataset_a)}, Test: {len(test_dataset_a)}")

    train_loader_a = DataLoader(train_dataset_a, batch_size=128, shuffle=True, num_workers=0)  # 更小的batch_size
    val_loader_a = DataLoader(val_dataset_a, batch_size=128, shuffle=False, num_workers=0)
    test_loader_a = DataLoader(test_dataset_a, batch_size=128, shuffle=False, num_workers=0)

    # 更大的模型架构
    model_a = Informer(enc_in=9, dec_in=9, c_out=6, seq_len=sequence_length_a, label_len=15,
                      out_len=1, factor=5, d_model=192, n_heads=8, e_layers=4, d_layers=2,
                      d_ff=384, dropout=0.15, attn='prob', activation='gelu',
                      output_attention=False, distil=True)

    print(f"Model A parameters: {sum(p.numel() for p in model_a.parameters()):,}")

    # 权重聚焦于XY平面和速度
    train_losses_a, val_losses_a = train_model_custom(model_a, train_loader_a, val_loader_a,
                                                       feature_weights=[2.0, 2.0, 0.3, 12.0, 12.0, 1.0],
                                                       num_epochs=300, model_name="Model-A")

    # ============ Train Model B: Balanced Model ============
    print("\n>>> Training Model B: Balanced Model (seq=20, step=1)")
    sequence_length_b = 20
    step_size_b = 1  # 密集采样

    train_dataset_b = OrbitDataset(train_files, fit_scalers=True,
                                   sequence_length=sequence_length_b, step_size=step_size_b)
    val_dataset_b = OrbitDataset(val_files, train_dataset_b.scaler_input,
                                train_dataset_b.scaler_output, False, sequence_length_b, 1, step_size_b)
    test_dataset_b = OrbitDataset(test_files, train_dataset_b.scaler_input,
                                  train_dataset_b.scaler_output, False, sequence_length_b, 1, step_size_b)

    print(f"Model B datasets - Train: {len(train_dataset_b)}, Val: {len(val_dataset_b)}, Test: {len(test_dataset_b)}")

    train_loader_b = DataLoader(train_dataset_b, batch_size=128, shuffle=True, num_workers=0)
    val_loader_b = DataLoader(val_dataset_b, batch_size=128, shuffle=False, num_workers=0)
    test_loader_b = DataLoader(test_dataset_b, batch_size=128, shuffle=False, num_workers=0)

    # 中等模型架构
    model_b = Informer(enc_in=9, dec_in=9, c_out=6, seq_len=sequence_length_b, label_len=10,
                      out_len=1, factor=5, d_model=128, n_heads=8, e_layers=3, d_layers=2,
                      d_ff=256, dropout=0.1, attn='prob', activation='gelu',
                      output_attention=False, distil=True)

    print(f"Model B parameters: {sum(p.numel() for p in model_b.parameters()):,}")

    # 平衡的权重
    train_losses_b, val_losses_b = train_model_custom(model_b, train_loader_b, val_loader_b,
                                                       feature_weights=[1.0, 1.0, 3.0, 8.0, 8.0, 10.0],
                                                       num_epochs=300, model_name="Model-B")

    # ============ Train Model C: Z-Direction Specialist ============
    print("\n>>> Training Model C: Z-Direction Specialist (seq=10, step=1)")
    sequence_length_c = 10
    step_size_c = 1  # 密集采样

    train_dataset_c = OrbitDataset(train_files, fit_scalers=True,
                                   sequence_length=sequence_length_c, step_size=step_size_c)
    val_dataset_c = OrbitDataset(val_files, train_dataset_c.scaler_input,
                                train_dataset_c.scaler_output, False, sequence_length_c, 1, step_size_c)
    test_dataset_c = OrbitDataset(test_files, train_dataset_c.scaler_input,
                                  train_dataset_c.scaler_output, False, sequence_length_c, 1, step_size_c)

    print(f"Model C datasets - Train: {len(train_dataset_c)}, Val: {len(val_dataset_c)}, Test: {len(test_dataset_c)}")

    train_loader_c = DataLoader(train_dataset_c, batch_size=128, shuffle=True, num_workers=0)
    val_loader_c = DataLoader(val_dataset_c, batch_size=128, shuffle=False, num_workers=0)
    test_loader_c = DataLoader(test_dataset_c, batch_size=128, shuffle=False, num_workers=0)

    # 轻量级模型架构
    model_c = Informer(enc_in=9, dec_in=9, c_out=6, seq_len=sequence_length_c, label_len=5,
                      out_len=1, factor=5, d_model=96, n_heads=8, e_layers=2, d_layers=2,
                      d_ff=192, dropout=0.05, attn='prob', activation='gelu',
                      output_attention=False, distil=True)

    print(f"Model C parameters: {sum(p.numel() for p in model_c.parameters()):,}")

    # 权重聚焦于Z方向
    train_losses_c, val_losses_c = train_model_custom(model_c, train_loader_c, val_loader_c,
                                                       feature_weights=[0.3, 0.3, 10.0, 1.0, 1.0, 20.0],
                                                       num_epochs=300, model_name="Model-C")

    # ============ Ensemble Evaluation ============
    print("\n>>> Evaluating Individual Models and Ensemble")

    predictions_a, targets_a = get_predictions(model_a, test_loader_a, train_dataset_a.scaler_output)
    predictions_b, targets_b = get_predictions(model_b, test_loader_b, train_dataset_b.scaler_output)
    predictions_c, targets_c = get_predictions(model_c, test_loader_c, train_dataset_c.scaler_output)

    # 确保相同数量的预测
    min_len = min(len(predictions_a), len(predictions_b), len(predictions_c))
    predictions_a = predictions_a[:min_len]
    predictions_b = predictions_b[:min_len]
    predictions_c = predictions_c[:min_len]
    targets = targets_a[:min_len]

    feature_names = ['x_km', 'y_km', 'z_km', 'vx_km/s', 'vy_km/s', 'vz_km/s']

    # 评估单个模型
    evaluate_predictions(predictions_a, targets, feature_names, "Model A (seq=40)")
    evaluate_predictions(predictions_b, targets, feature_names, "Model B (seq=20)")
    evaluate_predictions(predictions_c, targets, feature_names, "Model C (seq=10)")

    # 特征级集成权重: [weight_A, weight_B, weight_C]
    # 基于实际表现优化的集成权重
    ensemble_weights = {
        'x_km': [0.1, 0.2, 0.7],    # Model C在x方向表现最好
        'y_km': [0.1, 0.2, 0.7],    # Model C在y方向表现最好  
        'z_km': [0.8, 0.1, 0.1],    # Model A在z方向表现最好
        'vx_km/s': [0.1, 0.8, 0.1], # Model B在vx方向表现最好
        'vy_km/s': [0.1, 0.1, 0.8], # Model C在vy方向表现最好
        'vz_km/s': [0.6, 0.2, 0.2]  # Model A在vz方向表现最好
    }
    ensemble_predictions = np.zeros_like(predictions_a)

    print("\n>>> 基于实际表现优化的集成权重:")
    for i, feat_name in enumerate(feature_names):
        w_a, w_b, w_c = ensemble_weights[feat_name]
        ensemble_predictions[:, i] = w_a * predictions_a[:, i] + w_b * predictions_b[:, i] + w_c * predictions_c[:, i]
        print(f"  {feat_name}: {w_a*100:.0f}% A + {w_b*100:.0f}% B + {w_c*100:.0f}% C")

    # 评估集成模型
    evaluate_predictions(ensemble_predictions, targets, feature_names, "TRIPLE ENSEMBLE MODEL")

    # 保存结果
    os.makedirs(save_dir, exist_ok=True)

    # 保存模型和结果
    torch.save({
        'model_a_state': model_a.state_dict(),
        'model_b_state': model_b.state_dict(),
        'model_c_state': model_c.state_dict(),
        'scaler_input_a': train_dataset_a.scaler_input,
        'scaler_output_a': train_dataset_a.scaler_output,
        'scaler_input_b': train_dataset_b.scaler_input,
        'scaler_output_b': train_dataset_b.scaler_output,
        'scaler_input_c': train_dataset_c.scaler_input,
        'scaler_output_c': train_dataset_c.scaler_output,
        'ensemble_weights': ensemble_weights,
        'sequence_length_a': sequence_length_a,
        'sequence_length_b': sequence_length_b,
        'sequence_length_c': sequence_length_c,
        'train_losses_a': train_losses_a,
        'val_losses_a': val_losses_a,
        'train_losses_b': train_losses_b,
        'val_losses_b': val_losses_b,
        'train_losses_c': train_losses_c,
        'val_losses_c': val_losses_c
    }, os.path.join(save_dir, 'triple_ensemble_models.pth'))

    # 保存预测结果
    results_df = pd.DataFrame({
        'x_km_true': targets[:, 0], 'x_km_pred_ensemble': ensemble_predictions[:, 0],
        'x_km_pred_a': predictions_a[:, 0], 'x_km_pred_b': predictions_b[:, 0], 'x_km_pred_c': predictions_c[:, 0],
        'y_km_true': targets[:, 1], 'y_km_pred_ensemble': ensemble_predictions[:, 1],
        'y_km_pred_a': predictions_a[:, 1], 'y_km_pred_b': predictions_b[:, 1], 'y_km_pred_c': predictions_c[:, 1],
        'z_km_true': targets[:, 2], 'z_km_pred_ensemble': ensemble_predictions[:, 2],
        'z_km_pred_a': predictions_a[:, 2], 'z_km_pred_b': predictions_b[:, 2], 'z_km_pred_c': predictions_c[:, 2],
        'vx_true': targets[:, 3], 'vx_pred_ensemble': ensemble_predictions[:, 3],
        'vx_pred_a': predictions_a[:, 3], 'vx_pred_b': predictions_b[:, 3], 'vx_pred_c': predictions_c[:, 3],
        'vy_true': targets[:, 4], 'vy_pred_ensemble': ensemble_predictions[:, 4],
        'vy_pred_a': predictions_a[:, 4], 'vy_pred_b': predictions_b[:, 4], 'vy_pred_c': predictions_c[:, 4],
        'vz_true': targets[:, 5], 'vz_pred_ensemble': ensemble_predictions[:, 5],
        'vz_pred_a': predictions_a[:, 5], 'vz_pred_b': predictions_b[:, 5], 'vz_pred_c': predictions_c[:, 5]
    })
    results_df.to_csv(os.path.join(save_dir, 'triple_ensemble_predictions.csv'), index=False)

    # 绘制集成结果对比
    plot_ensemble_comparison(ensemble_predictions, targets, predictions_a, predictions_b, predictions_c,
                            feature_names, save_dir)


    # 绘制三个模型的训练损失
    fig, axes = plt.subplots(1, 3, figsize=(21, 5))

    axes[0].plot(train_losses_a, label='Model A Train', linewidth=2)
    axes[0].plot(val_losses_a, label='Model A Val', linewidth=2)
    axes[0].set_xlabel('Epoch', fontsize=12)
    axes[0].set_ylabel('Loss', fontsize=12)
    axes[0].set_title('Model A (seq=40) Training Loss', fontsize=14, fontweight='bold')
    axes[0].legend()
    axes[0].grid(True, alpha=0.3)
    axes[0].set_yscale('log')

    axes[1].plot(train_losses_b, label='Model B Train', linewidth=2)
    axes[1].plot(val_losses_b, label='Model B Val', linewidth=2)
    axes[1].set_xlabel('Epoch', fontsize=12)
    axes[1].set_ylabel('Loss', fontsize=12)
    axes[1].set_title('Model B (seq=20) Training Loss', fontsize=14, fontweight='bold')
    axes[1].legend()
    axes[1].grid(True, alpha=0.3)
    axes[1].set_yscale('log')

    axes[2].plot(train_losses_c, label='Model C Train', linewidth=2)
    axes[2].plot(val_losses_c, label='Model C Val', linewidth=2)
    axes[2].set_xlabel('Epoch', fontsize=12)
    axes[2].set_ylabel('Loss', fontsize=12)
    axes[2].set_title('Model C (seq=10) Training Loss', fontsize=14, fontweight='bold')
    axes[2].legend()
    axes[2].grid(True, alpha=0.3)
    axes[2].set_yscale('log')

    plt.tight_layout()
    plt.savefig(os.path.join(save_dir, 'triple_training_losses.png'), dpi=300, bbox_inches='tight')
    plt.close()

    # 绘制集成模型的误差分布
    fig, axes = plt.subplots(2, 3, figsize=(18, 12))
    axes = axes.flatten()
    feature_units = ['km', 'km', 'km', 'km/s', 'km/s', 'km/s']

    for i, (feat, unit) in enumerate(zip(feature_names, feature_units)):
        ax = axes[i]
        error = ensemble_predictions[:, i] - targets[:, i]
        ax.hist(error, bins=50, alpha=0.7, color='green', edgecolor='black')
        ax.axvline(0, color='red', linestyle='--', linewidth=2, label='Zero Error')
        ax.set_xlabel(f'Error ({unit})', fontsize=12)
        ax.set_ylabel('Frequency', fontsize=12)
        ax.set_title(f'{feat} Error Distribution (Triple Ensemble)', fontsize=14, fontweight='bold')
        ax.legend(fontsize=10)
        ax.grid(True, alpha=0.3)

        rmse = np.sqrt(np.mean(error**2))
        textstr = f'Mean: {np.mean(error):.4f}\nStd: {np.std(error):.4f}\nRMSE: {rmse:.4f}'
        ax.text(0.05, 0.95, textstr, transform=ax.transAxes, fontsize=10,
                verticalalignment='top', bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

    plt.tight_layout()
    plt.savefig(os.path.join(save_dir, 'triple_ensemble_error_distribution.png'), dpi=300, bbox_inches='tight')
    plt.close()

    print(f"\n✅ Triple ensemble model and results saved to {save_dir}")
    print(f"\nFiles saved:")
    print(f"  - triple_ensemble_models.pth (model weights and scalers)")
    print(f"  - triple_ensemble_predictions.csv (detailed predictions)")
    print(f"  - ensemble_comparison.png (visual comparison)")
    print(f"  - triple_training_losses.png (training curves)")
    print(f"  - triple_ensemble_error_distribution.png (error analysis)")


if __name__ == "__main__":
    main()