"""区域智能划分路由：暴露容量约束划分算法与对比实验接口。"""

import json
from pathlib import Path

import numpy as np
from fastapi import APIRouter, HTTPException
from shapely.geometry import mapping, shape as shapely_shape, Point
from sqlalchemy import func, select, text

from app.algorithms import divide, random_divide, grid_divide, kmeans_divide
from app.core.database import SessionLocal
from app.models.event import Event
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


def _pg_voronoi_polygons(centroids, envelope):
    """用 PostGIS ST_VoronoiPolygons 生成 K 个片区的 Voronoi 边界（生产级几何）。

    算法照常算出 K 个片区中心（centroids，lng/lat），这里把边界生成下推到数据库：
    ST_Collect 中心点 → ST_VoronoiPolygons（裁剪到数据外接框）→ ST_Dump 拆成 K 个 cell。
    按「cell 包含其种子中心」把 K 个 cell 与 K 个片区序号一一匹配后返回。
    """
    pts = ", ".join(
        f"ST_SetSRID(ST_MakePoint({float(lng):.8f}, {float(lat):.8f}), 4326)"
        for lng, lat in centroids
    )
    minlng, minlat, maxlng, maxlat = envelope
    sql = text(
        f"""
        SELECT ST_AsGeoJSON(
            (ST_Dump(ST_VoronoiPolygons(
                ST_Collect(ARRAY[{pts}]),
                0.0,
                ST_MakeEnvelope(:minlng, :minlat, :maxlng, :maxlat, 4326)
            ))).geom
        ) AS geo
        """
    )
    with SessionLocal() as db:
        rows = db.execute(
            sql, {"minlng": minlng, "minlat": minlat, "maxlng": maxlng, "maxlat": maxlat}
        ).all()
    geoms = [shapely_shape(json.loads(r[0])) for r in rows]
    matched = [None] * len(centroids)
    for geo in geoms:
        for r, (lng, lat) in enumerate(centroids):
            if matched[r] is None and geo.covers(Point(lng, lat)):
                matched[r] = geo
                break
    return matched


def _load_points_from_db(type_filter):
    """从 PostGIS 读取事件点（生产数据源）。连不上或表缺失则抛异常，由调用方决定回退。"""
    with SessionLocal() as db:
        stmt = select(Event.longitude, Event.latitude, Event.weight)
        if type_filter:
            stmt = stmt.where(Event.type.in_(type_filter))
        rows = db.execute(stmt).all()
    if not rows:
        raise ValueError("event 表为空，请先运行 seed 灌库")
    xy = np.array([[r[0], r[1]] for r in rows], dtype=float)
    w = np.array([float(r[2]) for r in rows], dtype=float)
    return xy, w, "database"


def _load_points(req: DivideRequest):
    """点集来源优先级：请求体 > 数据库(auto/database) > 本地造数文件（降级）。"""
    if req.points:
        return (
            np.array([[p["longitude"], p["latitude"]] for p in req.points]),
            np.array([float(p.get("weight", 1.0)) for p in req.points]),
            "request",
        )

    mode = (req.source or "auto").lower()
    if mode in ("auto", "database"):
        try:
            return _load_points_from_db(req.type_filter)
        except Exception as e:
            if mode == "database":
                raise HTTPException(status_code=502, detail=f"数据库读取失败：{e}")
            # auto：数据库不可用 → 回退本地文件，保证演示链路不中断
            print(f"[warn] 数据库读取失败，回退本地文件：{e}")

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

    # 生产级边界：用 PostGIS ST_VoronoiPolygons 生成，覆盖本地 shapely 结果
    if req.use_pg_voronoi:
        try:
            pad = (xy[:, 0].max() - xy[:, 0].min()) * 0.02 + 1e-4
            env = (
                float(xy[:, 0].min()) - pad, float(xy[:, 1].min()) - pad,
                float(xy[:, 0].max()) + pad, float(xy[:, 1].max()) + pad,
            )
            pg_polys = _pg_voronoi_polygons(res.centroids, env)
            replaced = 0
            for r in range(req.k):
                if pg_polys[r] is not None:
                    res.polygons[r] = pg_polys[r]
                    replaced += 1
            source = f"{source}+pg_voronoi"
            print(f"[info] 边界由 PostGIS ST_VoronoiPolygons 生成（{replaced}/{req.k} 个片区）")
        except Exception as e:
            print(f"[warn] PostGIS Voronoi 失败，回退本地 shapely：{e}")

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
