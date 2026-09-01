import React, { useEffect, useRef, useState } from 'react'

const TYPE_COLORS = {
  secondhand: '#667eea',
  lostfound: '#ff4757',
  emergency: '#f44336',
  discussion: '#2ed573'
}

// 片区配色：按 HSL 均匀取色，保证相邻片区易于区分
function regionColor(i, total) {
  const hue = Math.round((i * 360) / Math.max(total, 1))
  return `hsl(${hue}, 65%, 55%)`
}

function TerritoryPage() {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const overlaysRef = useRef([])
  const [params, setParams] = useState({ k: 10, lam: 2.0, typeFilter: [] })
  const [result, setResult] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [bench, setBench] = useState(null)
  const [loading, setLoading] = useState(false)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    if (!window.AMap || mapInstance.current) return
    const map = new window.AMap.Map(mapRef.current, {
      zoom: 11,
      center: [116.4074, 39.9042],
      viewMode: '2D',
      mapStyle: 'amap://styles/normal'
    })
    mapInstance.current = map
    setMapReady(true)
    return () => {
      overlaysRef.current.forEach(o => o.setMap && o.setMap(null))
      overlaysRef.current = []
      if (mapInstance.current) {
        mapInstance.current.destroy()
        mapInstance.current = null
      }
    }
  }, [])

  const clearOverlays = () => {
    overlaysRef.current.forEach(o => o.setMap && o.setMap(null))
    overlaysRef.current = []
  }

  const renderResult = (data) => {
    const map = mapInstance.current
    if (!map) return
    clearOverlays()

    // 1) 片区 Voronoi 多边形
    data.geojson.features.forEach(f => {
      const ring = f.geometry.coordinates[0]
      const path = ring.map(([lng, lat]) => [lng, lat])
      const color = regionColor(f.properties.region_id, data.k)
      const poly = new window.AMap.Polygon({
        path,
        strokeColor: color,
        strokeWeight: 2,
        strokeOpacity: 0.9,
        fillColor: color,
        fillOpacity: 0.18
      })
      poly.setMap(map)
      overlaysRef.current.push(poly)

      // 片区标签：编号 + 业务量权重
      const [lng, lat] = f.properties.centroid
      const text = new window.AMap.Text({
        text: `片区${f.properties.region_id + 1}\n权重 ${f.properties.weight}`,
        position: [lng, lat],
        anchor: 'center',
        style: {
          background: 'rgba(255,255,255,0.85)',
          border: `1px solid ${color}`,
          'border-radius': '4px',
          padding: '2px 6px',
          'font-size': '12px',
          color: '#333',
          'white-space': 'pre'
        }
      })
      text.setMap(map)
      overlaysRef.current.push(text)
    })

    // 2) 源事件点（按类型着色的小圆点）
    if (data.source_points && data.source_points.length) {
      data.source_points.forEach(p => {
        const cm = new window.AMap.CircleMarker({
          center: [p.longitude, p.latitude],
          radius: 3,
          strokeColor: TYPE_COLORS[p.type] || '#888',
          strokeOpacity: 0.8,
          strokeWeight: 1,
          fillColor: TYPE_COLORS[p.type] || '#888',
          fillOpacity: 0.7,
          bubble: true
        })
        cm.setMap(map)
        overlaysRef.current.push(cm)
      })
    }

    // 缩放到数据范围
    try {
      map.setFitView(overlaysRef.current.filter(o => o instanceof window.AMap.Polygon))
    } catch (_) {}
  }

  const handleDivide = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/territory/divide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          k: params.k,
          lam: params.lam,
          type_filter: params.typeFilter.length ? params.typeFilter : undefined
        })
      })
      const data = await res.json()
      // 拉取源点用于叠加显示
      const ptsRes = await fetch('/api/items?status=active')
      const pts = await ptsRes.json()
      data.source_points = pts
      setResult(data)
      setMetrics(data.metrics)
      renderResult(data)
    } catch (e) {
      console.error('划分失败', e)
      alert('划分失败，请确认后端（FastAPI :8000）已启动')
    } finally {
      setLoading(false)
    }
  }

  const handleBenchmark = async () => {
    try {
      const res = await fetch(`/api/territory/benchmark?k=${params.k}`)
      const data = await res.json()
      setBench(data.rows)
    } catch (e) {
      console.error(e)
    }
  }

  const toggleType = (t) => {
    setParams(prev => ({
      ...prev,
      typeFilter: prev.typeFilter.includes(t)
        ? prev.typeFilter.filter(x => x !== t)
        : [...prev.typeFilter, t]
    }))
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>🧭 区域智能划分</h2>
        <p style={{ color: '#666', marginTop: '.25rem' }}>
          容量约束聚类 · Voronoi 边界 · 业务量均衡（λ 为权衡参数）
        </p>
      </div>

      <div className="cluster-controls">
        <div className="control-row">
          <div className="form-group">
            <label>片区数 K</label>
            <input type="number" value={params.k}
              onChange={e => setParams({ ...params, k: Math.max(2, parseInt(e.target.value) || 2) })}
              min="2" max="50" />
          </div>
          <div className="form-group">
            <label>均衡权重 λ（{params.lam}）</label>
            <input type="range" min="0.5" max="5" step="0.5" value={params.lam}
              onChange={e => setParams({ ...params, lam: parseFloat(e.target.value) })} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>事件类型筛选</label>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.4rem' }}>
              {Object.entries(TYPE_COLORS).map(([t, c]) => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '.25rem', fontSize: '.85rem' }}>
                  <input type="checkbox" checked={params.typeFilter.includes(t)} onChange={() => toggleType(t)} />
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' }} />
                  {t}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="control-row" style={{ marginTop: '.75rem' }}>
          <button className="btn btn-primary" onClick={handleDivide} disabled={loading}>
            {loading ? '计算中…' : '▶ 执行划分'}
          </button>
          <button className="btn btn-outline" onClick={handleBenchmark}>
            📊 运行对比实验
          </button>
        </div>
      </div>

      {metrics && (
        <div className="stats-container">
          <div className="stat-card"><div className="value">{metrics.n_regions}</div><div className="label">实际片区数</div></div>
          <div className="stat-card"><div className="value">{metrics.cv_weight}</div><div className="label">业务量变异系数 CV↓</div></div>
          <div className="stat-card"><div className="value">{Math.round(metrics.mean_radius_m)}m</div><div className="label">平均服务半径↓</div></div>
          <div className="stat-card"><div className="value">{Math.round(metrics.max_radius_m)}m</div><div className="label">最大服务半径↓</div></div>
          <div className="stat-card"><div className="value">{metrics.mean_compactness}</div><div className="label">平均紧凑度↑</div></div>
          <div className="stat-card"><div className="value" style={{ color: metrics.capacity_violations === 0 ? '#2ed573' : '#ff4757' }}>{metrics.capacity_violations}</div><div className="label">超容片区（应为0）</div></div>
        </div>
      )}

      {bench && (
        <div className="cluster-results" style={{ marginBottom: '1.5rem' }}>
          <h3>对比实验（K={params.k}）</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #eee' }}>
                <th style={{ padding: '.4rem' }}>方法</th>
                <th style={{ padding: '.4rem' }}>CV↓</th>
                <th style={{ padding: '.4rem' }}>平均半径↓</th>
                <th style={{ padding: '.4rem' }}>最大半径↓</th>
                <th style={{ padding: '.4rem' }}>紧凑度↑</th>
                <th style={{ padding: '.4rem' }}>超容↓</th>
              </tr>
            </thead>
            <tbody>
              {bench.map(r => (
                <tr key={r.method} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '.4rem', fontWeight: r.method === 'capacity-constrained' ? 700 : 400 }}>
                    {r.method === 'capacity-constrained' ? '容量约束（本方法）' : r.method}
                  </td>
                  <td style={{ padding: '.4rem' }}>{r.cv_weight}</td>
                  <td style={{ padding: '.4rem' }}>{Math.round(r.mean_radius_m)}</td>
                  <td style={{ padding: '.4rem' }}>{Math.round(r.max_radius_m)}</td>
                  <td style={{ padding: '.4rem' }}>{r.mean_compactness}</td>
                  <td style={{ padding: '.4rem', color: r.capacity_violations === 0 ? '#2ed573' : '#ff4757' }}>{r.capacity_violations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="map-wrapper">
        <div className="map-container" ref={mapRef} style={{ height: '560px' }}></div>
        {!mapReady && <div className="map-loading"><div className="loading-spinner"></div><p>地图加载中…</p></div>}
      </div>

      {result && (
        <div className="cluster-results">
          <h3>片区清单（共 {result.regions.length} 个）</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
            {result.regions.map(r => (
              <span key={r.region_id}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', background: '#f5f6fa', padding: '.3rem .6rem', borderRadius: '6px', fontSize: '.8rem' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: regionColor(r.region_id, result.k), display: 'inline-block' }} />
                片区{r.region_id + 1} · {r.point_count}点 · 权重{r.weight}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default TerritoryPage
