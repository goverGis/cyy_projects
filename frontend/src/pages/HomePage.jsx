import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * HomePage — Hero 着陆页（P1）
 * ----------------------------------------------------------------
 * 一屏讲清产品价值："让城市服务资源跟着真实需求走"。
 * 三个核心数字来自真实后端（/api/stats + /api/territory/divide）：
 *   - 事件样本总数
 *   - 目标片区数
 *   - 较等距网格的不均衡度改善百分比
 * CTA 引导到区域划分、算法对比、参数市场。
 */

export default function HomePage() {
  const [stats, setStats] = useState({ total: '—', regions: '—', improve: '—' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [s, d] = await Promise.all([
          fetch('/api/stats').then(r => r.json()),
          fetch('/api/territory/divide', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ k: 6, lam: 2, mu: 0.1, seed: 42 }),
          }).then(r => r.json()),
        ])
        if (cancelled) return
        setStats({
          total: typeof s.total === 'number' ? s.total.toLocaleString() : '—',
          regions: d.regions?.length ?? '—',
          improve: d.balance_report?.improvement_pct != null
            ? Math.round(d.balance_report.improvement_pct * 100)
            : '—',
        })
      } catch (e) {
        console.error('首页核心数字加载失败', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="home-page">
      <div className="hero-bg">
        <div className="hero-grid" />
        <svg className="hero-network" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#4caf72" stopOpacity=".45" />
              <stop offset="100%" stopColor="#4caf72" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="linkGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#4a90d9" stopOpacity=".3" />
              <stop offset="100%" stopColor="#4caf72" stopOpacity=".05" />
            </linearGradient>
          </defs>
          {/* 城市节点与连接线（示意性） */}
          <g stroke="url(#linkGrad)" strokeWidth="1" fill="none">
            <line x1="200" y1="420" x2="380" y2="260" />
            <line x1="380" y1="260" x2="520" y2="340" />
            <line x1="520" y1="340" x2="640" y2="200" />
            <line x1="640" y1="200" x2="820" y2="300" />
            <line x1="820" y1="300" x2="980" y2="220" />
            <line x1="520" y1="340" x2="780" y2="460" />
            <line x1="380" y1="260" x2="560" y2="150" />
            <line x1="200" y1="420" x2="300" y2="520" />
            <line x1="820" y1="300" x2="920" y2="420" />
          </g>
          <g fill="url(#nodeGlow)">
            <circle cx="200" cy="420" r="8" />
            <circle cx="380" cy="260" r="11" />
            <circle cx="520" cy="340" r="10" />
            <circle cx="640" cy="200" r="12" />
            <circle cx="820" cy="300" r="10" />
            <circle cx="980" cy="220" r="9" />
            <circle cx="300" cy="520" r="7" />
            <circle cx="780" cy="460" r="8" />
            <circle cx="920" cy="420" r="7" />
            <circle cx="560" cy="150" r="8" />
          </g>
          <g fill="#2f9e6b" fillOpacity=".85">
            <circle cx="200" cy="420" r="2.5" />
            <circle cx="380" cy="260" r="3" />
            <circle cx="520" cy="340" r="2.8" />
            <circle cx="640" cy="200" r="3.2" />
            <circle cx="820" cy="300" r="2.8" />
            <circle cx="980" cy="220" r="2.5" />
          </g>
        </svg>
      </div>

      <div className="hero-content">
        <div className="hero-badge">WebGIS Console · Territory Intelligence</div>
        <h1 className="hero-title">
          让城市服务资源<br />
          <span className="hero-accent">跟着真实需求走</span>
        </h1>
        <p className="hero-sub">
          基于真实事件密度（闲置 / 寻物 / 急救 / 讨论）做容量约束聚类，
          把城市自动划分成服务负载均衡的片区，让资源配置从"按面积"升级为"按需求"。
        </p>

        <div className={`hero-stats ${loading ? 'loading' : ''}`}>
          <div className="hero-card">
            <div className="hero-value">{stats.total}</div>
            <div className="hero-label">事件样本</div>
          </div>
          <div className="hero-card">
            <div className="hero-value">{stats.regions}</div>
            <div className="hero-label">目标片区</div>
          </div>
          <div className="hero-card">
            <div className="hero-value">{stats.improve}<span className="hero-unit">%</span></div>
            <div className="hero-label">较等距网格不均衡度改善</div>
          </div>
        </div>

        <div className="hero-actions">
          <Link className="btn btn-primary hero-cta" to="/cluster">▶ 开始划分</Link>
          <Link className="btn btn-outline hero-cta" to="/cluster">📊 看算法对比</Link>
          <Link className="btn btn-outline hero-cta" to="/developer">⚙ 参数市场</Link>
          <Link className="btn btn-ghost hero-cta" to="/map">🗺 直接看地图</Link>
        </div>
      </div>
    </div>
  )
}
