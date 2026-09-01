"""事件的请求 / 响应模型。

对外契约刻意与旧 Express 后端保持一致（latitude / longitude 字段名），
这样前端页面无需改动即可切到新的 FastAPI 后端。
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.event import EVENT_TYPES, EVENT_STATUSES


def _check_lat(v: float) -> float:
    if not -90 <= v <= 90:
        raise ValueError("latitude 必须在 -90 ~ 90 之间")
    return v


def _check_lng(v: float) -> float:
    if not -180 <= v <= 180:
        raise ValueError("longitude 必须在 -180 ~ 180 之间")
    return v


class EventBase(BaseModel):
    type: str = Field(description="secondhand | lostfound | emergency | discussion")
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    category: str | None = None
    price: float | None = Field(default=None, ge=0)
    contact: str | None = None
    weight: float = Field(default=1.0, gt=0, le=10000)
    latitude: float
    longitude: float

    @field_validator("type")
    @classmethod
    def _type_valid(cls, v: str) -> str:
        if v not in EVENT_TYPES:
            raise ValueError(f"type 必须是 {EVENT_TYPES} 之一")
        return v

    @field_validator("latitude")
    @classmethod
    def _lat_valid(cls, v: float) -> float:
        return _check_lat(v)

    @field_validator("longitude")
    @classmethod
    def _lng_valid(cls, v: float) -> float:
        return _check_lng(v)


class EventCreate(EventBase):
    status: str = "active"
    source: str = "manual"

    @field_validator("status")
    @classmethod
    def _status_valid(cls, v: str) -> str:
        if v not in EVENT_STATUSES:
            raise ValueError(f"status 必须是 {EVENT_STATUSES} 之一")
        return v


class EventUpdate(BaseModel):
    """全字段可选，未提供的保持原值。"""

    type: str | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    category: str | None = None
    price: float | None = Field(default=None, ge=0)
    contact: str | None = None
    weight: float | None = Field(default=None, gt=0, le=10000)
    latitude: float | None = None
    longitude: float | None = None
    status: str | None = None

    @field_validator("type")
    @classmethod
    def _type_valid(cls, v: str | None) -> str | None:
        if v is not None and v not in EVENT_TYPES:
            raise ValueError(f"type 必须是 {EVENT_TYPES} 之一")
        return v

    @field_validator("status")
    @classmethod
    def _status_valid(cls, v: str | None) -> str | None:
        if v is not None and v not in EVENT_STATUSES:
            raise ValueError(f"status 必须是 {EVENT_STATUSES} 之一")
        return v

    @field_validator("latitude")
    @classmethod
    def _lat_valid(cls, v: float | None) -> float | None:
        return None if v is None else _check_lat(v)

    @field_validator("longitude")
    @classmethod
    def _lng_valid(cls, v: float | None) -> float | None:
        return None if v is None else _check_lng(v)


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: str
    title: str
    description: str | None = None
    category: str | None = None
    price: float | None = None
    contact: str | None = None
    weight: float
    status: str
    source: str
    latitude: float
    longitude: float
    created_at: datetime


class StatsOut(BaseModel):
    """与旧 /api/stats 接口保持同构。"""

    total: int
    secondhand: int
    lostfound: int
    emergency: int
    discussion: int
    active: int
