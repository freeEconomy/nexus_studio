import React from 'react'

function formatTime(isoString) {
  if (!isoString) return '--:--'
  return new Date(isoString).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatDate(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

function formatPrice(price, currency) {
  if (!price) return '가격 문의'
  const num = parseFloat(price)
  if (isNaN(num)) return '가격 문의'
  if (!currency || currency === 'KRW') return `₩${Math.round(num).toLocaleString()}`
  return `${currency} ${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export default function FlightsTab({ flights, originCode, destCode, originCity, destination, date, error }) {
  if (!originCity) {
    return (
      <div className="tp-tab-content">
        <div className="flights-header">
          <h2>✈️ 항공편 검색</h2>
        </div>
        <div className="flights-empty">
          <span className="flights-empty-icon">✈️</span>
          <p>출발 도시를 입력하면 항공편을 검색합니다.</p>
          <p className="flights-empty-sub">여행 계획 생성 폼에서 출발 도시를 입력해주세요.</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="tp-tab-content">
        <div className="flights-header">
          <h2>✈️ 항공편 검색</h2>
          <p className="flights-subtitle">{originCity} → {destination}</p>
        </div>
        <div className="flights-empty">
          <span className="flights-empty-icon">⚠️</span>
          <p>{error}</p>
          <a
            className="flights-ext-link"
            href={`https://www.google.com/travel/flights?q=${encodeURIComponent(`${originCity} ${destination} ${date || ''}`)}`}
            target="_blank"
            rel="noreferrer"
          >
            Google Flights에서 직접 검색 ↗
          </a>
        </div>
      </div>
    )
  }

  if (!flights || flights.length === 0) {
    return (
      <div className="tp-tab-content">
        <div className="flights-header">
          <h2>✈️ 항공편 검색</h2>
          <p className="flights-subtitle">{originCity} → {destination}</p>
        </div>
        <div className="flights-empty">
          <span className="flights-empty-icon">🔍</span>
          <p>항공편 정보를 찾을 수 없습니다.</p>
          <a
            className="flights-ext-link"
            href={`https://www.google.com/travel/flights?q=${encodeURIComponent(`${originCity} ${destination} ${date || ''}`)}`}
            target="_blank"
            rel="noreferrer"
          >
            Google Flights에서 직접 검색 ↗
          </a>
        </div>
      </div>
    )
  }

  const handleBook = (flight) => {
    const q = `${flight.airline || ''} ${originCity} ${destination} ${date || ''}`.trim()
    window.open(`https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`, '_blank')
  }

  return (
    <div className="tp-tab-content flights-tab">
      <div className="flights-header">
        <h2>✈️ 항공편 검색</h2>
        <p className="flights-subtitle">
          {originCity} ({originCode}) → {destination} ({destCode})
          {date && ` · ${new Date(date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}`}
          <span className="flights-note"> · 클릭 시 Google Flights로 이동</span>
        </p>
      </div>

      <div className="flights-list">
        {flights.map((flight, idx) => (
          <div key={flight.id || idx} className="flight-card" onClick={() => handleBook(flight)}>
            <div className="flight-card-top">
              <div className="flight-airline">
                <span className="airline-name">{flight.airline || '항공사 미상'}</span>
                {flight.flight_number && (
                  <span className="flight-number">{flight.flight_number}</span>
                )}
              </div>
              <div className="flight-price">
                <span className="price-amount">{formatPrice(flight.price, flight.currency)}</span>
                <span className="price-per"> / 1인</span>
              </div>
            </div>

            <div className="flight-route">
              <div className="flight-endpoint">
                <span className="flight-time">{formatTime(flight.departure_time)}</span>
                <span className="flight-city">{flight.departure || originCode}</span>
              </div>
              <div className="flight-middle">
                <span className="flight-duration">{flight.duration || ''}</span>
                <div className="flight-line">✈</div>
                <span className="flight-direct">직항</span>
              </div>
              <div className="flight-endpoint arrival">
                <span className="flight-time">{formatTime(flight.arrival_time)}</span>
                <span className="flight-city">{flight.arrival || destCode}</span>
              </div>
            </div>

            <div className="flight-card-footer">
              <span className="flight-date">{formatDate(flight.departure_time)}</span>
              <button className="flight-book-btn" onClick={(e) => { e.stopPropagation(); handleBook(flight) }}>
                Google Flights에서 예약 ↗
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
