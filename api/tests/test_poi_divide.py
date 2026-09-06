"""POI 语义划分算法测试（纯算法层，不依赖数据库 / HTTP）。

运行（在 api/ 目录，激活 .venv）：
    pytest -q tests/test_poi_divide.py
"""

import numpy as np
import pytest

from app.algorithms.poi_divide import poi_divide

POI_TYPES = ["residential", "mall", "medical", "leisure", "education"]


# --------------------------- 构造测试数据 --------------------------- #
def _make_cluster(cx, cy, n, typ, weight=1.0, spread=0.002, seed=0):
    """在 (cx, cy) 附近生成 n 个同类型点。

    用均匀分布而非正态：保证全部点落在 ±spread 内，
    不会出现「尾巴点逃逸出 eps 自成一簇」的假簇。
    spread=0.002（≈220m）时任意两点距离 < 440m < 默认 eps，必然单簇。
    """
    rng = np.random.default_rng(seed)
    lng = cx + rng.uniform(-spread, spread, n)
    lat = cy + rng.uniform(-spread, spread, n)
    return np.column_stack([lng, lat]), [typ] * n, np.full(n, weight)


def _make_block_grid(blocks, per_block, weight, base=(116.40, 39.90),
                     step=0.003, jitter=0.00025, seed=0):
    """构造「超容热点」：blocks 个紧致子块沿经度排开。

    - 子块内部：per_block 点均匀 ±jitter（约 ±28m），块内必然连通；
    - 子块间距 step=0.003（约 330m）：
      * eps=350 时块间最近点距 ≈ 330 − 2×28 ≈ 274m < eps → 全部连成 1 个单元；
      * 递归拆分 eps=175 时 274m > eps → 恰好切成 blocks 个可独立聚合的单元。
    这样能稳定验证「超容单元被递归拆分」这一核心逻辑。
    """
    rng = np.random.default_rng(seed)
    xy_list, ty_list, w_list = [], [], []
    for i in range(blocks):
        cx = base[0] + i * step
        xy = np.column_stack([
            cx + rng.uniform(-jitter, jitter, per_block),
            base[1] + rng.uniform(-jitter, jitter, per_block),
        ])
        xy_list.append(xy)
        ty_list.extend(["residential"] * per_block)
        w_list.extend([weight] * per_block)
    return np.vstack(xy_list), ty_list, np.array(w_list, dtype=float)


def _make_mixed(seed=1, per_small=25):
    """5 类 POI × 2 簇，簇间距拉开，每簇均匀散布 → 精确 10 个原子单元。"""
    centers = [
        (116.30, 39.80), (116.40, 39.82), (116.50, 39.84),
        (116.33, 39.90), (116.43, 39.92), (116.53, 39.94),
        (116.35, 40.00), (116.45, 40.02), (116.55, 40.04),
        (116.38, 40.10),
    ]
    xy_list, ty_list, w_list = [], [], []
    for i, (c, typ) in enumerate(zip(centers, POI_TYPES * 2)):
        xy, ty, w = _make_cluster(*c, per_small, typ, weight=1.0 + (i % 3), seed=seed + i)
        xy_list.append(xy); ty_list.extend(ty); w_list.extend(w)
    return np.vstack(xy_list), ty_list, np.array(w_list, dtype=float)


# --------------------------- 纯语义聚类（一单元一片区） --------------------------- #
def test_semantic_mode_each_region_single_type():
    xy, types, w = _make_mixed()
    res = poi_divide(xy, types, w, balanced=False, eps_by_type={"residential": 500, "mall": 500,
                                                                "medical": 500, "leisure": 500, "education": 500})
    assert res.balanced is False
    assert len(res.regions) == 10  # 5 类 × 2 簇
    for r in res.regions:
        assert r.poi_type in POI_TYPES
    # by_type 计数与 region 分布一致
    assert sum(res.by_type.values()) == len(res.regions)
    assert all(res.by_type[t] == 2 for t in POI_TYPES)


def test_semantic_mode_point_count_and_weight():
    xy, types, w = _make_mixed(per_small=40)
    res = poi_divide(xy, types, w, balanced=False)
    assert sum(r.point_count for r in res.regions) == len(xy)
    assert abs(res.total_weight - w.sum()) < 1e-6


def test_empty_input():
    xy = np.empty((0, 2)); types = []; w = np.empty(0)
    res = poi_divide(xy, types, w)
    assert res.regions == []
    assert res.by_type == {}
    assert res.metrics["region_count"] == 0


def test_single_point_per_type():
    pts = [[116.35, 39.87], [116.40, 39.90], [116.45, 39.93]]
    types = ["residential", "mall", "medical"]
    xy = np.array(pts); w = np.array([2.0, 3.0, 4.0])
    res = poi_divide(xy, types, w, balanced=False)
    assert len(res.regions) == 3
    assert {r.poi_type for r in res.regions} == {"residential", "mall", "medical"}
    # 单点片区 weight = 点权重
    wmap = {r.poi_type: r.weight for r in res.regions}
    assert wmap["residential"] == 2.0 and wmap["mall"] == 3.0


# --------------------------- 均衡模式（两阶段） --------------------------- #
def test_balanced_mode_lowers_cv():
    """两阶段均衡聚合的 CV 应显著低于纯语义（超容热点被拆开混批）。"""
    # 一个超容热点：6 子块 × 50 点 × 权重 2 = 600（eps350 连成 1 单元，可递归拆分）
    hot_xy, hot_t, hot_w = _make_block_grid(6, 50, 2.0, base=(116.40, 39.90), seed=10)
    # 若干远距小簇（低权重），拉大语义模式的 CV
    small_xy, small_t, small_w = _make_mixed(seed=4, per_small=20)
    xy = np.vstack([hot_xy, small_xy])
    types = hot_t + small_t
    w = np.concatenate([hot_w, small_w])

    raw = poi_divide(xy, types, w, balanced=False)
    bal = poi_divide(xy, types, w, balanced=True, target_k=6)
    assert bal.metrics["cv_weight"] < raw.metrics["cv_weight"]
    assert bal.metrics["cv_weight"] < 0.6  # 均衡模式应处于合理低 CV


def test_balanced_mode_no_overload_when_splittable():
    """核心回归：超容热点单元应被递归拆分，不允许 overload 残留。

    容量口径与 /divide 一致（总权重/k × 1.2 裕量）；当容量给足时，
    拆分后的原子单元应能聚合为零超载片区。
    """
    # 主热点：4 子块 × 80 点 × 权重 1 = 320 → eps350 合并为 1 个超容单元
    hot_xy, hot_t, hot_w = _make_block_grid(4, 80, 1.0, base=(116.40, 39.90), seed=0)
    # 远处一个小簇提供均衡聚合空间
    ex, et, ew = _make_cluster(116.46, 39.96, 20, "residential", 1.0, seed=5)
    xy = np.vstack([hot_xy, ex])
    types = hot_t + et
    w = np.concatenate([hot_w, ew])
    # total = 340；k=2 → capacity = 340/2 × 1.2 = 204 → 4×80 拆后两两并 ≤204
    res = poi_divide(xy, types, w, balanced=True, target_k=2,
                     eps_by_type={"residential": 350, "mall": 450, "medical": 400,
                                  "leisure": 400, "education": 400})
    assert res.metrics["region_count"] > 1
    # 递归拆分确实发生：4 子块 + 1 小簇 = 5 个原子单元（不拆只有 2 个粗单元）
    assert res.metrics["unit_count"] == 5, res.metrics
    # 存在容量语义时必须零超载
    assert res.metrics["overload_count"] == 0, res.metrics
    assert res.metrics["max_load_ratio"] <= 1.0 + 1e-6
    cap = res.metrics["capacity"]
    for r in res.regions:
        assert r.weight <= cap * 1.001 + 1e-6, f"region {r.region_id} weight {r.weight} > cap {cap}"


def test_balanced_mode_weight_preserved():
    xy, types, w = _make_mixed()
    res = poi_divide(xy, types, w, balanced=True, target_k=8)
    assert abs(sum(r.weight for r in res.regions) - w.sum()) < 1e-6


# --------------------------- 边界与稳定性 --------------------------- #
def test_same_seed_reproducible():
    xy, types, w = _make_mixed(seed=2)
    a = poi_divide(xy, types, w, balanced=True, target_k=12, seed=7)
    b = poi_divide(xy, types, w, balanced=True, target_k=12, seed=7)
    assert [r.region_id for r in a.regions] == [r.region_id for r in b.regions]
    assert [round(r.weight, 3) for r in a.regions] == [round(r.weight, 3) for r in b.regions]


def test_all_same_type_no_crash():
    xy, types, w = _make_cluster(116.40, 39.90, 80, "mall", 1.0, seed=9)
    res = poi_divide(xy, types, w, balanced=True, target_k=4)
    assert res.by_type == {"mall": len(res.regions)}
    assert res.metrics["region_count"] >= 1


@pytest.mark.parametrize("balanced", [True, False])
def test_result_always_has_geojson(balanced):
    xy, types, w = _make_mixed(per_small=30)
    res = poi_divide(xy, types, w, balanced=balanced, target_k=8)
    assert res.geojson["type"] == "FeatureCollection"
    assert len(res.geojson["features"]) == len(res.regions)
