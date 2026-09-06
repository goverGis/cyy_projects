import React, { useEffect, useState } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import MapView from './components/MapView'
import HomePage from './pages/HomePage'
import SecondhandPage from './pages/SecondhandPage'
import LostFoundPage from './pages/LostFoundPage'
import EmergencyPage from './pages/EmergencyPage'
import DiscussionPage from './pages/DiscussionPage'
import DeveloperPage from './pages/DeveloperPage'
import TerritoryPage from './pages/TerritoryPage'

/* ---- 错误边界：子组件抛错时显示信息而不是黑屏 ---- */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem', color: 'var(--danger)', fontFamily: 'monospace', whiteSpace: 'pre-wrap',
          background: '#ffffff', border: '1px solid var(--danger)', borderRadius: 12, margin: '2rem'
        }}>
          <h2 style={{ marginBottom: '1rem' }}>页面渲染出错</h2>
            <div>{this.state.error?.toString?.() || '未知错误'}</div>
            <div style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>请打开浏览器控制台（F12 → Console）查看完整堆栈。</div>
        </div>
      )
    }
    return this.props.children
  }
}

/* ---- 导航图标（内联 SVG，描边随 currentColor） ---- */
const Icon = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5l9-7 9 7v9a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  map: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  ),
  box: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8l-9-5-9 5v8l9 5 9-5Z" /><path d="M3.3 7.5 12 12l8.7-4.5M12 12v8.5" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  medical: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-4-1L3 20l1.1-4A8.4 8.4 0 1 1 21 11.5Z" />
    </svg>
  ),
  sliders: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6" /><circle cx="9" cy="6" r="2.2" fill="#0d1c2f" />
      <line x1="4" y1="12" x2="20" y2="12" /><circle cx="15" cy="12" r="2.2" fill="#0d1c2f" />
      <line x1="4" y1="18" x2="20" y2="18" /><circle cx="7" cy="18" r="2.2" fill="#0d1c2f" />
    </svg>
  ),
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
}

const NAV = [
  { to: '/', label: '首页', icon: Icon.home },
  { to: '/map', label: '地图', icon: Icon.map },
  { to: '/secondhand', label: '闲置物品', icon: Icon.box },
  { to: '/lostfound', label: '寻物启事', icon: Icon.search },
  { to: '/emergency', label: '紧急医疗', icon: Icon.medical },
  { to: '/discussion', label: '区域讨论', icon: Icon.chat },
  { to: '/developer', label: '参数市场', icon: Icon.sliders },
  { to: '/cluster', label: '区域划分', icon: Icon.grid },
]

function App() {
  const [total, setTotal] = useState(null)
  const [clock, setClock] = useState('')

  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(d => {
      if (d && typeof d.total === 'number') setTotal(d.total)
    }).catch(() => {})
    const tick = () => {
      const d = new Date()
      const p = n => String(n).padStart(2, '0')
      setClock(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="app">
      <header className="header">
        <div className="header-bar">
          <div className="brand">
            <span className="brand-mark">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2f9e6b" strokeWidth="1.6">
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="1.5" x2="12" y2="22.5" stroke="#4a90d9" />
                <line x1="1.5" y1="12" x2="22.5" y2="12" stroke="#4a90d9" />
                <polygon points="12,3 14.5,12 12,12" fill="#2f9e6b" stroke="none" />
                <circle cx="12" cy="12" r="1.6" fill="#2f9e6b" stroke="none" />
              </svg>
            </span>
            <div className="brand-text">
              <span className="brand-name">GeoRegion</span>
              <span className="brand-sub">区域智能划分系统 · WebGIS Console</span>
            </div>
          </div>
          <div className="hud">
            <div className="hud-item"><span className="hud-dot" /> SYSTEM ONLINE</div>
            <div className="hud-item">DB <b>{total != null ? total.toLocaleString() : '—'}</b> 事件</div>
            <div className="hud-item hud-clock">{clock || '--:--:--'}</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map(item => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              {item.icon}
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="main">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/map" element={<MapView />} />
            <Route path="/secondhand" element={<SecondhandPage />} />
            <Route path="/lostfound" element={<LostFoundPage />} />
            <Route path="/emergency" element={<EmergencyPage />} />
            <Route path="/discussion" element={<DiscussionPage />} />
            <Route path="/developer" element={<DeveloperPage />} />
            <Route path="/cluster" element={<TerritoryPage />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  )
}

export default App
