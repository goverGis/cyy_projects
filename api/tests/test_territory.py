"""区域划分核心算法的单元测试 + 可跳过的生产库集成测试。

运行（在 api/ 目录，激活 .venv）：
    pytest -q
"""

import math

import numpy as np
import pytest
from shapely.geometry import Polygon

from app.algorithms import (
    divide,
    random_divide,
    grid_divide,
    kmeans_divide,
)
from app.algorithms.territory import (
    haversine_m,
    evaluate,
    _voronoi_polys,
    TerritoryResult,
)


# --------------------------- 构造测试数据 --------------------------- #
def _make_points(n=300, seed=0):
    rng = np.random.default_rng(seed)
    # 北京中心城区附近随机点（经纬度），权重 0.5~3
    xy = np.column_stack([
        rng.uniform(116.30, 116.55, n),
        rng.uniform(39.80, 40.00, n),
    ])
    w = rng.uniform(0.5, 3.0, n)
    return xy, w


# --------------------------- 基础几何 --------------------------- #
def test_haversine_zero_and_scale():
    assert haversine_m(np.array([116.40, 39.90]), np.array([116.40, 39.90])) == 0.0
    # 1 纬度差 ≈ 111320 米
    d = haversine_m(np.array([0.0, 0.0]), np.array([0.0, 1.0]))
    assert 110_000 < d < 113_000


# --------------------------- 主算法 --------------------------- #
def test_divide_returns_k_regions():
    xy, w = _make_points()
    res = divide(xy, w, k=10, lam=2.0, mu=0.1, seed=42)
    assert isinstance(res, TerritoryResult)
    assert res.k == 10
    assert res.centroids.shape == (10, 2)
    # 每个点都被分配到一个合法片区
    assert len(res.assignment) == len(w)
    assert set(np.unique(res.assignment)).issubset(set(range(10)))
    # 非空片区数 = k（容量约束不应产生空片区）
    loads = np.array([w[res.assignment == r].sum() for r in range(10)])
    assert (loads > 0).sum() == 10


def test_divide_assignment_coverage():
    xy, w = _make_points(n=500)
    res = divide(xy, w, k=8, lam=2.0, seed=7)
    # 所有点都被分配（无 -1）
    assert (res.assignment >= 0).all()
    # 分配覆盖全部点
    assert len(res.assignment) == len(w)


def test_divide_capacity_balanced():
    """均衡权重 λ 较大时，超容片区数应为 0。"""
    xy, w = _make_points()
    res = divide(xy, w, k=12, lam=3.0, mu=0.1, seed=42)
    assert res.metrics["capacity_violations"] == 0
    # 高 λ 应得到很均衡的划分（CV 低），且仍在合理范围
    assert 0.0 <= res.metrics["cv_weight"] <= 0.6


def test_divide_reproducible():
    """相同种子应得到完全相同的划分。"""
    xy, w = _make_points()
    a = divide(xy, w, k=10, lam=2.0, seed=42)
    b = divide(xy, w, k=10, lam=2.0, seed=42)
    assert np.array_equal(a.assignment, b.assignment)


# --------------------------- 基线方法 --------------------------- #
@pytest.mark.parametrize("fn", [random_divide, grid_divide, kmeans_divide])
def test_baselines_return_results(fn):
    xy, w = _make_points()
    res = fn(xy, w, k=10)
    assert isinstance(res, TerritoryResult)
    assert res.k == 10
    assert len(res.metrics) > 0
    # 基线也应产出 k 个 Voronoi 多边形（部分为 None 也允许，但多数应有效）
    valid = [p for p in res.polygons if isinstance(p, Polygon) and not p.is_empty]
    assert len(valid) >= 1


# --------------------------- Voronoi 几何 --------------------------- #
def test_voronoi_polys_match_centroids():
    rng = np.random.default_rng(1)
    cents = rng.uniform([116.3, 39.8], [116.55, 40.0], (10, 2))
    xy = rng.uniform([116.3, 39.8], [116.55, 40.0], (200, 2))
    polys = _voronoi_polys(cents, xy, mean_lat=39.9)
    assert len(polys) == 10
    valid = [p for p in polys if isinstance(p, Polygon) and not p.is_empty]
    # 散布的中心点应能生成全部有效多边形
    assert len(valid) == 10


# --------------------------- 评估指标 --------------------------- #
def test_evaluate_keys():
    xy, w = _make_points()
    res = divide(xy, w, k=10, lam=2.0, seed=42)
    keys = set(res.metrics.keys())
    for k in ("cv_weight", "mean_radius_m", "max_radius_m",
             "mean_compactness", "capacity_violations", "total_weight"):
        assert k in keys


# --------------------------- 生产库集成（可跳过） --------------------------- #
def _db_available():
    try:
        from sqlalchemy import text
        from app.core.database import SessionLocal
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


@pytest.mark.skipif(not _db_available(), reason="未检测到可用的 PostGIS（设好 DATABASE_URL 后运行）")
def test_pg_voronoi_integration():
    """边界由 PostGIS ST_VoronoiPolygons 生成，应与中心点一一匹配。"""
    from app.routers.territory import _pg_voronoi_polygons
    cents = [
        (116.40, 39.90), (116.45, 39.92), (116.38, 39.88),
        (116.50, 39.95), (116.42, 39.85),
    ]
    env = (116.30, 39.80, 116.60, 40.05)
    polys, clipped = _pg_voronoi_polygons(cents, env)
    assert clipped is False
    assert len(polys) == len(cents)
    matched = [p for p in polys if p is not None and p.is_valid]
    assert len(matched) == len(cents)


@pytest.mark.skipif(not _db_available(), reason="未检测到可用的 PostGIS")
def test_divide_endpoint_pg_voronoi():
    """通过 HTTP 接口验证 use_pg_voronoi 走生产边界。"""
    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app)
    r = client.post("/api/territory/divide", json={
        "k": 12, "lam": 2.0, "mu": 0.1, "seed": 42,
        "source": "database", "use_pg_voronoi": True,
    })
    assert r.status_code == 200
    body = r.json()
    assert "pg_voronoi" in body["source"]
    assert len(body["geojson"]["features"]) == 12


@pytest.mark.skipif(not _db_available(), reason="未检测到可用的 PostGIS")
def test_pg_voronoi_clip_to_district():
    """裁剪到北京行政区：结果多边形应被 beijing_districts 并集完整包含。"""
    import json as _json

    from sqlalchemy import text

    from app.routers.territory import _pg_voronoi_polygons
    cents = [
        (116.40, 39.90), (116.45, 39.92), (116.38, 39.88),
        (116.50, 39.95), (116.42, 39.85),
    ]
    env = (116.30, 39.80, 116.60, 40.05)
    polys, clipped = _pg_voronoi_polygons(cents, env, clip_to_bj=True)
    assert clipped is True
    assert all(p is not None and p.is_valid for p in polys)

    from app.core.database import SessionLocal
    with SessionLocal() as db:
        for p in polys:
            ok = db.execute(
                text(
                    "SELECT ST_Within("
                    "ST_GeomFromGeoJSON(:g)::geometry, "
                    "(SELECT ST_Union(geom) FROM beijing_districts))"
                ),
                {"g": _json.dumps({"type": "Polygon", "coordinates": [list(p.exterior.coords)]})},
            ).scalar()
            assert ok, "裁剪后的片区未被北京行政区并集包含"


@pytest.mark.skipif(not _db_available(), reason="未检测到可用的 PostGIS")
def test_divide_endpoint_clip_source_suffix():
    """HTTP 接口带 clip_to_district 时，source 应包含 +bj。"""
    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app)
    r = client.post("/api/territory/divide", json={
        "k": 8, "lam": 2.0, "mu": 0.1, "seed": 42,
        "source": "database", "use_pg_voronoi": True, "clip_to_district": True,
    })
    assert r.status_code == 200
    assert r.json()["source"].endswith("+bj")
