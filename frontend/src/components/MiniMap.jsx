import React, { useEffect, useRef, useState } from 'react'

function MiniMap({ 
  items = [], 
  type, 
  color = '#667eea',
  onLocationSelect,
  selectedLocation,
  height = '300px',
  showCurrentLocation = true
}) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersRef = useRef([])
  const [currentLocation, setCurrentLocation] = useState(null)

  useEffect(() => {
    if (mapInstance.current || !window.AMap) return

    const map = new window.AMap.Map(mapRef.current, {
      zoom: 12,
      center: [116.4074, 39.9042],
      mapStyle: 'amap://styles/normal'
    })

    map.on('click', (e) => {
      const { lng, lat } = e.lnglat
      if (onLocationSelect) {
        onLocationSelect({
          latitude: parseFloat(lat.toFixed(6)),
          longitude: parseFloat(lng.toFixed(6))
        })
      }
    })

    if (showCurrentLocation) {
      window.AMap.plugin('AMap.Geolocation', () => {
        const geolocation = new window.AMap.Geolocation({
          enableHighAccuracy: true,
          timeout: 10000,
          showButton: false,
          showMarker: false
        })
        
        geolocation.getCurrentPosition((status, result) => {
          if (status === 'complete') {
            const { lng, lat } = result.position
            setCurrentLocation({
              longitude: lng,
              latitude: lat
            })
            map.setCenter([lng, lat])
            map.setZoom(13)
          }
        })
        
        map.addControl(geolocation)
      })
    }

    mapInstance.current = map

    return () => {
      if (mapInstance.current) {
        mapInstance.current.destroy()
        mapInstance.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!mapInstance.current) return

    markersRef.current.forEach(marker => marker.setMap(null))
    markersRef.current = []

    const filteredItems = type ? items.filter(item => item.type === type) : items
    
    filteredItems.forEach(item => {
      const marker = new window.AMap.Marker({
        position: [item.longitude, item.latitude],
        icon: new window.AMap.Icon({
          size: new window.AMap.Size(24, 24),
          image: 'data:image/svg+xml,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
              <circle cx="12" cy="12" r="8" fill="${color}" stroke="#fff" stroke-width="2"/>
            </svg>
          `),
          imageSize: new window.AMap.Size(24, 24)
        }),
        offset: new window.AMap.Pixel(-12, -12)
      })
      
      marker.setMap(mapInstance.current)
      markersRef.current.push(marker)
    })

    if (selectedLocation) {
      const selectedMarker = new window.AMap.Marker({
        position: [selectedLocation.longitude, selectedLocation.latitude],
        icon: new window.AMap.Icon({
          size: new window.AMap.Size(32, 32),
          image: 'data:image/svg+xml,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
              <circle cx="12" cy="12" r="10" fill="rgba(255, 87, 51, 0.8)" stroke="#ff5733" stroke-width="2"/>
              <circle cx="12" cy="12" r="4" fill="#fff"/>
            </svg>
          `),
          imageSize: new window.AMap.Size(32, 32)
        }),
        offset: new window.AMap.Pixel(-16, -16)
      })
      selectedMarker.setMap(mapInstance.current)
      markersRef.current.push(selectedMarker)
    }

    if (currentLocation) {
      const locationMarker = new window.AMap.Marker({
        position: [currentLocation.longitude, currentLocation.latitude],
        icon: new window.AMap.Icon({
          size: new window.AMap.Size(28, 28),
          image: 'data:image/svg+xml,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28">
              <circle cx="12" cy="12" r="10" fill="rgba(33, 150, 243, 0.3)" stroke="#2196f3" stroke-width="2"/>
              <circle cx="12" cy="12" r="4" fill="#2196f3"/>
            </svg>
          `),
          imageSize: new window.AMap.Size(28, 28)
        }),
        offset: new window.AMap.Pixel(-14, -14)
      })
      locationMarker.setMap(mapInstance.current)
      markersRef.current.push(locationMarker)
    }
  }, [items, type, color, selectedLocation, currentLocation])

  return (
    <div 
      ref={mapRef} 
      className="mini-map"
      style={{ height }}
    />
  )
}

export default MiniMap
