import React from 'react'

/**
 * RegionChipList — 通用片区 / 标签清单组件
 * ----------------------------------------------------------------
 * 纯展示型组件：输入片区数组，渲染为彩色 chip 列表。
 * 颜色由 regionColor 统一生成（与地图多边形配色一致），保证地图与清单的
 * 视觉对应。可复用于任意「带 id / 颜色 / 文本」的标签墙场景。
 *
 * Props:
 *   regions : Array<{region_id, weight, point_count, ...}>
 *   k       : number — 片区总数（用于配色基）
 *   onClick : (region_id) => void  — 可选，点击 chip 联动地图高亮
 */
function regionColor(i, total) {
  const hue = Math.round((i * 360) / Math.max(total, 1))
  return `hsl(${hue}, 65%, 55%)`
}

export default function RegionChipList({ regions, k, onClick }) {
  if (!regions || !regions.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
      {regions.map(r => (
        <span
          key={r.region_id}
          onClick={onClick ? () => onClick(r.region_id) : undefined}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '.35rem',
            background: '#f5f6fa',
            padding: '.3rem .6rem',
            borderRadius: '6px',
            fontSize: '.8rem',
            cursor: onClick ? 'pointer' : 'default',
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: 3, background: regionColor(r.region_id, k), display: 'inline-block' }} />
          片区{r.region_id + 1} · {r.point_count}点 · 权重{r.weight}
        </span>
      ))}
    </div>
  )
}
