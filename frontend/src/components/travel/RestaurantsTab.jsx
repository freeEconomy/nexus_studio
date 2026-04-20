import React, { useState } from 'react'

export default function RestaurantsTab({ restaurants }) {
  const [selectedRestaurant, setSelectedRestaurant] = useState(null)

  if (!restaurants || restaurants.length === 0) {
    return (
      <div className="tp-tab-content">
        <p className="empty-state">맛집 정보를 준비 중입니다.</p>
      </div>
    )
  }

  const categories = [...new Set(restaurants.map(r => r.category))]

  return (
    <div className="tp-tab-content restaurants-tab">
      <div className="restaurants-header">
        <h2>🍽️ 맛집 가이드</h2>
        <p className="restaurants-subtitle">로컬 맛집부터 프리미엄 식당까지</p>
      </div>

      {/* 카테고리별 섹션 */}
      <div className="restaurant-sections">
        {categories.map(category => (
          <div key={category} className="restaurant-category">
            <h3 className="category-title">{category}</h3>
            <div className="restaurant-grid">
              {restaurants
                .filter(r => r.category === category)
                .map(restaurant => (
                  <div
                    key={restaurant.id}
                    className="restaurant-card"
                    onClick={() => setSelectedRestaurant(restaurant)}
                  >
                    <div className="restaurant-image">
                      <img src={restaurant.image} alt={restaurant.name} loading="lazy" />
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
                      <p className="description">{restaurant.description}</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* 상세정보 모달 */}
      {selectedRestaurant && (
        <div className="modal-overlay" onClick={() => setSelectedRestaurant(null)}>
          <div className="modal-content restaurant-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedRestaurant(null)}>✕</button>
            
            <div className="modal-header">
              <div className="modal-image large">
                <img src={selectedRestaurant.image} alt={selectedRestaurant.name} />
              </div>
              <div className="modal-title">
                <h2>{selectedRestaurant.name}</h2>
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

              <div className="info-item">
                <label>💡 팁</label>
                <p>{selectedRestaurant.tips}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
