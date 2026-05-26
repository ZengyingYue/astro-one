"""
MLF (Liquid State Machine) 轨道机动检测模型
基于液体状态机的卫星机动检测算法
"""

import torch
import torch.nn as nn
from typing import List, Tuple, Optional
import numpy as np

# 全局参数
Vth = 0.6
Vth2 = 1.6
Vth3 = 2.6
a = 1.0
TimeStep = 4
tau = 0.75


class SpikeFunction(torch.autograd.Function):
    """代理梯度函数"""
    @staticmethod
    def forward(ctx, input):
        ctx.save_for_backward(input)
        output = torch.gt(input, Vth)
        return output.float()

    @staticmethod
    def backward(ctx, grad_output):
        input, = ctx.saved_tensors
        grad_input = grad_output.clone()
        hu = (abs(input - Vth) < (a / 2)) / a
        return grad_input * hu


spikefunc = SpikeFunction.apply


class SpikeFunction2(torch.autograd.Function):
    @staticmethod
    def forward(ctx, input):
        ctx.save_for_backward(input)
        output = torch.gt(input, Vth2)
        return output.float()

    @staticmethod
    def backward(ctx, grad_output):
        input, = ctx.saved_tensors
        grad_input = grad_output.clone()
        hu = (abs(input - Vth2) < (a / 2)) / a
        return grad_input * hu


spikefunc2 = SpikeFunction2.apply


class SpikeFunction3(torch.autograd.Function):
    @staticmethod
    def forward(ctx, input):
        ctx.save_for_backward(input)
        output = torch.gt(input, Vth3)
        return output.float()

    @staticmethod
    def backward(ctx, grad_output):
        input, = ctx.saved_tensors
        grad_input = grad_output.clone()
        hu = (abs(input - Vth3) < (a / 2)) / a
        return grad_input * hu


spikefunc3 = SpikeFunction3.apply


class MLF(nn.Module):
    """液体状态机模块"""
    def __init__(self):
        super(MLF, self).__init__()

    def forward(self, x):
        bs = int(x.shape[0] / TimeStep)
        u = torch.zeros((bs,) + x.shape[1:], device=x.device)
        u2 = torch.zeros((bs,) + x.shape[1:], device=x.device)
        u3 = torch.zeros((bs,) + x.shape[1:], device=x.device)
        o = torch.zeros(x.shape, device=x.device)

        for t in range(TimeStep):
            xt = x[t * bs:(t + 1) * bs, ...]
            u = u + xt
            u2 = u2 + xt
            u3 = u3 + xt

            out = spikefunc(u)
            out2 = spikefunc2(u2)
            out3 = spikefunc3(u3)

            u = u * (1 - out)
            u = tau * u
            u2 = u2 * (1 - out2)
            u2 = tau * u2
            u3 = u3 * (1 - out3)
            u3 = tau * u3

            o[t * bs:(t + 1) * bs, ...] = out + out2 + out3

        return o
