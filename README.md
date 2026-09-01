# 区域智能划分系统（WebGIS · 销售/服务片区划分）

> 基于 WebGIS 的地理区域智能划分系统：把离散的业务事件（闲置、寻物、急救、讨论）按**业务量均衡 + 服务半径最短 + 形状紧凑**的智能目标，自动聚成若干服务片区，并用 Voronoi 边界落地到地图上。

本项目为求职简历作品集，覆盖「数据生成 → 空间算法 → PostGIS 持久化 → 可视化交互 → 参数市场」的完整闭环。

---

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 18 + Vite + 高德 JSAPI 2.0 + Ant Design |
| 后端 | Python FastAPI + SQLAlchemy 2 + Pydantic v2 |
| 空间数据库 | PostgreSQL 13 + PostGIS 3.2（`ST_VoronoiPolygons` 生成生产级边界） |
| 算法 | numpy + shapely（容量约束 Lloyd 迭代 + move/swap 局部搜索） |
| 坐标系 | 全链路 GCJ-02（高德体系），SRID 4326 仅占位，不做纠偏 |

---

## 功能特性

- 🧭 **区域智能划分**：调 K / λ（均衡权重）/ μ（紧凑度）/ 种子，实时生成片区与指标
- 🛰 **生产级边界**：勾选「PostGIS 边界」后，片区边界由数据库 `ST_VoronoiPolygons` 直接生成
- 🔲 **3D 负载视图**：按各片区业务量权重拉伸 3D 柱体，直观看哪里过载
- 📊 **海量数据优化**：点层抽稀（聚合桶）+ 视窗分页，数千点仍可流畅渲染
- 🧪 **算法参数市场**：调参 → 保存 → 浏览/对比不同 (K, λ, μ) 方案 → 复制分享链接 → 一键应用到大图
- 📈 **对比实验**：随机 / 网格 / k-means / 容量约束 四种基线同台对比
- 🗄 **真实数据驱动**：事件 CRUD、统计、划分数据源全部由 PostGIS 驱动（无库时自动回退本地文件）

---

## 架构

```
前端 (React+Vite :3000)
   │  /api 代理
   ▼
后端 (FastAPI :8000)
   ├─ /api/territory/divide   容量约束划分（算法层 + 可选 PostGIS 边界）
   ├─ /api/territory/benchmark 四基线对比
   ├─ /api/events  (PostGIS CRUD)
   ├─ /api/stats   (PostGIS 统计)
   ├─ /api/items   (文件型兼容路由：抽稀/分页)
   └─ /api/schemes (参数市场：保存/对比/分享)
        │
  数据层：PostGIS event 表（geometry 空间列 + GIST 索引）
  算法层：容量约束 Lloyd + move/swap 局部搜索 → 最优分配 → Voronoi 边界
```

---

## 快速开始

### 1. 环境要求
- Node.js ≥ 18，Python ≥ 3.11
- PostgreSQL 13 + PostGIS 3.2（本机已验证；无则走「演示模式」）

### 2. 数据库（生产模式，可选）
```bash
# 建库并启用扩展
createdb webgis_territory
psql -d webgis_territory -c "CREATE EXTENSION postgis;"

# 配置连接（api/.env，已被 gitignore）
# DATABASE_URL=postgresql+psycopg://<user>:<pwd>@localhost:5432/webgis_territory

# 灌入造数器生成的 4000 条北京事件
cd api
python -m scripts.seed          # 建表 + 导入 data/events.json
```

> 无 PostGIS 也能跑：后端自动回退到 `data/events.json` 文件，划分/统计照常可用。

### 3. 后端
```bash
cd api
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
# 健康检查： http://localhost:8000/api/health
```

### 4. 前端
```bash
cd frontend
npm install
npm run dev                    # http://localhost:3000
```

### 5. 造数器（生成事件数据）
```bash
cd tools/generator
node generate.mjs              # 输出 ../data/events.json（北京 10 热点高斯分布）
```

### 6. 测试
```bash
cd api
.venv/Scripts/python -m pytest -q
# 12 passed（含 2 个真实 PostGIS 集成测试，需先建库灌数）
```

---

## 核心算法

目标函数（三项归一化后加权）：

```
J = J_dist + λ·J_balance + μ·J_shape
  · J_dist     平均加权服务半径（越小越好）
  · J_balance  各片区业务量变异系数 CV（越小越均衡）
  · J_shape    平均紧凑度惩罚（1 - Polsby-Popper）
```

求解（NP-hard，工程标准解）：
1. **k-means++ 种子**：空间上分散的初始中心，保证地理覆盖
2. **容量约束 Lloyd 迭代**：就近分配 + 容量兜底（每片业务量 ∈ [均值×0.5, 均值×1.5]）
3. **move / swap 局部搜索**：在容量硬约束下优化目标函数
4. **Voronoi 边界**：以片区中心生成 Voronoi 多边形（默认本地 shapely，生产模式用 `ST_VoronoiPolygons`）

---

## API 速览

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/territory/divide` | 区域划分（`source`: auto/file/database，`use_pg_voronoi`: 生产边界） |
| GET | `/api/territory/benchmark?k=` | 四基线对比 |
| GET | `/api/events` | 事件列表（PostGIS，支持 bbox 空间过滤） |
| GET | `/api/stats` | 按类型统计（PostGIS） |
| GET | `/api/items` | 文件型事件（支持 offset/limit/bbox 分页） |
| GET | `/api/items/aggregate` | 网格密度桶（点抽稀） |
| GET/POST | `/api/schemes` | 参数市场：列表 / 保存 |
| GET | `/api/schemes/{id}` | 单个方案详情 |

---

## 目录结构

```
trae/
├─ api/                  FastAPI 后端
│  ├─ app/
│  │  ├─ algorithms/     容量约束划分核心算法（纯 numpy+shapely）
│  │  ├─ routers/        territory / events / stats / legacy_items / schemes
│  │  ├─ models/          Event / Plan / Territory / Assignment (ORM)
│  │  └─ core/            config / database
│  ├─ scripts/seed.py     PostGIS 灌库脚本
│  └─ tests/             pytest 单元测试 + 集成测试
├─ frontend/             React 前端
│  └─ src/pages/         TerritoryPage / DeveloperPage(参数市场) / 业务页
├─ tools/generator/      事件造数器
└─ data/                 events.json（gitignore）
```

---

## 演示模式 vs 生产模式

| 维度 | 演示模式 | 生产模式 |
|---|---|---|
| 数据源 | `data/events.json` 文件 | PostGIS `event` 表 |
| 边界 | shapely 本地生成 | `ST_VoronoiPolygons`（数据库） |
| 依赖 | 仅需 FastAPI | 需 PostgreSQL + PostGIS |
| 切换 | 默认 `source=auto` 自动按可用性选择 | 设好 `DATABASE_URL` 即生效 |

`source=auto` 下，优先读数据库；连不上自动回退本地文件，**演示永不中断**。
