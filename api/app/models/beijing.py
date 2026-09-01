"""北京行政区边界模型（生产级片区裁剪用的底图）。

坐标全链路 GCJ-02（高德体系），SRID 4326 仅作占位标记，不做纠偏。
数据来源：api/data/beijing_districts.json（DataV GeoAtlas 导出，GCJ-02），
由 scripts.load_beijing_districts 灌库。若文件缺失，load_beijing_districts
会用北京 16 区真实质心 + 近似半径程序化生成一份可用的近似边界，
保证「Voronoi 边界贴合行政区」的演示链路始终可跑。
"""

from geoalchemy2 import Geometry
from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class BeijingDistrict(Base):
    __tablename__ = "beijing_districts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    adcode: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    # GCJ-02 行政区多边形（SRID 4326 占位）
    geom: Mapped[object] = mapped_column(
        Geometry("MULTIPOLYGON", srid=4326, spatial_index=True), nullable=False
    )
