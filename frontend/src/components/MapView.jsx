import React, { useEffect, useRef, useState } from 'react'

const COLORS = {
  secondhand: '#667eea',
  lostfound: '#ff4757',
  emergency: '#f44336',
  discussion: '#2ed573',
  cluster: '#ffc107'
}

const TYPE_NAMES = {
  secondhand: '闲置物品',
  lostfound: '寻物启事',
  emergency: '紧急医疗',
  discussion: '区域讨论'
}

function MapView() {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersRef = useRef([])
  const [items, setItems] = useState([])
  const [clusters, setClusters] = useState(null)
  const [showClusters, setShowClusters] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [currentLocation, setCurrentLocation] = useState(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [hud, setHud] = useState({ lat: 39.9042, lng: 116.4074, zoom: 12 })
  const [formData, setFormData] = useState({
    type: 'secondhand',
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
    initMap()

    return () => {
      // 高德地图实例不会随组件卸载自动回收，必须显式 destroy，
      // 否则路由切换后会残留 DOM 与定时器（MiniMap 已正确处理，此处补齐）
      markersRef.current = []
      if (mapInstance.current) {
        mapInstance.current.destroy()
        mapInstance.current = null
      }
    }
  }, [])

  const initMap = () => {
    if (!window.AMap) {
      console.error('高德地图API未加载')
      return
    }

    if (mapInstance.current) return

    const map = new window.AMap.Map(mapRef.current, {
      zoom: 12,
      center: [116.4074, 39.9042],
      viewMode: '2D',
      mapStyle: 'amap://styles/dark'
    })

    map.on('click', (e) => {
      setFormData(prev => ({
        ...prev,
        longitude: parseFloat(e.lnglat.getLng().toFixed(6)),
        latitude: parseFloat(e.lnglat.getLat().toFixed(6))
      }))
    })

    window.AMap.plugin('AMap.Geolocation', () => {
      const geolocation = new window.AMap.Geolocation({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      })

      geolocation.getCurrentPosition((status, result) => {
        if (status === 'complete') {
          const { lng, lat } = result.position
          setCurrentLocation({
            longitude: lng,
            latitude: lat
          })
          map.setCenter([lng, lat])
          map.setZoom(14)
          
          const marker = new window.AMap.Marker({
            position: [lng, lat],
            icon: new window.AMap.Icon({
              size: new window.AMap.Size(32, 32),
              image: 'data:image/svg+xml,' + encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#2196f3" width="32" height="32">
                  <circle cx="12" cy="12" r="10" fill="rgba(33,150,243,0.3)" stroke="#2196f3" stroke-width="3"/>
                </svg>
              `),
              imageSize: new window.AMap.Size(32, 32)
            }),
            offset: new window.AMap.Pixel(-16, -16)
          })
          marker.setMap(map)
        }
      })
    })

    mapInstance.current = map
    setMapLoaded(true)
    const updateHud = () => {
      const c = map.getCenter()
      setHud({ lat: c.getLat(), lng: c.getLng(), zoom: map.getZoom() })
    }
    map.on('move', updateHud)
    map.on('zoomend', updateHud)
    updateHud()
  }

  useEffect(() => {
    if (!mapInstance.current || !window.AMap) return

    markersRef.current.forEach(marker => marker.setMap(null))
    markersRef.current = []

    items.forEach(item => {
      const marker = new window.AMap.Marker({
        position: [item.longitude, item.latitude],
        icon: new window.AMap.Icon({
          size: new window.AMap.Size(28, 28),
          image: 'data:image/svg+xml,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28">
              <circle cx="12" cy="12" r="10" fill="${COLORS[item.type] || '#667eea'}" stroke="#fff" stroke-width="3"/>
            </svg>
          `),
          imageSize: new window.AMap.Size(28, 28)
        }),
        offset: new window.AMap.Pixel(-14, -14),
        title: item.title,
        extData: item
      })
      
      marker.on('click', () => {
        setFormData({
          type: item.type,
          title: item.title,
          description: item.description || '',
          latitude: item.latitude,
          longitude: item.longitude,
          category: item.category || '',
          price: item.price || '',
          contact: item.contact || ''
        })
      })
      
      marker.setMap(mapInstance.current)
      markersRef.current.push(marker)
    })
  }, [items])

  const fetchItems = async () => {
    try {
      const res = await fetch('/api/items?status=active')
      const data = await res.json()
      setItems(data.items || data || [])
    } catch (error) {
      console.error('Failed to fetch items:', error)
    }
  }

  const fetchClusters = async () => {
    try {
      const res = await fetch('/api/cluster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epsilon: 0.01, minPoints: 2 })
      })
      const data = await res.json()
      setClusters(data)
    } catch (error) {
      console.error('Failed to fetch clusters:', error)
    }
  }

  const handleLocate = () => {
    if (currentLocation && mapInstance.current) {
      mapInstance.current.setCenter([currentLocation.longitude, currentLocation.latitude])
      mapInstance.current.setZoom(15)
    } else {
      alert('正在获取位置信息，请稍候...')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          price: formData.price ? parseFloat(formData.price) : null
        })
      })
      setShowModal(false)
      setFormData({
        type: 'secondhand',
        title: '',
        description: '',
        latitude: currentLocation?.latitude || 39.9042,
        longitude: currentLocation?.longitude || 116.4074,
        category: '',
        price: '',
        contact: ''
      })
      fetchItems()
    } catch (error) {
      console.error('Failed to create item:', error)
    }
  }

  return (
    <div className="map-page">
      <div className="map-header">
        <div className="map-title">
          <h2>🗺️ 地图视图</h2>
          <p className="map-subtitle">探索您周边的位置信息</p>
        </div>
        <div className="map-actions">
          <button className="btn btn-outline" onClick={handleLocate}>
            📍 我的位置
          </button>
          <button 
            className="btn btn-outline"
            onClick={() => {
              setShowClusters(!showClusters)
              if (!showClusters && !clusters) fetchClusters()
            }}
          >
            {showClusters ? '📊 隐藏聚类' : '📊 显示聚类'}
          </button>
          <button className="btn btn-primary" onClick={() => {
            if (currentLocation) {
              setFormData(prev => ({
                ...prev,
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude
              }))
            }
            setShowModal(true)
          }}>
            ➕ 添加标记
          </button>
        </div>
      </div>
      
      <div className="map-wrapper" style={{ position: 'relative' }}>
        <div className="map-container" ref={mapRef}></div>
        {!mapLoaded && (
          <div className="map-loading">
            <div className="loading-spinner"></div>
            <p>地图加载中...</p>
          </div>
        )}

        <div className="gis-frame">
          <span className="gis-corner tl" /><span className="gis-corner tr" />
          <span className="gis-corner bl" /><span className="gis-corner br" />
        </div>
        <div className="reticle"><span className="reticle-dot" /></div>
        <div className="hud-coord">
          <div><span className="k">LAT&nbsp;</span><span className="v">{hud.lat.toFixed(4)}</span></div>
          <div><span className="k">LNG&nbsp;</span><span className="v">{hud.lng.toFixed(4)}</span></div>
          <div><span className="k">ZOOM</span><span className="v">&nbsp;{hud.zoom.toFixed(1)}</span></div>
        </div>
      </div>
      
      <div className="map-legend">
        <div className="legend-title">图例说明</div>
        <div className="legend-items">
          {Object.entries(COLORS).filter(([key]) => key !== 'cluster').map(([key, color]) => (
            <div key={key} className="legend-item">
              <span className="legend-dot" style={{ background: color }}></span>
              <span className="legend-label">{TYPE_NAMES[key]}</span>
            </div>
          ))}
          {currentLocation && (
            <div className="legend-item">
              <span className="legend-dot legend-current"></span>
              <span className="legend-label">当前位置</span>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📍 添加新标记</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-row">
                <div className="form-group">
                  <label>类型</label>
                  <select 
                    value={formData.type}
                    onChange={e => setFormData({...formData, type: e.target.value, category: ''})}
                  >
                    <option value="secondhand">📦 闲置物品</option>
                    <option value="lostfound">🔍 寻物启事</option>
                    <option value="emergency">🚑 紧急医疗</option>
                    <option value="discussion">💬 区域讨论</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>标题 *</label>
                  <input 
                    type="text"
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                    required
                    placeholder="请输入标题"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>描述</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="详细描述..."
                  rows={3}
                />
              </div>
              <div className="form-row">
                {formData.type === 'secondhand' && (
                  <div className="form-group">
                    <label>价格（元）</label>
                    <input 
                      type="number"
                      value={formData.price}
                      onChange={e => setFormData({...formData, price: e.target.value})}
                      placeholder="0"
                    />
                  </div>
                )}
                {formData.type === 'emergency' && (
                  <div className="form-group">
                    <label>紧急程度</label>
                    <select 
                      value={formData.category}
                      onChange={e => setFormData({...formData, category: e.target.value})}
                    >
                      <option value="">请选择</option>
                      <option value="轻度">🟢 轻度</option>
                      <option value="中度">🟡 中度</option>
                      <option value="重度">🟠 重度</option>
                      <option value="紧急">🔴 紧急</option>
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label>联系方式</label>
                  <input 
                    type="text"
                    value={formData.contact}
                    onChange={e => setFormData({...formData, contact: e.target.value})}
                    placeholder="手机号或微信"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>纬度</label>
                  <input 
                    type="number"
                    step="0.000001"
                    value={formData.latitude}
                    onChange={e => setFormData({...formData, latitude: parseFloat(e.target.value)})}
                  />
                </div>
                <div className="form-group">
                  <label>经度</label>
                  <input 
                    type="number"
                    step="0.000001"
                    value={formData.longitude}
                    onChange={e => setFormData({...formData, longitude: parseFloat(e.target.value)})}
                  />
                </div>
              </div>
              <div className="form-tip">
                💡 提示：点击地图可自动填充坐标
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  取消
                </button>
                <button type="submit" className="btn btn-primary">
                  ✓ 提交
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default MapView
