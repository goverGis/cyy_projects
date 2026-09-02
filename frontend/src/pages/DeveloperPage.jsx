import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MetricPanel from '../components/MetricPanel'
import RegionChipList from '../components/RegionChipList'

const TYPE_COLORS = {
  secondhand: '#667eea',
  lostfound: '#ff4757',
  emergency: '#f44336',
  discussion: '#2ed573'
}
const ALL_TYPES = ['secondhand', 'lostfound', 'emergency', 'discussion']

function regionColor(i, total) {
  const hue = Math.round((i * 360) / Math.max(total, 1))
  return `hsl(${hue}, 65%, 55%)`
}

// 把方案参数编码进 URL，生成「可分享链接」——无需后端存储、无需登录即可在大图还原
function buildShareUrl(s) {
  const qs = new URLSearchParams({
    k: s.params.k, lam: s.params.lam, mu: s.params.mu, seed: s.params.seed, name: s.name
  })
  if (s.params.type_filter?.length) qs.set('type', s.params.type_filter.join(','))
  return `${window.location.origin}/cluster?${qs.toString()}`
}

// 片区边界小地图预览（复用 TerritoryPage 的 Voronoi 渲染思路，但独立组件、可多实例）
function SchemePreviewMap({ geojson, height = '340px' }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const layerRef = useRef([])

  useEffect(() => {
    if (mapInstance.current || !window.AMap) return
    const map = new window.AMap.Map(mapRef.current, {
      zoom: 11, center: [116.4074, 39.9042], viewMode: '2D', mapStyle: 'amap://styles/dark'
    })
    mapInstance.current = map
    return () => { if (mapInstance.current) { mapInstance.current.destroy(); mapInstance.current = null } }
  }, [])

  useEffect(() => {
    const map = mapInstance.current
    if (!map) return
    layerRef.current.forEach(o => o.setMap && o.setMap(null))
    layerRef.current = []
    if (!geojson || !geojson.features || !geojson.features.length) return
    const feats = geojson.features
    const polys = []
    feats.forEach(f => {
      const ring = f.geometry.coordinates[0]
      const path = ring.map(([lng, lat]) => [lng, lat])
      const color = regionColor(f.properties.region_id, feats.length)
      const poly = new window.AMap.Polygon({
        path, strokeColor: color, strokeWeight: 1.5, strokeOpacity: 0.9,
        fillColor: color, fillOpacity: 0.25
      })
      poly.setMap(map)
      layerRef.current.push(poly)
      polys.push(poly)
    })
    if (polys.length) { try { map.setFitView(polys) } catch (_) {} }
  }, [geojson])

  return <div ref={mapRef} className="mini-map" style={{ height }} />
}

// 片区业务量负载分布条（横向）
function WeightBars({ weights, color = 'var(--primary)' }) {
  const max = Math.max(1, ...weights)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
      {weights.map((w, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', width: 28 }}>{i + 1}</span>
          <div style={{ flex: 1, height: 10, background: 'var(--background-secondary)', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{ width: `${(w / max) * 100}%`, height: '100%', background: color, borderRadius: 5 }} />
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', width: 44, textAlign: 'right' }}>{Math.round(w)}</span>
        </div>
      ))}
    </div>
  )
}

function metricRow(label, vals, betterLow = false) {
  // 在多个方案中高亮最优（CV/半径取最小，紧凑度取最大）
  const nums = vals.map(v => typeof v === 'number' ? v : parseFloat(v))
  const valid = nums.filter(v => !isNaN(v))
  if (!valid.length) return null
  const best = betterLow ? Math.min(...valid) : Math.max(...valid)
  return (
    <tr>
      <td style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</td>
      {vals.map((v, i) => {
        const isBest = typeof v === 'number' && !isNaN(v) && v === best && valid.length > 1
        return (
          <td key={i} style={{ textAlign: 'right', color: isBest ? 'var(--success)' : 'var(--text)', fontWeight: isBest ? 700 : 400 }}>
            {v}{isBest ? ' ★' : ''}
          </td>
        )
      })}
    </tr>
  )
}

function DeveloperPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('playground')

  // ---- 调试器状态 ----
  const [params, setParams] = useState({ k: 12, lam: 2.0, mu: 0.1, seed: 42, typeFilter: [], usePgVoronoi: false })
  const [run, setRun] = useState(null)            // /api/territory/divide 结果
  const [running, setRunning] = useState(false)
  const [showSave, setShowSave] = useState(false)
  const [saveForm, setSaveForm] = useState({ name: '', description: '', author: '', tags: '' })

  // ---- 市场状态 ----
  const [schemes, setSchemes] = useState([])
  const [marketLoading, setMarketLoading] = useState(false)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('created_at')
  const [order, setOrder] = useState('desc')
  const [preview, setPreview] = useState(null)     // 预览弹窗：{ scheme, geojson, loading }
  const [compareIds, setCompareIds] = useState([]) // 最多 3 个
  const [showCompare, setShowCompare] = useState(false)
  const [copiedId, setCopiedId] = useState(null)    // 复制分享链接后的瞬时反馈

  const fetchSchemes = async () => {
    setMarketLoading(true)
    try {
      const qs = new URLSearchParams({ sort, order })
      if (q) qs.set('q', q)
      const res = await fetch(`/api/schemes?${qs.toString()}`)
      setSchemes(await res.json())
    } catch (e) { console.error(e) } finally { setMarketLoading(false) }
  }

  useEffect(() => { if (tab === 'market') fetchSchemes() }, [tab, q, sort, order])

  const toggleType = (t) => setParams(prev => ({
    ...prev,
    typeFilter: prev.typeFilter.includes(t) ? prev.typeFilter.filter(x => x !== t) : [...prev.typeFilter, t]
  }))

  const handleDivide = async () => {
    setRunning(true)
    try {
      const res = await fetch('/api/territory/divide', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          k: params.k, lam: params.lam, mu: params.mu, seed: params.seed,
          type_filter: params.typeFilter.length ? params.typeFilter : undefined,
          use_pg_voronoi: params.usePgVoronoi || false
        })
      })
      if (!res.ok) throw new Error('divide failed')
      setRun(await res.json())
    } catch (e) {
      console.error(e)
      alert('划分失败，请确认后端（FastAPI :8000）已启动')
    } finally { setRunning(false) }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/schemes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveForm.name,
          description: saveForm.description,
          author: saveForm.author || '匿名开发者',
          tags: saveForm.tags.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean),
          params: {
            k: params.k, lam: params.lam, mu: params.mu, seed: params.seed,
            type_filter: params.typeFilter.length ? params.typeFilter : null
          }
        })
      })
      if (!res.ok) throw new Error('save failed')
      setShowSave(false)
      setSaveForm({ name: '', description: '', author: '', tags: '' })
      setTab('market')
    } catch (e) { console.error(e); alert('保存失败，请确认后端已启动') }
  }

  const loadToPlayground = (s) => {
    setParams({
      k: s.params.k, lam: s.params.lam, mu: s.params.mu, seed: s.params.seed,
      typeFilter: s.params.type_filter || []
    })
    setTab('playground')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 把方案一键应用到大地图（区域划分页）：把参数编码进 URL 跳转，链接本身即可分享
  const applyToMap = (s) => {
    const qs = new URLSearchParams({
      k: s.params.k, lam: s.params.lam, mu: s.params.mu, seed: s.params.seed, name: s.name
    })
    if (s.params.type_filter?.length) qs.set('type', s.params.type_filter.join(','))
    navigate(`/cluster?${qs.toString()}`)
  }

  // 复制可分享链接到剪贴板（带降级方案）
  const copyShareLink = async (s) => {
    const url = buildShareUrl(s)
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* noop */ }
      ta.remove()
    }
    setCopiedId(s.id)
    setTimeout(() => setCopiedId(prev => (prev === s.id ? null : prev)), 1500)
  }

  const openPreview = async (s) => {
    setPreview({ scheme: s, geojson: null, loading: true })
    try {
      const res = await fetch('/api/territory/divide', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          k: s.params.k, lam: s.params.lam, mu: s.params.mu, seed: s.params.seed,
          type_filter: s.params.type_filter || undefined
        })
      })
      const data = await res.json()
      setPreview({ scheme: s, geojson: data.geojson, loading: false })
    } catch (e) { setPreview({ scheme: s, geojson: null, loading: false }) }
  }

  const toggleCompare = (s) => {
    setCompareIds(prev => {
      if (prev.includes(s.id)) return prev.filter(x => x !== s.id)
      if (prev.length >= 3) { alert('最多对比 3 个方案'); return prev }
      return [...prev, s.id]
    })
  }

  const downloadScheme = (s) => {
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${s.name}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const compareSchemes = compareIds.map(id => schemes.find(s => s.id === id)).filter(Boolean)

  // ==================== 渲染 ====================
  return (
    <div className="page-container">
      <div className="page-header">
        <h2>🧪 算法参数市场</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '.25rem' }}>
          调参 → 预览 → 保存到市场 → 对比不同 (K, λ, μ) 划分方案的片区质量
        </p>
      </div>

      {/* Tab 切换 */}
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1.5rem' }}>
        {[
          { key: 'playground', label: '🎛 方案调试器' },
          { key: 'market', label: `🏪 方案市场 (${schemes.length})` }
        ].map(t => (
          <button key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '.6rem 1.2rem', borderRadius: '10px', cursor: 'pointer',
              border: '2px solid', fontSize: '.95rem', fontWeight: 600, transition: 'all .2s',
              borderColor: tab === t.key ? 'var(--primary)' : 'var(--border)',
              background: tab === t.key ? 'var(--primary)' : 'var(--surface)',
              color: tab === t.key ? '#fff' : 'var(--text)'
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ============ 调试器 ============ */}
      {tab === 'playground' && (
        <>
          <div className="cluster-controls">
            <div className="control-row">
              <div className="form-group">
                <label>片区数 K（{params.k}）</label>
                <input type="range" min="2" max="50" value={params.k}
                  onChange={e => setParams({ ...params, k: parseInt(e.target.value) })} />
              </div>
              <div className="form-group">
                <label>均衡权重 λ（{params.lam}）</label>
                <input type="range" min="0.5" max="5" step="0.5" value={params.lam}
                  onChange={e => setParams({ ...params, lam: parseFloat(e.target.value) })} />
              </div>
              <div className="form-group">
                <label>紧凑度 μ（{params.mu}）</label>
                <input type="range" min="0" max="0.5" step="0.05" value={params.mu}
                  onChange={e => setParams({ ...params, mu: parseFloat(e.target.value) })} />
              </div>
              <div className="form-group">
                <label>随机种子</label>
                <input type="number" value={params.seed}
                  onChange={e => setParams({ ...params, seed: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="control-row" style={{ marginTop: '.75rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>事件类型筛选</label>
                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.4rem' }}>
                  {ALL_TYPES.map(t => (
                    <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '.25rem', fontSize: '.85rem' }}>
                      <input type="checkbox" checked={params.typeFilter.includes(t)} onChange={() => toggleType(t)} />
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: TYPE_COLORS[t], display: 'inline-block' }} />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="control-row" style={{ marginTop: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.85rem' }}>
                <input type="checkbox" checked={params.usePgVoronoi}
                  onChange={e => setParams({ ...params, usePgVoronoi: e.target.checked })} />
                🛰 PostGIS 边界 (ST_VoronoiPolygons)
              </label>
              <button className="btn btn-primary" onClick={handleDivide} disabled={running}>
                {running ? '计算中…' : '▶ 运行划分'}
              </button>
              <button className="btn btn-outline" onClick={handleSave} disabled={!run}>
                💾 保存到市场
              </button>
            </div>
          </div>

          {!run && (
            <div className="empty-state">
              <div className="empty-state-icon">🎛️</div>
              <h3>调好参数，点击「运行划分」</h3>
              <p>算法会用容量约束 Lloyd + 局部搜索生成片区，并实时给出质量指标。</p>
            </div>
          )}

          {run && (
            <>
              <MetricPanel metrics={run.metrics} />
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <div className="cluster-results">
                  <h3>片区边界预览（Voronoi）</h3>
                  <SchemePreviewMap geojson={run.geojson} />
                </div>
                <div className="cluster-results">
                  <h3>片区业务量分布</h3>
                  <WeightBars weights={run.regions.map(r => r.weight)} />
                </div>
              </div>
              <div className="cluster-results">
                <h3>片区清单（共 {run.regions.length} 个）</h3>
                <RegionChipList regions={run.regions} k={run.k} />
              </div>
            </>
          )}
        </>
      )}

      {/* ============ 市场 ============ */}
      {tab === 'market' && (
        <>
          <div className="cluster-controls" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'end' }}>
            <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
              <label>🔍 搜索（名称 / 作者 / 描述）</label>
              <input placeholder="如：均衡、λ、急救…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label>排序</label>
              <select value={sort} onChange={e => setSort(e.target.value)}>
                <option value="created_at">最新发布</option>
                <option value="cv_weight">业务量最均衡 (CV↑)</option>
                <option value="mean_radius_m">服务半径最短</option>
                <option value="k">片区数 K</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 0, marginBottom: 0 }}>
              <label>顺序</label>
              <select value={order} onChange={e => setOrder(e.target.value)}>
                <option value="desc">降序</option>
                <option value="asc">升序</option>
              </select>
            </div>
          </div>

          {marketLoading && <div className="loading"><div className="loading-spinner"></div></div>}

          {!marketLoading && schemes.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">🏪</div>
              <h3>市场还没有方案</h3>
              <p>去「方案调试器」调一组参数，跑出结果后保存到这里分享。</p>
            </div>
          )}

          <div className="items-grid" style={{ marginTop: '1.5rem' }}>
            {schemes.map(s => {
              const inCompare = compareIds.includes(s.id)
              const m = s.metrics
              return (
                <div key={s.id} className="item-card">
                  <div className="item-card-content">
                    <div className="item-card-header">
                      <h3 style={{ fontSize: '1.05rem' }}>{s.name}</h3>
                      <span className="category">{s.author}</span>
                    </div>
                    {s.tags?.length > 0 && (
                      <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
                        {s.tags.map(t => <span key={t} style={{ fontSize: '.72rem', background: 'var(--background-secondary)', color: 'var(--text-secondary)', padding: '.15rem .5rem', borderRadius: 10 }}>{t}</span>)}
                      </div>
                    )}
                    <p className="description" style={{ fontSize: '.85rem' }}>{s.description || '—'}</p>
                    <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', fontSize: '.8rem', color: 'var(--text-secondary)', marginBottom: '.75rem' }}>
                      <span>K={s.params.k}</span>
                      <span>λ={s.params.lam}</span>
                      <span>μ={s.params.mu}</span>
                      <span>seed={s.params.seed}</span>
                      {s.params.type_filter?.length > 0 && <span>类型:{s.params.type_filter.join('/')}</span>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', fontSize: '.8rem', marginBottom: '.75rem' }}>
                      <div>CV <b style={{ color: 'var(--text)' }}>{m.cv_weight}</b></div>
                      <div>半径 <b style={{ color: 'var(--text)' }}>{Math.round(m.mean_radius_m)}m</b></div>
                      <div>紧凑度 <b style={{ color: 'var(--text)' }}>{m.mean_compactness}</b></div>
                      <div>超容 <b style={{ color: m.capacity_violations === 0 ? 'var(--success)' : 'var(--danger)' }}>{m.capacity_violations}</b></div>
                    </div>
                    <div className="actions" style={{ flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary" onClick={() => loadToPlayground(s)}>加载调试</button>
                      <button className="btn btn-secondary" onClick={() => openPreview(s)}>预览</button>
                      <button className="btn btn-secondary" onClick={() => downloadScheme(s)}>下载</button>
                      <button className="btn btn-outline" onClick={() => applyToMap(s)}>🗺 应用到大图</button>
                      <button className="btn btn-outline" onClick={() => copyShareLink(s)}>{copiedId === s.id ? '✓ 已复制' : '🔗 复制链接'}</button>
                      <button className={inCompare ? 'btn btn-primary' : 'btn btn-outline'}
                        onClick={() => toggleCompare(s)} style={{ flex: '1 1 100%' }}>
                        {inCompare ? '✓ 已加入对比' : '＋ 加入对比'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ============ 保存弹窗 ============ */}
      {showSave && (
        <div className="modal-overlay" onClick={() => setShowSave(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>💾 保存方案到市场</h3>
              <button className="modal-close" onClick={() => setShowSave(false)}>×</button></div>
            <form className="modal-form" onSubmit={handleSave}>
              <div className="form-group">
                <label>方案名称 *</label>
                <input value={saveForm.name} onChange={e => setSaveForm({ ...saveForm, name: e.target.value })} required placeholder="如：朝阳均衡方案 λ=2.5" />
              </div>
              <div className="form-group">
                <label>描述</label>
                <textarea value={saveForm.description} onChange={e => setSaveForm({ ...saveForm, description: e.target.value })} placeholder="这个参数组合适合什么场景？" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>作者</label>
                  <input value={saveForm.author} onChange={e => setSaveForm({ ...saveForm, author: e.target.value })} placeholder="你的名字" />
                </div>
                <div className="form-group">
                  <label>标签（逗号分隔）</label>
                  <input value={saveForm.tags} onChange={e => setSaveForm({ ...saveForm, tags: e.target.value })} placeholder="均衡, 推荐" />
                </div>
              </div>
              <div style={{ background: 'var(--background-secondary)', padding: '1rem', borderRadius: '8px', fontSize: '.85rem', color: 'var(--text-secondary)' }}>
                将保存参数 K={params.k} · λ={params.lam} · μ={params.mu} · seed={params.seed}
                {params.typeFilter.length ? ` · 类型 ${params.typeFilter.join('/')}` : ' · 全类型'}，
                后端会用算法复算质量指标后入库。
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowSave(false)}>取消</button>
                <button type="submit" className="btn btn-primary">保存并发布</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============ 预览弹窗 ============ */}
      {preview && (
        <div className="modal-overlay" onClick={() => setPreview(null)}>
          <div className="modal modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>👁 {preview.scheme.name}</h3>
              <button className="modal-close" onClick={() => setPreview(null)}>×</button></div>
            <div className="modal-form">
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', fontSize: '.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                <span>K={preview.scheme.params.k}</span>
                <span>λ={preview.scheme.params.lam}</span>
                <span>μ={preview.scheme.params.mu}</span>
                <span>seed={preview.scheme.params.seed}</span>
                <span>作者：{preview.scheme.author}</span>
              </div>
              {preview.loading && <div className="loading"><div className="loading-spinner"></div></div>}
              {!preview.loading && preview.geojson && <SchemePreviewMap geojson={preview.geojson} height="360px" />}
              {!preview.loading && !preview.geojson && <div className="empty-state"><p>预览失败，请确认后端已启动</p></div>}
              <div className="actions" style={{ marginTop: '1rem' }}>
                <button className="btn btn-primary" onClick={() => { loadToPlayground(preview.scheme); setPreview(null) }}>加载到调试器</button>
                <button className="btn btn-outline" onClick={() => { applyToMap(preview.scheme); setPreview(null) }}>🗺 应用到大图</button>
                <button className="btn btn-outline" onClick={() => copyShareLink(preview.scheme)}>🔗 复制链接</button>
                <button className="btn btn-secondary" onClick={() => downloadScheme(preview.scheme)}>下载 JSON</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ 对比弹窗 ============ */}
      {showCompare && compareSchemes.length >= 2 && (
        <div className="modal-overlay" onClick={() => setShowCompare(false)}>
          <div className="modal modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>📊 方案对比（{compareSchemes.length}）</h3>
              <button className="modal-close" onClick={() => setShowCompare(false)}>×</button></div>
            <div className="modal-form">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem', marginBottom: '1.5rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '.5rem' }}>指标</th>
                    {compareSchemes.map(s => <th key={s.id} style={{ textAlign: 'right', padding: '.5rem', color: 'var(--primary)' }}>{s.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {metricRow('片区数 K', compareSchemes.map(s => s.params.k))}
                  {metricRow('业务量变异系数 CV（↓）', compareSchemes.map(s => s.metrics.cv_weight), true)}
                  {metricRow('平均服务半径 (m)（↓）', compareSchemes.map(s => Math.round(s.metrics.mean_radius_m)), true)}
                  {metricRow('最大服务半径 (m)（↓）', compareSchemes.map(s => Math.round(s.metrics.max_radius_m)), true)}
                  {metricRow('平均紧凑度（↑）', compareSchemes.map(s => s.metrics.mean_compactness))}
                  {metricRow('超容片区数（↓）', compareSchemes.map(s => s.metrics.capacity_violations), true)}
                  {metricRow('总业务量', compareSchemes.map(s => Math.round(s.metrics.total_weight)))}
                </tbody>
              </table>
              <div style={{ display: 'grid', gridTemplateColumns: `120px repeat(${compareSchemes.length}, 1fr)`, gap: '1rem' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '.85rem', alignSelf: 'center' }}>片区负载分布</div>
                {compareSchemes.map((s, i) => (
                  <div key={s.id}>
                    <div style={{ fontSize: '.78rem', color: 'var(--text-secondary)', marginBottom: '.4rem' }}>{s.name}</div>
                    <WeightBars weights={s.region_weights} color={regionColor(i, compareSchemes.length)} />
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: '1.25rem' }}>
                ★ 标记为该指标下的最优方案。CV 越低越均衡、半径越短越近居民、紧凑度越高形状越规整。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ============ 对比浮动条 ============ */}
      {tab === 'market' && compareIds.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface)', boxShadow: 'var(--shadow-lg)', borderRadius: 12,
          padding: '.75rem 1rem', display: 'flex', gap: '.75rem', alignItems: 'center', zIndex: 500,
          border: '1px solid var(--border-light)'
        }}>
          <span style={{ fontSize: '.85rem', color: 'var(--text-secondary)' }}>已选 {compareIds.length}/3 对比：</span>
          {compareIds.map(id => {
            const s = schemes.find(x => x.id === id)
            return s ? <span key={id} style={{ fontSize: '.8rem', background: 'var(--background-secondary)', padding: '.2rem .55rem', borderRadius: 8 }}>{s.name}</span> : null
          })}
          <button className="btn btn-primary" disabled={compareIds.length < 2} onClick={() => setShowCompare(true)}>📊 对比</button>
          <button className="btn btn-secondary" onClick={() => setCompareIds([])}>清空</button>
        </div>
      )}
    </div>
  )
}

export default DeveloperPage
