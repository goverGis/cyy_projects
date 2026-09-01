"""事件 CRUD 接口。"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.event import Event
from app.schemas.event import EventCreate, EventOut, EventUpdate

router = APIRouter(prefix="/events", tags=["events"])

_SRID = 4326


def _get_or_404(db: Session, event_id: UUID) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.get("", response_model=list[EventOut])
def list_events(
    type: str | None = Query(default=None),
    status: str | None = Query(default="active"),
    bbox: str | None = Query(
        default=None,
        description="空间过滤：minLng,minLat,maxLng,maxLat（GCJ-02）",
        examples=["116.21,39.76,116.55,40.03"],
    ),
    limit: int = Query(default=2000, ge=1, le=10000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[Event]:
    stmt = select(Event)

    if type:
        stmt = stmt.where(Event.type == type)
    if status:
        stmt = stmt.where(Event.status == status)

    if bbox:
        try:
            min_lng, min_lat, max_lng, max_lat = (float(x) for x in bbox.split(","))
        except ValueError:
            raise HTTPException(
                status_code=422, detail="bbox 格式应为 minLng,minLat,maxLng,maxLat"
            )
        # 走 GIST 索引，避免全表扫描
        stmt = stmt.where(
            func.ST_Intersects(
                Event.geom,
                func.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, _SRID),
            )
        )

    stmt = stmt.order_by(Event.created_at.desc()).limit(limit).offset(offset)
    return list(db.scalars(stmt))


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: UUID, db: Session = Depends(get_db)) -> Event:
    return _get_or_404(db, event_id)


@router.post("", response_model=EventOut, status_code=201)
def create_event(payload: EventCreate, db: Session = Depends(get_db)) -> Event:
    event = Event(
        type=payload.type,
        title=payload.title,
        description=payload.description,
        category=payload.category,
        price=payload.price,
        contact=payload.contact,
        weight=payload.weight,
        status=payload.status,
        source=payload.source,
        geom=from_shape(
            Point(payload.longitude, payload.latitude), srid=_SRID
        ),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.put("/{event_id}", response_model=EventOut)
def update_event(
    event_id: UUID, payload: EventUpdate, db: Session = Depends(get_db)
) -> Event:
    event = _get_or_404(db, event_id)
    data = payload.model_dump(exclude_unset=True)

    lng = data.pop("longitude", None)
    lat = data.pop("latitude", None)
    if lng is not None or lat is not None:
        # 坐标任一改变都要重建空间列，取新值优先、否则沿用旧值
        new_lng = lng if lng is not None else event.longitude
        new_lat = lat if lat is not None else event.latitude
        event.geom = from_shape(Point(new_lng, new_lat), srid=_SRID)

    for field, value in data.items():
        setattr(event, field, value)

    db.commit()
    db.refresh(event)
    return event


@router.delete("/{event_id}", status_code=204)
def delete_event(event_id: UUID, db: Session = Depends(get_db)) -> None:
    event = _get_or_404(db, event_id)
    db.delete(event)
    db.commit()
