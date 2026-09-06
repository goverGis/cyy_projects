"""区域智能划分核心算法（容量约束聚类 + Voronoi 边界 + 评估指标）。

设计目标：把「智能」数学化、可解释、可手写，而不是黑箱调库。
- 硬约束：每个片区业务量落在 [w_min, w_max]，归属唯一，空间连通（Voronoi 天然连通）。
- 软目标：J = J_dist + λ·J_balance + μ·J_shape，归一化后加权。
  · J_dist   服务半径（点到片区中心距离）最小
  · J_balance 各片区业务量均衡
  · J_shape   片区紧凑（Polsby-Popper）
- 求解：容量感知贪心初始化 → move/swap 局部搜索（NP-hard，局部搜索是工程标准解）。

本模块纯 Python（numpy + shapely），可直接在 GeoJSON 上跑通，
FastAPI 路由层再叠加 PostGIS 的 ST_VoronoiPolygons 做生产级裁剪。
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Sequence

import numpy as np
from shapely import MultiPoint, voronoi_polygons
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

# 经纬度 → 米的近似投影系数（城市尺度内误差可忽略）
_M_PER_DEG_LAT = 111_320.0


def _m_per_deg_lng(lat: float) -> float:
    return _M_PER_DEG_LAT * math.cos(math.radians(lat))


def project_to_meters(xy: np.ndarray, lat0: float) -> np.ndarray:
    """经纬度坐标投影到米（等距圆柱近似，用于半径/面积度量）。"""
    kx = _m_per_deg_lng(lat0)
    return np.column_stack([xy[:, 0] * kx, xy[:, 1] * _M_PER_DEG_LAT])


def haversine_m(a: np.ndarray, b: np.ndarray) -> float:
    """两点（经纬度）大圆距离，单位米。"""
    lat0, lat1 = math.radians(a[1]), math.radians(b[1])
    dlat = math.radians(b[1] - a[1])
    dlon = math.radians(b[0] - a[0])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat0) * math.cos(lat1) * math.sin(dlon / 2) ** 2
    return 2 * 6_371_000.0 * math.asin(min(1.0, math.sqrt(h)))


@dataclass
class TerritoryResult:
    k: int
    assignment: np.ndarray                 # 每个点所属片区 id（0..k-1）
    centroids: np.ndarray                  # 片区中心 (lng,lat)
    polygons: list[Polygon | None]         # 各片区 Voronoi 边界
    metrics: dict = field(default_factory=dict)


# --------------------------- 初始化策略 --------------------------- #

def _kpp_seeds(xy: np.ndarray, k: int, rng: np.random.Generator) -> np.ndarray:
    """k-means++ 种子选择，照顾空间覆盖。"""
    n = len(xy)
    seeds = [int(rng.integers(n))]
    d2 = np.sum((xy - xy[seeds[0]]) ** 2, axis=1)
    for _ in range(1, k):
        probs = d2 / d2.sum()
        seeds.append(int(rng.choice(n, p=probs)))
        nd = np.sum((xy - xy[seeds[-1]]) ** 2, axis=1)
        d2 = np.minimum(d2, nd)
    return xy[seeds]


def capacitated_lloyd(
    xy: np.ndarray, weights: np.ndarray, k: int, w_min: float, w_max: float, rng: np.random.Generator, iters: int = 15
) -> tuple[np.ndarray, np.ndarray]:
    """容量约束 Lloyd 迭代（balanced k-means）。

    1. k-means++ 选出空间上分散的种子 → 保证初始地理覆盖；
    2. 就近分配：每个点优先归入最近且仍有余量的片区（容量兜底）；
    3. 重新计算片区中心 → 迭代收敛。
    这一步同时保证「地理邻近」与「容量可控」，是本项目的主干 baseline。
    """
    cents = _kpp_seeds(xy, k, rng)
    assign = np.full(len(weights), -1, dtype=int)
    for _ in range(iters):
        # 就近 + 容量分配
        d = np.linalg.norm(xy[:, None, :] - cents[None, :, :], axis=2)
        order = np.argsort(d, axis=1)  # 每个点按距离升序的片区
        load = np.zeros(k)
        assign = np.full(len(weights), -1, dtype=int)
        for i in range(len(weights)):
            w = weights[i]
            for r in order[i]:
                if load[r] + w <= w_max + 1e-9:
                    assign[i] = r
                    load[r] += w
                    break
            if assign[i] == -1:  # 全部超容 → 丢给余量最大的
                assign[i] = int(np.argmax(w_max - load))
                load[assign[i]] += w
        # 重算中心；空片区重种到离当前中心最远的点
        new_cents = _centroids_of(xy, assign, k)
        for r in range(k):
            if not (assign == r).any():
                far = int(np.argmax(np.linalg.norm(xy - (cents[r] if r < len(cents) else xy.mean(axis=0)), axis=1)))
                new_cents[r] = xy[far]
        if np.allclose(new_cents, cents):
            cents = new_cents
            break
        cents = new_cents
    return assign, cents


# --------------------------- 局部搜索 --------------------------- #

def _centroids_of(xy: np.ndarray, assign: np.ndarray, k: int) -> np.ndarray:
    cents = np.zeros((k, 2))
    for r in range(k):
        m = assign == r
        if m.any():
            cents[r] = xy[m].mean(axis=0)
    return cents


def _objective(
    xy: np.ndarray, weights: np.ndarray, assign: np.ndarray, cents: np.ndarray,
    k: int, lam: float, mu: float, total_w: float, mean_lat: float, ref_dist: float,
) -> float:
    # J_dist：平均加权服务距离，归一化到「城市尺度参考距离」
    d = 0.0
    for r in range(k):
        m = assign == r
        if not m.any():
            continue
        for i in np.where(m)[0]:
            d += haversine_m(xy[i], cents[r]) * weights[i]
    j_dist = (d / total_w) / (ref_dist + 1e-9)

    # J_balance：业务量变异系数 CV
    loads = np.array([weights[assign == r].sum() for r in range(k)])
    j_balance = loads.std() / (loads.mean() + 1e-9)

    # J_shape：平均紧凑度惩罚（1 - 平均 Polsby-Popper）
    j_shape = _mean_compactness(cents, xy, assign, k, mean_lat)
    j_shape = 1.0 - j_shape

    return j_dist + lam * j_balance + mu * j_shape


def _mean_compactness(cents: np.ndarray, xy: np.ndarray, assign: np.ndarray, k: int, mean_lat: float) -> float:
    polys = _voronoi_polys(cents, xy, mean_lat)
    vals = []
    for poly in polys:
        if poly is None or poly.is_empty:
            continue
        vals.append(_polby_popper(poly))
    return float(np.mean(vals)) if vals else 0.0


def _polby_popper(poly: Polygon) -> float:
    """Polsby-Popper 紧凑度 = 4πA / P²，1 为最紧凑（圆）。"""
    area = poly.area
    perim = poly.length
    if perim <= 0:
        return 0.0
    return 4 * math.pi * area / (perim * perim)


def _voronoi_polys(cents: np.ndarray, xy: np.ndarray, mean_lat: float) -> list[Polygon | None]:
    """以片区中心生成 Voronoi，裁剪到所有点的外接矩形。"""
    minx, miny = xy.min(axis=0)
    maxx, maxy = xy.max(axis=0)
    pad = max(maxx - minx, maxy - miny) * 0.05 + 1e-4
    envelope = box(minx - pad, miny - pad, maxx + pad, maxy + pad)
    try:
        diag = voronoi_polygons(MultiPoint([(x, y) for x, y in cents]), extend_to=envelope)
    except Exception:
        return [None] * len(cents)
    # shapely 的 voronoi_polygons 输出顺序与输入点（片区中心）一一对应
    geoms = list(diag.geoms)
    polys: list[Polygon | None] = [None] * len(cents)
    for idx, g in enumerate(geoms):
        if idx < len(polys):
            polys[idx] = g
    return polys


def local_search(
    xy: np.ndarray, weights: np.ndarray, assign: np.ndarray, k: int,
    w_min: float, w_max: float, lam: float, mu: float,
    iters: int = 60, rng: np.random.Generator | None = None, ref_dist: float | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """move / swap 局部搜索，在保持容量硬约束下优化目标函数。"""
    rng = rng or np.random.default_rng(0)
    total_w = float(weights.sum())
    mean_lat = float(xy[:, 1].mean())
    cents = _centroids_of(xy, assign, k)
    if ref_dist is None:
        g = xy.mean(axis=0)
        ref_dist = float(np.mean([haversine_m(p, g) for p in xy])) or 1.0
    cur = _objective(xy, weights, assign, cents, k, lam, mu, total_w, mean_lat, ref_dist)

    for _ in range(iters):
        moved = False
        # move：尝试把某个点移到邻片区
        idx = int(rng.integers(len(weights)))
        cur_r = assign[idx]
        w = weights[idx]
        # 候选：当前负载最小的几个片区（近邻剪枝）
        loads = np.array([weights[assign == r].sum() for r in range(k)])
        cands = np.argsort(loads)[: max(2, k // 3)]
        for r in cands:
            if r == cur_r:
                continue
            if loads[r] + w > w_max + 1e-9:
                continue
            trial = assign.copy()
            trial[idx] = r
            tc = _centroids_of(xy, trial, k)
            obj = _objective(xy, weights, trial, tc, k, lam, mu, total_w, mean_lat, ref_dist)
            if obj < cur - 1e-9:
                assign = trial
                cents = tc
                cur = obj
                moved = True
                break
        if not moved:
            # swap：尝试交换两个片区的点，缓解容量越界
            i, j = int(rng.integers(len(weights))), int(rng.integers(len(weights)))
            if assign[i] != assign[j] and weights[i] != weights[j]:
                trial = assign.copy()
                trial[i], trial[j] = trial[j], trial[i]
                loads = np.array([weights[trial == r].sum() for r in range(k)])
                if loads.max() <= w_max + 1e-9:
                    tc = _centroids_of(xy, trial, k)
                    obj = _objective(xy, weights, trial, tc, k, lam, mu, total_w, mean_lat, ref_dist)
                    if obj < cur - 1e-9:
                        assign = trial
                        cents = tc
                        cur = obj
    return assign, cents


# --------------------------- 主入口 --------------------------- #

def divide(
    xy: np.ndarray,
    weights: np.ndarray,
    k: int,
    w_min: float | None = None,
    w_max: float | None = None,
    lam: float = 2.0,
    mu: float = 0.1,
    seed: int = 42,
    iters: int = 60,
) -> TerritoryResult:
    """容量约束区域划分主入口。返回分配、中心、边界多边形、指标。"""
    xy = np.asarray(xy, dtype=float)
    weights = np.asarray(weights, dtype=float)
    if len(xy) == 0:
        raise ValueError("divide 需要至少 1 个点")
    # 健壮性：片区数不能超过点数（容量约束下每片至少容纳 1 点），
    # 否则初始化时会出现全等距离矩阵导致 NaN。路由层已校验，这里防御兜底。
    k = max(1, min(int(k), len(xy)))
    rng = np.random.default_rng(seed)
    total_w = float(weights.sum())
    mean_w = total_w / k
    w_min = w_min if w_min is not None else mean_w * 0.5
    w_max = w_max if w_max is not None else mean_w * 1.5

    assign, cents = capacitated_lloyd(xy, weights, k, w_min, w_max, rng)
    assign, cents = local_search(xy, weights, assign, k, w_min, w_max, lam, mu, iters, rng)
    mean_lat = float(xy[:, 1].mean())
    polys = _voronoi_polys(cents, xy, mean_lat)
    metrics = evaluate(xy, weights, assign, polys, k, mean_lat)
    return TerritoryResult(k=k, assignment=assign, centroids=cents, polygons=polys, metrics=metrics)


# --------------------------- 基线方法 --------------------------- #

def random_divide(xy, weights, k, seed=42) -> TerritoryResult:
    rng = np.random.default_rng(seed)
    assign = rng.integers(0, k, size=len(weights))
    cents = _centroids_of(xy, assign, k)
    mean_lat = float(xy[:, 1].mean())
    polys = _voronoi_polys(cents, xy, mean_lat)
    return TerritoryResult(k=k, assignment=assign, centroids=cents, polygons=polys,
                           metrics=evaluate(xy, weights, assign, polys, k, mean_lat))


def grid_divide(xy, weights, k) -> TerritoryResult:
    """等距网格：按点数近似切 sqrt(k) × sqrt(k) 网格。"""
    side = int(math.ceil(math.sqrt(k)))
    minx, miny = xy.min(axis=0)
    maxx, maxy = xy.max(axis=0)
    xs = np.floor((xy[:, 0] - minx) / (maxx - minx + 1e-9) * side).astype(int)
    ys = np.floor((xy[:, 1] - miny) / (maxy - miny + 1e-9) * side).astype(int)
    assign = (ys * side + xs).clip(0, k - 1)
    # 若网格数多于 k，归并
    if (assign.max() + 1) > k:
        order = np.unique(assign)
        remap = {v: i % k for i, v in enumerate(order)}
        assign = np.array([remap[v] for v in assign])
    cents = _centroids_of(xy, assign, k)
    mean_lat = float(xy[:, 1].mean())
    polys = _voronoi_polys(cents, xy, mean_lat)
    return TerritoryResult(k=k, assignment=assign, centroids=cents, polygons=polys,
                           metrics=evaluate(xy, weights, assign, polys, k, mean_lat))


def kmeans_divide(xy, weights, k, seed=42, iters=30) -> TerritoryResult:
    """纯 k-means（忽略容量约束），作为对比基线。"""
    rng = np.random.default_rng(seed)
    cents = _kpp_seeds(xy, k, rng)
    for _ in range(iters):
        d = np.linalg.norm(xy[:, None, :] - cents[None, :, :], axis=2)
        assign = d.argmin(axis=1)
        new_cents = _centroids_of(xy, assign, k)
        if np.allclose(new_cents, cents):
            break
        cents = new_cents
    mean_lat = float(xy[:, 1].mean())
    polys = _voronoi_polys(cents, xy, mean_lat)
    return TerritoryResult(k=k, assignment=assign, centroids=cents, polygons=polys,
                           metrics=evaluate(xy, weights, assign, polys, k, mean_lat))


# --------------------------- 评估指标 --------------------------- #

def evaluate(xy, weights, assign, polys, k, mean_lat) -> dict:
    loads = np.array([weights[assign == r].sum() for r in range(k)])
    n_regions = int((loads > 0).sum())
    cv = float(loads.std() / (loads.mean() + 1e-9))

    # 服务半径：每点到大区中心距离（米）
    radii = np.array([haversine_m(xy[i], assign_centroid(assign, cents_of(xy, assign, k), i))
                      for i in range(len(weights))])
    mean_r = float(radii.mean())
    max_r = float(radii.max())

    # 紧凑度：按各片区成员点的凸包计算（Voronoi 多边形被裁剪到全城包围盒，
    # 外圈格子会变成横跨全城的大矩形，Polsby-Popper 趋零，不能反映真实形状）。
    # 注：生产环境应改为把 Voronoi 裁剪到行政区/路网后得到真实边界再算紧凑度。
    compacts = []
    for r in range(k):
        m = xy[assign == r]
        if len(m) < 3:
            continue
        hull = MultiPoint([(x, y) for x, y in m]).convex_hull
        if isinstance(hull, Polygon) and hull.length > 0:
            compacts.append(_polby_popper(hull))
    mean_c = float(np.mean(compacts)) if compacts else 0.0

    return {
        "k": k,
        "n_regions": n_regions,
        "total_weight": float(weights.sum()),
        "min_region_weight": float(loads.min()),
        "max_region_weight": float(loads.max()),
        "cv_weight": round(cv, 4),
        "mean_radius_m": round(mean_r, 1),
        "max_radius_m": round(max_r, 1),
        "mean_compactness": round(mean_c, 4),
        "capacity_violations": int((loads > loads.mean() * 1.5 + 1e-9).sum()),
    }


def cents_of(xy, assign, k):
    return _centroids_of(xy, assign, k)


def assign_centroid(assign, cents, i):
    return cents[assign[i]]


# 便捷：从 GeoJSON / 列表构造输入
def from_points(points: Sequence[dict], k: int, **kw) -> TerritoryResult:
    xy = np.array([[p["longitude"], p["latitude"]] for p in points])
    weights = np.array([float(p.get("weight", 1.0)) for p in points])
    return divide(xy, weights, k, **kw)
