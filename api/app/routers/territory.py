"""区域智能划分路由：暴露容量约束划分算法与对比实验接口。"""

import json
from pathlib import Path

import numpy as np
from fastapi import APIRouter, HTTPException
from shapely.geometry import mapping

from app.algorithms import divide, random_divide, grid_divide, kmeans_divide
from app.schemas.territory import (
    BenchmarkResponse,
    BenchmarkRow,
    DivideRequest,
    DivideResponse,
    RegionOut,
)

router = APIRouter(prefix="/api/territory", tags=["territory"])

ROOT = Path(__file__).resolve().parents[3]
DATA_FILE = ROOT / "data" / "events.json"


def _load_points(req: DivideRequest):
    """点集来源优先级：请求体 > 数据库 > 本地造数文件（无 DB 时的降级）。"""
    if req.points:
        return (
            np.array([[p["longitude"], p["latitude"]] for p in req.points]),
            np.array([float(p.get("weight", 1.0)) for p in req.points]),
            "request",
        )
    # 数据库优先（此处为清晰起见直接读本地文件，DB 接入后在 repositories 层替换）
    if DATA_FILE.exists():
        doc = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        pts = doc["events"]
        if req.type_filter:
            pts = [p for p in pts if p["type"] in req.type_filter]
        return (
            np.array([[p["longitude"], p["latitude"]] for p in pts]),
            np.array([float(p.get("weight", 1.0)) for p in pts]),
            "file",
        )
    raise HTTPException(status_code=404, detail="无可用点集：请先运行造数器或导入事件")


@router.post("/divide", response_model=DivideResponse)
def divide_endpoint(req: DivideRequest):
    xy, w, source = _load_points(req)
    if len(xy) < req.k:
        raise HTTPException(status_code=400, detail=f"点集数量 {len(xy)} 小于片区数 {req.k}")

    res = divide(xy, w, req.k, lam=req.lam, mu=req.mu, seed=req.seed)

    regions = []
    features = []
    for r in range(req.k):
        m = res.assignment == r
        if not m.any():
            continue
        weight = float(w[m].sum())
        centroid = [float(res.centroids[r][0]), float(res.centroids[r][1])]
        poly = res.polygons[r]
        geo = mapping(poly) if poly is not None and not poly.is_empty else None
        regions.append(
            RegionOut(
                region_id=r,
                weight=round(weight, 2),
                point_count=int(m.sum()),
                centroid=centroid,
                polygon=geo,
            )
        )
        if geo is not None:
            features.append(
                {
                    "type": "Feature",
                    "geometry": geo,
                    "properties": {
                        "region_id": r,
                        "weight": round(weight, 2),
                        "point_count": int(m.sum()),
                        "centroid": centroid,
                    },
                }
            )

    return DivideResponse(
        k=req.k,
        lam=req.lam,
        metrics=res.metrics,
        regions=regions,
        geojson={"type": "FeatureCollection", "features": features},
        source=source,
    )


@router.get("/benchmark", response_model=BenchmarkResponse)
def benchmark_endpoint(k: int = 10):
    if not DATA_FILE.exists():
        raise HTTPException(status_code=404, detail="请先运行造数器生成 data/events.json")
    doc = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    pts = doc["events"]
    xy = np.array([[p["longitude"], p["latitude"]] for p in pts])
    w = np.array([float(p.get("weight", 1.0)) for p in pts])

    methods = {
        "capacity-constrained": divide(xy, w, k, lam=2.0, mu=0.1, seed=42),
        "random": random_divide(xy, w, k, seed=42),
        "grid": grid_divide(xy, w, k),
        "kmeans": kmeans_divide(xy, w, k, seed=42),
    }
    rows = [
        BenchmarkRow(method=name, **{kk: v for kk, v in m.metrics.items() if kk in BenchmarkRow.model_fields})
        for name, m in methods.items()
    ]
    return BenchmarkResponse(k=k, rows=rows)
