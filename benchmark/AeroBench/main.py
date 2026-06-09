"""AeroBench — astro-one 航天垂直领域专项测评基准

用法:
    # 模拟模式（快速 baseline）
    python -m benchmark.AeroBench.main --mode tool-sim

    # 直接调用真实模型
    python -m benchmark.AeroBench.main --mode tool-direct --tasks mlf iod

    # 详细指标输出
    python -m benchmark.AeroBench.main --mode tool-sim --print-metrics

    # 保存报告
    python -m benchmark.AeroBench.main --mode tool-sim --output report.json
"""

import sys
from pathlib import Path

# 确保项目根目录在 sys.path 中
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(_PROJECT_ROOT))

from benchmark.AeroBench.runners.bench_runner import run_benchmark_cli

if __name__ == "__main__":
    run_benchmark_cli()
