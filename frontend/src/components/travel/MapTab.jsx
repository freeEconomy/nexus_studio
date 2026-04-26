// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { loadKakaoSDK, resetKakaoSDK } from './kakaoSDK'

const KAKAO_KEY  = import.meta.env.VITE_KAKAO_MAP_KEY
const STADIA_KEY = import.meta.env.VITE_STADIA_KEY

// 국내(한반도·제주) 여부 판별
function isKorea(lat, lng) {
  return lat >= 33.0 && lat <= 38.9 && lng >= 124.5 && lng <= 131.0
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// KAKAO MAPS (국내)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeMarkerEl(imgSrc, color, onClick) {
  const isUrl = typeof imgSrc === 'string' && imgSrc.startsWith('http')
  const div = document.createElement('div')
  div.style.cssText = [
    `background:${color}`,
    'width:40px;height:40px;border-radius:50%',
    'display:flex;align-items:center;justify-content:center',
    'border:3px solid #fff',
    'box-shadow:0 3px 12px rgba(0,0,0,0.35)',
    'cursor:pointer;user-select:none;flex-shrink:0',
  ].join(';')
  if (isUrl) {
    const img = document.createElement('img')
    img.src = imgSrc
    img.style.cssText = 'width:32px;height:32px;border-radius:50%;object-fit:cover;pointer-events:none'
    img.onerror = () => { div.textContent = '📍' }
    div.appendChild(img)
  } else {
    div.style.fontSize = '18px'
    div.textContent = imgSrc || '📍'
  }
  div.addEventListener('click', e => { e.stopPropagation(); onClick() })
  return div
}

function makePopupEl(item, accentColor, onClose) {
  const wrap = document.createElement('div')
  wrap.style.cssText = [
    'position:relative',
    'background:#1e293b',
    'border:1px solid rgba(255,255,255,0.12)',
    'border-radius:12px',
    'padding:12px 28px 14px 12px',
    'min-width:200px;max-width:260px',
    'box-shadow:0 8px 24px rgba(0,0,0,0.45)',
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  ].join(';')

  const closeBtn = document.createElement('button')
  closeBtn.textContent = '✕'
  closeBtn.style.cssText = 'position:absolute;top:7px;right:9px;background:none;border:none;cursor:pointer;font-size:12px;color:#64748b;padding:0;line-height:1'
  closeBtn.addEventListener('click', e => { e.stopPropagation(); onClose() })
  wrap.appendChild(closeBtn)

  // 이름
  const name = document.createElement('strong')
  name.textContent = item.name
  name.style.cssText = 'display:block;font-size:0.88rem;color:#f1f5f9;line-height:1.3;margin-bottom:3px;padding-right:8px'
  wrap.appendChild(name)

  // subcategory + 별점 한 줄
  const metaRow = document.createElement('div')
  metaRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap'
  if (item.subcategory) {
    const sub = document.createElement('span')
    sub.textContent = item.subcategory
    sub.style.cssText = `font-size:0.68rem;color:${accentColor};font-weight:700;background:${accentColor}22;padding:1px 6px;border-radius:999px`
    metaRow.appendChild(sub)
  }
  if (item.rating != null) {
    const star = document.createElement('span')
    star.textContent = `⭐ ${item.rating}`
    star.style.cssText = 'font-size:0.68rem;color:#fbbf24'
    metaRow.appendChild(star)
  }
  if (metaRow.children.length) wrap.appendChild(metaRow)

  // 설명
  if (item.description) {
    const desc = document.createElement('p')
    const t = item.description
    desc.textContent = t.length > 80 ? t.slice(0, 80) + '…' : t
    desc.style.cssText = 'font-size:0.74rem;color:#94a3b8;margin:0 0 6px;line-height:1.45'
    wrap.appendChild(desc)
  }

  // 구분선
  const divider = document.createElement('div')
  divider.style.cssText = 'height:1px;background:rgba(255,255,255,0.08);margin:0 0 6px'
  wrap.appendChild(divider)

  // 상세 정보 행 헬퍼
  const addRow = (emoji, text) => {
    if (!text || text === '정보 없음') return
    const row = document.createElement('p')
    row.textContent = `${emoji} ${text}`
    row.style.cssText = 'font-size:0.72rem;color:#cbd5e1;margin:0 0 3px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
    wrap.appendChild(row)
  }

  addRow('📍', item.address)
  addRow('🕐', item.hours)
  addRow('💰', item.price !== '정보 없음' ? item.price : null)
  addRow('⏱️', item.duration)

  if (item.tips) {
    const tip = document.createElement('p')
    const t = item.tips
    tip.textContent = `💡 ${t.length > 60 ? t.slice(0, 60) + '…' : t}`
    tip.style.cssText = 'font-size:0.7rem;color:#a78bfa;margin:4px 0 0;line-height:1.4'
    wrap.appendChild(tip)
  }

  // 아래 화살표
  const arrow = document.createElement('div')
  arrow.style.cssText = 'position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:8px solid #1e293b'
  wrap.appendChild(arrow)

  return wrap
}

function KakaoMapTab({ places, restaurants, activities, coordinates }) {
  const mapDivRef   = useRef(null)
  const mapRef      = useRef(null)
  const overlaysRef = useRef([])
  const fitRef      = useRef(null)
  const [ready, setReady]       = useState(false)
  const [sdkError, setSdkError] = useState('')

  useEffect(() => {
    loadKakaoSDK()
      .then(() => setReady(true))
      .catch(e => setSdkError(e?.message || String(e)))
  }, [])

  useEffect(() => {
    if (!ready || !mapDivRef.current || !coordinates) return
    const { kakao } = window
    try {
      if (!mapRef.current) {
        mapRef.current = new kakao.maps.Map(mapDivRef.current, {
          center: new kakao.maps.LatLng(coordinates.lat, coordinates.lng),
          level: 7,
        })
        requestAnimationFrame(() => mapRef.current?.relayout())
      }
    } catch (e) {
      setSdkError(`지도 생성 실패: ${e?.message || String(e)}`)
      return
    }
    const map = mapRef.current

    overlaysRef.current.forEach(o => o.setMap(null))
    overlaysRef.current = []

    const allPos = []
    let activePopup = null
    const hidePopup = () => { if (activePopup) { activePopup.setMap(null); activePopup = null } }

    kakao.maps.event.addListener(map, 'click', hidePopup)

    const addGroup = (items, color, fallback) => {
      if (!items?.length) return
      items.forEach((item, i) => {
        const lat = item.coords?.lat || fallback(i)[0]
        const lng = item.coords?.lng || fallback(i)[1]
        const pos = new kakao.maps.LatLng(lat, lng)
        allPos.push(pos)

        const popupEl = makePopupEl(item, color, hidePopup)
        const popup = new kakao.maps.CustomOverlay({ position: pos, content: popupEl, yAnchor: 1.6, zIndex: 5 })
        overlaysRef.current.push(popup)

        const markerEl = makeMarkerEl(item.image, color, () => { hidePopup(); popup.setMap(map); activePopup = popup })
        const marker = new kakao.maps.CustomOverlay({ position: pos, content: markerEl, yAnchor: 1, zIndex: 3 })
        marker.setMap(map)
        overlaysRef.current.push(marker)
      })
    }

    addGroup(places,      '#3b82f6', i => [coordinates.lat + (i % 3 - 1) * 0.02,  coordinates.lng + (i % 2 === 0 ?  1 : -1) * 0.02])
    addGroup(restaurants, '#ef4444', i => [coordinates.lat + (i % 2 === 0 ? -1 : 1) * 0.015, coordinates.lng + (i % 3 - 1) * 0.015])
    addGroup(activities,  '#10b981', i => [coordinates.lat + (i % 2 === 0 ?  1 : -1) * 0.025, coordinates.lng + (i % 3 - 1) * 0.025])

    if (allPos.length) {
      const bounds = new kakao.maps.LatLngBounds()
      allPos.forEach(p => bounds.extend(p))
      fitRef.current = () => map.setBounds(bounds)
    }

    return () => { kakao.maps.event.removeListener(map, 'click', hidePopup) }
  }, [ready, coordinates, places, restaurants, activities])

  useEffect(() => () => {
    overlaysRef.current.forEach(o => o.setMap(null))
    overlaysRef.current = []
    mapRef.current = null
  }, [])

  if (sdkError) {
    const retry = () => {
      resetKakaoSDK(); setSdkError(''); setReady(false)
      loadKakaoSDK().then(() => setReady(true)).catch(e => setSdkError(e?.message || String(e)))
    }
    return (
      <div className="tp-tab-content map-tab">
        <div className="map-header"><h2>🗺️ 여행지 지도</h2></div>
        <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(239,68,68,0.08)', borderRadius: '12px' }}>
          <p style={{ margin: '0 0 0.5rem', color: '#ef4444', fontWeight: 600 }}>카카오 맵 로드 실패</p>
          <pre style={{ margin: '0 0 1rem', fontSize: '0.78rem', color: '#94a3b8', whiteSpace: 'pre-wrap', textAlign: 'left' }}>{sdkError}</pre>
          <button onClick={retry} style={{ padding: '0.5rem 1.25rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="tp-tab-content map-tab">
      <div className="map-header">
        <h2>🗺️ 여행지 지도</h2>
        <p className="map-subtitle">모든 여행지와 맛집을 한눈에 확인하세요</p>
      </div>
      <div className="map-container" style={{ overflow: 'visible' }}>
        <div style={{ position: 'relative' }}>
          {!ready && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', borderRadius: '14px', color: '#94a3b8', fontSize: '0.9rem' }}>
              🗺️ 지도 로딩 중...
            </div>
          )}
          <div ref={mapDivRef} style={{ width: '100%', height: '520px', borderRadius: '14px' }} />
          <button className="map-fit-btn kakao-fit-btn" onClick={() => fitRef.current?.()}>⊞ 전체 보기</button>
        </div>
      </div>
      <div className="map-legend">
        <div className="legend-item"><div className="legend-color" style={{ background: '#3b82f6' }}>📍</div><span>추천 장소</span></div>
        <div className="legend-item"><div className="legend-color" style={{ background: '#ef4444' }}>🍽️</div><span>맛집</span></div>
        <div className="legend-item"><div className="legend-color" style={{ background: '#10b981' }}>🎭</div><span>액티비티</span></div>
        <span className="tile-provider-badge">Kakao Maps</span>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STADIA MAPS (해외) — Leaflet 기반
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// alidade_smooth_dark: 다크 테마 + 영어 우선 표기 (OpenMapTiles name:en 사용)
const STADIA_TILE = STADIA_KEY
  ? { url: `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${STADIA_KEY}`, attr: '&copy; Stadia Maps &copy; OpenMapTiles &copy; OSM', label: 'Stadia Maps' }
  : { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attr: '&copy; OSM &copy; CARTO', label: 'Carto Voyager' }

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

function createIcon(imgSrc, color) {
  const isUrl = typeof imgSrc === 'string' && imgSrc.startsWith('http')
  const inner = isUrl
    ? `<img src="${imgSrc}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;"/>`
    : `<span style="font-size:18px;">${imgSrc}</span>`
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background:${color};width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 3px 12px rgba(0,0,0,0.35);">${inner}</div>`,
    iconSize: [40, 40], iconAnchor: [20, 20], popupAnchor: [0, -22],
  })
}

function DetailPopup({ item, color }) {
  return (
    <div className="map-popup">
      <strong style={{ display:'block', fontSize:'0.88rem', marginBottom:'3px', paddingRight:'4px' }}>{item.name}</strong>
      <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap', marginBottom:'5px' }}>
        {item.subcategory && <span style={{ fontSize:'0.68rem', color: color, fontWeight:700, background:`${color}22`, padding:'1px 6px', borderRadius:'999px' }}>{item.subcategory}</span>}
        {item.rating != null && <span style={{ fontSize:'0.68rem', color:'#f59e0b' }}>⭐ {item.rating}</span>}
      </div>
      {item.description && <p style={{ fontSize:'0.78rem', margin:'0 0 6px', color:'#475569', lineHeight:1.4 }}>{item.description.length > 80 ? item.description.slice(0, 80) + '…' : item.description}</p>}
      <hr style={{ margin:'0 0 5px', border:'none', borderTop:'1px solid #e2e8f0' }} />
      {item.address    && item.address    !== '정보 없음' && <p style={{ fontSize:'0.74rem', margin:'0 0 2px' }}>📍 {item.address}</p>}
      {item.hours      && item.hours      !== '정보 없음' && <p style={{ fontSize:'0.74rem', margin:'0 0 2px' }}>🕐 {item.hours}</p>}
      {item.price      && item.price      !== '정보 없음' && <p style={{ fontSize:'0.74rem', margin:'0 0 2px' }}>💰 {item.price}</p>}
      {item.duration   && item.duration   !== '정보 없음' && <p style={{ fontSize:'0.74rem', margin:'0 0 2px' }}>⏱️ {item.duration}</p>}
      {item.tips && <p style={{ fontSize:'0.72rem', margin:'4px 0 0', color:'#7c3aed' }}>💡 {item.tips.length > 60 ? item.tips.slice(0, 60) + '…' : item.tips}</p>}
    </div>
  )
}

function FitBoundsButton({ positions }) {
  const map = useMap()
  useEffect(() => {
    if (!positions.length) return
    const ctrl = L.control({ position: 'topright' })
    ctrl.onAdd = () => {
      const btn = L.DomUtil.create('button', 'map-fit-btn')
      btn.innerHTML = '⊞ 전체 보기'
      L.DomEvent.on(btn, 'click', e => { L.DomEvent.stopPropagation(e); map.fitBounds(L.latLngBounds(positions), { padding: [50, 50], maxZoom: 16 }) })
      L.DomEvent.disableClickPropagation(btn)
      return btn
    }
    ctrl.addTo(map)
    return () => ctrl.remove()
  }, [map, positions])
  return null
}

function LeafletMapTab({ places, restaurants, activities, coordinates }) {
  const allPositions = [
    ...(places      || []).map((p, i) => [p.coords?.lat ?? (coordinates.lat + (i % 3 - 1) * 0.02),  p.coords?.lng ?? (coordinates.lng + (i % 2 === 0 ?  1 : -1) * 0.02)]),
    ...(restaurants || []).map((r, i) => [r.coords?.lat ?? (coordinates.lat + (i % 2 === 0 ? -1 : 1) * 0.015), r.coords?.lng ?? (coordinates.lng + (i % 3 - 1) * 0.015)]),
    ...(activities  || []).map((a, i) => [a.coords?.lat ?? (coordinates.lat + (i % 2 === 0 ?  1 : -1) * 0.025), a.coords?.lng ?? (coordinates.lng + (i % 3 - 1) * 0.025)]),
  ]

  return (
    <div className="tp-tab-content map-tab">
      <div className="map-header">
        <h2>🗺️ 여행지 지도</h2>
        <p className="map-subtitle">모든 여행지와 맛집을 한눈에 확인하세요</p>
      </div>
      <div className="map-container">
        <MapContainer center={[coordinates.lat, coordinates.lng]} zoom={13} style={{ width: '100%', height: '520px', borderRadius: '14px' }}>
          <TileLayer attribution={STADIA_TILE.attr} url={STADIA_TILE.url} maxZoom={20} tileSize={256} detectRetina />
          {allPositions.length > 0 && <FitBoundsButton positions={allPositions} />}

          {places?.map((p, i) => {
            const lat = p.coords?.lat ?? (coordinates.lat + (i % 3 - 1) * 0.02)
            const lng = p.coords?.lng ?? (coordinates.lng + (i % 2 === 0 ? 1 : -1) * 0.02)
            return (
              <Marker key={`p-${i}`} position={[lat, lng]} icon={createIcon(p.image, '#3b82f6')}>
                <Popup maxWidth={260}><DetailPopup item={p} color='#3b82f6' /></Popup>
              </Marker>
            )
          })}

          {restaurants?.map((r, i) => {
            const lat = r.coords?.lat ?? (coordinates.lat + (i % 2 === 0 ? -1 : 1) * 0.015)
            const lng = r.coords?.lng ?? (coordinates.lng + (i % 3 - 1) * 0.015)
            return (
              <Marker key={`r-${i}`} position={[lat, lng]} icon={createIcon(r.image, '#ef4444')}>
                <Popup maxWidth={260}><DetailPopup item={r} color='#ef4444' /></Popup>
              </Marker>
            )
          })}

          {activities?.map((a, i) => {
            const lat = a.coords?.lat ?? (coordinates.lat + (i % 2 === 0 ? 1 : -1) * 0.025)
            const lng = a.coords?.lng ?? (coordinates.lng + (i % 3 - 1) * 0.025)
            return (
              <Marker key={`a-${i}`} position={[lat, lng]} icon={createIcon(a.image, '#10b981')}>
                <Popup maxWidth={260}><DetailPopup item={a} color='#10b981' /></Popup>
              </Marker>
            )
          })}
        </MapContainer>
      </div>
      <div className="map-legend">
        <div className="legend-item"><div className="legend-color" style={{ background: '#3b82f6' }}>📍</div><span>추천 장소</span></div>
        <div className="legend-item"><div className="legend-color" style={{ background: '#ef4444' }}>🍽️</div><span>맛집</span></div>
        <div className="legend-item"><div className="legend-color" style={{ background: '#10b981' }}>🎭</div><span>액티비티</span></div>
        <span className="tile-provider-badge">{STADIA_TILE.label}</span>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 내보내기 — 국내: Kakao Maps / 해외: Stadia Maps
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function MapTab(props) {
  if (!props.coordinates) {
    return <div className="tp-tab-content"><p className="empty-state">지도 정보를 준비 중입니다.</p></div>
  }
  const { lat, lng } = props.coordinates
  return (KAKAO_KEY && isKorea(lat, lng))
    ? <KakaoMapTab {...props} />
    : <LeafletMapTab {...props} />
}
