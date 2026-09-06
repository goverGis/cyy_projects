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
    source: str = Field(
        default="auto",
        description="点集数据源：auto（优先数据库，失败回退文件）| database | file",
    )
    use_pg_voronoi: bool = Field(
        default=False,
        description="边界是否由 PostGIS ST_VoronoiPolygons 生成（生产级几何）；需数据库可用，失败回退本地 shapely",
    )
    clip_to_district: bool = Field(
        default=False,
        description="生产级边界是否再裁剪到北京行政区（beijing_districts 表）；需先运行 scripts.load_beijing_districts 灌库",
    )
    time_window: dict | None = Field(
        default=None,
        description="{'start': ISO, 'end': ISO}，仅对该时间窗内的事件划分（时间滑块用）；缺省为全量",
    )


class RegionOut(BaseModel):
    region_id: int
    weight: float
    point_count: int
    centroid: list[float]          # [lng, lat]
    polygon: Any | None = None     # GeoJSON Polygon（Voronoi 边界）
    # —— 出彩改造（P0）：让每个片区"说得清" ——
    type_breakdown: dict[str, float] = {}   # 各类事件权重占比，如 {"secondhand": 1200.5, "emergency": 300.0}
    capacity: float = 0.0                  # 片区承载上限（总容量 / K * 1.2，留 20% 余量）
    load_ratio: float = 0.0                # weight / capacity，>1 即过载
    overload: bool = False                 # load_ratio > 1
    suggested_action: str | None = None    # "OK" / "拆分" / "新增服务点" / "合并"


class DivideResponse(BaseModel):
    k: int
    lam: float
    method: str = "capacity-constrained"
    metrics: dict
    regions: list[RegionOut]
    geojson: dict                  # FeatureCollection，供前端地图直接加载
    source: str = "database"       # database | file
    # —— 出彩改造（P0）：把裸指标转成"决策建议" ——
    balance_report: dict | None = None
    recommendation: dict | None = None


class BenchmarkRow(BaseModel):
    method: str
    cv_weight: float
    mean_radius_m: float
    max_radius_m: float
    mean_compactness: float
    capacity_violations: int
    # —— 出彩改造（P1）：标注推荐算法 ——
    is_recommended: bool = False
    rank: int | None = None
    score: float | None = None       # 综合评分（均衡/半径/紧凑度/零超容加权），越高越好


class BenchmarkResponse(BaseModel):
    k: int
    rows: list[BenchmarkRow]
    recommended_method: str | None = None


# ========== POI 语义划分（赛博霓虹新功能）==========

class PoiDivideRequest(BaseModel):
    eps_by_type: dict[str, float] = Field(
        default={"residential": 700, "mall": 600, "medical": 450, "leisure": 500, "education": 500},
        description="各类 POI 的空间聚类半径（米）；小区大半径→邻里片区，医疗/休闲小半径→保留多片区",
    )
    min_samples: int = Field(default=1, ge=1, description="DBSCAN 最小样本数；1 表示不允许噪声点")
    type_filter: list[str] | None = Field(
        default=None, description="仅对指定 POI 类型划分，如 ['residential','mall']"
    )
    time_window: dict | None = Field(
        default=None,
        description="{'start': ISO, 'end': ISO}，仅对该时间窗内的事件划分；缺省为全量",
    )
    source: str = Field(
        default="auto",
        description="数据源：auto（优先数据库）| database | file",
    )


class PoiRegionOut(BaseModel):
    region_id: int
    poi_type: str
    weight: float
    point_count: int
    centroid: list[float]
    polygon: Any | None = None


class PoiDivideResponse(BaseModel):
    regions: list[PoiRegionOut]
    total_weight: float
    by_type: dict[str, int]
    geojson: dict
    source: str = "database"
    eps_by_type: dict[str, float]
