"""时间序列 /timeseries 接口集成测试（需数据库含 created_at 的事件）。

该端点要求事件带时间信息（仅 database 数据源支持），故整体按 DB 可用性跳过；
本地开发库（seed 4000 条、created_at 09-01~09-07）可直接跑通。

运行（在 api/ 目录，激活 .venv）：
    pytest -q tests/test_timeseries.py
"""

import pytest


def _db_available():
    try:
        from sqlalchemy import text

        from app.core.database import SessionLocal
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _db_available(), reason="未检测到可用的 PostGIS（设好 DATABASE_URL 后运行）")


@pytest.fixture(scope="module")
def series():
    from fastapi.testclient import TestClient

    from app.main import app
    client = TestClient(app)
    r = client.get("/api/territory/timeseries", params={"k": 10, "steps": 5})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "series" in body, "timeseries 应返回 {series: [...]}"
    return body["series"]


def test_timeseries_returns_steps(series):
    assert len(series) == 5


def test_timeseries_cumulative_growth(series):
    """时间窗是累积的：越到后面的窗口事件越多。"""
    counts = [s["count"] for s in series]
    assert counts == sorted(counts)
    assert counts[0] > 0 and counts[-1] >= counts[0]


def test_timeseries_each_step_has_results(series):
    for s in series:
        assert "t" in s and "k" in s and s["k"] == 10
        assert "metrics" in s and "cv_weight" in s["metrics"]
        assert s["geojson"]["type"] == "FeatureCollection"
        # 每个时间窗都产出片区
        assert s["metrics"]["n_regions"] > 0


def test_timeseries_balance_report_present(series):
    last = series[-1]
    assert "balance_report" in last
    assert "recommendation" in last
    assert last["balance_report"]["current_cv"] >= 0


def test_timeseries_with_type_filter():
    from fastapi.testclient import TestClient

    from app.main import app
    client = TestClient(app)
    r = client.get("/api/territory/timeseries", params={
        "k": 8, "steps": 3, "type_filter": "emergency",
    })
    assert r.status_code == 200
    body = r.json()
    assert len(body["series"]) == 3
    assert all(s["metrics"]["n_regions"] > 0 for s in body["series"])
