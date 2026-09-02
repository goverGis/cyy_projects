import React from 'react'

/**
 * BalanceReport — 均衡报告卡（出彩改造 P0）
 * ----------------------------------------------------------------
 * 把后端 DivideResponse.balance_report / recommendation 转成"人话"洞察：
 *   - 与「等距网格」朴素基线对比，量化不均衡度改善百分比
 *   - 过载片区数（红色预警）
 *   - 一句话结论 + 推荐算法理由
 */

export default function BalanceReport({ report, recommendation }) {
  if (!report) return null
  const pct = Math.round(report.improvement_pct * 100)
  const good = pct >= 0
  const baseLabel = report.baseline_method === 'grid' ? '等距网格' : '基线'
  return (
    <div className="balance-report">
      <div className="br-head">
        <span className="br-title">⚖️ 均衡报告</span>
        <span className={`br-badge ${good ? 'good' : 'warn'}`}>
          较{baseLabel} 不均衡度 {good ? '↓' : '↑'}{Math.abs(pct)}%
        </span>
      </div>
      <div className="br-grid">
        <div className="br-metric">
          <div className="v" style={good ? { color: 'var(--success)' } : { color: 'var(--danger)' }}>{Math.abs(pct)}%</div>
          <div className="l">不均衡度{good ? '改善' : '恶化'}</div>
        </div>
        <div className="br-metric">
          <div className="v" style={report.overload_count > 0 ? { color: 'var(--danger)' } : { color: 'var(--success)' }}>{report.overload_count}</div>
          <div className="l">过载片区</div>
        </div>
        <div className="br-metric">
          <div className="v">{report.current_cv}</div>
          <div className="l">当前 CV（变异系数）</div>
        </div>
      </div>
      <div className="br-verdict">{report.verdict}</div>
      {recommendation && (
        <div className="br-rec">
          <strong>★ 推荐算法：{recommendation.method}</strong>
          <span>{recommendation.reason}</span>
        </div>
      )}
    </div>
  )
}
