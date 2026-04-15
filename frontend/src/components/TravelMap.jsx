import React, { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Leaflet 마커 아이콘 수정 (기본 아이콘 경로 문제 해결)
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

// 지도 중심을 업데이트하는 컴포넌트
function MapCenterUpdater({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    if (center) {
      map.flyTo(center, zoom || map.getZoom(), { duration: 1 })
    }
  }, [center, map, zoom])
  return null
}

const TravelMap = ({ travelData, routeData }) => {
  const mapRef = useRef(null)

  // 기본 중심 좌표 (서울)
  const defaultCenter = [37.5665, 126.9780]
  const defaultZoom = 6

  // 여행지 마커 추출
  const markers = []
  
  if (travelData) {
    // 출발지 마커
    if (travelData.origin) {
      markers.push({
        position: travelData.origin.coords || defaultCenter,
        title: `출발: ${travelData.origin.name || '출발지'}`,
        icon: '🛫',
        color: '#10b981',
      })
    }

    // 숙소 마커
    if (travelData.accommodations && travelData.accommodations.length > 0) {
      travelData.accommodations.forEach((acc, index) => {
        if (acc.location) {
          markers.push({
            position: acc.coords || [37.5665 + (index * 0.01), 126.9780 + (index * 0.01)],
            title: `🏨 ${acc.name}`,
            subtitle: `⭐ ${acc.rating || 'N/A'}`,
            icon: '🏨',
            color: '#8b5cf6',
          })
        }
      })
    }

    // 관광지 마커
    if (travelData.attractions && travelData.attractions.length > 0) {
      travelData.attractions.forEach((attr, index) => {
        markers.push({
          position: attr.coords || [37.5665 + (index * 0.005), 126.9780 + (index * 0.005)],
          title: attr.name || attr,
          subtitle: attr.description || '',
          icon: '🎯',
          color: '#f59e0b',
        })
      })
    }

    // 도착지 마커
    if (travelData.destination) {
      markers.push({
        position: travelData.destinationCoords || [35.6762, 139.6503],
        title: `도착: ${travelData.destination}`,
        icon: '🏁',
        color: '#ef4444',
      })
    }
  }

  // 경로 데이터 처리
  const routeCoordinates = routeData?.geometry?.coordinates?.map(coord => [coord[1], coord[0]]) || []

  // 커스텀 마커 아이콘 생성
  const createCustomIcon = (icon, color) => {
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="
        background-color: ${color};
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        border: 3px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      ">${icon}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16],
    })
  }

  // 모든 마커의 중심점 계산
  const getCenter = () => {
    if (markers.length === 0) return defaultCenter
    const lats = markers.map(m => m.position[0])
    const lngs = markers.map(m => m.position[1])
    return [
      (Math.min(...lats) + Math.max(...lats)) / 2,
      (Math.min(...lngs) + Math.max(...lngs)) / 2,
    ]
  }

  return (
    <div className="travel-map-container">
      <MapContainer
        center={getCenter()}
        zoom={defaultZoom}
        style={{ width: '100%', height: '500px', borderRadius: '8px' }}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapCenterUpdater center={getCenter()} zoom={defaultZoom} />

        {/* 마커 표시 */}
        {markers.map((marker, index) => (
          <Marker
            key={index}
            position={marker.position}
            icon={createCustomIcon(marker.icon, marker.color)}
          >
            <Popup>
              <div style={{ minWidth: '150px' }}>
                <strong style={{ fontSize: '14px' }}>{marker.title}</strong>
                {marker.subtitle && (
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                    {marker.subtitle}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* 경로 표시 */}
        {routeCoordinates.length > 1 && (
          <Polyline
            positions={routeCoordinates}
            color="#3b82f6"
            weight={4}
            opacity={0.8}
          />
        )}
      </MapContainer>

      {/* 범례 */}
      <div className="map-legend">
        <div className="legend-item">
          <span className="legend-icon" style={{ background: '#10b981' }}>🛫</span>
          <span>출발</span>
        </div>
        <div className="legend-item">
          <span className="legend-icon" style={{ background: '#8b5cf6' }}>🏨</span>
          <span>숙소</span>
        </div>
        <div className="legend-item">
          <span className="legend-icon" style={{ background: '#f59e0b' }}>🎯</span>
          <span>관광지</span>
        </div>
        <div className="legend-item">
          <span className="legend-icon" style={{ background: '#ef4444' }}>🏁</span>
          <span>도착</span>
        </div>
      </div>
    </div>
  )
}

export default TravelMap