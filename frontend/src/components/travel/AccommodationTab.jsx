import React, { useState } from 'react'

function formatPrice(price, currency) {
  if (!price) return '가격 문의'
  const num = typeof price === 'string' ? parseFloat(price.replace(/[^0-9.]/g, '')) : price
  if (!num || isNaN(num)) return '가격 문의'
  if (!currency || currency === 'KRW') return `₩${Math.round(num).toLocaleString()}`
  return `${currency} ${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

const PROVIDERS = [
  { id: 'booking', label: 'Booking.com' },
  { id: 'tripadvisor', label: 'TripAdvisor' },
]

export default function AccommodationTab({ accommodationsBooking, accommodationsTripAdvisor, destination, checkin, checkout }) {
  const [provider, setProvider] = useState('booking')

  const accommodations = provider === 'tripadvisor'
    ? (accommodationsTripAdvisor || [])
    : (accommodationsBooking || [])

  const handleBook = (acc) => {
    const query = `${acc.name} ${destination}`.trim()
    if (provider === 'tripadvisor') {
      window.open(`https://www.tripadvisor.com/Search?q=${encodeURIComponent(query)}`, '_blank')
    } else {
      const params = new URLSearchParams({ ss: query })
      if (checkin) params.set('checkin', checkin)
      if (checkout) params.set('checkout', checkout)
      window.open(`https://www.booking.com/search.html?${params.toString()}`, '_blank')
    }
  }

  const hasNoData = !accommodationsBooking?.length && !accommodationsTripAdvisor?.length

  if (hasNoData) {
    return (
      <div className="tp-tab-content">
        <div className="accom-header">
          <h2>🏨 숙소 추천</h2>
        </div>
        <div className="accom-empty">
          <span className="accom-empty-icon">🏨</span>
          <p>숙소 정보를 불러올 수 없습니다.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="tp-tab-content accommodation-tab">
      <div className="accom-header">
        <h2>🏨 숙소 추천</h2>
        <p className="accom-subtitle">
          {destination} 인근 숙소
          {checkin && checkout && ` · ${new Date(checkin).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} ~ ${new Date(checkout).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}`}
          <span className="accom-note"> · 클릭 시 예약 사이트로 이동</span>
        </p>
        <div className="accom-provider-toggle">
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              className={`provider-btn ${provider === p.id ? 'active' : ''}`}
              onClick={() => setProvider(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {accommodations.length === 0 ? (
        <div className="accom-empty">
          <span className="accom-empty-icon">🔍</span>
          <p>{provider === 'tripadvisor' ? 'TripAdvisor' : 'Booking.com'} 숙소 정보를 불러올 수 없습니다.</p>
        </div>
      ) : (
        <div className="accom-grid">
          {accommodations.map((acc, idx) => (
            <div key={acc.id || idx} className="accommodation-card" onClick={() => handleBook(acc)}>
              <div className="accom-image">
                {acc.image && acc.image.startsWith('http') ? (
                  <>
                    <img
                      src={acc.image}
                      alt={acc.name}
                      onError={(e) => {
                        e.target.style.display = 'none'
                        e.target.nextSibling.style.display = 'flex'
                      }}
                    />
                    <div className="accom-image-fallback" style={{ display: 'none' }}>🏨</div>
                  </>
                ) : (
                  <div className="accom-image-fallback">{acc.image || '🏨'}</div>
                )}
              </div>

              <div className="accom-info">
                <h3 className="accom-name">{acc.name}</h3>

                {acc.rating && (
                  <div className="accom-rating">
                    <span className="accom-star">★</span>
                    <span className="rating-score">{acc.rating}</span>
                    {acc.review_count && (
                      <span className="review-count">({Number(acc.review_count).toLocaleString()} 리뷰)</span>
                    )}
                  </div>
                )}

                {acc.location && (
                  <p className="accom-location">📍 {acc.location}</p>
                )}

                {acc.amenities && (
                  <div className="accom-amenities">
                    {String(acc.amenities).split(',').slice(0, 4).map((a, i) => (
                      <span key={i} className="amenity-tag">{a.trim()}</span>
                    ))}
                  </div>
                )}

                <div className="accom-footer">
                  <div className="accom-price">
                    <span className="price-amount">{formatPrice(acc.price, acc.currency)}</span>
                    <span className="price-per"> / 1박</span>
                  </div>
                  <button
                    className="accom-book-btn"
                    onClick={(e) => { e.stopPropagation(); handleBook(acc) }}
                  >
                    예약하기 ↗
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
