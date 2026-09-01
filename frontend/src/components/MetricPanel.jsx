import React from 'react'

/**
 * MetricPanel — 通用指标面板组件
 * ----------------------------------------------------------------
 * 与具体业务解耦：只认「一组带 label/value/hint 的指标」，由 props 驱动渲染。
 * 在区域划分页用于展示算法评估指标（CV / 半径 / 紧凑度 / 超容），
 * 也可复用于任何「数值指标 + 卡片」场景（如后台概览、监控面板）。
 *
 * Props:
 *   metrics : object            — 指标源对象
 *   schema  : Array<{key,label,hint,format,betterWhenLow}> — 展示编排
 *             betterWhenLow=true 时低于阈值显示绿色（如超容数=0）
 */
const DEFAULT_SCHEMA = [
  { key: 'n_regions', label: '实际片区数' },
  { key: 'cv_weight', label: '业务量变异系数 CV', hint: '↓ 越均衡越好' },
  { key: 'mean_radius_m', label: '平均服务半径', format: v => `${Math.round(v)}m`, hint: '↓ 越小越近' },
  { key: 'max_radius_m', label: '最大服务半径', format: v => `${Math.round(v)}m`, hint: '↓ 越小越近' },
  { key: 'mean_compactness', label: '平均紧凑度', hint: '↑ 越紧凑越好' },
  { key: 'capacity_violations', label: '超容片区', hint: '应为 0', betterWhenLow: true },
]

export default function MetricPanel({ metrics, schema = DEFAULT_SCHEMA }) {
  if (!metrics) return null
  return (
    <div className="stats-container">
      {schema.map(s => {
        const raw = metrics[s.key]
        const value = s.format ? s.format(raw) : raw
        const good = s.betterWhenLow && raw === 0
        return (
          <div className="stat-card" key={s.key}>
            <div className="value" style={good ? { color: '#2ed573' } : undefined}>{value}</div>
            <div className="label">{s.label}</div>
            {s.hint && <div className="hint">{s.hint}</div>}
          </div>
        )
      })}
    </div>
  )
}
