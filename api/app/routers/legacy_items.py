"""文件型事件兼容路由（无 PostGIS 时的降级数据源）。

前端现有页面（MapView / SecondhandPage / ...）调用的是旧 Express 的
`/api/items`、`/api/stats` 契约。本路由直接从造数器生成的 `data/events.json`
提供只读数据，使整套前端在「未接入 PostGIS」时也能完整演示。
写入类接口（POST/PUT/DELETE）走内存态，重启即重置——生产环境应切到
`events` 路由（PostGIS 持久化）。

挂载点已在 main.py 以 prefix="/api" 注册，故路径为 /api/items、/api/stats。
"""

import json
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(tags=["legacy-items"])

ROOT = Path(__file__).resolve().parents[3]
DATA_FILE = ROOT / "data" / "events.json"

# 内存态（写入演示用，重启重置）
_MEM = []


def _load_file():
    if not DATA_FILE.exists():
        return []
    doc = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return doc.get("events", [])


def _all_items():
    base = _load_file()
    # 合并内存态新增项（按 id 去重）
    seen = {e["id"] for e in _MEM}
    merged = [e for e in base if e["id"] not in seen] + _MEM
    return merged


def _normalize(e: dict) -> dict:
    return {
        "id": e.get("id"),
        "type": e.get("type"),
        "title": e.get("title"),
        "description": e.get("description"),
        "category": e.get("category"),
        "price": e.get("price"),
        "contact": e.get("contact"),
        "latitude": e.get("latitude"),
        "longitude": e.get("longitude"),
        "status": e.get("status", "active"),
        "created_at": e.get("created_at", "2026-01-01T00:00:00"),
    }


@router.get("/items")
def list_items(
    type: str | None = Query(default=None),
    category: str | None = Query(default=None),
    status: str | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
    minlng: float | None = Query(default=None),
    minlat: float | None = Query(default=None),
    maxlng: float | None = Query(default=None),
    maxlat: float | None = Query(default=None),
):
    """列出事件（支持按类型/类目/状态过滤 + 分页 + 视窗 bbox 过滤）。

    海量数据优化之「分页查询」：前端列表 / 地图明细视图按 offset/limit
    分批拉取，避免一次性返回上万条造成前端卡顿与带宽浪费。
    bbox 参数用于地图明细视图只取当前视窗内的点。
    """
    items = [_normalize(e) for e in _all_items()]
    if type:
        items = [i for i in items if i["type"] == type]
    if category:
        items = [i for i in items if i["category"] == category]
    if status:
        items = [i for i in items if i["status"] == status]
    if None not in (minlng, minlat, maxlng, maxlat):
        items = [
            i for i in items
            if minlng <= i["longitude"] <= maxlng and minlat <= i["latitude"] <= maxlat
        ]
    total = len(items)
    page = items[offset : offset + limit]
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "count": len(page),
        "items": page,
    }


@router.get("/items/aggregate")
def aggregate_items(
    minlng: float = Query(...),
    minlat: float = Query(...),
    maxlng: float = Query(...),
    maxlat: float = Query(...),
    grid: int = Query(default=48, ge=8, le=128),
):
    """点抽稀（WebGIS 海量数据优化之「数据点抽稀」）。

    给定视窗 bbox，把落入其中的事件按 grid×grid 等经纬网格分桶，
    每桶返回加权质心 + 数量 + 总权重 + 类型分布。前端在低 zoom / 海量点
    时渲染这些聚合桶（而非逐个打点），把数千 DOM 标记压到几十个，
    彻底消除卡顿；高 zoom 时再走 /api/items 明细分页。

    返回结构：
      buckets: [{ cx, cy, count, weight, types:{secondhand:n,...} }, ...]
    """
    import math

    # 仅取落在 bbox 内的点（粗筛）
    pts = [
        e
        for e in _all_items()
        if minlng <= e.get("longitude", 0) <= maxlng
        and minlat <= e.get("latitude", 0) <= maxlat
    ]
    if not pts:
        return {"grid": grid, "in_view": 0, "buckets": []}

    dlon = (maxlng - minlng) or 1e-6
    dlat = (maxlat - minlat) or 1e-6

    buckets: dict[tuple[int, int], dict] = {}
    for e in pts:
        gx = min(grid - 1, int((e["longitude"] - minlng) / dlon * grid))
        gy = min(grid - 1, int((e["latitude"] - minlat) / dlat * grid))
        key = (gx, gy)
        b = buckets.get(key)
        if b is None:
            b = {"sx": 0.0, "sy": 0.0, "count": 0, "weight": 0.0,
                 "types": {"secondhand": 0, "lostfound": 0, "emergency": 0, "discussion": 0}}
            buckets[key] = b
        b["sx"] += e["longitude"]
        b["sy"] += e["latitude"]
        b["count"] += 1
        b["weight"] += float(e.get("weight", 1))
        t = e.get("type", "secondhand")
        if t in b["types"]:
            b["types"][t] += 1

    result = []
    for (gx, gy), b in buckets.items():
        n = b["count"]
        result.append({
            "cx": round(b["sx"] / n, 6),
            "cy": round(b["sy"] / n, 6),
            "count": n,
            "weight": round(b["weight"], 2),
            "types": b["types"],
        })
    result.sort(key=lambda x: -x["count"])
    return {"grid": grid, "in_view": len(pts), "buckets": result}


@router.get("/items/{item_id}")
def get_item(item_id: str):
    for e in _all_items():
        if str(e.get("id")) == str(item_id):
            return _normalize(e)
    raise HTTPException(status_code=404, detail="Item not found")


class ItemIn(BaseModel):
    type: str
    title: str
    description: str | None = None
    category: str | None = None
    price: float | None = None
    contact: str | None = None
    latitude: float
    longitude: float


@router.post("/items", status_code=201)
def create_item(payload: ItemIn):
    item = {**payload.model_dump(), "id": f"mem-{uuid4().hex[:8]}", "status": "active"}
    _MEM.append(item)
    return _normalize(item)


@router.put("/items/{item_id}")
def update_item(item_id: str, payload: ItemIn):
    for e in _MEM:
        if str(e.get("id")) == str(item_id):
            e.update(payload.model_dump())
            return _normalize(e)
    raise HTTPException(status_code=404, detail="Item not found")


@router.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: str):
    for i, e in enumerate(_MEM):
        if str(e.get("id")) == str(item_id):
            _MEM.pop(i)
            return
    raise HTTPException(status_code=404, detail="Item not found")


# 统计接口已迁移到生产路由 stats.py（PostGIS 驱动），由 main.py 以 /api 前缀挂载为 /api/stats。


@router.post("/cluster")
def cluster_legacy():
    """旧 DBSCAN 聚类入口的兼容占位：已升级为容量约束划分，请使用 /api/territory/divide。"""
    return {"clusters": [], "noise": [], "note": "已升级为容量约束区域划分，调用 /api/territory/divide"}


# ---------------------------------------------------------------------------
# 开发者平台（插件市集）
# 原项目 DeveloperPage 调用 /api/plugins，挂起 PostGIS 时该路由被摘掉导致 404。
# 这里用内存态恢复，使「开发者平台」真正可增删（演示用，重启重置）。
# 后续可演化为「算法参数市场」：保存/对比不同 (K, λ) 划分方案。
# ---------------------------------------------------------------------------
_PLUGINS = [
    {
        "id": "seed-1", "name": "坐标转换工具",
        "description": "支持 WGS84、GCJ02、BD09 坐标系互转",
        "category": "位置服务", "author": "开发者A", "downloads": 156, "rating": 4.8,
        "code": "function coordTransform(lat, lon, from, to) {\n  // 坐标转换逻辑\n  return { lat, lon };\n}",
    },
    {
        "id": "seed-2", "name": "热力图生成器",
        "description": "基于位置数据生成热力图可视化",
        "category": "可视化", "author": "开发者B", "downloads": 89, "rating": 4.5,
        "code": "function generateHeatmap(points) {\n  // 热力图生成逻辑\n  return heatmapData;\n}",
    },
    {
        "id": "seed-3", "name": "路径规划插件",
        "description": "基于 OpenStreetMap 的路径规划功能",
        "category": "地图工具", "author": "开发者C", "downloads": 234, "rating": 4.9,
        "code": "function planRoute(start, end) {\n  // 路径规划逻辑\n  return route;\n}",
    },
]


class PluginIn(BaseModel):
    name: str
    description: str
    category: str | None = None
    code: str
    author: str | None = None
    github: str | None = None


@router.get("/plugins")
def list_plugins():
    return _PLUGINS


@router.post("/plugins", status_code=201)
def create_plugin(payload: PluginIn):
    plugin = {**payload.model_dump(), "id": f"plg-{uuid4().hex[:8]}",
              "downloads": 0, "rating": 0.0}
    _PLUGINS.append(plugin)
    return plugin
