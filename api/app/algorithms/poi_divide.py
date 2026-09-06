"""POI 语义划分算法

按地理语义（小区、商场、医疗、休闲、教育）对事件点进行空间聚类：
- 同类型 POI 内部做 DBSCAN，eps 按真实地理距离（米）计算；
- 一个簇即一个「语义片区」；
- 片区边界用簇内点的凸包近似。

坐标系：GCJ-02（高德），计算距离时用 Haversine 球面距离，不纠偏。
"""

from dataclasses import dataclass

import numpy as np
from shapely.geometry import MultiPoint, Point, mapping


EARTH_RADIUS_M = 6371000.0


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


def _dbscan(xy, eps_m, min_samples=1):
    """简易 DBSCAN（基于真实地理距离）。

    返回 labels：-1 表示噪声，>=0 表示簇编号。
    """
    n = len(xy)
    if n == 0:
        return np.array([], dtype=int)

    # 构建邻接表：对每个点，找与其距离 <= eps_m 的点
    neighbors = [[] for _ in range(n)]
    # 4000 点全量两两计算约 8e6 次，可接受；更大规模时应改为 KD-Tree 或空间网格
    for i in range(n):
        for j in range(i + 1, n):
            d = _haversine_m(xy[i], xy[j])
            if d <= eps_m:
                neighbors[i].append(j)
                neighbors[j].append(i)
        # 自身也算邻居，保证 min_samples=1 时点自成簇
        neighbors[i].append(i)

    labels = np.full(n, -1, dtype=int)
    cluster_id = 0
    visited = set()

    for i in range(n):
        if i in visited:
            continue
        # 核心点判定
        if len(neighbors[i]) < min_samples:
            visited.add(i)
            continue
        # BFS 扩散簇
        queue = [i]
        visited.add(i)
        labels[i] = cluster_id
        while queue:
            cur = queue.pop()
            for nb in neighbors[cur]:
                if nb not in visited:
                    visited.add(nb)
                    labels[nb] = cluster_id
                    if len(neighbors[nb]) >= min_samples:
                        queue.append(nb)
        cluster_id += 1

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


@dataclass
class PoiDivideResult:
    regions: list[PoiRegion]
    total_weight: float
    by_type: dict[str, int]
    geojson: dict


def poi_divide(
    xy,
    poi_types,
    weights=None,
    eps_by_type=None,
    min_samples=1,
):
    """按 POI 语义划分区域。

    参数：
        xy: np.ndarray (N, 2) [lng, lat]
        poi_types: list[str] 长度 N，每个点的 POI 类型
        weights: np.ndarray (N,) 可选，默认全 1
        eps_by_type: dict[str, float] 各类 POI 的聚类半径（米）
        min_samples: int DBSCAN 最小样本数

    返回：
        PoiDivideResult
    """
    xy = np.asarray(xy, dtype=float)
    poi_types = np.asarray(poi_types, dtype=object)
    if weights is None:
        weights = np.ones(len(xy), dtype=float)
    weights = np.asarray(weights, dtype=float)

    if eps_by_type is None:
        # 默认半径：小区密集 350m，商业/医疗/休闲/教育稍大
        eps_by_type = {
            "residential": 350,
            "mall": 500,
            "medical": 500,
            "leisure": 500,
            "education": 500,
        }

    regions = []
    features = []
    region_id = 0
    by_type = {}

    for ptype in ["residential", "mall", "medical", "leisure", "education"]:
        mask = poi_types == ptype
        if not mask.any():
            continue
        sub_xy = xy[mask]
        sub_w = weights[mask]
        eps = eps_by_type.get(ptype, 500)
        labels = _dbscan(sub_xy, eps_m=eps, min_samples=min_samples)

        # 收集每个簇
        unique_labels = sorted(set(labels[labels >= 0]))
        for cid in unique_labels:
            cmask = labels == cid
            pts = sub_xy[cmask]
            wsum = float(sub_w[cmask].sum())
            centroid = [float(pts[:, 0].mean()), float(pts[:, 1].mean())]
            # 边界：凸包；点数不足 3 时用圆形缓冲
            if len(pts) >= 3:
                hull = MultiPoint(pts).convex_hull
            else:
                # 2 个点：以质心为圆心、eps/2 为半径的圆（16 边形）
                cx, cy = centroid
                r_m = eps / 2
                # 近似：1 度 lat ≈ 111 km；1 度 lng ≈ 111 km * cos(lat)
                lat_rad = np.radians(cy)
                r_lat = r_m / 111000.0
                r_lng = r_m / (111000.0 * np.cos(lat_rad)) if np.cos(lat_rad) > 1e-6 else r_m / 111000.0
                circle = Point(cx, cy).buffer(max(r_lng, r_lat), resolution=16)
                hull = circle
            geo = mapping(hull) if hull is not None and not hull.is_empty else None

            region = PoiRegion(
                region_id=region_id,
                poi_type=ptype,
                weight=round(wsum, 2),
                point_count=int(cmask.sum()),
                centroid=centroid,
                polygon=geo,
                points=pts,
            )
            regions.append(region)
            by_type[ptype] = by_type.get(ptype, 0) + 1
            features.append({
                "type": "Feature",
                "geometry": geo,
                "properties": {
                    "region_id": region_id,
                    "poi_type": ptype,
                    "weight": region.weight,
                    "point_count": region.point_count,
                    "centroid": centroid,
                },
            })
            region_id += 1

    return PoiDivideResult(
        regions=regions,
        total_weight=float(weights.sum()),
        by_type=by_type,
        geojson={"type": "FeatureCollection", "features": features},
    )
