"""区域智能划分系统 —— FastAPI 入口。"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import events, stats, territory

app = FastAPI(
    title="区域智能划分系统 API",
    description=(
        "基于 PostGIS 空间计算的地理区域智能划分服务。"
        "坐标全链路统一使用 GCJ-02（高德体系），SRID 4326 仅为占位标记。"
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(events.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(territory.router, prefix="")


@app.get("/api/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}
