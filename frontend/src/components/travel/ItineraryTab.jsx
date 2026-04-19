import React from 'react'

export default function ItineraryTab({ itinerary, destination }) {
  if (!itinerary || itinerary.length === 0) {
    return (
      <div className="tp-tab-content">
        <p className="empty-state">일정 정보를 준비 중입니다.</p>
      </div>
    )
  }

  return (
    <div className="tp-tab-content itinerary-tab">
      <div className="itinerary-header">
        <h2>📅 {destination} 일정 코스</h2>
        <p className="itinerary-subtitle">시간대별 일정을 확인하세요</p>
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
                      <span className="activity-cost">{activity.cost ? `${activity.cost.toLocaleString()}원` : '무료'}</span>
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

      {/* 일정 요약 */}
      <div className="itinerary-summary">
        <h3>💰 예상 비용</h3>
        <div className="cost-breakdown">
          <div className="cost-item">
            <span>식사</span>
            <strong>50,000 - 100,000원</strong>
          </div>
          <div className="cost-item">
            <span>관광지 입장료</span>
            <strong>30,000 - 50,000원</strong>
          </div>
          <div className="cost-item">
            <span>교통비</span>
            <strong>10,000 - 20,000원</strong>
          </div>
          <hr />
          <div className="cost-item total">
            <span>일일 예상 비용</span>
            <strong>100,000 - 170,000원</strong>
          </div>
        </div>
      </div>
    </div>
  )
}
