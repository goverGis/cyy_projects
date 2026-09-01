"""区域划分相关请求 / 响应模型。"""

from typing import Any

from pydantic import BaseModel, Field


class DivideRequest(BaseModel):
    k: int = Field(default=10, ge=2, le=200, description="目标片区数")
    lam: float = Field(default=2.0, gt=0, description="均衡项权重（越大越均衡、半径越大）")
    mu: float = Field(default=0.1, ge=0, description="紧凑度项权重")
    seed: int = Field(default=42, description="随机种子，保证可复现")
    type_filter: list[str] | None = Field(
        default=None, description="仅对指定事件类型划分，如 ['emergency','secondhand']"
    )
    points: list[dict] | None = Field(
        default=None, description="直接传入点集（覆盖数据源）；每项含 longitude/latitude/weight"
    )


class RegionOut(BaseModel):
    region_id: int
    weight: float
    point_count: int
    centroid: list[float]          # [lng, lat]
    polygon: Any | None = None     # GeoJSON Polygon（Voronoi 边界）


class DivideResponse(BaseModel):
    k: int
    lam: float
    method: str = "capacity-constrained"
    metrics: dict
    regions: list[RegionOut]
    geojson: dict                  # FeatureCollection，供前端地图直接加载
    source: str = "database"       # database | file


class BenchmarkRow(BaseModel):
    method: str
    cv_weight: float
    mean_radius_m: float
    max_radius_m: float
    mean_compactness: float
    capacity_violations: int


class BenchmarkResponse(BaseModel):
    k: int
    rows: list[BenchmarkRow]
