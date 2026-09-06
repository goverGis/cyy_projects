import React from 'react'

/**
 * RegionCardList — 片区卡片清单（全局 UI 风格基准）
 * ----------------------------------------------------------------
 * 设计语言：浅色纸感底 + 自然彩色（森林绿 / 天蓝 / 暖阳橙 / 薰衣紫 / 珊瑚红）。
 * 这张卡片的排版、圆角、左侧色带、hover 抬升、状态徽章，
 * 是整个项目其它卡片（统计卡 / 负载卡 / 指标卡 / 市场卡）的风格基准。
 *
 * 每张卡片表达 5 件事：
 *   1. 它是哪一类地物（图标 + 类型色）
 *   2. 编号与规模（点数 / 权重）
 *   3. 负载水平（进度条 + 百分比）
 *   4. 该不该管（状态徽章：均衡 / 接近饱和 / 建议拆分 / 可合并）
 *   5. 它在哪（中心点经纬度）
 *
 * Props:
 *   regions  : Array<{region_id, weight, point_count, poi_type?, load_ratio?,
 *                     capacity?, overload?, suggested_action?, type_breakdown?, centroid?}>
 *   onClick  : (region_id) => void  可选，点击卡片联动地图
 *   activeId : number               可选，当前高亮的片区
 *   compact  : boolean              可选，紧凑模式（隐藏经纬度与构成条）
 */

// —— 自然色系 POI 配色（与 index.css 的 --poi-* 变量保持一致） ——
export const POI_COLORS = {
  residential: '#4caf72', // 叶绿（小区/住宅）
  mall: '#e08a4b',        // 暖阳橙（商场）
  medical: '#e2604f',     // 珊瑚红（医疗）
  leisure: '#4a90d9',     // 天蓝（休闲）
  education: '#8b7fd6',   // 薰衣紫（教育）
}

export const POI_LABELS = {
  residential: '小区/住宅',
  mall: '商场',
  medical: '医疗',
  leisure: '休闲',
  education: '教育',
}

export const POI_ORDER = ['residential', 'mall', 'medical', 'leisure', 'education']

// 未带 POI 类型时的自然色轮（大地色，避免荧光感）
const NATURE_WHEEL = [
  '#4caf72', '#4a90d9', '#e08a4b', '#8b7fd6',
  '#3aa89b', '#d9a93a', '#e2604f', '#6aa84f',
]
export function regionColor(i) {
  return NATURE_WHEEL[Math.abs(i || 0) % NATURE_WHEEL.length]
}

// 业务事件类型配色（构成条用）
export const EVENT_COLORS = {
  secondhand: '#4a90d9',
  lostfound: '#e2604f',
  emergency: '#d9a93a',
  discussion: '#3aa89b',
}
export const EVENT_LABELS = {
  secondhand: '闲置',
  lostfound: '寻物',
  emergency: '急救',
  discussion: '讨论',
}

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 1 }))
const pctOf = (v) => `${Math.max(0, Math.min(100, Math.round((v || 0) * 100)))}%`

// 状态判定：容量模式看「负载率」；POI 语义模式没有容量，按权重分位数给密度档
function statusOf(r, ratio, hi, lo) {
  const hasCapacity = r.load_ratio != null || r.capacity != null
  if (hasCapacity) {
    if (r.overload || ratio > 1) return { cls: 'over', text: r.suggested_action || '建议拆分' }
    if (ratio > 0.85) return { cls: 'warn', text: '接近饱和' }
    if (ratio < 0.35) return { cls: 'low', text: '可合并' }
    return { cls: 'ok', text: '均衡' }
  }
  const w = r.weight || 0
  if (w >= hi) return { cls: 'warn', text: '高密度' }
  if (w <= lo) return { cls: 'low', text: '低密度' }
  return { cls: 'ok', text: '中密度' }
}

function TypeIcon({ type }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (type) {
    case 'residential':
      return <svg {...common}><path d="M4 11.5 12 5l8 6.5" /><path d="M6 11v8h12v-8" /></svg>
    case 'mall':
      return <svg {...common}><path d="M4 9h16v11H4z" /><path d="M4 9l2-4h12l2 4" /><path d="M9 20v-6h6v6" /></svg>
    case 'medical':
      return <svg {...common}><path d="M12 5v14" /><path d="M5 12h14" /></svg>
    case 'leisure':
      return <svg {...common}><circle cx="12" cy="9" r="5" /><path d="M12 14v6" /><path d="M9 20h6" /></svg>
    case 'education':
      return <svg {...common}><path d="M3 9l9-4 9 4-9 4z" /><path d="M7 11.5V16c0 1.4 2.2 2.4 5 2.4s5-1 5-2.4v-4.5" /></svg>
    default:
      return <svg {...common}><circle cx="12" cy="12" r="7" /></svg>
  }
}

export default function RegionCardList({ regions, onClick, activeId, compact = false }) {
  if (!regions || !regions.length) return null

  const maxWeight = Math.max(...regions.map((r) => r.weight || 0), 1)
  // 密度分档阈值：权重最高的 20% 记为高密度，最低的 40% 记为低密度
  const sortedW = regions.map((r) => r.weight || 0).sort((a, b) => a - b)
  const quantile = (p) => sortedW[Math.min(sortedW.length - 1, Math.max(0, Math.floor(sortedW.length * p)))]
  const hiT = quantile(0.8)
  const loT = quantile(0.4)

  return (
    <div className="region-grid">
      {regions.map((r, i) => {
        const type = r.poi_type
        const color = type ? POI_COLORS[type] || regionColor(i) : regionColor(r.region_id ?? i)
        // 状态：容量模式看负载率；POI 模式看权重分位（高/中/低密度）
        const ratio = r.load_ratio != null
          ? r.load_ratio
          : (r.capacity ? r.weight / r.capacity : r.weight / maxWeight)
        const st = statusOf(r, ratio, hiT, loT)
        const pct = Math.max(0, Math.min(100, Math.round((ratio || 0) * 100)))
        const pctLabel = (r.load_ratio != null || r.capacity != null) ? '负载' : '规模'
        const lng = r.centroid && r.centroid[0]
        const lat = r.centroid && r.centroid[1]
        const bd = r.type_breakdown || null
        const bdTotal = bd ? Object.values(bd).reduce((a, b) => a + (b || 0), 0) || 1 : 1

        return (
          <div
            key={r.region_id ?? i}
            className={`region-card${activeId != null && activeId === r.region_id ? ' is-active' : ''}`}
            style={{ '--c': color }}
            onClick={onClick ? () => onClick(r.region_id) : undefined}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
          >
            <div className="rc-top">
              <span className="rc-icon" style={{ color, background: `${color}1f`, border: `1px solid ${color}55` }}>
                <TypeIcon type={type} />
              </span>
              <span className="rc-title">
                {type ? `${POI_LABELS[type] || type} · ` : ''}片区 {(r.region_id ?? i) + 1}
              </span>
              <span className={`rc-badge ${st.cls}`}>{st.text}</span>
            </div>

            <div className="rc-stats">
              <span><b>{fmt(r.point_count)}</b> 点</span>
              <span><b>{fmt(r.weight)}</b> 权重</span>
              {r.capacity != null && <span className="rc-cap">容量 {fmt(r.capacity)}</span>}
            </div>

            <div className="rc-bar"><i style={{ width: pctOf(ratio) }} /></div>

            {!compact && (
              <div className="rc-foot">
                <span className="rc-ratio">{pctLabel} {pct}%</span>
                {lng != null && (
                  <span className="rc-coord">{Number(lng).toFixed(3)}°E {Number(lat).toFixed(3)}°N</span>
                )}
              </div>
            )}

            {!compact && bd && (
              <div className="rc-mix" title={Object.entries(bd).map(([k, v]) => `${EVENT_LABELS[k] || k} ${v}`).join(' · ')}>
                {Object.entries(bd).map(([k, v]) => (
                  <i key={k} style={{ width: `${((v || 0) / bdTotal) * 100}%`, background: EVENT_COLORS[k] || '#8a978a' }} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
