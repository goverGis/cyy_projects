"""算法参数市场（方案市集）路由。

把「开发者平台」升级为可分享、可对比的「区域划分方案市场」：
- 每位开发者可保存一套 (K, λ, μ, seed, type_filter) 划分参数预设，并附带
  算法服务端复算后的质量指标快照（CV / 半径 / 紧凑度 / 超容 / 片区负载分布）；
- 市场内可浏览、按质量排序、对比不同参数下片区质量的差异；
- 设计贴合原始蓝图「上传/分享与区域属性相关的小功能」的社区化思想，
  但把「小功能插件」具体化为「算法调参方案」，与本项目算法内核直接闭环。

持久化：落盘到 data/schemes.json（文件型，重启不丢；演示规模足够）。
指标在服务端用容量约束划分算法复算，前端不可伪造，保证市场对比的可信度。
"""

import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import numpy as np
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.algorithms import divide

router = APIRouter(prefix="/api/schemes", tags=["schemes"])

ROOT = Path(__file__).resolve().parents[3]
DATA_FILE = ROOT / "data" / "events.json"
SCHEMES_FILE = ROOT / "data" / "schemes.json"

ALL_TYPES = ("secondhand", "lostfound", "emergency", "discussion")


# ---------------------------------------------------------------------------
# 请求 / 响应模型
# ---------------------------------------------------------------------------
class SchemeParams(BaseModel):
    k: int = Field(..., ge=2, le=200, description="目标片区数")
    lam: float = Field(default=2.0, gt=0, description="均衡项权重（越大越均衡、半径越大）")
    mu: float = Field(default=0.1, ge=0, description="紧凑度项权重")
    seed: int = Field(default=42, description="随机种子，保证可复现")
    type_filter: list[str] | None = Field(
        default=None, description="仅对指定事件类型划分，如 ['emergency','secondhand']"
    )


class SchemeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    description: str = Field(default="", max_length=500)
    author: str = Field(default="匿名开发者", max_length=40)
    tags: list[str] = Field(default_factory=list)
    params: SchemeParams


class SchemeOut(BaseModel):
    id: str
    name: str
    description: str
    author: str
    tags: list[str]
    params: SchemeParams
    metrics: dict[str, Any]
    region_weights: list[float]      # 各片区业务量负载，供对比图/分布条使用
    region_point_counts: list[int]   # 各片区点数
    created_at: str
    source: str = "file"


# ---------------------------------------------------------------------------
# 文件读写（演示规模，单进程足够）
# ---------------------------------------------------------------------------
def _load_schemes() -> list[dict]:
    if not SCHEMES_FILE.exists():
        return []
    try:
        doc = json.loads(SCHEMES_FILE.read_text(encoding="utf-8"))
        return doc if isinstance(doc, list) else []
    except Exception:
        return []


def _save_schemes(items: list[dict]) -> None:
    SCHEMES_FILE.parent.mkdir(parents=True, exist_ok=True)
    SCHEMES_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# 用同一算法复算，得到可信指标 + 片区负载分布
# ---------------------------------------------------------------------------
def _load_points(type_filter: list[str] | None):
    if not DATA_FILE.exists():
        raise HTTPException(status_code=404, detail="无可用点集：请先运行造数器或导入事件")
    doc = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    pts = doc["events"]
    if type_filter:
        pts = [p for p in pts if p["type"] in type_filter]
    xy = np.array([[p["longitude"], p["latitude"]] for p in pts])
    w = np.array([float(p.get("weight", 1.0)) for p in pts])
    return xy, w


def _compute(p: SchemeParams) -> dict:
    xy, w = _load_points(p.type_filter)
    if len(xy) < p.k:
        raise HTTPException(status_code=400, detail=f"点集数量 {len(xy)} 小于片区数 {p.k}")
    res = divide(xy, w, p.k, lam=p.lam, mu=p.mu, seed=p.seed)
    loads = [float(w[res.assignment == r].sum()) for r in range(p.k)]
    counts = [int((res.assignment == r).sum()) for r in range(p.k)]
    return {
        "metrics": res.metrics,
        "region_weights": [round(x, 2) for x in loads],
        "region_point_counts": counts,
    }


# ---------------------------------------------------------------------------
# 社区预设（市场冷启动时自动播种，保证一进来就有可对比内容）
# ---------------------------------------------------------------------------
_COMMUNITY_PRESETS = [
    {"name": "均衡优先方案 λ=3.0", "author": "官方示例", "tags": ["均衡", "推荐"],
     "description": "高均衡权重，片区业务量最均匀，适合服务负载敏感场景（如急救资源调度）。",
     "params": {"k": 12, "lam": 3.0, "mu": 0.1, "seed": 42, "type_filter": None}},
    {"name": "半径优先方案 λ=0.5", "author": "官方示例", "tags": ["紧凑半径"],
     "description": "低均衡权重，服务半径更短、居民更近，但片区负载方差更大。",
     "params": {"k": 12, "lam": 0.5, "mu": 0.1, "seed": 42, "type_filter": None}},
    {"name": "高细分方案 K=24", "author": "官方示例", "tags": ["高细分"],
     "description": "翻倍片区数，单片区更小更近，适合高密度城区的网格化运营。",
     "params": {"k": 24, "lam": 2.0, "mu": 0.1, "seed": 42, "type_filter": None}},
]


def _ensure_seed() -> None:
    """市场为空且数据可用时，播种 3 个社区预设方案。"""
    items = _load_schemes()
    if items:
        return
    if not DATA_FILE.exists():
        return
    seeded = []
    for pre in _COMMUNITY_PRESETS:
        try:
            params = SchemeParams(**pre["params"])
            comp = _compute(params)
        except Exception:
            continue
        rec = {
            "id": f"seed-{uuid4().hex[:8]}",
            "name": pre["name"],
            "description": pre["description"],
            "author": pre["author"],
            "tags": pre["tags"],
            "params": params.model_dump(),
            "metrics": comp["metrics"],
            "region_weights": comp["region_weights"],
            "region_point_counts": comp["region_point_counts"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "source": "seed",
        }
        seeded.append(rec)
    if seeded:
        _save_schemes(seeded)


# ---------------------------------------------------------------------------
# 接口
# ---------------------------------------------------------------------------
@router.get("", response_model=list[SchemeOut])
def list_schemes(
    q: str | None = Query(default=None, description="按名称/作者模糊搜索"),
    tag: str | None = Query(default=None, description="按标签过滤"),
    sort: str = Query(default="created_at", description="排序：created_at|cv_weight|mean_radius_m|k"),
    order: str = Query(default="desc", description="asc|desc"),
):
    _ensure_seed()
    items = _load_schemes()
    if q:
        ql = q.lower()
        items = [s for s in items if ql in s["name"].lower() or ql in s["author"].lower()
                 or ql in s.get("description", "").lower()]
    if tag:
        items = [s for s in items if tag in s.get("tags", [])]
    reverse = order != "asc"
    if sort == "cv_weight":
        items.sort(key=lambda s: s["metrics"].get("cv_weight", 0), reverse=reverse)
    elif sort == "mean_radius_m":
        items.sort(key=lambda s: s["metrics"].get("mean_radius_m", 0), reverse=reverse)
    elif sort == "k":
        items.sort(key=lambda s: s["params"].get("k", 0), reverse=reverse)
    else:
        items.sort(key=lambda s: s.get("created_at", ""), reverse=reverse)
    return [SchemeOut(**s) for s in items]


@router.post("", response_model=SchemeOut, status_code=201)
def create_scheme(payload: SchemeCreate):
    comp = _compute(payload.params)
    rec = {
        "id": f"sch-{uuid4().hex[:8]}",
        "name": payload.name,
        "description": payload.description,
        "author": payload.author,
        "tags": payload.tags,
        "params": payload.params.model_dump(),
        "metrics": comp["metrics"],
        "region_weights": comp["region_weights"],
        "region_point_counts": comp["region_point_counts"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": "user",
    }
    items = _load_schemes()
    items.append(rec)
    _save_schemes(items)
    return SchemeOut(**rec)


@router.get("/{scheme_id}", response_model=SchemeOut)
def get_scheme(scheme_id: str):
    for s in _load_schemes():
        if s["id"] == scheme_id:
            return SchemeOut(**s)
    raise HTTPException(status_code=404, detail="方案不存在")


@router.delete("/{scheme_id}", status_code=204)
def delete_scheme(scheme_id: str):
    items = _load_schemes()
    new_items = [s for s in items if s["id"] != scheme_id]
    if len(new_items) == len(items):
        raise HTTPException(status_code=404, detail="方案不存在")
    _save_schemes(new_items)
