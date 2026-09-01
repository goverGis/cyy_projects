import React, { useState, useEffect } from 'react'

const PLUGIN_CATEGORIES = ['地图工具', '数据分析', '可视化', '位置服务', '其他']

function DeveloperPage() {
  const [plugins, setPlugins] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedPlugin, setSelectedPlugin] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    code: '',
    author: '',
    github: ''
  })

  useEffect(() => {
    fetchPlugins()
  }, [])

  const fetchPlugins = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/plugins')
      const data = await res.json()
      setPlugins(data)
    } catch (error) {
      console.error('Failed to fetch plugins:', error)
      setPlugins([
        {
          id: '1',
          name: '坐标转换工具',
          description: '支持WGS84、GCJ02、BD09坐标系互转',
          category: '位置服务',
          author: '开发者A',
          downloads: 156,
          rating: 4.8,
          code: `function coordTransform(lat, lon, from, to) {\n  // 坐标转换逻辑\n  return { lat, lon };\n}`
        },
        {
          id: '2',
          name: '热力图生成器',
          description: '基于位置数据生成热力图可视化',
          category: '可视化',
          author: '开发者B',
          downloads: 89,
          rating: 4.5,
          code: `function generateHeatmap(points) {\n  // 热力图生成逻辑\n  return heatmapData;\n}`
        },
        {
          id: '3',
          name: '路径规划插件',
          description: '基于OpenStreetMap的路径规划功能',
          category: '地图工具',
          author: '开发者C',
          downloads: 234,
          rating: 4.9,
          code: `function planRoute(start, end) {\n  // 路径规划逻辑\n  return route;\n}`
        }
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await fetch('/api/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      setShowModal(false)
      setFormData({
        name: '',
        description: '',
        category: '',
        code: '',
        author: '',
        github: ''
      })
      fetchPlugins()
    } catch (error) {
      console.error('Failed to save plugin:', error)
      const newPlugin = {
        id: Date.now().toString(),
        ...formData,
        downloads: 0,
        rating: 0
      }
      setPlugins([...plugins, newPlugin])
      setShowModal(false)
    }
  }

  const handleDownload = (plugin) => {
    const blob = new Blob([plugin.code], { type: 'text/javascript' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${plugin.name}.js`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code)
    alert('代码已复制到剪贴板')
  }

  if (loading) {
    return <div className="loading">加载中...</div>
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>开发者平台</h2>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          发布插件
        </button>
      </div>

      <div style={{ marginBottom: '2rem', padding: '1.5rem', background: 'white', borderRadius: '12px' }}>
        <h3 style={{ marginBottom: '1rem' }}>关于开发者平台</h3>
        <p style={{ color: '#666', lineHeight: 1.6 }}>
          开发者平台允许您上传和分享与区域属性相关的小功能插件。您可以发布地图工具、数据分析脚本、可视化组件等，
          与社区其他开发者共享您的创意和代码。
        </p>
      </div>

      {plugins.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
          暂无插件，点击"发布插件"添加您的第一个作品
        </div>
      ) : (
        <div className="items-grid">
          {plugins.map(plugin => (
            <div key={plugin.id} className="item-card">
              {plugin.category && (
                <span className="category" style={{ background: '#e3f2fd', color: '#1565c0' }}>
                  {plugin.category}
                </span>
              )}
              <h3>{plugin.name}</h3>
              <p className="description">{plugin.description}</p>
              <div style={{ display: 'flex', gap: '1rem', margin: '0.75rem 0', fontSize: '0.85rem', color: '#666' }}>
                <span>👤 {plugin.author}</span>
                <span>⬇️ {plugin.downloads} 次下载</span>
                <span>⭐ {plugin.rating}</span>
              </div>
              <div className="actions">
                <button className="btn btn-secondary" onClick={() => setSelectedPlugin(plugin)}>
                  查看代码
                </button>
                <button className="btn btn-primary" onClick={() => handleDownload(plugin)}>
                  下载
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <h3>发布新插件</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>插件名称 *</label>
                <input 
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  required
                  placeholder="插件名称"
                />
              </div>
              <div className="form-group">
                <label>描述 *</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  required
                  placeholder="插件功能描述"
                />
              </div>
              <div className="form-group">
                <label>分类</label>
                <select
                  value={formData.category}
                  onChange={e => setFormData({...formData, category: e.target.value})}
                >
                  <option value="">请选择</option>
                  {PLUGIN_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>作者</label>
                <input 
                  type="text"
                  value={formData.author}
                  onChange={e => setFormData({...formData, author: e.target.value})}
                  placeholder="您的名字"
                />
              </div>
              <div className="form-group">
                <label>GitHub地址</label>
                <input 
                  type="text"
                  value={formData.github}
                  onChange={e => setFormData({...formData, github: e.target.value})}
                  placeholder="https://github.com/..."
                />
              </div>
              <div className="form-group">
                <label>代码 *</label>
                <textarea
                  value={formData.code}
                  onChange={e => setFormData({...formData, code: e.target.value})}
                  required
                  placeholder="粘贴您的JavaScript代码..."
                  style={{ fontFamily: 'monospace', minHeight: '150px' }}
                />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  取消
                </button>
                <button type="submit" className="btn btn-primary">
                  发布
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedPlugin && (
        <div className="modal-overlay" onClick={() => setSelectedPlugin(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <h3>{selectedPlugin.name}</h3>
            <p style={{ color: '#666', marginBottom: '1rem' }}>{selectedPlugin.description}</p>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', fontSize: '0.9rem' }}>
              <span>👤 作者: {selectedPlugin.author}</span>
              <span>⬇️ {selectedPlugin.downloads} 次下载</span>
              <span>⭐ 评分: {selectedPlugin.rating}</span>
            </div>
            <div className="form-group">
              <label>代码</label>
              <pre style={{ 
                background: '#f5f5f5', 
                padding: '1rem', 
                borderRadius: '8px',
                overflow: 'auto',
                maxHeight: '300px',
                fontSize: '0.85rem'
              }}>
                {selectedPlugin.code}
              </pre>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setSelectedPlugin(null)}>
                关闭
              </button>
              <button className="btn btn-primary" onClick={() => handleCopyCode(selectedPlugin.code)}>
                复制代码
              </button>
              <button className="btn btn-primary" onClick={() => handleDownload(selectedPlugin)}>
                下载
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DeveloperPage
