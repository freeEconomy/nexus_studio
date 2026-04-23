import React from 'react'

// 목적지 → 통화 정보 (symbol, name, 일일 참고 예산 범위 [최소, 최대])
const CURRENCY_MAP = [
  { pattern: /도쿄|오사카|교토|후쿠오카|삿포로|나고야|일본/i,
    symbol: '¥', name: '엔(JPY)', daily: [8000, 15000] },
  { pattern: /베이징|상하이|청두|광저우|시안|선전|중국/i,
    symbol: '¥', name: '위안(CNY)', daily: [200, 500] },
  { pattern: /뉴욕|로스앤젤레스|샌프란시스코|시카고|라스베가스|하와이|미국/i,
    symbol: '$', name: '달러(USD)', daily: [80, 150] },
  { pattern: /런던|영국/i,
    symbol: '£', name: '파운드(GBP)', daily: [60, 120] },
  { pattern: /파리|바르셀로나|로마|암스테르담|프랑크푸르트|마드리드|유럽/i,
    symbol: '€', name: '유로(EUR)', daily: [70, 130] },
  { pattern: /방콕|치앙마이|푸켓|태국/i,
    symbol: '฿', name: '바트(THB)', daily: [1500, 3500] },
  { pattern: /싱가포르/i,
    symbol: 'S$', name: '싱가포르달러(SGD)', daily: [80, 160] },
  { pattern: /홍콩/i,
    symbol: 'HK$', name: '홍콩달러(HKD)', daily: [500, 1000] },
  { pattern: /타이베이|대만/i,
    symbol: 'NT$', name: '대만달러(TWD)', daily: [1500, 3000] },
  { pattern: /하노이|호치민|다낭|베트남/i,
    symbol: '₫', name: '동(VND)', daily: [300000, 700000] },
  { pattern: /발리|자카르타|인도네시아/i,
    symbol: 'Rp', name: '루피아(IDR)', daily: [300000, 700000] },
  { pattern: /시드니|멜버른|호주/i,
    symbol: 'A$', name: '호주달러(AUD)', daily: [80, 150] },
  { pattern: /두바이|아랍에미리트/i,
    symbol: 'AED', name: '디르함(AED)', daily: [200, 400] },
  { pattern: /서울|부산|제주|인천|광주|대구|한국/i,
    symbol: '원', name: '원(KRW)', daily: [80000, 150000] },
]

function getCurrency(destination) {
  if (!destination) return { symbol: '원', name: '원(KRW)', daily: [80000, 150000] }
  for (const entry of CURRENCY_MAP) {
    if (entry.pattern.test(destination)) return entry
  }
  return { symbol: '원', name: '원(KRW)', daily: [80000, 150000] }
}

function fmt(amount, symbol) {
  if (amount === null || amount === undefined || amount === 0) return '무료'
  const s = Number(amount).toLocaleString()
  return symbol === '원' ? `${s}원` : `${symbol}${s}`
}

export default function ItineraryTab({ itinerary, destination, dayCount }) {
  if (!itinerary || itinerary.length === 0) {
    return (
      <div className="tp-tab-content">
        <p className="empty-state">일정 정보를 준비 중입니다.</p>
      </div>
    )
  }

  const currency = getCurrency(destination)
  const days = dayCount || itinerary.length

  const totalActivityCost = itinerary.reduce(
    (sum, day) => sum + day.activities.reduce((s, a) => s + (Number(a.cost) || 0), 0),
    0
  )

  return (
    <div className="tp-tab-content itinerary-tab">
      <div className="itinerary-header">
        <h2>📅 {destination} 일정 코스</h2>
        <p className="itinerary-subtitle">
          시간대별 일정 · 비용 단위: {currency.name}
        </p>
      </div>

      <div className="itinerary-list">
        {itinerary.map(day => (
          <div key={day.day} className="day-schedule">
            <div className="day-header">
              <h3>📌 Day {day.day}</h3>
              <span className="day-date">{day.date}</span>
            </div>

            <div className="activities">
              {day.activities.map((activity, idx) => (
                <div key={activity.id} className={`activity-item activity-${activity.type}`}>
                  <div className="activity-time">
                    <div className="time-badge">{activity.time}</div>
                    {idx < day.activities.length - 1 && <div className="time-connector"></div>}
                  </div>

                  <div className="activity-body">
                    <div className="activity-header">
                      <h4>{activity.title || activity.activity || activity.name}</h4>
                      <span className="activity-cost">
                        {activity.cost ? fmt(activity.cost, currency.symbol) : '무료'}
                      </span>
                    </div>
                    <div className="activity-duration">
                      <span>⏳ {activity.duration}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 예상 비용 요약 */}
      <div className="itinerary-summary">
        <h3>💰 예상 비용 ({currency.name} 기준)</h3>
        <div className="cost-breakdown">
          {totalActivityCost > 0 ? (
            <div className="cost-item">
              <span>일정 내 활동 합산</span>
              <strong>{fmt(totalActivityCost, currency.symbol)}</strong>
            </div>
          ) : (
            <>
              <div className="cost-item">
                <span>식사</span>
                <strong>{fmt(currency.daily[0] * 0.4, currency.symbol)} ~ {fmt(currency.daily[1] * 0.4, currency.symbol)}</strong>
              </div>
              <div className="cost-item">
                <span>관광지 입장료</span>
                <strong>{fmt(currency.daily[0] * 0.35, currency.symbol)} ~ {fmt(currency.daily[1] * 0.35, currency.symbol)}</strong>
              </div>
              <div className="cost-item">
                <span>교통비</span>
                <strong>{fmt(currency.daily[0] * 0.25, currency.symbol)} ~ {fmt(currency.daily[1] * 0.25, currency.symbol)}</strong>
              </div>
            </>
          )}
          <hr />
          <div className="cost-item total">
            <span>전체 여행 예상 비용 ({days}일)</span>
            <strong>
              {fmt(currency.daily[0] * days, currency.symbol)}
              {' ~ '}
              {fmt(currency.daily[1] * days, currency.symbol)}
            </strong>
          </div>
        </div>
      </div>
    </div>
  )
}
