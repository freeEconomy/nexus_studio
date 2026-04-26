import React, { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { loadKakaoSDK } from './kakaoSDK'

const KAKAO_KEY  = import.meta.env.VITE_KAKAO_MAP_KEY
const STADIA_KEY = import.meta.env.VITE_STADIA_KEY

function isKorea(lat, lng) {
  return lat >= 33.0 && lat <= 38.9 && lng >= 124.5 && lng <= 131.0
}

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>',
  iconSize: [14, 14], iconAnchor: [7, 7],
})

const STADIA_URL = STADIA_KEY
  ? `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${STADIA_KEY}`
  : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'

const FS_BTN = {
  position: 'absolute', top: 8, right: 8, zIndex: 1000,
  background: 'rgba(15,23,42,0.75)', color: '#e2e8f0',
  border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px',
  padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
  backdropFilter: 'blur(4px)',
}

// ── 전체화면 진입/종료 ─────────────────────────────────────────────────────
function useFullscreen(ref) {
  const [isFull, setIsFull] = useState(false)
  useEffect(() => {
    const onChange = () => setIsFull(document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [ref])
  const toggle = () => {
    if (!document.fullscreenElement) ref.current?.requestFullscreen()
    else document.exitFullscreen()
  }
  return [isFull, toggle]
}

// ── 국내: Kakao Maps SDK ──────────────────────────────────────────────────
function KakaoMiniMap({ lat, lng, name, height }) {
  const containerRef = useRef(null)
  const mapDivRef    = useRef(null)
  const mapRef       = useRef(null)
  const [isFull, toggleFullscreen] = useFullscreen(containerRef)

  // 전체화면 전환 시 지도 크기 재계산
  useEffect(() => {
    const onChange = () => setTimeout(() => mapRef.current?.relayout(), 150)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    if (!mapDivRef.current) return
    let cancelled = false
    loadKakaoSDK().then(() => {
      if (cancelled || !mapDivRef.current) return
      try {
        const { kakao } = window
        const pos = new kakao.maps.LatLng(lat, lng)
        mapRef.current = new kakao.maps.Map(mapDivRef.current, { center: pos, level: 4 })
        const marker = new kakao.maps.Marker({ position: pos, map: mapRef.current })
        if (name) {
          const iw = new kakao.maps.InfoWindow({
            content: `<div style="padding:4px 8px;font-size:12px;white-space:nowrap">${name}</div>`,
          })
          iw.open(mapRef.current, marker)
        }
        requestAnimationFrame(() => mapRef.current?.relayout())
      } catch (e) { console.warn('[MiniMap] Kakao init error:', e) }
    }).catch(e => console.warn('[MiniMap] SDK load failed:', e.message))
    return () => { cancelled = true }
  }, [lat, lng, name])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        marginTop: '4px',
        borderRadius: isFull ? 0 : '8px',
        overflow: 'hidden',
        background: '#0f172a',
        height: isFull ? '100%' : `${height}px`,
      }}
    >
      <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />
      <button onClick={toggleFullscreen} style={FS_BTN}>
        {isFull ? '✕ 닫기' : '⛶ 전체화면'}
      </button>
    </div>
  )
}

// ── 해외: Stadia Maps (Leaflet) ───────────────────────────────────────────
function MapInvalidator() {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 120)
    const onFs = () => setTimeout(() => map.invalidateSize(), 150)
    document.addEventListener('fullscreenchange', onFs)
    return () => { clearTimeout(t); document.removeEventListener('fullscreenchange', onFs) }
  }, [map])
  return null
}

function StadiaMiniMap({ lat, lng, height }) {
  const containerRef = useRef(null)
  const [isFull, toggleFullscreen] = useFullscreen(containerRef)

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        marginTop: '4px',
        borderRadius: isFull ? 0 : '8px',
        overflow: 'hidden',
        background: '#0f172a',
        height: isFull ? '100%' : `${height}px`,
      }}
    >
      <MapContainer
        center={[lat, lng]}
        zoom={14}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        scrollWheelZoom={false}
        attributionControl={false}
      >
        <TileLayer url={STADIA_URL} maxZoom={20} tileSize={256} detectRetina />
        <Marker position={[lat, lng]} icon={pinIcon} />
        <MapInvalidator />
      </MapContainer>
      <button onClick={toggleFullscreen} style={FS_BTN}>
        {isFull ? '✕ 닫기' : '⛶ 전체화면'}
      </button>
    </div>
  )
}

// ── 메인 내보내기 ─────────────────────────────────────────────────────────
export default function MiniKakaoMap({ lat, lng, name, height = 200 }) {
  if (!lat || !lng) return null
  return (KAKAO_KEY && isKorea(lat, lng))
    ? <KakaoMiniMap lat={lat} lng={lng} name={name} height={height} />
    : <StadiaMiniMap lat={lat} lng={lng} height={height} />
}
