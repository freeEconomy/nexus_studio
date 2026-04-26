import React, { useState } from 'react'
import MiniKakaoMap from './MiniKakaoMap'

const SUBCATEGORY_META = {
  '투어·체험':   { emoji: '🎯', color: '#3b82f6' },
  '쇼핑':        { emoji: '🛍️', color: '#8b5cf6' },
  '야경 스팟':   { emoji: '🌃', color: '#1e293b' },
  '계절 이벤트': { emoji: '🌸', color: '#ec4899' },
}

const FILTERS = ['전체', '투어·체험', '쇼핑', '야경 스팟', '계절 이벤트']

export default function ActivitiesTab({ activities, destination }) {
  const [selectedActivity, setSelectedActivity] = useState(null)
  const [activeFilter, setActiveFilter] = useState('전체')

  if (!activities || activities.length === 0) {
    return (
      <div className="tp-tab-content">
        <p className="empty-state">액티비티 정보를 준비 중입니다.</p>
      </div>
    )
  }

  const filtered = activeFilter === '전체'
    ? activities
    : activities.filter(a => a.subcategory === activeFilter)

  return (
    <div className="tp-tab-content activities-tab">
      <div className="places-header">
        <h2>🎭 {destination} 경험 & 액티비티</h2>
        <p className="places-subtitle">투어, 쇼핑, 야경, 계절 이벤트까지 — 현지를 제대로 즐기는 법</p>
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

      {filtered.length === 0 && (
        <p className="empty-state">해당 카테고리의 액티비티가 없습니다.</p>
      )}

      <div className="places-grid">
        {filtered.map(activity => {
          const meta = SUBCATEGORY_META[activity.subcategory]
          return (
            <div key={activity.id} className="place-card" onClick={() => setSelectedActivity(activity)}>
              <div className="place-image">
                <img
                  src={activity.image}
                  alt={activity.name}
                  loading="lazy"
                  onError={e => { e.target.onerror = null; e.target.src = `https://picsum.photos/seed/activity${activity.id}/400/300` }}
                />
                {meta && (
                  <span
                    className="subcategory-badge"
                    style={{ background: activity.subcategory === '야경 스팟' ? '#334155' : meta.color }}
                  >
                    {meta.emoji} {activity.subcategory}
                  </span>
                )}
              </div>
              <div className="place-content">
                <h3>{activity.name}</h3>
                {activity.rating != null && (
                  <div className="place-rating">
                    <span className="stars">{'⭐'.repeat(Math.min(5, Math.floor(activity.rating)))}</span>
                    <span className="rating-value">{activity.rating}</span>
                  </div>
                )}
                <p className="place-category">{activity.category}</p>
                <p className="place-desc">{activity.description?.slice(0, 60)}{activity.description?.length > 60 ? '...' : ''}</p>
                <div className="place-meta">
                  <span>⏱️ {activity.duration}</span>
                  {activity.price && activity.price !== '정보 없음' && <span>💰 {activity.price}</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 상세정보 모달 */}
      {selectedActivity && (
        <div className="modal-overlay" onClick={() => setSelectedActivity(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedActivity(null)}>✕</button>

            <div className="modal-header">
              <div className="modal-image">
                <img
                  src={selectedActivity.image}
                  alt={selectedActivity.name}
                  onError={e => { e.target.onerror = null; e.target.src = `https://picsum.photos/seed/activity${selectedActivity.id}/800/600` }}
                />
              </div>
              <div className="modal-title">
                <h2>{selectedActivity.name}</h2>
                {selectedActivity.subcategory && (
                  <span className="modal-subcategory-badge">
                    {SUBCATEGORY_META[selectedActivity.subcategory]?.emoji} {selectedActivity.subcategory}
                  </span>
                )}
                {selectedActivity.rating != null && (
                  <div className="modal-rating">
                    <span className="stars">{'⭐'.repeat(Math.min(5, Math.floor(selectedActivity.rating)))}</span>
                    <span className="rating-value">{selectedActivity.rating}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-info">
              <div className="info-item">
                <label>설명</label>
                <p>{selectedActivity.description}</p>
              </div>
              <div className="info-row">
                <div className="info-item">
                  <label>📍 주소</label>
                  <p>{selectedActivity.address}</p>
                </div>
                <div className="info-item">
                  <label>🕐 운영시간</label>
                  <p>{selectedActivity.hours}</p>
                </div>
              </div>
              <div className="info-row">
                <div className="info-item">
                  <label>💰 가격</label>
                  <p>{selectedActivity.price}</p>
                </div>
                <div className="info-item">
                  <label>⏳ 소요시간</label>
                  <p>{selectedActivity.duration}</p>
                </div>
              </div>
              {selectedActivity.tips && (
                <div className="info-item tips-box">
                  <label>💡 가이드 팁</label>
                  <p>{selectedActivity.tips}</p>
                </div>
              )}
              {selectedActivity.coords && (
                <div className="info-item">
                  <label>🗺️ 위치</label>
                  <MiniKakaoMap lat={selectedActivity.coords.lat} lng={selectedActivity.coords.lng} name={selectedActivity.name} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
