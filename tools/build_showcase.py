"""生成自包含作品集页面 showcase.html（无需网络、双击即开，便于简历截图）。

- 架构图（SVG）
- 真实划分结果可视化：北京行政区底图 + K 个服务片区（来自运行中的后端 /api/territory/divide，clip_to_district=true）+ 质心与指标
- 简历亮点 + 运行说明

数据来源：
  divide 结果：本机后端 http://localhost:8000/api/territory/divide（需服务在跑）
  beijing 底图：data/beijing_districts.json（由 scripts.load_beijing_districts 生成）

用法（在 api/ 目录，激活 venv）：
  python ../tools/build_showcase.py
"""

import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DISTRICTS = ROOT / "data" / "beijing_districts.json"
OUT = ROOT / "showcase.html"

# 调一次真实生产划分（数据库 + PostGIS Voronoi + 北京行政区裁剪）
PAYLOAD = {
    "k": 6, "lam": 3.0, "mu": 0.15, "seed": 42,
    "type_filter": ["secondhand", "lostfound", "emergency", "discussion"],
    "source": "database", "use_pg_voronoi": True, "clip_to_district": True,
}


def fetch_divide():
    req = urllib.request.Request(
        "http://localhost:8000/api/territory/divide",
        data=json.dumps(PAYLOAD).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read())


def coords_of(geom):
    """返回几何的全部 [lng,lat] 点列表（支持 Polygon / MultiPolygon）。"""
    if geom is None:
        return []
    t = geom.get("type")
    if t == "Polygon":
        return [list(p) for p in geom["coordinates"][0]]
    if t == "MultiPolygon":
        pts = []
        for poly in geom["coordinates"]:
            pts += [list(p) for p in poly[0]]
        return pts
    return []


def build_svg_map(divide, districts):
    # 收集所有坐标算投影 bbox
    all_pts = []
    for r in divide["regions"]:
        all_pts += coords_of(r.get("polygon"))
    for f in districts.get("features", []):
        all_pts += coords_of(f.get("geometry"))
    if not all_pts:
        return "", (0, 0, 0, 0)
    lngs = [p[0] for p in all_pts]
    lats = [p[1] for p in all_pts]
    pad_lng = (max(lngs) - min(lngs)) * 0.06 + 1e-6
    pad_lat = (max(lats) - min(lats)) * 0.06 + 1e-6
    minlng, maxlng = min(lngs) - pad_lng, max(lngs) + pad_lng
    minlat, maxlat = min(lats) - pad_lat, max(lats) + pad_lat

    W, H = 760, 620

    def proj(lng, lat):
        x = (lng - minlng) / (maxlng - minlng) * W
        y = (1 - (lat - minlat) / (maxlat - minlat)) * H
        return x, y

    parts = []
    # 底图：北京行政区（浅灰填充）
    for f in districts.get("features", []):
        pts = coords_of(f.get("geometry"))
        if not pts:
            continue
        d = " ".join(f"{proj(*p)[0]:.1f},{proj(*p)[1]:.1f}" for p in pts)
        parts.append(
            f'<polygon points="{d}" fill="#eef2f7" stroke="#c3ccd9" stroke-width="1"/>'
        )
    # 服务片区（彩色半透明）
    palette = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899",
               "#14b8a6", "#f97316"]
    for i, r in enumerate(divide["regions"]):
        pts = coords_of(r.get("polygon"))
        if not pts:
            continue
        d = " ".join(f"{proj(*p)[0]:.1f},{proj(*p)[1]:.1f}" for p in pts)
        color = palette[i % len(palette)]
        parts.append(
            f'<polygon points="{d}" fill="{color}" fill-opacity="0.32" '
            f'stroke="{color}" stroke-width="2.5"/>'
        )
        # 质心标签
        cx, cy = proj(*r["centroid"])
        parts.append(
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="13" fill="{color}" '
            f'stroke="#fff" stroke-width="2"/>'
        )
        parts.append(
            f'<text x="{cx:.1f}" y="{cy+4:.1f}" text-anchor="middle" '
            f'font-size="13" font-weight="700" fill="#fff">{r["region_id"]}</text>'
        )
        # 权重标注
        parts.append(
            f'<text x="{cx:.1f}" y="{cy-18:.1f}" text-anchor="middle" '
            f'font-size="11" fill="#334155">w={r["weight"]:.0f}</text>'
        )
    return "\n".join(parts), (W, H)


def build():
    divide = fetch_divide()
    districts = json.loads(DISTRICTS.read_text(encoding="utf-8")) if DISTRICTS.exists() else {"features": []}
    svg_map, (W, H) = build_svg_map(divide, districts)
    m = divide["metrics"]
    regions = divide["regions"]
    total_w = sum(r["weight"] for r in regions)
    k = len(regions)

    region_rows = "".join(
        f"<tr><td>#{r['region_id']}</td><td>{r['weight']:.0f}</td>"
        f"<td>{r['point_count']}</td><td>{r['centroid'][0]:.3f}, {r['centroid'][1]:.3f}</td></tr>"
        for r in regions
    )

    html = f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>区域智能划分系统 · 作品集</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{ margin:0; font-family: -apple-system,"PingFang SC","Microsoft YaHei",Segoe UI,Roboto,sans-serif;
         color:#1e293b; background:#f8fafc; line-height:1.6; }}
  .wrap {{ max-width: 920px; margin: 0 auto; padding: 40px 24px 64px; }}
  header h1 {{ font-size: 28px; margin: 0 0 6px; }}
  .sub {{ color:#64748b; font-size:15px; margin-bottom: 18px; }}
  .chips {{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom: 28px; }}
  .chip {{ background:#e0edff; color:#1d4ed8; border-radius:999px; padding:4px 12px; font-size:12.5px; font-weight:600; }}
  section {{ background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:22px 24px; margin-bottom:22px; }}
  h2 {{ font-size:18px; margin:0 0 14px; }}
  .arch {{ width:100%; height:auto; }}
  .metrics {{ display:flex; flex-wrap:wrap; gap:12px; margin: 6px 0 16px; }}
  .metric {{ flex:1 1 130px; background:#f1f5f9; border-radius:10px; padding:12px 14px; }}
  .metric .v {{ font-size:22px; font-weight:800; color:#0f172a; }}
  .metric .k {{ font-size:12px; color:#64748b; }}
  table {{ width:100%; border-collapse:collapse; font-size:13px; }}
  th,td {{ text-align:left; padding:7px 10px; border-bottom:1px solid #eef2f7; }}
  th {{ color:#64748b; font-weight:600; }}
  .hl li {{ margin-bottom:8px; }}
  code {{ background:#f1f5f9; padding:2px 6px; border-radius:6px; font-size:12.5px; }}
  .src {{ font-size:12px; color:#16a34a; font-weight:600; }}
  footer {{ text-align:center; color:#94a3b8; font-size:12px; margin-top:10px; }}
</style></head>
<body><div class="wrap">

<header>
  <h1>🧭 区域智能划分系统</h1>
  <div class="sub">基于 WebGIS 的地理区域智能划分 · 销售/服务片区自动生成 · 简历作品集</div>
  <div class="chips">
    <span class="chip">React 18 + Vite</span><span class="chip">高德 JSAPI 2.0</span>
    <span class="chip">FastAPI</span><span class="chip">PostgreSQL + PostGIS 3.2</span>
    <span class="chip">numpy + shapely</span><span class="chip">容量约束聚类</span>
    <span class="chip">ST_VoronoiPolygons</span><span class="chip">行政区裁剪</span>
  </div>
</header>

<section>
  <h2>① 系统架构</h2>
  <svg class="arch" viewBox="0 0 880 300" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">
    <defs><marker id="ar" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
      <path d="M0,0 L7,3 L0,6 Z" fill="#94a3b8"/></marker></defs>
    <g font-size="13" text-anchor="middle">
      <rect x="330" y="14" width="220" height="46" rx="10" fill="#dbeafe" stroke="#3b82f6"/>
      <text x="440" y="34" font-weight="700">前端 React+Vite</text>
      <text x="440" y="51" font-size="11" fill="#475569">高德 JSAPI · 3D · 参数市场</text>

      <rect x="330" y="92" width="220" height="46" rx="10" fill="#dcfce7" stroke="#22c55e"/>
      <text x="440" y="112" font-weight="700">后端 FastAPI</text>
      <text x="440" y="129" font-size="11" fill="#475569">SQLAlchemy · Pydantic v2</text>

      <rect x="330" y="170" width="220" height="46" rx="10" fill="#fef9c3" stroke="#eab308"/>
      <text x="440" y="190" font-weight="700">算法层 numpy+shapely</text>
      <text x="440" y="207" font-size="11" fill="#475569">容量约束 Lloyd + move/swap</text>

      <rect x="330" y="248" width="220" height="42" rx="10" fill="#fae8ff" stroke="#d946ef"/>
      <text x="440" y="273" font-weight="700">PostGIS 13/3.2</text>

      <line x1="440" y1="60" x2="440" y2="92" stroke="#94a3b8" marker-end="url(#ar)"/>
      <line x1="440" y1="138" x2="440" y2="170" stroke="#94a3b8" marker-end="url(#ar)"/>
      <line x1="440" y1="216" x2="440" y2="248" stroke="#94a3b8" marker-end="url(#ar)"/>
      <text x="700" y="150" font-size="11" fill="#64748b">event ·</text>
      <text x="700" y="166" font-size="11" fill="#64748b">beijing_districts</text>
      <text x="700" y="182" font-size="11" fill="#64748b">plan · territory</text>
      <text x="160" y="150" font-size="11" fill="#64748b">分享链接</text>
      <text x="160" y="166" font-size="11" fill="#64748b">一键应用大图</text>
    </g>
  </svg>
</section>

<section>
  <h2>② 真实划分结果可视化</h2>
  <div class="src">数据来源：{divide['source']} · 数据库 4000 条事件 · 生产级边界 + 北京行政区裁剪</div>
  <div class="metrics">
    <div class="metric"><div class="v">{k}</div><div class="k">片区数 K</div></div>
    <div class="metric"><div class="v">{m['cv_weight']:.3f}</div><div class="k">业务量 CV（越均衡越好）</div></div>
    <div class="metric"><div class="v">{m['mean_radius_m']:.0f}m</div><div class="k">平均服务半径</div></div>
    <div class="metric"><div class="v">{m['capacity_violations']}</div><div class="k">容量越界次数</div></div>
    <div class="metric"><div class="v">{m['mean_compactness']:.2f}</div><div class="k">平均紧凑度</div></div>
  </div>
  <svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;background:#fbfdff;border-radius:10px">
    {svg_map}
  </svg>
  <table style="margin-top:14px">
    <thead><tr><th>片区</th><th>业务量权重</th><th>事件数</th><th>质心 (GCJ-02)</th></tr></thead>
    <tbody>{region_rows}</tbody>
  </table>
</section>

<section>
  <h2>③ 简历亮点</h2>
  <ul class="hl">
    <li><b>完整闭环</b>：数据生成 → 空间算法 → PostGIS 持久化 → 高德可视化 → 参数市场（调参/保存/对比/分享链接）→ 测试与文档。</li>
    <li><b>生产级几何</b>：片区边界由 PostGIS <code>ST_VoronoiPolygons</code> 生成，并 <code>ST_Intersection</code> 裁剪到真实北京行政区，而非简单外接框。</li>
    <li><b>容量约束聚类</b>：k-means++ 初始化 + 容量约束 Lloyd 迭代 + move/swap 局部搜索，目标函数兼顾服务半径、业务量均衡与形状紧凑度。</li>
    <li><b>工程化</b>：FastAPI + SQLAlchemy 2 + Pydantic v2；<code>pytest</code> 14 用例（含真实 PostGIS 集成测试）；无库时自动回退文件模式。</li>
    <li><b>可分享方案</b>：参数（K/λ/μ/seed/类型）编码进 URL，跨用户无需登录即可还原方案并一键应用到大图。</li>
  </ul>
</section>

<section>
  <h2>④ 本地运行</h2>
  <p style="font-size:13.5px;color:#475569;margin-top:0">
    后端 <code>cd api &amp;&amp; .venv/Scripts/python -m uvicorn app.main:app --port 8000</code> ·
    前端 <code>cd frontend &amp;&amp; npm run dev</code>（http://localhost:3000）。<br>
    灌库：<code>python -m scripts.seed</code> → <code>python -m scripts.load_beijing_districts</code>。<br>
    换真实行政区边界：把 DataV <code>110000_full.json</code> 存为 <code>data/beijing_districts.json</code> 后重跑上面第二条命令即可。
  </p>
</section>

<footer>本页为离线自包含作品集页面 · 数据来自本机运行实例的真实划分结果</footer>
</div></body></html>
"""
    OUT.write_text(html, encoding="utf-8")
    print(f"✅ 已生成 {OUT}（{OUT.stat().st_size} 字节，{k} 个片区）")


if __name__ == "__main__":
    build()
