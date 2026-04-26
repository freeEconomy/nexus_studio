import React, { useState } from 'react'
import MiniKakaoMap from './MiniKakaoMap'

const SUBCATEGORY_META = {
  '현지 맛집':   { emoji: '🍜', color: '#ef4444' },
  '카페·디저트': { emoji: '☕', color: '#8b5cf6' },
  '길거리 음식': { emoji: '🥢', color: '#f59e0b' },
}

const FILTERS = ['전체', '현지 맛집', '카페·디저트', '길거리 음식']

export default function RestaurantsTab({ restaurants }) {
  const [selectedRestaurant, setSelectedRestaurant] = useState(null)
  const [activeFilter, setActiveFilter] = useState('전체')

  if (!restaurants || restaurants.length === 0) {
    return (
      <div className="tp-tab-content">
        <p className="empty-state">맛집 정보를 준비 중입니다.</p>
      </div>
    )
  }

  const filteredRestaurants = activeFilter === '전체'
    ? restaurants
    : restaurants.filter(r => r.subcategory === activeFilter)

  return (
    <div className="tp-tab-content restaurants-tab">
      <div className="restaurants-header">
        <h2>🍽️ 맛집 가이드</h2>
        <p className="restaurants-subtitle">10년 경력 가이드가 직접 검증한 현지 맛집</p>
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

      {filteredRestaurants.length === 0 && (
        <p className="empty-state">해당 카테고리의 맛집이 없습니다.</p>
      )}

      <div className="restaurant-sections">
        <div className="restaurant-grid">
          {filteredRestaurants.map(restaurant => {
            const meta = SUBCATEGORY_META[restaurant.subcategory]
            return (
              <div
                key={restaurant.id}
                className="restaurant-card"
                onClick={() => setSelectedRestaurant(restaurant)}
              >
                <div className="restaurant-image">
                  <img
                    src={restaurant.image}
                    alt={restaurant.name}
                    loading="lazy"
                    onError={e => { e.target.onerror = null; e.target.src = `https://picsum.photos/seed/food${restaurant.id}/400/300` }}
                  />
                  {meta && (
                    <span className="subcategory-badge" style={{ background: meta.color }}>
                      {meta.emoji} {restaurant.subcategory}
                    </span>
                  )}
                </div>
                <div className="restaurant-content">
                  <h4>{restaurant.name}</h4>
                  {restaurant.rating != null && (
                    <div className="restaurant-rating">
                      <span className="stars">{'⭐'.repeat(Math.min(5, Math.floor(restaurant.rating)))}</span>
                      <span className="rating">{restaurant.rating}</span>
                    </div>
                  )}
                  <p className="cuisine">{restaurant.category}</p>
                  <p className="price">{restaurant.price}</p>
                  <p className="description">{restaurant.description?.slice(0, 60)}{restaurant.description?.length > 60 ? '...' : ''}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 상세정보 모달 */}
      {selectedRestaurant && (
        <div className="modal-overlay" onClick={() => setSelectedRestaurant(null)}>
          <div className="modal-content restaurant-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedRestaurant(null)}>✕</button>

            <div className="modal-header">
              <div className="modal-image large">
                <img
                  src={selectedRestaurant.image}
                  alt={selectedRestaurant.name}
                  onError={e => { e.target.onerror = null; e.target.src = `https://picsum.photos/seed/food${selectedRestaurant.id}/800/600` }}
                />
              </div>
              <div className="modal-title">
                <h2>{selectedRestaurant.name}</h2>
                {selectedRestaurant.subcategory && (
                  <span className="modal-subcategory-badge">
                    {SUBCATEGORY_META[selectedRestaurant.subcategory]?.emoji} {selectedRestaurant.subcategory}
                  </span>
                )}
                <p className="cuisine">{selectedRestaurant.category}</p>
                {selectedRestaurant.rating != null && (
                  <div className="modal-rating">
                    <span className="stars">{'⭐'.repeat(Math.min(5, Math.floor(selectedRestaurant.rating)))}</span>
                    <span className="rating">{selectedRestaurant.rating}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-info">
              <div className="info-item">
                <label>설명</label>
                <p>{selectedRestaurant.description}</p>
              </div>
              <div className="info-row">
                <div className="info-item">
                  <label>📍 주소</label>
                  <p>{selectedRestaurant.address}</p>
                </div>
                <div className="info-item">
                  <label>🕐 영업시간</label>
                  <p>{selectedRestaurant.hours}</p>
                </div>
              </div>
              <div className="info-item">
                <label>💰 가격대</label>
                <p>{selectedRestaurant.price}</p>
              </div>
              {selectedRestaurant.tips && (
                <div className="info-item tips-box">
                  <label>💡 가이드 팁</label>
                  <p>{selectedRestaurant.tips}</p>
                </div>
              )}
              {selectedRestaurant.coords && (
                <div className="info-item">
                  <label>🗺️ 위치</label>
                  <MiniKakaoMap lat={selectedRestaurant.coords.lat} lng={selectedRestaurant.coords.lng} name={selectedRestaurant.name} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
