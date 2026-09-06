import React from 'react'

import { regionColor, POI_COLORS, POI_LABELS } from './RegionCardList'

/**
 * RegionChipList — 轻量片区 chip 清单（紧凑场景用；默认清单一律用 RegionCardList）
 * ----------------------------------------------------------------
 * 纯展示型组件：输入片区数组，渲染为彩色 chip 列表。
 * 颜色复用 RegionCardList 的自然色（与地图多边形配色一致），保证地图与清单视觉对应。
 *
 * Props:
 *   regions : Array<{region_id, weight, point_count, ...}>
 *   onClick : (region_id) => void  — 可选，点击 chip 联动地图高亮
 */

export default function RegionChipList({ regions, onClick }) {
  if (!regions || !regions.length) return null
  return (
    <div className="region-chips">
      {regions.map((r, i) => {
        const c = r.poi_type ? (POI_COLORS[r.poi_type] || regionColor(i)) : regionColor(r.region_id ?? i)
        return (
          <span
            key={r.region_id ?? i}
            className="region-chip"
            style={{ '--c': c }}
            onClick={onClick ? () => onClick(r.region_id) : undefined}
          >
            <span className="rc-dot" />
            {r.poi_type ? `${POI_LABELS[r.poi_type] || r.poi_type} · ` : ''}
            片区{(r.region_id ?? i) + 1} · {r.point_count}点 · 权重{r.weight}
          </span>
        )
      })}
    </div>
  )
}
