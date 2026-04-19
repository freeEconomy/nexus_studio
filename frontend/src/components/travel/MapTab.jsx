import React from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

export default function MapTab({ places, restaurants, coordinates, routeCoordinates }) {
  if (!coordinates) {
    return (
      <div className="tp-tab-content">
        <p className="empty-state">지도 정보를 준비 중입니다.</p>
      </div>
    )
  }

  const createCustomIcon = (emoji, color) => {
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="
        background-color: ${color};
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      ">${emoji}</div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -20],
    })
  }

  return (
    <div className="tp-tab-content map-tab">
      <div className="map-header">
        <h2>🗺️ 여행지 지도</h2>
        <p className="map-subtitle">모든 여행지와 맛집을 한눈에 확인하세요</p>
      </div>

      <div className="map-container">
        <MapContainer
          center={[coordinates.lat, coordinates.lng]}
          zoom={12}
          style={{ width: '100%', height: '500px', borderRadius: '12px' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* 여행지 마커 */}
          {places && places.map((place, idx) => {
            const lat = place.coords?.lat ?? (coordinates.lat + (idx % 3 - 1) * 0.02)
            const lng = place.coords?.lng ?? (coordinates.lng + (idx % 2 === 0 ? 1 : -1) * 0.02)
            return (
              <Marker
                key={`place-${idx}`}
                position={[lat, lng]}
                icon={createCustomIcon(place.image, '#3b82f6')}
              >
                <Popup>
                  <div className="map-popup">
                    <strong>{place.name}</strong>
                    <p className="popup-category">{place.category}</p>
                    <p className="popup-desc">{place.description}</p>
                    <p className="popup-price">💰 {place.price}</p>
                  </div>
                </Popup>
              </Marker>
            )
          })}

          {/* 맛집 마커 */}
          {restaurants && restaurants.map((restaurant, idx) => {
            const lat = restaurant.coords?.lat ?? (coordinates.lat + (idx % 2 === 0 ? -1 : 1) * 0.015)
            const lng = restaurant.coords?.lng ?? (coordinates.lng + (idx % 3 - 1) * 0.015)
            return (
              <Marker
                key={`restaurant-${idx}`}
                position={[lat, lng]}
                icon={createCustomIcon(restaurant.image, '#ef4444')}
              >
                <Popup>
                  <div className="map-popup">
                    <strong>{restaurant.name}</strong>
                    <p className="popup-cuisine">{restaurant.cuisine}</p>
                    <p className="popup-desc">{restaurant.description}</p>
                    <p className="popup-price">💰 {restaurant.price}</p>
                  </div>
                </Popup>
              </Marker>
            )
          })}

          {/* 추천 경로: routeCoordinates는 [lat, lng] 형식 */}
          {routeCoordinates && routeCoordinates.length > 1 && (
            <Polyline
              positions={routeCoordinates.map(coord =>
                Array.isArray(coord) ? coord : [coord.lat, coord.lng]
              )}
              color="#3b82f6"
              weight={3}
              opacity={0.7}
              dashArray="5, 5"
            />
          )}
        </MapContainer>
      </div>

      {/* 범례 */}
      <div className="map-legend">
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#3b82f6' }}>📍</div>
          <span>여행지</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#ef4444' }}>🍽️</div>
          <span>맛집</span>
        </div>
        <div className="legend-item">
          <div className="legend-line"></div>
          <span>추천 경로</span>
        </div>
      </div>
    </div>
  )
}
