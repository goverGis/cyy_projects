import React, { useState, useEffect } from 'react'

function ClusterPage() {
  const [stats, setStats] = useState(null)
  const [clusters, setClusters] = useState(null)
  const [loading, setLoading] = useState(false)
  const [params, setParams] = useState({
    epsilon: 0.5,
    minPoints: 2,
    type: ''
  })

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats')
      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  const handleCluster = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/cluster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          epsilon: params.epsilon / 111.32,
          minPoints: params.minPoints,
          type: params.type || undefined
        })
      })
      const data = await res.json()
      setClusters(data)
    } catch (error) {
      console.error('Failed to cluster:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>区域聚类分析</h2>
      </div>

      {stats && (
        <div className="stats-container">
          <div className="stat-card">
            <div className="value">{stats.total}</div>
            <div className="label">总记录数</div>
          </div>
          <div className="stat-card">
            <div className="value">{stats.secondhand}</div>
            <div className="label">闲置物品</div>
          </div>
          <div className="stat-card">
            <div className="value">{stats.lostfound}</div>
            <div className="label">寻物启事</div>
          </div>
          <div className="stat-card">
            <div className="value">{stats.emergency}</div>
            <div className="label">紧急医疗</div>
          </div>
          <div className="stat-card">
            <div className="value">{stats.discussion}</div>
            <div className="label">区域讨论</div>
          </div>
          <div className="stat-card">
            <div className="value">{stats.active}</div>
            <div className="label">活跃记录</div>
          </div>
        </div>
      )}

      <div className="cluster-controls">
        <h3>DBSCAN 聚类参数</h3>
        <div className="control-row">
          <div className="form-group">
            <label>邻域半径（米）</label>
            <input 
              type="number"
              value={params.epsilon}
              onChange={e => setParams({...params, epsilon: parseFloat(e.target.value)})}
              min="10"
              max="5000"
            />
          </div>
          <div className="form-group">
            <label>最小点数</label>
            <input 
              type="number"
              value={params.minPoints}
              onChange={e => setParams({...params, minPoints: parseInt(e.target.value)})}
              min="1"
              max="20"
            />
          </div>
          <div className="form-group">
            <label>数据类型</label>
            <select
              value={params.type}
              onChange={e => setParams({...params, type: e.target.value})}
            >
              <option value="">全部</option>
              <option value="secondhand">闲置物品</option>
              <option value="lostfound">寻物启事</option>
              <option value="emergency">紧急医疗</option>
              <option value="discussion">区域讨论</option>
            </select>
          </div>
          <button 
            className="btn btn-primary" 
            onClick={handleCluster}
            disabled={loading}
          >
            {loading ? '计算中...' : '执行聚类'}
          </button>
        </div>
      </div>

      {clusters && (
        <div className="cluster-results">
          <h3>聚类结果</h3>
          <p style={{ marginBottom: '1rem', color: '#666' }}>
            共发现 {clusters.clusterCount} 个聚类区域，{clusters.noiseCount} 个噪声点
          </p>
          
          {clusters.clusters.length > 0 && (
            <div>
              <h4 style={{ marginBottom: '1rem', color: '#333' }}>聚类区域</h4>
              {clusters.clusters.map((cluster, index) => {
                const centerLon = cluster.reduce((sum, p) => sum + p.coordinates[0], 0) / cluster.length
                const centerLat = cluster.reduce((sum, p) => sum + p.coordinates[1], 0) / cluster.length
                
                return (
                  <div key={index} className="cluster-item">
                    <h4>区域 {index + 1}</h4>
                    <p className="points-count">包含 {cluster.length} 个点</p>
                    <p style={{ fontSize: '0.85rem', color: '#666' }}>
                      中心位置: ({centerLat.toFixed(4)}, {centerLon.toFixed(4)})
                    </p>
                    <div style={{ marginTop: '0.5rem' }}>
                      {cluster.slice(0, 3).map((point, i) => (
                        <span 
                          key={i}
                          style={{ 
                            display: 'inline-block',
                            background: '#e8f4fd',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            marginRight: '0.5rem',
                            marginBottom: '0.5rem'
                          }}
                        >
                          {point.data?.title || `点${i + 1}`}
                        </span>
                      ))}
                      {cluster.length > 3 && (
                        <span style={{ color: '#666', fontSize: '0.8rem' }}>
                          +{cluster.length - 3} 更多
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {clusters.noise.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <h4 style={{ marginBottom: '1rem', color: '#333' }}>噪声点（孤立点）</h4>
              <div className="noise-item">
                <p className="points-count">{clusters.noise.length} 个孤立点</p>
                <div style={{ marginTop: '0.5rem' }}>
                  {clusters.noise.slice(0, 5).map((point, i) => (
                    <span 
                      key={i}
                      style={{ 
                        display: 'inline-block',
                        background: '#fff3cd',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        marginRight: '0.5rem',
                        marginBottom: '0.5rem'
                      }}
                    >
                      {point.data?.title || `点${i + 1}`}
                    </span>
                  ))}
                  {clusters.noise.length > 5 && (
                    <span style={{ color: '#666', fontSize: '0.8rem' }}>
                      +{clusters.noise.length - 5} 更多
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ClusterPage
