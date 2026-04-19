import React, { useState } from 'react'

export default function PlacesTab({ places, destination }) {
  const [selectedPlace, setSelectedPlace] = useState(null)

  if (!places || places.length === 0) {
    return (
      <div className="tp-tab-content">
        <p className="empty-state">여행지 정보를 준비 중입니다.</p>
      </div>
    )
  }

  const categories = [...new Set(places.map(p => p.category))]

  return (
    <div className="tp-tab-content places-tab">
      <div className="places-header">
        <h2>📍 {destination} 주요 여행지</h2>
        <p className="places-subtitle">클릭하면 상세정보를 볼 수 있습니다</p>
      </div>

      {/* 카테고리 필터 */}
      <div className="filter-chips">
        {categories.map(category => (
          <div key={category} className="filter-chip">
            {category}
          </div>
        ))}
      </div>

      {/* 여행지 카드 그리드 */}
      <div className="places-grid">
        {places.map(place => (
          <div
            key={place.id}
            className="place-card"
            onClick={() => setSelectedPlace(place)}
          >
            <div className="place-image">{place.image}</div>
            <div className="place-content">
              <h3>{place.name}</h3>
              <div className="place-rating">
                <span className="stars">{'⭐'.repeat(Math.floor(place.rating))}</span>
                <span className="rating-value">{place.rating}</span>
              </div>
              <p className="place-category">{place.category}</p>
              <p className="place-price">가격: {place.price}</p>
              <div className="place-meta">
                <span>⏱️ {place.duration}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 상세정보 모달 */}
      {selectedPlace && (
        <div className="modal-overlay" onClick={() => setSelectedPlace(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedPlace(null)}>✕</button>
            
            <div className="modal-header">
              <div className="modal-image">{selectedPlace.image}</div>
              <div className="modal-title">
                <h2>{selectedPlace.name}</h2>
                <div className="modal-rating">
                  <span className="stars">{'⭐'.repeat(Math.floor(selectedPlace.rating))}</span>
                  <span className="rating-value">{selectedPlace.rating}</span>
                </div>
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

              <div className="info-item">
                <label>💡 팁</label>
                <p>{selectedPlace.tips}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
