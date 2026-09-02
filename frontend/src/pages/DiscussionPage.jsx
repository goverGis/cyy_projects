import React, { useState, useEffect } from 'react'
import MiniMap from '../components/MiniMap'

const TOPIC_CATEGORIES = ['社区公告', '邻里互助', '活动组织', '问题反馈', '其他']

function DiscussionPage() {
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
    category: '',
    contact: ''
  })

  useEffect(() => {
    fetchItems()
  }, [])

  const fetchItems = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/items?type=discussion&status=active')
      const data = await res.json()
      setItems(data.items || data || [])
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
          type: 'discussion',
          ...formData
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
        category: '',
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
      category: item.category || '',
      contact: item.contact || ''
    })
    setSelectedLocation({ latitude: item.latitude, longitude: item.longitude })
    setShowModal(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这条讨论吗？')) return
    try {
      await fetch(`/api/items/${id}`, { method: 'DELETE' })
      fetchItems()
    } catch (error) {
      console.error('Failed to delete item:', error)
    }
  }

  const handleClose = async (item) => {
    try {
      await fetch(`/api/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' })
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
          <h2>💬 区域讨论</h2>
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
        <h2>💬 区域讨论</h2>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          ➕ 发起讨论
        </button>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <MiniMap 
          items={items}
          type="discussion"
          color="#2ed573"
          height="350px"
        />
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💬</div>
          <h3>暂无讨论</h3>
          <p>点击"发起讨论"发起区域话题讨论</p>
        </div>
      ) : (
        <div className="items-grid">
          {items.map(item => (
            <div key={item.id} className="item-card">
              <div className="item-card-content">
                {item.category && (
                  <span className="category" style={{ background: '#e8f5e9', color: '#2e7d32' }}>
                    🏷️ {item.category}
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
                  🕐 {new Date(item.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="actions">
                <button className="btn btn-secondary" onClick={() => handleEdit(item)}>
                  ✏️ 编辑
                </button>
                <button className="btn btn-primary" onClick={() => handleClose(item)}>
                  🔒 结束
                </button>
                <button className="btn btn-danger" onClick={() => handleDelete(item.id)}>
                  🗑️ 删除
                </button>
              </div>
            </div>
          ))}
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
              <h3>💬 {editingItem ? '编辑讨论' : '发起讨论'}</h3>
              <button className="modal-close" onClick={() => {
                setShowModal(false)
                setEditingItem(null)
                setSelectedLocation(null)
              }}>✕</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-row">
                <div className="form-group">
                  <label>🏷️ 分类</label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                  >
                    <option value="">请选择</option>
                    {TOPIC_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>📞 联系方式</label>
                  <input 
                    type="text"
                    value={formData.contact}
                    onChange={e => setFormData({...formData, contact: e.target.value})}
                    placeholder="手机号或微信"
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
                  placeholder="讨论主题"
                />
              </div>
              <div className="form-group">
                <label>📄 内容</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="详细描述讨论内容..."
                />
              </div>
              <div className="form-group">
                <label>📍 位置（点击地图选择）</label>
                <MiniMap 
                  items={items}
                  type="discussion"
                  color="#2ed573"
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

export default DiscussionPage
