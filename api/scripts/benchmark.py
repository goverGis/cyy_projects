"""区域划分对比实验：随机 / 等距网格 / 纯 k-means / 容量约束方法。

一条命令产出简历上最值钱的那张表，证明「智能」不是口号。
用法：python -m scripts.benchmark  (在 api/ 目录下)
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from app.algorithms import (
    divide,
    random_divide,
    grid_divide,
    kmeans_divide,
)

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "events.json"
SEEDS = [42, 7, 99, 2024, 13]


def load_points():
    with open(DATA, encoding="utf-8") as f:
        doc = json.load(f)
    pts = doc["events"]
    xy = np.array([[p["longitude"], p["latitude"]] for p in pts])
    w = np.array([float(p.get("weight", 1.0)) for p in pts])
    return xy, w, len(pts)


def run_all(xy, w, k, seed):
    ours = divide(xy, w, k, lam=2.0, mu=0.1, seed=seed)
    rnd = random_divide(xy, w, k, seed=seed)
    grid = grid_divide(xy, w, k)
    km = kmeans_divide(xy, w, k, seed=seed)
    return {
        "ours": ours.metrics,
        "random": rnd.metrics,
        "grid": grid.metrics,
        "kmeans": km.metrics,
    }


def main():
    if not DATA.exists():
        print(f"❌ 找不到 {DATA}，请先运行 tools/generator/generate.mjs")
        sys.exit(1)
    xy, w, n = load_points()
    print(f"数据集：{n} 个事件，总权重 {w.sum():.1f}\n")

    for k in (5, 10, 20):
        print(f"===== K = {k} （5 个固定种子取平均） =====")
        print(f"{'方法':<10}{'CV(业务量)':>12}{'平均半径(m)':>12}{'最大半径(m)':>12}{'紧凑度':>9}{'超容片区':>10}")
        agg = {m: {} for m in ("ours", "random", "grid", "kmeans")}
        for seed in SEEDS:
            res = run_all(xy, w, k, seed)
            for m, met in res.items():
                for key in ("cv_weight", "mean_radius_m", "max_radius_m", "mean_compactness", "capacity_violations"):
                    agg[m].setdefault(key, []).append(met[key])
        for label, m in (("本方法", "ours"), ("随机", "random"), ("网格", "grid"), ("k-means", "kmeans")):
            a = agg[m]
            print(
                f"{label:<10}"
                f"{np.mean(a['cv_weight']):>12.4f}"
                f"{np.mean(a['mean_radius_m']):>12.1f}"
                f"{np.mean(a['max_radius_m']):>12.1f}"
                f"{np.mean(a['mean_compactness']):>9.4f}"
                f"{np.mean(a['capacity_violations']):>10.1f}"
            )
        print()


if __name__ == "__main__":
    main()
