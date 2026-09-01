"""统计接口：契约与旧 Express 后端保持同构，前端 /api/stats 无需改动。"""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.event import Event
from app.schemas.event import StatsOut

router = APIRouter(tags=["stats"])


def _count_by_type(db: Session) -> dict[str, int]:
    rows = db.execute(
        select(Event.type, func.count()).group_by(Event.type)
    ).all()
    counts = {t: 0 for t in ("secondhand", "lostfound", "emergency", "discussion")}
    for event_type, n in rows:
        counts[event_type] = n
    return counts


@router.get("/stats", response_model=StatsOut)
def get_stats(db: Session = Depends(get_db)) -> StatsOut:
    counts = _count_by_type(db)
    total = db.scalar(select(func.count()).select_from(Event)) or 0
    active = (
        db.scalar(select(func.count()).where(Event.status == "active")) or 0
    )
    return StatsOut(total=total, active=active, **counts)
