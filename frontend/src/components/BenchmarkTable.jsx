import React from 'react'

/**
 * BenchmarkTable — 通用对比实验表格组件
 * ----------------------------------------------------------------
 * 与具体算法解耦：输入任意「方法行数组」，按约定的指标列渲染对比表。
 * 当前用于区域划分四方法（随机/网格/k-means/容量约束）对比；
 * 任意 A/B/C 实验结果的横向对比都能复用。
 *
 * Props:
 *   rows    : Array<{method, cv_weight, mean_radius_m, max_radius_m, mean_compactness, capacity_violations}>
 *   k       : number  — 当前片区数（仅用于表头展示）
 *   highlight: string — 需要高亮的方法名（如 'capacity-constrained'）
 */
const METHOD_LABELS = {
  'capacity-constrained': '容量约束（本方法）',
  'kmeans': '纯 k-means',
  'grid': '等距网格',
  'random': '随机划分',
}

const COLS = [
  { key: 'cv_weight', label: 'CV↓' },
  { key: 'mean_radius_m', label: '平均半径↓', fmt: v => Math.round(v) },
  { key: 'max_radius_m', label: '最大半径↓', fmt: v => Math.round(v) },
  { key: 'mean_compactness', label: '紧凑度↑' },
  { key: 'capacity_violations', label: '超容↓' },
  { key: 'score', label: '综合分↑' },
]

export default function BenchmarkTable({ rows, k, highlight = 'capacity-constrained' }) {
  if (!rows || !rows.length) return null
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
      <thead>
        <tr style={{ textAlign: 'left', borderBottom: '2px solid #eee' }}>
          <th style={{ padding: '.4rem' }}>方法</th>
          {COLS.map(c => <th key={c.key} style={{ padding: '.4rem' }}>{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const isRec = r.is_recommended
          return (
            <tr key={r.method} style={{ borderBottom: '1px solid #f0f0f0', background: isRec ? 'rgba(45,212,191,0.10)' : undefined }}>
              <td style={{ padding: '.4rem', fontWeight: 700 }}>
                {isRec && <span style={{ color: 'var(--accent-3)' }}>★ </span>}
                {METHOD_LABELS[r.method] || r.method}
                {r.rank != null && <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '.75rem' }}> · #{r.rank}</span>}
              </td>
              {COLS.map(c => {
                const v = r[c.key]
                if (v == null) return <td key={c.key} style={{ padding: '.4rem', color: 'var(--text-muted)' }}>—</td>
                const txt = c.fmt ? c.fmt(v) : v
                const ok = c.key === 'capacity_violations' && v === 0
                const best = c.key === 'score' && isRec
                return (
                  <td key={c.key} style={{ padding: '.4rem', color: ok ? '#2ed573' : best ? 'var(--primary)' : undefined, fontWeight: best ? 700 : 400 }}>
                    {txt}
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
