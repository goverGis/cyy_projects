"""业务事件模型。

坐标以 PostGIS 空间列存储（可建 GIST 索引），
同时用 column_property 暴露 latitude / longitude 两个计算列，
使接口契约与旧 Express 后端保持一致，前端无需改动字段名。
"""

import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from geoalchemy2.functions import ST_X, ST_Y
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, column_property, mapped_column

from app.core.database import Base

EVENT_TYPES = ("secondhand", "lostfound", "emergency", "discussion")
EVENT_STATUSES = ("active", "resolved", "closed")


class Event(Base):
    __tablename__ = "event"
    __table_args__ = (
        CheckConstraint(
            "type IN ('secondhand','lostfound','emergency','discussion')",
            name="event_type_chk",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(64))
    price: Mapped[float | None] = mapped_column(Numeric(12, 2))
    contact: Mapped[str | None] = mapped_column(String(100))

    # 业务量权重：区域划分算法的输入，由事件类型 / 紧急度 / 价格派生
    weight: Mapped[float] = mapped_column(Numeric(10, 3), nullable=False, default=1)

    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="seed")

    # GCJ-02 坐标（高德体系），SRID 4326 仅为占位
    geom: Mapped[object] = mapped_column(
        Geometry("POINT", srid=4326, spatial_index=True), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # 计算列：直接从空间列取经纬，保持与旧接口一致
    longitude = column_property(ST_X(geom))
    latitude = column_property(ST_Y(geom))


class Plan(Base):
    """划分方案：一次完整划分的快照。"""

    __tablename__ = "plan"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    algorithm: Mapped[str] = mapped_column(String(32), nullable=False)
    params: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    metrics: Mapped[dict | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Territory(Base):
    """片区：划分产出的地理区域（多边形）。

    原项目的 DBSCAN 只产出点簇与噪声点，从未生成过这一层 —— 本项目补上的核心。
    """

    __tablename__ = "territory"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    centroid: Mapped[object | None] = mapped_column(Geometry("POINT", srid=4326))
    total_weight: Mapped[float | None] = mapped_column(Numeric(14, 3))
    event_count: Mapped[int | None] = mapped_column(Integer)
    area_km2: Mapped[float | None] = mapped_column(Numeric(12, 4))
    geom: Mapped[object | None] = mapped_column(
        Geometry("MULTIPOLYGON", srid=4326, spatial_index=True)
    )


class Assignment(Base):
    """事件 → 片区的归属关系。"""

    __tablename__ = "assignment"

    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True
    )
    territory_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    distance_m: Mapped[float | None] = mapped_column(Float)
