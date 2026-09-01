import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import MetricPanel from '../components/MetricPanel'
import BenchmarkTable from '../components/BenchmarkTable'
import RegionChipList from '../components/RegionChipList'

const TYPE_COLORS = {
  secondhand: '#667eea',
  lostfound: '#ff4757',
  emergency: '#f44336',
  discussion: '#2ed573'
}

function regionColor(i, total) {
  const hue = Math.round((i * 360) / Math.max(total, 1))
  return `hsl(${hue}, 65%, 55%)`
}

// 抽稀阈值：视窗内点数超过该值 → 用聚合桶渲染（点抽稀），否则用明细点
const THIN_THRESHOLD = 400
// 低于该 zoom 强制抽稀（城市级俯视，单点无意义）
const THIN_ZOOM = 12

function TerritoryPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const regionLayerRef = useRef([])   // 片区多边形 + 标签
  const pointLayerRef = useRef([])    // 抽稀桶 / 明细点（与片区层分离，独立刷新）
  const resultRef = useRef(null)      // 最新划分结果（避免 zoomend 闭包拿到旧值）
  const refreshRef = useRef(null)     // 最新 refreshPointLayer

  const [params, setParams] = useState({ k: 10, lam: 2.0, typeFilter: [], usePgVoronoi: false })
  const [result, setResult] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [bench, setBench] = useState(null)
  const [loading, setLoading] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [thinMode, setThinMode] = useState(false)
  const [detailTotal, setDetailTotal] = useState(0)
  const [view3D, setView3D] = useState(false)
  const view3DRef = useRef(false)
  const [appliedName, setAppliedName] = useState(null)   // 来自参数市场的应用方案名

  // 渲染片区 Voronoi 多边形（与抽稀无关，始终全量）
  // is3D=true 时按业务量权重拉伸成 3D 柱体（高度=权重，直观看出哪片过载）
  const renderRegions = (data, is3D = false) => {
    const map = mapInstance.current
    if (!map) return
    const feats = data.geojson.features
    const maxW = Math.max(1, ...feats.map(f => f.properties.weight || 1))
    feats.forEach(f => {
      const ring = f.geometry.coordinates[0]
      const path = ring.map(([lng, lat]) => [lng, lat])
      const color = regionColor(f.properties.region_id, data.k)
      const w = f.properties.weight || 1
      // 3D 柱体高度：归一化到 [120, 3200] 米，权重越高柱体越高
      const height = is3D ? Math.max(120, Math.round((w / maxW) * 3200)) : 0
      const poly = new window.AMap.Polygon({
        path, strokeColor: color, strokeWeight: 2, strokeOpacity: 0.9,
        fillColor: color, fillOpacity: is3D ? 0.35 : 0.18,
        height, extrusion: is3D ? { color, opacity: 0.7 } : undefined
      })
      poly.setMap(map)
      regionLayerRef.current.push(poly)
      const [lng, lat] = f.properties.centroid
      const text = new window.AMap.Text({
        text: `片区${f.properties.region_id + 1}\n权重 ${f.properties.weight}`,
        position: [lng, lat], anchor: 'center',
        style: {
          background: 'rgba(255,255,255,0.85)', border: `1px solid ${color}`,
          'border-radius': '4px', padding: '2px 6px', 'font-size': '12px',
          color: '#333', 'white-space': 'pre'
        }
      })
      text.setMap(map)
      regionLayerRef.current.push(text)
    })
    try {
      map.setFitView(regionLayerRef.current.filter(o => o instanceof window.AMap.Polygon))
    } catch (_) {}
  }

  // 3D 负载视图开关：仅切换地图 pitch + 重渲片区层高度（不重建地图）
  const toggle3D = () => {
    const nv = !view3D
    setView3D(nv)
    view3DRef.current = nv
    const map = mapInstance.current
    if (map) map.setPitch(nv ? 55 : 0)
    regionLayerRef.current.forEach(o => o.setMap && o.setMap(null))
    regionLayerRef.current = []
    if (resultRef.current) renderRegions(resultRef.current, nv)
  }

  const clearPointLayer = () => {
    pointLayerRef.current.forEach(o => o.setMap && o.setMap(null))
    pointLayerRef.current = []
  }

  // 点层：按 zoom / 视窗点数决定 抽稀桶 还是 明细点（海量数据优化）
  const refreshPointLayer = async () => {
    const map = mapInstance.current
    if (!map || !resultRef.current) return
    const zoom = map.getZoom()
    const b = map.getBounds()
    const sw = b.getSouthWest(), ne = b.getNorthEast()
    const minlng = sw.getLng(), minlat = sw.getLat(), maxlng = ne.getLng(), maxlat = ne.getLat()

    const cnt = await (await fetch(`/api/items/aggregate?minlng=${minlng}&minlat=${minlat}&maxlng=${maxlng}&maxlat=${maxlat}&grid=64`)).json()
    const useThin = zoom < THIN_ZOOM || cnt.in_view > THIN_THRESHOLD
    setThinMode(useThin)
    clearPointLayer()

    if (useThin) {
      // 抽稀视图：聚合桶（DOM 标记数量级从数千降到几十）
      cnt.buckets.forEach(bk => {
        const r = 6 + Math.sqrt(bk.count) * 2.2
        const cm = new window.AMap.CircleMarker({
          center: [bk.cx, bk.cy], radius: r,
          strokeColor: '#3742fa', strokeOpacity: 0.9, strokeWeight: 1,
          fillColor: '#3742fa', fillOpacity: 0.45, bubble: true,
          extData: { count: bk.count, weight: bk.weight }
        })
        cm.setMap(map)
        cm.on('click', () => alert(`该区域聚合 ${bk.count} 个事件\n总权重 ${bk.weight}\n类型分布 ${JSON.stringify(bk.types)}`))
        pointLayerRef.current.push(cm)
      })
      setDetailTotal(cnt.in_view)
    } else {
      // 明细视图：按视窗 bbox 分页拉取原始事件点
      const PAGE = 500
      const data = await (await fetch(`/api/items?minlng=${minlng}&minlat=${minlat}&maxlng=${maxlng}&maxlat=${maxlat}&offset=0&limit=${PAGE}`)).json()
      setDetailTotal(data.total)
      ;(data.items || []).forEach(p => {
        const cm = new window.AMap.CircleMarker({
          center: [p.longitude, p.latitude], radius: 3,
          strokeColor: TYPE_COLORS[p.type] || '#888', strokeOpacity: 0.8, strokeWeight: 1,
          fillColor: TYPE_COLORS[p.type] || '#888', fillOpacity: 0.7, bubble: true
        })
        cm.setMap(map)
        pointLayerRef.current.push(cm)
      })
    }
  }
  refreshRef.current = refreshPointLayer

  useEffect(() => {
    if (!window.AMap || mapInstance.current) return
    const map = new window.AMap.Map(mapRef.current, {
      zoom: 11, center: [116.4074, 39.9042], viewMode: '3D', pitch: 0, mapStyle: 'amap://styles/normal'
    })
    mapInstance.current = map
    setMapReady(true)
    if (resultRef.current) renderRegions(resultRef.current, view3DRef.current)  // 应用方案可能先于地图就绪
    map.on('zoomend', () => refreshRef.current && refreshRef.current())
    return () => {
      regionLayerRef.current.forEach(o => o.setMap && o.setMap(null))
      pointLayerRef.current.forEach(o => o.setMap && o.setMap(null))
      regionLayerRef.current = []
      pointLayerRef.current = []
      if (mapInstance.current) { mapInstance.current.destroy(); mapInstance.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 从「分享链接 / 应用到大图」还原方案：URL 参数优先，localStorage 方案 id 回退
  const appliedRef = useRef(false)
  useEffect(() => {
    if (appliedRef.current) return
    appliedRef.current = true
    const k = searchParams.get('k')
    const lam = searchParams.get('lam')
    if (k && lam) {
      // 分享链接：直接拿 URL 里的参数还原，无需后端存储方案，故可跨用户分享
      const mu = searchParams.get('mu')
      const seed = searchParams.get('seed')
      const type = searchParams.get('type')
      const tf = type ? type.split(',').filter(Boolean) : []
      const p = {
        k: parseInt(k), lam: parseFloat(lam),
        mu: mu != null ? parseFloat(mu) : 0.1,
        seed: seed != null ? parseInt(seed) : 42,
        typeFilter: tf
      }
      setParams(p)
      setAppliedName(searchParams.get('name') || '分享方案')
      handleDivide(p)
      return
    }
    const sid = localStorage.getItem('applied_scheme_id')
    if (!sid) return
    ;(async () => {
      try {
        const res = await fetch(`/api/schemes/${sid}`)
        if (!res.ok) return
        const s = await res.json()
        setAppliedName(s.name)
        handleDivide({
          k: s.params.k, lam: s.params.lam, mu: s.params.mu, seed: s.params.seed,
          typeFilter: s.params.type_filter || []
        })
      } catch (e) { console.error('应用方案加载失败', e) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDivide = async (override) => {
    const p = override || params
    if (!override) {
      setAppliedName(null)   // 手动重跑即退出「查看方案」状态
      if (window.location.search) navigate('/cluster', { replace: true })  // 清理分享链接的 URL 参数
      localStorage.removeItem('applied_scheme_id')
    }
    setLoading(true)
    try {
      const res = await fetch('/api/territory/divide', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          k: p.k, lam: p.lam, mu: p.mu, seed: p.seed,
          type_filter: p.typeFilter.length ? p.typeFilter : undefined,
          use_pg_voronoi: p.usePgVoronoi || false
        })
      })
      const data = await res.json()
      resultRef.current = data
      setResult(data)
      setMetrics(data.metrics)
      // 清空旧图层：片区层 + 点层
      regionLayerRef.current.forEach(o => o.setMap && o.setMap(null))
      regionLayerRef.current = []
      clearPointLayer()
      renderRegions(data, view3DRef.current)
      await refreshPointLayer()
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
    } catch (e) { console.error(e) }
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

      {appliedName && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '1rem',
          background: 'linear-gradient(135deg,#eef2ff,#e0e7ff)', border: '1px solid #c7d2fe',
          borderRadius: '12px', padding: '.9rem 1.25rem', marginBottom: '1.5rem'
        }}>
          <span style={{ fontSize: '1.2rem' }}>🗺️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: '#3730a3' }}>正在大图查看方案：{appliedName}</div>
            <div style={{ fontSize: '.82rem', color: 'var(--text-secondary)' }}>
              该方案来自「参数市场」。调节上方 K / λ 后重新执行，或清除回到默认划分。
            </div>
          </div>
          <button className="btn btn-secondary" onClick={() => {
            localStorage.removeItem('applied_scheme_id')
            navigate('/cluster', { replace: true })
            setAppliedName(null)
            setParams({ k: 10, lam: 2.0, typeFilter: [] })
            handleDivide({ k: 10, lam: 2.0, mu: 0.1, seed: 42, typeFilter: [] })
          }}>清除应用</button>
        </div>
      )}

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
            <button className="btn btn-outline" onClick={toggle3D}>
              {view3D ? '⬇ 退出 3D 视图' : '🔲 3D 负载视图'}
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.85rem', marginLeft: 'auto' }}>
              <input type="checkbox" checked={params.usePgVoronoi}
                onChange={e => setParams({ ...params, usePgVoronoi: e.target.checked })} />
              🛰 PostGIS 边界 (ST_VoronoiPolygons)
            </label>
          </div>
      </div>

      {metrics && <MetricPanel metrics={metrics} />}

      {result && result.source && result.source.includes('pg_voronoi') && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '.4rem', marginTop: '.75rem',
          background: '#ecfdf5', border: '1px solid #6ee7b7', color: '#065f46',
          padding: '.4rem .8rem', borderRadius: 8, fontSize: '.82rem', fontWeight: 600
        }}>
          🛰 边界由 PostGIS ST_VoronoiPolygons 生成（生产级几何）
        </div>
      )}

      {bench && (
        <div className="cluster-results" style={{ marginBottom: '1.5rem' }}>
          <h3>对比实验（K={params.k}）</h3>
          <BenchmarkTable rows={bench} k={params.k} />
        </div>
      )}

      <div className="map-wrapper" style={{ position: 'relative' }}>
        <div className="map-container" ref={mapRef} style={{ height: '560px' }}></div>
        {!mapReady && <div className="map-loading"><div className="loading-spinner"></div><p>地图加载中…</p></div>}
        {result && (
          <div className="map-overlay-badge" style={{
            position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,.92)',
            padding: '.4rem .7rem', borderRadius: 6, fontSize: '.8rem', boxShadow: '0 1px 4px rgba(0,0,0,.15)'
          }}>
            地图点层：{thinMode ? '🔵 抽稀聚合视图' : `🔴 明细视图（视窗 ${detailTotal} 点，分页渲染）`}
            {view3D && <div style={{ marginTop: '.3rem', color: '#3742fa' }}>🧊 3D 柱体高度 = 业务量权重（越高=负载越重）</div>}
          </div>
        )}
      </div>

      {result && (
        <div className="cluster-results">
          <h3>片区清单（共 {result.regions.length} 个）</h3>
          <RegionChipList regions={result.regions} k={result.k} />
        </div>
      )}
    </div>
  )
}

export default TerritoryPage
