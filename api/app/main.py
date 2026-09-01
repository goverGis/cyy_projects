"""区域智能划分系统 —— FastAPI 入口。"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import territory, legacy_items, schemes, events, stats

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

# 演示模式（无 PostGIS 也可跑）：挂载文件型兼容路由 + 区域划分路由。
# events / stats（PostGIS 持久化版）在此不挂载，避免无库时连接报错；
# 接入 PostGIS 并 seed 后改为挂载它们即可。
# 文件型兼容路由（无 PostGIS 也可跑）：/api/items、/api/items/aggregate、/api/plugins 等
app.include_router(legacy_items.router, prefix="/api")
# 区域划分 + 参数市场
app.include_router(territory.router, prefix="")
app.include_router(schemes.router, prefix="")
# 生产模式（PostGIS 持久化）：事件 CRUD 与统计，由 DB 驱动
app.include_router(events.router, prefix="/api")
app.include_router(stats.router, prefix="/api")


@app.get("/api/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}
