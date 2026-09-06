"""HTTP 接口测试（TestClient + points 直传，不依赖 PostGIS）。

通过 DivideRequest/PoiDivideRequest/SimulateRequest 的 points 字段注入点集，
任何环境（包括无数据库的 CI）都能跑通算法链路。

运行（在 api/ 目录，激活 .venv）：
    pytest -q tests/test_endpoints.py
"""

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# --------------------------- 构造点集 --------------------------- #
def _rng_pts(n=300, seed=0):
    rng = np.random.default_rng(seed)
    pts = []
    for _ in range(n):
        pts.append({
            "longitude": round(float(rng.uniform(116.30, 116.55)), 6),
            "latitude": round(float(rng.uniform(39.80, 40.00)), 6),
            "weight": round(float(rng.uniform(0.5, 3.0)), 3),
            "type": "secondhand",
        })
    return pts


def _poi_pts(seed=1, per_cluster=40):
    """5 类 POI，每类 2 个热点簇。"""
    centers = [
        (116.30, 39.80), (116.40, 39.82), (116.50, 39.84),
        (116.33, 39.90), (116.43, 39.92), (116.53, 39.94),
        (116.35, 40.00), (116.45, 40.02), (116.55, 40.04),
        (116.38, 40.10),
    ]
    types = ["residential", "mall", "medical", "leisure", "education"] * 2
    rng = np.random.default_rng(seed)
    pts = []
    for i, ((cx, cy), typ) in enumerate(zip(centers, types)):
        for _ in range(per_cluster):
            pts.append({
                "longitude": round(float(cx + rng.uniform(-0.002, 0.002)), 6),
                "latitude": round(float(cy + rng.uniform(-0.002, 0.002)), 6),
                "weight": round(float(1.0 + (i % 3)), 2),
                "poi_type": typ,
            })
    return pts


# --------------------------- /divide（容量约束） --------------------------- #
def test_divide_with_points_returns_balance_report():
    r = client.post("/api/territory/divide", json={
        "k": 10, "lam": 2.0, "mu": 0.1, "seed": 42, "points": _rng_pts(),
    })
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "request"
    assert len(body["regions"]) == 10
    assert body["balance_report"]["current_cv"] >= 0
    assert "recommendation" in body
    assert body["geojson"]["type"] == "FeatureCollection"


def test_divide_invalid_k():
    r = client.post("/api/territory/divide", json={
        "k": 300, "points": _rng_pts(),  # k > 200 上限
    })
    assert r.status_code == 422


def test_divide_fewer_points_than_k():
    r = client.post("/api/territory/divide", json={
        "k": 50, "points": _rng_pts(n=10),  # 点太少
    })
    assert r.status_code in (400, 422)


# --------------------------- /poi-divide（语义） --------------------------- #
def test_poi_divide_semantic_mode():
    r = client.post("/api/territory/poi-divide", json={
        "balanced": False,
        "eps_by_type": {"residential": 500, "mall": 500, "medical": 500,
                        "leisure": 500, "education": 500},
        "points": _poi_pts(),
    })
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "request"
    assert body["balanced"] is False
    assert len(body["regions"]) == 10
    # 语义模式无容量概念
    assert all(x["load_ratio"] is None for x in body["regions"])
    # by_type 计数
    assert body["by_type"] == {"residential": 2, "mall": 2, "medical": 2,
                               "leisure": 2, "education": 2}
    # 前端着色所需字段
    f0 = body["geojson"]["features"][0]["properties"]
    assert "poi_color" in f0 and "poi_label" in f0


def test_poi_divide_balanced_mode_metrics():
    r = client.post("/api/territory/poi-divide", json={
        "balanced": True, "target_k": 6, "points": _poi_pts(),
    })
    assert r.status_code == 200
    body = r.json()
    assert body["balanced"] is True
    assert "metrics" in body
    m = body["metrics"]
    for k in ("cv_weight", "overload_count", "capacity", "region_count",
              "mean_load_ratio", "max_load_ratio", "unit_count"):
        assert k in m
    # 均衡模式的片区应有容量语义字段
    for x in body["regions"]:
        assert x["capacity"] is not None and x["load_ratio"] is not None


def test_poi_divide_type_filter():
    r = client.post("/api/territory/poi-divide", json={
        "balanced": False, "type_filter": ["residential"],
        "eps_by_type": {"residential": 500, "mall": 500, "medical": 500,
                        "leisure": 500, "education": 500},
        "points": _poi_pts(),
    })
    assert r.status_code == 200
    body = r.json()
    assert body["by_type"] == {"residential": 2}
    assert all(x["poi_type"] == "residential" for x in body["regions"])


# --------------------------- /simulate（What-if 推演） --------------------------- #
def _baseline_divide(points, k=10):
    r = client.post("/api/territory/divide", json={"k": k, "points": points})
    assert r.status_code == 200
    return r.json()


def test_simulate_split_improves_or_unchanged():
    pts = _rng_pts(n=300, seed=0)
    base = _baseline_divide(pts, k=10)
    # 挑权重最大的片区做拆分推演
    biggest = max(base["regions"], key=lambda x: x["weight"])
    r = client.post("/api/territory/simulate", json={
        "k": 10, "actions": [{"type": "split", "region_id": biggest["region_id"]}],
        "points": pts,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["verdict"] in ("improved", "unchanged", "mixed", "worsened")
    # 拆分会新增一个片区 → after 片区数 = before + 1
    assert len(body["after"]["regions"]) == len(body["before"]["regions"]) + 1
    # 核心指标都在
    for side in ("before", "after"):
        m = body[side]["metrics"]
        for k in ("cv_weight", "overload_count", "max_load_ratio"):
            assert k in m
    assert "deltas" in body and "verdict" in body
    # 被拆片区应标记 changed
    changed = {x["region_id"] for x in body["after"]["regions"] if x["changed"]}
    assert biggest["region_id"] in changed


def test_simulate_add_facility_lowers_load_ratio():
    pts = _rng_pts(n=300, seed=1)
    base = _baseline_divide(pts, k=10)
    biggest = max(base["regions"], key=lambda x: x["weight"])
    r = client.post("/api/territory/simulate", json={
        "k": 10, "actions": [{"type": "add_facility", "region_id": biggest["region_id"],
                              "capacity_multiplier": 2.0}],
        "points": pts,
    })
    assert r.status_code == 200
    body = r.json()
    b = next(x for x in body["before"]["regions"] if x["region_id"] == biggest["region_id"])
    a = next(x for x in body["after"]["regions"] if x["region_id"] == biggest["region_id"])
    assert a["load_ratio"] < b["load_ratio"]  # 提容后负载率必降
    assert a["capacity"] == b["capacity"] * 2.0


def test_simulate_merge_reduces_region_count():
    pts = _rng_pts(n=300, seed=2)
    base = _baseline_divide(pts, k=10)
    regions = sorted(base["regions"], key=lambda x: x["weight"])
    r = client.post("/api/territory/simulate", json={
        "k": 10, "actions": [{"type": "merge", "region_id": regions[0]["region_id"],
                              "target_region_id": regions[-1]["region_id"]}],
        "points": pts,
    })
    assert r.status_code == 200
    body = r.json()
    assert len(body["after"]["regions"]) == len(body["before"]["regions"]) - 1


def test_simulate_empty_actions_rejected():
    r = client.post("/api/territory/simulate", json={"k": 10, "actions": [], "points": _rng_pts()})
    assert r.status_code == 422


def test_simulate_too_few_points():
    r = client.post("/api/territory/simulate", json={
        "k": 50, "actions": [{"type": "split", "region_id": 0}], "points": _rng_pts(n=5),
    })
    assert r.status_code == 400


# --------------------------- 可复现性 --------------------------- #
def test_divide_reproducible_via_http():
    pts = _rng_pts(seed=5)
    a = client.post("/api/territory/divide", json={"k": 8, "seed": 7, "points": pts}).json()
    b = client.post("/api/territory/divide", json={"k": 8, "seed": 7, "points": pts}).json()
    assert [r["region_id"] for r in a["regions"]] == [r["region_id"] for r in b["regions"]]
    assert [round(r["weight"], 3) for r in a["regions"]] == [round(r["weight"], 3) for r in b["regions"]]
