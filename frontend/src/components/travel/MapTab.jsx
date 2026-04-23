import React from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// ─── 타일 서버 설정 ────────────────────────────────────────────────────────────
//
// 우선순위: MapTiler → Stadia Maps → Jawg Maps → ESRI (폴백)
//
// [1] MapTiler  ★ 권장 — Google Maps급 세밀도, 건물 윤곽·골목 선명
//   무료: 100,000 뷰/월  |  https://cloud.maptiler.com/account/keys
//   .env 에 추가: VITE_MAPTILER_KEY=발급키
//
// [2] Stadia Maps  — 깔끔한 미니멀 모던 스타일
//   무료: 200,000 뷰/월  |  https://client.stadiamaps.com/signup
//   .env 에 추가: VITE_STADIA_KEY=발급키
//
// [3] Jawg Maps  — 한국어(lang=ko) 지명 표시
//   무료: 50,000 뷰/월  |  https://www.jawg.io
//   .env 에 추가: VITE_JAWG_TOKEN=발급토큰
//
// [4] ESRI World Street Map  — API 키 불필요, 영어 전용
// ──────────────────────────────────────────────────────────────────────────────

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY
const STADIA_KEY   = import.meta.env.VITE_STADIA_KEY
const JAWG_TOKEN   = import.meta.env.VITE_JAWG_TOKEN

function resolveTile() {
  if (MAPTILER_KEY) {
    return {
      // streets-v2: 도로·건물·POI 최고 세밀도 / {r} → 레티나 @2x 자동 적용
      url:   `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}{r}.png?key=${MAPTILER_KEY}`,
      attr:  '&copy; <a href="https://www.maptiler.com">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      label: 'MapTiler Streets',
    }
  }
  if (STADIA_KEY) {
    return {
      // alidade_smooth: 깨끗한 미니멀 디자인, 가독성 좋음
      url:   `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key=${STADIA_KEY}`,
      attr:  '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      label: 'Stadia Alidade Smooth',
    }
  }
  if (JAWG_TOKEN) {
    return {
      // jawg-streets: 한국어(lang=ko) 지명 표시
      url:   `https://tile.jawg.io/jawg-streets/{z}/{x}/{y}{r}.png?lang=ko&access-token=${JAWG_TOKEN}`,
      attr:  '&copy; <a href="https://www.jawg.io">Jawg Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      label: 'Jawg (한국어)',
    }
  }
  return {
    url:   'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attr:  'Tiles &copy; Esri',
    label: 'ESRI (폴백)',
  }
}

const TILE = resolveTile()

// ─── Leaflet 기본 아이콘 CDN 교체 ─────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

// ─── 커스텀 마커 ──────────────────────────────────────────────────────────────
function createCustomIcon(imgSrc, color) {
  const isUrl = typeof imgSrc === 'string' && (imgSrc.startsWith('http://') || imgSrc.startsWith('https://'))
  const inner = isUrl
    ? `<img src="${imgSrc}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;"/>`
    : `<span style="font-size:18px;">${imgSrc}</span>`

  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background:${color};
      width:40px; height:40px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      border:3px solid white;
      box-shadow:0 3px 12px rgba(0,0,0,0.35);
    ">${inner}</div>`,
    iconSize:    [40, 40],
    iconAnchor:  [20, 20],
    popupAnchor: [0, -22],
  })
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────
export default function MapTab({ places, restaurants, coordinates, routeCoordinates }) {
  if (!coordinates) {
    return (
      <div className="tp-tab-content">
        <p className="empty-state">지도 정보를 준비 중입니다.</p>
      </div>
    )
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
          zoom={13}
          style={{ width: '100%', height: '520px', borderRadius: '14px' }}
          zoomControl={true}
        >
          <TileLayer
            attribution={TILE.attr}
            url={TILE.url}
            maxZoom={20}
            tileSize={512}
            zoomOffset={-1}
            detectRetina={true}
          />

          {/* 여행지 마커 (파란색) */}
          {places?.map((place, idx) => {
            const lat = place.coords?.lat ?? (coordinates.lat + (idx % 3 - 1) * 0.02)
            const lng = place.coords?.lng ?? (coordinates.lng + (idx % 2 === 0 ? 1 : -1) * 0.02)
            return (
              <Marker key={`place-${idx}`} position={[lat, lng]} icon={createCustomIcon(place.image, '#3b82f6')}>
                <Popup maxWidth={220}>
                  <div className="map-popup">
                    <strong style={{ fontSize: '0.9rem' }}>{place.name}</strong>
                    {place.category && <p className="popup-category" style={{ margin: '2px 0', color: '#64748b', fontSize: '0.78rem' }}>{place.category}</p>}
                    {place.description && <p className="popup-desc" style={{ margin: '4px 0', fontSize: '0.82rem', lineHeight: 1.4 }}>{place.description}</p>}
                    {place.price && place.price !== '정보 없음' && <p style={{ margin: '2px 0', fontSize: '0.78rem' }}>💰 {place.price}</p>}
                  </div>
                </Popup>
              </Marker>
            )
          })}

          {/* 맛집 마커 (빨간색) */}
          {restaurants?.map((restaurant, idx) => {
            const lat = restaurant.coords?.lat ?? (coordinates.lat + (idx % 2 === 0 ? -1 : 1) * 0.015)
            const lng = restaurant.coords?.lng ?? (coordinates.lng + (idx % 3 - 1) * 0.015)
            return (
              <Marker key={`restaurant-${idx}`} position={[lat, lng]} icon={createCustomIcon(restaurant.image, '#ef4444')}>
                <Popup maxWidth={220}>
                  <div className="map-popup">
                    <strong style={{ fontSize: '0.9rem' }}>{restaurant.name}</strong>
                    {restaurant.category && <p className="popup-category" style={{ margin: '2px 0', color: '#64748b', fontSize: '0.78rem' }}>{restaurant.category}</p>}
                    {restaurant.description && <p className="popup-desc" style={{ margin: '4px 0', fontSize: '0.82rem', lineHeight: 1.4 }}>{restaurant.description}</p>}
                    {restaurant.price && restaurant.price !== '정보 없음' && <p style={{ margin: '2px 0', fontSize: '0.78rem' }}>💰 {restaurant.price}</p>}
                  </div>
                </Popup>
              </Marker>
            )
          })}

          {/* 추천 경로 */}
          {routeCoordinates?.length > 1 && (
            <Polyline
              positions={routeCoordinates.map(c => Array.isArray(c) ? c : [c.lat, c.lng])}
              color="#3b82f6"
              weight={3}
              opacity={0.75}
              dashArray="6, 6"
            />
          )}
        </MapContainer>
      </div>

      {/* 범례 + 현재 타일 표시 */}
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
        <span className="tile-provider-badge">{TILE.label}</span>
      </div>
    </div>
  )
}
