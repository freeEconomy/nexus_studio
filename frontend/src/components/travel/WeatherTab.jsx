import React from 'react'

export default function WeatherTab({ weather, destination }) {
  if (!weather || weather.length === 0) {
    return (
      <div className="tp-tab-content">
        <p className="empty-state">날씨 정보를 준비 중입니다.</p>
      </div>
    )
  }

  const getWeatherEmoji = (description) => {
    const desc = description.toLowerCase()
    if (desc.includes('맑')) return '☀️'
    if (desc.includes('흐')) return '☁️'
    if (desc.includes('비')) return '🌧️'
    if (desc.includes('소나기')) return '⛈️'
    if (desc.includes('눈')) return '❄️'
    return '🌤️'
  }

  const getClothingRecommendation = (temp) => {
    if (temp >= 26) return ['반팔', '반바지', '선글라스', '모자', '썬크림']
    if (temp >= 20) return ['긴팔', '가벼운 자켓', '평상복']
    if (temp >= 15) return ['자켓', '긴팔', '청바지']
    if (temp >= 10) return ['겨울코트', '스카프', '장갑', '모자']
    return ['두꺼운 코트', '부츠', '장갑', '목도리']
  }

  return (
    <div className="tp-tab-content weather-tab">
      <div className="weather-header">
        <h2>🌤️ {destination} 날씨 정보</h2>
        <p className="weather-subtitle">여행 기간 날씨 예보입니다</p>
      </div>

      {/* 날씨 카드 그리드 */}
      <div className="weather-grid">
        {weather.map(day => (
          <div key={day.day} className="weather-card">
            <div className="weather-day">Day {day.day}</div>
            
            <div className="weather-emoji">
              {getWeatherEmoji(day.description)}
            </div>

            <div className="weather-temps">
              <div className="temp-row">
                <span className="temp-label">최고</span>
                <span className="temp-value max">{day.maxTemp}°</span>
              </div>
              <div className="temp-row">
                <span className="temp-label">최저</span>
                <span className="temp-value min">{day.minTemp}°</span>
              </div>
            </div>

            <div className="weather-description">
              {day.description}
            </div>

            <div className="weather-details">
              <div className="detail-item">
                <span className="label">💧</span>
                <span className="value">{day.humidity}%</span>
              </div>
              <div className="detail-item">
                <span className="label">💨</span>
                <span className="value">{day.windSpeed}km/h</span>
              </div>
              <div className="detail-item">
                <span className="label">☀️</span>
                <span className="value">UV {day.uvIndex}</span>
              </div>
            </div>

            {/* 복장 추천 */}
            <div className="clothing-recommendation">
              <div className="clothing-label">👕 추천 복장</div>
              <div className="clothing-items">
                {getClothingRecommendation(day.maxTemp).map((item, idx) => (
                  <span key={idx} className="clothing-item">{item}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 여행 준비물 체크리스트 */}
      <div className="packing-guide">
        <h3>🎒 여행 준비물 체크리스트</h3>
        <div className="checklist">
          <div className="checklist-section">
            <h4>필수 물품</h4>
            <ul>
              <li>✓ 여권 및 항공권</li>
              <li>✓ 신용카드/현금</li>
              <li>✓ 휴대폰</li>
              <li>✓ 충전기</li>
              <li>✓ 상비약</li>
            </ul>
          </div>
          
          <div className="checklist-section">
            <h4>의류</h4>
            <ul>
              <li>✓ 속옷 2-3장</li>
              <li>✓ 양말 2-3켤레</li>
              <li>✓ 잠옷</li>
              <li>✓ 겉옷</li>
              <li>✓ 신발</li>
            </ul>
          </div>

          <div className="checklist-section">
            <h4>세면도구</h4>
            <ul>
              <li>✓ 칫솔/치약</li>
              <li>✓ 스킨케어용품</li>
              <li>✓ 샴푸/바디워시 (호텔에서 제공)</li>
              <li>✓ 선글라스</li>
              <li>✓ 선크림</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
