import React, { useState, useEffect } from 'react'
import MiniMap from '../components/MiniMap'

const CATEGORIES = ['电子产品', '家具', '服装', '书籍', '运动器材', '宠物', '其他']

function SecondhandPage() {
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
    price: '',
    contact: ''
  })

  useEffect(() => {
    fetchItems()
  }, [])

  const fetchItems = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/items?type=secondhand&status=active')
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
          type: 'secondhand',
          ...formData,
          price: formData.price ? parseFloat(formData.price) : null
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
        price: '',
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
      price: item.price || '',
      contact: item.contact || ''
    })
    setSelectedLocation({ latitude: item.latitude, longitude: item.longitude })
    setShowModal(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这个物品吗？')) return
    try {
      await fetch(`/api/items/${id}`, { method: 'DELETE' })
      fetchItems()
    } catch (error) {
      console.error('Failed to delete item:', error)
    }
  }

  const handleMarkSold = async (item) => {
    try {
      await fetch(`/api/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sold' })
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
          <h2>📦 闲置物品信息</h2>
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
        <h2>📦 闲置物品信息</h2>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          ➕ 发布物品
        </button>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <MiniMap 
          items={items}
          type="secondhand"
          color="#667eea"
          height="350px"
        />
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <h3>暂无闲置物品</h3>
          <p>点击"发布物品"添加您的第一个闲置物品</p>
        </div>
      ) : (
        <div className="items-grid">
          {items.map(item => (
            <div key={item.id} className="item-card">
              <div className="item-card-content">
                {item.category && (
                  <span className="category">🏷️ {item.category}</span>
                )}
                <h3>{item.title}</h3>
                <p className="description">{item.description}</p>
                {item.price && (
                  <div className="price">
                    <span>¥</span>{item.price}
                  </div>
                )}
                <div className="meta">
                  <p className="location">
                    {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                  </p>
                  {item.contact && <p className="contact">{item.contact}</p>}
                </div>
              </div>
              <div className="actions">
                <button className="btn btn-secondary" onClick={() => handleEdit(item)}>
                  ✏️ 编辑
                </button>
                <button className="btn btn-primary" onClick={() => handleMarkSold(item)}>
                  ✅ 已出
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
              <h3>📦 {editingItem ? '编辑物品' : '发布闲置物品'}</h3>
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
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>💰 价格（元）</label>
                  <input 
                    type="number"
                    value={formData.price}
                    onChange={e => setFormData({...formData, price: e.target.value})}
                    placeholder="0"
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
                  placeholder="物品名称"
                />
              </div>
              <div className="form-group">
                <label>📄 描述</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="物品详情描述..."
                />
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
              <div className="form-group">
                <label>📍 位置（点击地图选择）</label>
                <MiniMap 
                  items={items}
                  type="secondhand"
                  color="#667eea"
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

export default SecondhandPage
