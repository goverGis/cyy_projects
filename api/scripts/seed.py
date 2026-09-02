"""将造数器生成的事件灌入 PostGIS（生产数据源）。

前置：
  1. 本机 PostgreSQL 13 + PostGIS 3.2.3 已运行（端口 5432）
  2. 配置环境变量（见 api/.env.example）：
       DATABASE_URL=postgresql+psycopg://<user>:<password>@localhost:5432/<db>
     或先执行建表：psql -f api/sql/001_init.sql
  3. 已生成数据：tools/generator/generate.mjs

用法（在 api/ 目录下，激活 venv）：
  python -m scripts.seed              # 清空 event 表后重新导入（幂等）
  python -m scripts.seed --append     # 不清空，仅追加（跳过已存在记录）

说明：坐标全链路 GCJ-02（高德体系），SRID 4326 仅作占位标记，不做纠偏。
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import text

from app.core.database import Base, SessionLocal, engine
from app.models.beijing import BeijingDistrict
from app.models.event import Event

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "events.json"
_SRID = 4326


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--append", action="store_true", help="不清空，仅追加")
    args = ap.parse_args()

    if not DATA.exists():
        print(f"❌ 找不到 {DATA}，请先运行 tools/generator/generate.mjs")
        sys.exit(1)

    print("⏳ 连接数据库并建表（如已存在则跳过）…")
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print("❌ 无法连接 / 建表，请检查 DATABASE_URL 与 PostGIS：", e)
        sys.exit(1)

    doc = json.loads(DATA.read_text(encoding="utf-8"))
    events = doc["events"]
    print(f"   待导入事件：{len(events)} 条")

    with SessionLocal() as db:
        if not args.append:
            print("🧹 清空 event 表…")
            db.execute(text("TRUNCATE TABLE event RESTART IDENTITY CASCADE"))
            db.commit()

    count = 0
    for e in events:
        # created_at：造数器已播种过去 7 天时间戳；缺省则回退数据库默认值（func.now()）
        ca = e.get("created_at")
        if ca:
            # JS toISOString 形如 2026-09-07T15:30:00.000Z（UTC，带时区）
            ca = datetime.fromisoformat(ca.replace("Z", "+00:00"))
        db.add(
            Event(
                type=e["type"],
                title=e["title"],
                description=e.get("description"),
                category=e.get("category"),
                price=e.get("price"),
                contact=e.get("contact"),
                weight=float(e.get("weight", 1.0)),
                status=e.get("status", "active"),
                source=e.get("source", "generator"),
                created_at=ca,
                geom=from_shape(
                    Point(float(e["longitude"]), float(e["latitude"])), srid=_SRID
                ),
            )
        )
        count += 1
    db.commit()
    print(f"✅ 导入完成，新增 {count} 条。")


if __name__ == "__main__":
    main()
