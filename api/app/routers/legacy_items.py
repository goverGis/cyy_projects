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
):
    items = [_normalize(e) for e in _all_items()]
    if type:
        items = [i for i in items if i["type"] == type]
    if category:
        items = [i for i in items if i["category"] == category]
    if status:
        items = [i for i in items if i["status"] == status]
    return items


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


@router.get("/stats")
def stats():
    items = _all_items()
    counts = {"total": len(items)}
    for t in ("secondhand", "lostfound", "emergency", "discussion"):
        counts[t] = sum(1 for e in items if e.get("type") == t)
    counts["active"] = sum(1 for e in items if e.get("status", "active") == "active")
    return counts


@router.post("/cluster")
def cluster_legacy():
    """旧 DBSCAN 聚类入口的兼容占位：已升级为容量约束划分，请使用 /api/territory/divide。"""
    return {"clusters": [], "noise": [], "note": "已升级为容量约束区域划分，调用 /api/territory/divide"}
