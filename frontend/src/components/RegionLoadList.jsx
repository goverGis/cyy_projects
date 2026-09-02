import React from 'react'

/**
 * RegionLoadList — 片区负载卡片（出彩改造 P0）
 * ----------------------------------------------------------------
 * 替代原纯 chip 列表，把每个片区"说得清"：
 *   - 容量进度条（负载率 = weight / capacity，绿→黄→红）
 *   - 异常预警徽标：OK / 拆分 / 新增服务点 / 合并
 *   - 类型构成明细（各类事件权重占比）
 */

const TYPE_COLORS = {
  secondhand: '#667eea',
  lostfound: '#ff4757',
  emergency: '#f44336',
  discussion: '#2ed573',
}

export default function RegionLoadList({ regions }) {
  if (!regions || !regions.length) return null
  return (
    <div className="load-list">
      {regions.map((r) => {
        const ratio = r.load_ratio || 0
        const pct = Math.min(100, Math.round(ratio * 100))
        const cls = r.overload ? 'over' : ratio < 0.5 ? 'low' : 'ok'
        return (
          <div key={r.region_id} className={`load-card ${cls}`}>
            <div className="lc-head">
              <span className="lc-name">片区 {r.region_id + 1}</span>
              <span className={`lc-badge ${cls}`}>{r.suggested_action || 'OK'}</span>
            </div>
            <div className="lc-weight">权重 {r.weight} · {r.point_count} 点</div>
            <div className="lc-bar">
              <div className={`lc-fill ${cls}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="lc-meta">
              负载率 {pct}% / 容量 {r.capacity}
              {r.overload && <span className="lc-warn"> ⚠ 超容</span>}
            </div>
            <div className="lc-types">
              {Object.entries(r.type_breakdown || {}).map(([t, v]) => (
                <span key={t} className="lc-type" style={{ borderColor: TYPE_COLORS[t] || '#888' }}>
                  {t} <b>{v}</b>
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
