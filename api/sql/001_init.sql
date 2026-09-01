-- 001_init.sql — 区域智能划分系统初始 schema
-- 目标库：PostgreSQL 13 + PostGIS 3.2.3（坐标统一 GCJ-02，SRID 仍标 4326 作占位）
--
-- 执行：psql -U postgres -d webgis_territory -f sql/001_init.sql

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- 业务事件：由 items 表演进而来
--   · latitude / longitude 两列 → 合并为空间列 geom，可建 GIST 索引
--   · 新增 weight（业务量权重），是区域划分算法的输入
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type         text NOT NULL,
    title        text NOT NULL,
    description  text,
    category     text,
    price        numeric(12, 2),
    contact      text,
    weight       numeric(10, 3) NOT NULL DEFAULT 1,
    status       text NOT NULL DEFAULT 'active',
    source       text NOT NULL DEFAULT 'seed',
    geom         geometry(Point, 4326) NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT event_type_chk CHECK (
        type IN ('secondhand', 'lostfound', 'emergency', 'discussion')
    ),
    CONSTRAINT event_status_chk CHECK (status IN ('active', 'resolved', 'closed'))
);

-- 空间索引：让「点落在哪个片区」从 O(n·K) 降到 O(log n)
CREATE INDEX IF NOT EXISTS idx_event_geom   ON event USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_event_type   ON event (type);
CREATE INDEX IF NOT EXISTS idx_event_status ON event (status);

COMMENT ON TABLE  event              IS '带地理坐标的业务事件，区域划分的输入数据';
COMMENT ON COLUMN event.weight       IS '业务量权重，由事件类型/紧急度/价格派生';
COMMENT ON COLUMN event.geom         IS 'GCJ-02 坐标（高德体系），SRID 4326 仅为占位';
COMMENT ON COLUMN event.source       IS '数据来源：seed=造数器 / amap=高德抓取 / manual=手工录入';

-- ---------------------------------------------------------------------------
-- 划分方案：一次完整划分的快照
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plan (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name         text NOT NULL,
    algorithm    text NOT NULL,          -- dbscan | grid | plain_kmeans | capacity_kmeans
    params       jsonb NOT NULL DEFAULT '{}'::jsonb,
    status       text NOT NULL DEFAULT 'pending',   -- pending | running | success | failed
    metrics      jsonb,
    error        text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    finished_at  timestamptz,

    CONSTRAINT plan_status_chk CHECK (status IN ('pending', 'running', 'success', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_plan_created ON plan (created_at DESC);

-- ---------------------------------------------------------------------------
-- 片区：划分产出的地理区域（多边形）—— 原项目 DBSCAN 从未生成过这一层
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS territory (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id        uuid NOT NULL REFERENCES plan (id) ON DELETE CASCADE,
    seq            int  NOT NULL,
    centroid       geometry(Point, 4326),
    total_weight   numeric(14, 3),
    event_count    int,
    area_km2       numeric(12, 4),
    geom           geometry(MultiPolygon, 4326),
    UNIQUE (plan_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_territory_plan ON territory (plan_id);
CREATE INDEX IF NOT EXISTS idx_territory_geom ON territory USING GIST (geom);

-- ---------------------------------------------------------------------------
-- 归属关系：事件 → 片区
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignment (
    plan_id       uuid NOT NULL REFERENCES plan (id) ON DELETE CASCADE,
    event_id      uuid NOT NULL REFERENCES event (id) ON DELETE CASCADE,
    territory_id  uuid NOT NULL,
    distance_m    double precision,
    PRIMARY KEY (plan_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_terr ON assignment (territory_id);
