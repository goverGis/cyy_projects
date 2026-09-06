"""POI 语义划分算法

两阶段划分（对应「小区为单元 → 邻近单元聚成片区 → 片区业务量均衡」的思路）：

- 阶段一（原子单元识别）：同类型 POI 内部做 DBSCAN，eps 按真实地理距离（米）计算，
  一个簇＝一个「原子单元」（一个小区 / 一个商圈 / 一所医院…）。
- 阶段二（容量约束聚合）：把每类内部的原子单元作为不可切分的最小单位，
  用容量约束 Lloyd + 局部搜索把它们聚成若干片区，使各片区业务量（权重）尽量均衡。
  这样语义片区也有「负载率 / 超载 / 服务半径」，可与容量约束划分同台对比。

关闭 balanced 时退化为纯语义聚类（一个 DBSCAN 簇即一个片区）。

坐标系：GCJ-02（高德），计算距离时用 Haversine 球面距离，不纠偏。
"""

from dataclasses import dataclass, field

import numpy as np
from shapely.geometry import MultiPoint, Point, mapping

from .territory import divide as capacity_divide


EARTH_RADIUS_M = 6371000.0
POI_TYPES = ["residential", "mall", "medical", "leisure", "education"]


def _haversine_m(a, b):
    """计算两点间球面距离（米）。a, b 为 [lng, lat] 数组。"""
    lat1, lon1 = np.radians(a[1]), np.radians(a[0])
    lat2, lon2 = np.radians(b[1]), np.radians(b[0])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    s = (
        np.sin(dlat / 2) ** 2
        + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(s))


def _pairwise_m(a, b):
    """两组点两两球面距离矩阵（米）。a: (n,2) b: (m,2) → (n,m)。"""
    lat1 = np.radians(a[:, 1])[:, None]
    lon1 = np.radians(a[:, 0])[:, None]
    lat2 = np.radians(b[:, 1])[None, :]
    lon2 = np.radians(b[:, 0])[None, :]
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    s = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(np.clip(s, 0.0, 1.0)))


def _dbscan(xy, eps_m, min_samples=1):
    """DBSCAN（基于真实地理距离，向量化邻接矩阵）。

    返回 labels：-1 表示噪声，>=0 表示簇编号。
    min_samples=1（默认）时不允许噪声点，退化为「距离 <= eps 的连通分量」。
    """
    n = len(xy)
    if n == 0:
        return np.array([], dtype=int)

    # 邻接矩阵分块计算，避免一次性 n×n 浮点（4000 点约 128MB）
    adj = np.zeros((n, n), dtype=bool)
    chunk = 512
    for i in range(0, n, chunk):
        adj[i:i + chunk] = _pairwise_m(xy[i:i + chunk], xy) <= eps_m
    np.fill_diagonal(adj, True)

    core = adj.sum(axis=1) >= max(1, min_samples)
    labels = np.full(n, -1, dtype=int)
    cid = 0

    for i in range(n):
        if not core[i] or labels[i] >= 0:
            continue
        # 只经过核心点扩散（DBSCAN 标准语义）
        comp = np.zeros(n, dtype=bool)
        comp[i] = True
        frontier = np.array([i])
        while frontier.size:
            mask = adj[frontier].any(axis=0) & core & ~comp
            if not mask.any():
                break
            comp |= mask
            frontier = np.where(mask)[0]
        labels[comp] = cid
        # 边界点：与簇内核心点相邻、但自身不是核心点
        border = adj[comp].any(axis=0) & ~core & (labels < 0)
        if border.any():
            labels[border] = cid
        cid += 1

    return labels


@dataclass
class PoiRegion:
    region_id: int
    poi_type: str
    weight: float
    point_count: int
    centroid: list[float]  # [lng, lat]
    polygon: dict | None  # GeoJSON Polygon
    points: np.ndarray  # 簇内点坐标，用于后续边界计算
    unit_count: int = 1            # 由几个原子单元聚合而成
    capacity: float | None = None  # 片区业务量上限（balanced 模式）
    load_ratio: float | None = None
    overload: bool = False
    radius_m: float = 0.0          # 平均服务半径（点到片区质心的平均距离）
    suggested_action: str | None = None


@dataclass
class PoiDivideResult:
    regions: list[PoiRegion]
    total_weight: float
    by_type: dict[str, int]
    geojson: dict
    metrics: dict = field(default_factory=dict)
    balanced: bool = False
    capacity: float | None = None
    unit_count: int = 0


def _mk_unit(pts, w):
    """构造一个原子单元（含对齐的权重数组，供后续拆分复用）。"""
    pts = np.asarray(pts, dtype=float)
    w = np.asarray(w, dtype=float)
    return {
        "centroid": [float(pts[:, 0].mean()), float(pts[:, 1].mean())],
        "weight": float(w.sum()),
        "points": pts,
        "w": w,
        "point_count": int(len(pts)),
    }


def _split_unit_points(pts, w, eps_m, capacity, levels_left):
    """递归把一个超容单元按更小 eps 拆成子单元，直到每片 ≤ 容量或层数用尽。

    地理语义上：一个太大的「小区」其实跨了多个自然街区，需要再细分，
    否则容量约束无法把它拆开、会直接爆仓拉爆 CV。
    """
    if len(pts) < 2 or levels_left <= 0:
        return [_mk_unit(pts, w)]
    if float(np.asarray(w).sum()) <= capacity * 1.0001:
        return [_mk_unit(pts, w)]
    sub = _dbscan(np.asarray(pts, dtype=float), eps_m=eps_m, min_samples=1)
    piece_labels = sorted(set(sub[sub >= 0]))
    if len(piece_labels) <= 1:
        # 连通性无法再分（点太近），用更小 eps 重试
        return _split_unit_points(pts, w, eps_m / 2.0, capacity, levels_left - 1)
    out = []
    for c in piece_labels:
        cmask = sub == c
        out.extend(_split_unit_points(pts[cmask], w[cmask], eps_m / 2.0, capacity, levels_left - 1))
    return out


def _units_of_type(sub_xy, sub_w, eps_m, min_samples=1, capacity=None, max_split_levels=4):
    """阶段一：同类 POI 内部 DBSCAN → 原子单元（一个小区 / 一个商圈 / 一所医院）。

    balanced 模式下，任何单单元权重超过容量时，会用更小 eps 递归拆分，
    确保没有「不可拆的超大单元」，从而让阶段二的真·均衡 achievable。
    """
    labels = _dbscan(sub_xy, eps_m=eps_m, min_samples=min_samples)
    raw = []
    for cid in sorted(set(labels[labels >= 0])):
        cmask = labels == cid
        raw.append(_mk_unit(sub_xy[cmask], sub_w[cmask]))
    if capacity is None:
        return raw
    out = []
    for u in raw:
        if u["weight"] <= capacity * 1.0001:
            out.append(u)
        else:
            out.extend(_split_unit_points(u["points"], u["w"], eps_m / 2.0, capacity, max_split_levels))
    return out


def _hull_geo(pts, eps_m):
    """片区边界：凸包；点数不足 3 时用圆形缓冲。"""
    if len(pts) >= 3:
        hull = MultiPoint(pts).convex_hull
    else:
        cx, cy = float(pts[:, 0].mean()), float(pts[:, 1].mean())
        r_m = max(eps_m / 2, 30.0)
        lat_rad = np.radians(cy)
        r_lat = r_m / 111000.0
        r_lng = r_m / (111000.0 * np.cos(lat_rad)) if np.cos(lat_rad) > 1e-6 else r_lat
        hull = Point(cx, cy).buffer(max(r_lng, r_lat), resolution=16)
    return mapping(hull) if hull is not None and not hull.is_empty else None


def _mean_radius_m(pts, centroid):
    """平均服务半径：片区事件点到片区质心的平均球面距离（米）。"""
    if len(pts) == 0:
        return 0.0
    c = np.asarray(centroid, dtype=float)
    ds = [_haversine_m(p, c) for p in pts]
    return float(np.mean(ds))


def _metrics_of(regions, capacity, unit_count):
    if not regions:
        return {"region_count": 0, "unit_count": unit_count, "capacity": None,
                "cv_weight": 0.0, "overload_count": 0, "mean_load_ratio": None,
                "max_load_ratio": None, "mean_radius_m": 0.0, "max_radius_m": 0.0}
    ws = np.array([r.weight for r in regions], dtype=float)
    mean_w = float(ws.mean())
    loads = np.array([r.load_ratio if r.load_ratio is not None else 0.0 for r in regions])
    radii = np.array([r.radius_m for r in regions])
    return {
        "region_count": len(regions),
        "unit_count": unit_count,
        "capacity": round(capacity, 2) if capacity else None,
        "cv_weight": round(float(ws.std() / mean_w), 4) if mean_w > 0 else 0.0,
        "overload_count": int(sum(1 for r in regions if r.overload)),
        "mean_load_ratio": round(float(loads.mean()), 4) if capacity else None,
        "max_load_ratio": round(float(loads.max()), 4) if capacity else None,
        "mean_radius_m": round(float(radii.mean()), 1),
        "max_radius_m": round(float(radii.max()), 1),
    }


def poi_divide(
    xy,
    poi_types,
    weights=None,
    eps_by_type=None,
    min_samples=1,
    balanced=True,
    target_k=48,
    lam=2.0,
    mu=0.1,
    seed=42,
):
    """POI 语义划分。

    参数：
        xy: np.ndarray (N, 2) [lng, lat]
        poi_types: list[str] 长度 N
        weights: np.ndarray (N,) 可选，默认全 1
        eps_by_type: dict[str, float] 各类 POI 的「单元识别半径」（米）
        min_samples: DBSCAN 最小样本数
        balanced: True → 两阶段（单元识别 + 容量约束聚合），片区业务量均衡；
                  False → 退化为一个 DBSCAN 簇即一个片区
        target_k: 目标片区总数（balanced 模式），capacity = 总权重 / target_k
        lam / mu / seed: 传给容量约束划分的均衡权重 / 紧凑度 / 随机种子

    返回：
        PoiDivideResult
    """
    xy = np.asarray(xy, dtype=float)
    poi_types = np.asarray(poi_types, dtype=object)
    if weights is None:
        weights = np.ones(len(xy), dtype=float)
    weights = np.asarray(weights, dtype=float)

    if eps_by_type is None:
        eps_by_type = {
            "residential": 350,
            "mall": 500,
            "medical": 500,
            "leisure": 500,
            "education": 500,
        }

    # ---------- 阶段一：原子单元识别（两遍） ----------
    # 第一遍：粗聚得到各类型单元，用于估算总权重 → 容量
    coarse_by_type = {}
    total_w = 0.0
    for ptype in POI_TYPES:
        mask = poi_types == ptype
        if not mask.any():
            continue
        units = _units_of_type(xy[mask], weights[mask], eps_by_type.get(ptype, 500), min_samples)
        if not units:
            continue
        coarse_by_type[ptype] = units
        total_w += sum(u["weight"] for u in units)

    # 容量 = 日均负载 / 目标片区数 × 1.2 峰值裕量 —— 与 /divide（容量约束划分）口径完全一致，
    # 保证两个模式的负载率、超载判定可以同台对比。
    capacity = (total_w / max(target_k, 1)) * 1.2 if balanced else None

    # 第二遍：balanced 模式下，把超容的粗单元用更小 eps 递归拆分，
    # 保证每个原子单元 ≤ 容量，阶段二才能真正均衡。
    units_by_type = {}
    for ptype, coarse in coarse_by_type.items():
        if capacity is None:
            units_by_type[ptype] = coarse
        else:
            eps = eps_by_type.get(ptype, 500)
            out = []
            for u in coarse:
                if u["weight"] <= capacity * 1.0001:
                    out.append(u)
                else:
                    out.extend(_split_unit_points(u["points"], u["w"], eps / 2.0, capacity, 4))
            units_by_type[ptype] = out

    # ---------- 阶段二：单元 → 片区 ----------
    regions = []
    features = []
    region_id = 0
    by_type = {}
    unit_total = 0

    for ptype, units in units_by_type.items():
        unit_total += len(units)
        eps = eps_by_type.get(ptype, 500)
        w_u = np.array([u["weight"] for u in units], dtype=float)

        if not balanced:
            # 纯语义聚类：一个原子单元即一个片区
            assign = np.arange(len(units), dtype=int)
            k_t = len(units)
        else:
            k_t = max(1, min(len(units), int(round(float(w_u.sum()) / capacity)) if capacity > 0 else 1))
            if k_t <= 1:
                assign = np.zeros(len(units), dtype=int)
            else:
                xy_u = np.array([u["centroid"] for u in units], dtype=float)
                res = capacity_divide(xy_u, w_u, k_t, lam=lam, mu=mu, seed=seed)
                assign = np.asarray(res.assignment)

        for r in range(k_t):
            idx = np.where(assign == r)[0]
            if idx.size == 0:
                continue
            pts = np.vstack([units[i]["points"] for i in idx])
            wsum = float(w_u[idx].sum())
            centroid = [float(pts[:, 0].mean()), float(pts[:, 1].mean())]
            ratio = (wsum / capacity) if capacity else None
            overload = bool(capacity is not None and wsum > capacity)
            if capacity is None:
                action = None
            elif overload:
                action = "建议拆分"
            elif ratio < 0.5:
                action = "可合并"
            else:
                action = "正常"
            region = PoiRegion(
                region_id=region_id,
                poi_type=ptype,
                weight=round(wsum, 2),
                point_count=int(sum(units[i]["point_count"] for i in idx)),
                centroid=centroid,
                polygon=_hull_geo(pts, eps),
                points=pts,
                unit_count=int(idx.size),
                capacity=round(capacity, 2) if capacity else None,
                load_ratio=round(ratio, 4) if ratio is not None else None,
                overload=overload,
                radius_m=round(_mean_radius_m(pts, centroid), 1),
                suggested_action=action,
            )
            regions.append(region)
            by_type[ptype] = by_type.get(ptype, 0) + 1
            features.append({
                "type": "Feature",
                "geometry": region.polygon,
                "properties": {
                    "region_id": region_id,
                    "poi_type": ptype,
                    "weight": region.weight,
                    "point_count": region.point_count,
                    "centroid": centroid,
                    "capacity": region.capacity,
                    "load_ratio": region.load_ratio,
                    "overload": overload,
                    "unit_count": region.unit_count,
                },
            })
            region_id += 1

    return PoiDivideResult(
        regions=regions,
        total_weight=float(weights.sum()),
        by_type=by_type,
        geojson={"type": "FeatureCollection", "features": features},
        metrics=_metrics_of(regions, capacity, unit_total),
        balanced=bool(balanced),
        capacity=round(capacity, 2) if capacity else None,
        unit_count=unit_total,
    )
