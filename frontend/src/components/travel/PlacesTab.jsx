import React, { useState } from 'react'
import MiniKakaoMap from './MiniKakaoMap'

const SUBCATEGORY_META = {
  '랜드마크':    { emoji: '🏛️', color: '#3b82f6' },
  '필수 관광지': { emoji: '⭐', color: '#8b5cf6' },
  '숨겨진 명소': { emoji: '🔍', color: '#10b981' },
  '현지 핫플':   { emoji: '🔥', color: '#f59e0b' },
}

const FILTERS = ['전체', '랜드마크', '필수 관광지', '숨겨진 명소', '현지 핫플']

export default function PlacesTab({ places, destination }) {
  const [selectedPlace, setSelectedPlace] = useState(null)
  const [activeFilter, setActiveFilter] = useState('전체')

  if (!places || places.length === 0) {
    return (
      <div className="tp-tab-content">
        <p className="empty-state">여행지 정보를 준비 중입니다.</p>
      </div>
    )
  }

  const filteredPlaces = activeFilter === '전체'
    ? places
    : places.filter(p => p.subcategory === activeFilter)

  return (
    <div className="tp-tab-content places-tab">
      <div className="places-header">
        <h2>📍 {destination} 추천 장소</h2>
        <p className="places-subtitle">10년 경력 가이드가 엄선한 실용적인 여행지</p>
      </div>

      {/* subcategory 필터 */}
      <div className="filter-chips">
        {FILTERS.map(f => {
          const meta = SUBCATEGORY_META[f]
          return (
            <button
              key={f}
              className={`filter-chip ${activeFilter === f ? 'active' : ''}`}
              onClick={() => setActiveFilter(f)}
            >
              {meta ? `${meta.emoji} ${f}` : f}
            </button>
          )
        })}
      </div>

      {filteredPlaces.length === 0 && (
        <p className="empty-state">해당 카테고리의 장소가 없습니다.</p>
      )}

      <div className="places-grid">
        {filteredPlaces.map(place => {
          const meta = SUBCATEGORY_META[place.subcategory]
          return (
            <div key={place.id} className="place-card" onClick={() => setSelectedPlace(place)}>
              <div className="place-image">
                <img
                  src={place.image}
                  alt={place.name}
                  loading="lazy"
                  onError={e => { e.target.onerror = null; e.target.src = `https://picsum.photos/seed/landmark${place.id}/400/300` }}
                />
                {meta && (
                  <span className="subcategory-badge" style={{ background: meta.color }}>
                    {meta.emoji} {place.subcategory}
                  </span>
                )}
              </div>
              <div className="place-content">
                <h3>{place.name}</h3>
                {place.rating != null && (
                  <div className="place-rating">
                    <span className="stars">{'⭐'.repeat(Math.min(5, Math.floor(place.rating)))}</span>
                    <span className="rating-value">{place.rating}</span>
                  </div>
                )}
                <p className="place-category">{place.category}</p>
                <p className="place-desc">{place.description?.slice(0, 60)}{place.description?.length > 60 ? '...' : ''}</p>
                <div className="place-meta">
                  <span>⏱️ {place.duration}</span>
                  {place.price && place.price !== '정보 없음' && <span>💰 {place.price}</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 상세정보 모달 */}
      {selectedPlace && (
        <div className="modal-overlay" onClick={() => setSelectedPlace(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedPlace(null)}>✕</button>

            <div className="modal-header">
              <div className="modal-image">
                <img
                  src={selectedPlace.image}
                  alt={selectedPlace.name}
                  onError={e => { e.target.onerror = null; e.target.src = `https://picsum.photos/seed/landmark${selectedPlace.id}/800/600` }}
                />
              </div>
              <div className="modal-title">
                <h2>{selectedPlace.name}</h2>
                {selectedPlace.subcategory && (
                  <span className="modal-subcategory-badge">
                    {SUBCATEGORY_META[selectedPlace.subcategory]?.emoji} {selectedPlace.subcategory}
                  </span>
                )}
                {selectedPlace.rating != null && (
                  <div className="modal-rating">
                    <span className="stars">{'⭐'.repeat(Math.min(5, Math.floor(selectedPlace.rating)))}</span>
                    <span className="rating-value">{selectedPlace.rating}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-info">
              <div className="info-item">
                <label>설명</label>
                <p>{selectedPlace.description}</p>
              </div>
              <div className="info-row">
                <div className="info-item">
                  <label>📍 주소</label>
                  <p>{selectedPlace.address}</p>
                </div>
                <div className="info-item">
                  <label>🕐 영업시간</label>
                  <p>{selectedPlace.hours}</p>
                </div>
              </div>
              <div className="info-row">
                <div className="info-item">
                  <label>💰 입장료</label>
                  <p>{selectedPlace.price}</p>
                </div>
                <div className="info-item">
                  <label>⏳ 소요시간</label>
                  <p>{selectedPlace.duration}</p>
                </div>
              </div>
              {selectedPlace.tips && (
                <div className="info-item tips-box">
                  <label>💡 가이드 팁</label>
                  <p>{selectedPlace.tips}</p>
                </div>
              )}
              {selectedPlace.coords && (
                <div className="info-item">
                  <label>🗺️ 위치</label>
                  <MiniKakaoMap lat={selectedPlace.coords.lat} lng={selectedPlace.coords.lng} name={selectedPlace.name} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
