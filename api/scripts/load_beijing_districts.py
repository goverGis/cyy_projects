"""将北京行政区边界灌入 PostGIS（生产级片区裁剪底图）。

数据源（任选其一）：
  1. api/data/beijing_districts.json —— DataV GeoAtlas 导出的真实行政区 GeoJSON
     （FeatureCollection，每个 feature 含 properties.adcode / properties.name / geometry）。
     推荐：https://geo.datav.aliyun.com/areas_v3/bound/110000_full.json
  2. 若文件缺失，则用北京 16 区【真实质心】做 Voronoi 镶嵌，程序化生成一份
     可 tessellate（不重叠、内部有区界）的近似边界，保证演示链路始终可跑。

坐标全链路 GCJ-02（高德体系），SRID 4326 仅占位，不做纠偏。

用法（在 api/ 目录下，激活 venv）：
  python -m scripts.load_beijing_districts            # 幂等：清空后重导
  python -m scripts.load_beijing_districts --force     # 强制重新生成近似边界
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import sqlalchemy
from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPoint, MultiPolygon, box, mapping, shape
from shapely.ops import voronoi_diagram

from app.core.database import Base, SessionLocal, engine
from app.models.beijing import BeijingDistrict

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "beijing_districts.json"
_SRID = 4326

# 北京 16 区真实质心（GCJ-02，来自高德）。用于「无真实边界数据时」生成近似镶嵌。
# 键为 adcode，值为 (名称, 经度, 纬度)。
_DISTRICT_CENTROIDS = {
    "110101": ("东城区", 116.418, 39.917),
    "110102": ("西城区", 116.366, 39.915),
    "110105": ("朝阳区", 116.486, 39.948),
    "110108": ("海淀区", 116.298, 39.959),
    "110106": ("丰台区", 116.287, 39.858),
    "110107": ("石景山区", 116.223, 39.906),
    "110109": ("门头沟区", 116.101, 39.937),
    "110111": ("房山区", 115.992, 39.735),
    "110112": ("通州区", 116.658, 39.902),
    "110113": ("顺义区", 116.653, 40.128),
    "110114": ("昌平区", 116.231, 40.221),
    "110115": ("大兴区", 116.341, 39.726),
    "110116": ("怀柔区", 116.637, 40.324),
    "110117": ("平谷区", 117.112, 40.141),
    "110118": ("密云区", 116.843, 40.377),
    "110119": ("延庆区", 115.985, 40.457),
}


def _generate_approx_districts():
    """用 16 区真实质心做 Voronoi 镶嵌，生成不重叠、内部有区界的近似边界。

    返回 FeatureCollection（与 DataV 结构一致）。
    """
    pts = [c for _, (_, *c) in _DISTRICT_CENTROIDS.items()]
    names = {k: v[0] for k, v in _DISTRICT_CENTROIDS.items()}
    mp = MultiPoint([(lng, lat) for lng, lat in pts])
    # 包裹北京的近似外接框（覆盖全部质心并留边）
    envelope = box(115.80, 39.55, 117.30, 40.62)
    diag = voronoi_diagram(mp, envelope=envelope, tolerance=1e-6)
    polys = list(diag.geoms)
    assert len(polys) == len(_DISTRICT_CENTROIDS), f"生成了 {len(polys)} 个片区，期望 {len(_DISTRICT_CENTROIDS)}"

    features = []
    for (adcode, (name, _, _)), poly in zip(_DISTRICT_CENTROIDS.items(), polys):
        features.append(
            {
                "type": "Feature",
                "properties": {"adcode": adcode, "name": name, "level": "district"},
                "geometry": mapping(poly),
            }
        )
    return {"type": "FeatureCollection", "features": features}


def _load_data():
    """返回 (features, source_desc)。优先读文件，缺失则程序化生成。"""
    if DATA.exists() and DATA.stat().st_size > 0:
        try:
            doc = json.loads(DATA.read_text(encoding="utf-8"))
            feats = doc.get("features") or []
            if feats:
                return feats, f"文件 {DATA.name}（{len(feats)} 个区）"
        except Exception as e:
            print(f"⚠️ 读取 {DATA} 失败，改用程序化生成：{e}")
    feats = _generate_approx_districts()["features"]
    DATA.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False), encoding="utf-8")
    return feats, f"程序化生成近似边界（{len(feats)} 个区）→ 已写入 {DATA.name}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="强制重新生成近似边界（忽略已有 json）")
    args = ap.parse_args()

    print("⏳ 连接数据库并建表（如已存在则跳过）…")
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print("❌ 无法连接 / 建表，请检查 DATABASE_URL 与 PostGIS：", e)
        sys.exit(1)

    features, src = _load_data() if not args.force else (
        _generate_approx_districts()["features"],
        "强制重新生成近似边界",
    )
    if args.force:
        DATA.write_text(
            json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False),
            encoding="utf-8",
        )

    print(f"⏳ 数据源：{src}")
    with SessionLocal() as db:
        print("🧹 清空 beijing_districts 表…")
        db.execute(sqlalchemy.text("TRUNCATE TABLE beijing_districts RESTART IDENTITY"))
        db.commit()

        count = 0
        for f in features:
            props = f.get("properties", {})
            adcode = str(props.get("adcode", ""))
            name = props.get("name", "") or ""
            geom = shape(f["geometry"])
            if geom.geom_type == "Polygon":
                geom = MultiPolygon([geom])
            db.add(
                BeijingDistrict(
                    adcode=adcode,
                    name=name,
                    geom=from_shape(geom, srid=_SRID),
                )
            )
            count += 1
        db.commit()
    print(f"✅ 导入完成，共 {count} 个北京行政区。")


if __name__ == "__main__":
    main()
