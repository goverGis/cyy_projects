import React, { useState, useEffect } from 'react'
import MiniMap from '../components/MiniMap'

const SEVERITY_LEVELS = ['轻度', '中度', '重度', '紧急']
const SEVERITY_STYLES = {
  '轻度': { bg: '#e8f5e9', color: '#2e7d32' },
  '中度': { bg: '#fff3e0', color: '#ef6c00' },
  '重度': { bg: '#ffebee', color: '#c62828' },
  '紧急': { bg: '#f3e5f5', color: '#7b1fa2' }
}

function EmergencyPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    latitude: 39.9042,
    longitude: 116.4074,
    severity: '',
    contact: ''
  })

  useEffect(() => {
    fetchItems()
  }, [])

  const fetchItems = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/items?type=emergency&status=active')
      const data = await res.json()
      setItems(data)
    } catch (error) {
      console.error('Failed to fetch items:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLocationSelect = (location) => {
    setSelectedLocation(location)
    setFormData(prev => ({
      ...prev,
      latitude: location.latitude,
      longitude: location.longitude
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const url = editingItem 
        ? `/api/items/${editingItem.id}`
        : '/api/items'
      const method = editingItem ? 'PUT' : 'POST'
      
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'emergency',
          ...formData,
          category: formData.severity
        })
      })
      
      setShowModal(false)
      setEditingItem(null)
      setSelectedLocation(null)
      setFormData({
        title: '',
        description: '',
        latitude: 39.9042,
        longitude: 116.4074,
        severity: '',
        contact: ''
      })
      fetchItems()
    } catch (error) {
      console.error('Failed to save item:', error)
    }
  }

  const handleEdit = (item) => {
    setEditingItem(item)
    setFormData({
      title: item.title,
      description: item.description || '',
      latitude: item.latitude,
      longitude: item.longitude,
      severity: item.category || '',
      contact: item.contact || ''
    })
    setSelectedLocation({ latitude: item.latitude, longitude: item.longitude })
    setShowModal(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这条紧急信息吗？')) return
    try {
      await fetch(`/api/items/${id}`, { method: 'DELETE' })
      fetchItems()
    } catch (error) {
      console.error('Failed to delete item:', error)
    }
  }

  const handleResolve = async (item) => {
    try {
      await fetch(`/api/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' })
      })
      fetchItems()
    } catch (error) {
      console.error('Failed to update item:', error)
    }
  }

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h2>🚑 紧急医疗</h2>
        </div>
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>🚑 紧急医疗</h2>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          ➕ 发布求助
        </button>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <MiniMap 
          items={items}
          type="emergency"
          color="#f44336"
          height="350px"
        />
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🚑</div>
          <h3>暂无紧急医疗信息</h3>
          <p>点击"发布求助"发布紧急医疗信息</p>
        </div>
      ) : (
        <div className="items-grid">
          {items.map(item => {
            const severityStyle = SEVERITY_STYLES[item.category] || SEVERITY_STYLES['轻度']
            return (
              <div key={item.id} className="item-card" style={{ borderLeft: `5px solid ${severityStyle.color}` }}>
                <div className="item-card-content">
                  {item.category && (
                    <span className="category" style={{ background: severityStyle.bg, color: severityStyle.color }}>
                      🚨 {item.category}
                    </span>
                  )}
                  <h3>{item.title}</h3>
                  <p className="description">{item.description}</p>
                  <div className="meta">
                    <p className="location">
                      {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                    </p>
                    {item.contact && <p className="contact">{item.contact}</p>}
                  </div>
                  <p className="timestamp">
                    🕐 {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="actions">
                  <button className="btn btn-secondary" onClick={() => handleEdit(item)}>
                    ✏️ 编辑
                  </button>
                  <button className="btn btn-primary" onClick={() => handleResolve(item)}>
                    ✅ 已处理
                  </button>
                  <button className="btn btn-danger" onClick={() => handleDelete(item.id)}>
                    🗑️ 删除
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => {
          setShowModal(false)
          setEditingItem(null)
          setSelectedLocation(null)
        }}>
          <div className="modal modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🚑 {editingItem ? '编辑求助' : '发布紧急求助'}</h3>
              <button className="modal-close" onClick={() => {
                setShowModal(false)
                setEditingItem(null)
                setSelectedLocation(null)
              }}>✕</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-row">
                <div className="form-group">
                  <label>🚨 紧急程度</label>
                  <select
                    value={formData.severity}
                    onChange={e => setFormData({...formData, severity: e.target.value})}
                    required
                  >
                    <option value="">请选择</option>
                    {SEVERITY_LEVELS.map(level => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>📞 联系方式</label>
                  <input 
                    type="text"
                    value={formData.contact}
                    onChange={e => setFormData({...formData, contact: e.target.value})}
                    placeholder="手机号"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>📝 标题 *</label>
                <input 
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  required
                  placeholder="简要描述紧急情况"
                />
              </div>
              <div className="form-group">
                <label>📄 详细描述</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="详细描述病情或紧急情况..."
                />
              </div>
              <div className="form-group">
                <label>📍 位置（点击地图选择）</label>
                <MiniMap 
                  items={items}
                  type="emergency"
                  color="#f44336"
                  height="220px"
                  onLocationSelect={handleLocationSelect}
                  selectedLocation={selectedLocation}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>🛰️ 纬度</label>
                  <input 
                    type="number"
                    step="0.000001"
                    value={formData.latitude}
                    onChange={e => setFormData({...formData, latitude: parseFloat(e.target.value)})}
                  />
                </div>
                <div className="form-group">
                  <label>🛰️ 经度</label>
                  <input 
                    type="number"
                    step="0.000001"
                    value={formData.longitude}
                    onChange={e => setFormData({...formData, longitude: parseFloat(e.target.value)})}
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => {
                  setShowModal(false)
                  setEditingItem(null)
                  setSelectedLocation(null)
                }}>
                  取消
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingItem ? '✏️ 更新' : '➕ 发布'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default EmergencyPage
