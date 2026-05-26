"""
Orbit训练模块
该文件引用原始的1021_best.py以确保推理正常工作
"""

import os
import sys

# 查找原始orbin目录 - 1021_best.py 与 src 目录在同一级
current_dir = os.path.dirname(os.path.abspath(__file__))
# tools/orbin/src -> tools/orbin (同一目录)
orbin_dir = current_dir

if os.path.exists(orbin_dir):
    sys.path.insert(0, orbin_dir)
    print(f"Added orbin dir: {orbin_dir}")

# 导入原始模块
import importlib.util

best_script = os.path.join(orbin_dir, "1021_best.py")
spec = importlib.util.spec_from_file_location("orbit_train", best_script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

OrbitDataset = module.OrbitDataset
Informer = module.Informer
get_predictions = module.get_predictions

__all__ = ['OrbitDataset', 'Informer', 'get_predictions']
