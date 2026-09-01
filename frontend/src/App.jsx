import React from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import MapView from './components/MapView'
import SecondhandPage from './pages/SecondhandPage'
import LostFoundPage from './pages/LostFoundPage'
import EmergencyPage from './pages/EmergencyPage'
import DiscussionPage from './pages/DiscussionPage'
import DeveloperPage from './pages/DeveloperPage'
import ClusterPage from './pages/ClusterPage'

function App() {
  return (
    <div className="app">
      <header className="header">
        <h1>区域智能分类APP</h1>
        <nav className="nav">
          <NavLink to="/" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            地图
          </NavLink>
          <NavLink to="/secondhand" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            闲置物品
          </NavLink>
          <NavLink to="/lostfound" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            寻物启事
          </NavLink>
          <NavLink to="/emergency" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            紧急医疗
          </NavLink>
          <NavLink to="/discussion" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            区域讨论
          </NavLink>
          <NavLink to="/developer" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            开发者平台
          </NavLink>
          <NavLink to="/cluster" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            区域聚类
          </NavLink>
        </nav>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<MapView />} />
          <Route path="/secondhand" element={<SecondhandPage />} />
          <Route path="/lostfound" element={<LostFoundPage />} />
          <Route path="/emergency" element={<EmergencyPage />} />
          <Route path="/discussion" element={<DiscussionPage />} />
          <Route path="/developer" element={<DeveloperPage />} />
          <Route path="/cluster" element={<ClusterPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
