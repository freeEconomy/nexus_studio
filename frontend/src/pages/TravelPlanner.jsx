import React, { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import './TravelPlanner.css'
import TravelFlowChart from '../components/TravelFlowChart'
import TravelMap from '../components/TravelMap'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const VIEW_MODES = {
  STORY: 'story',
  TIMELINE: 'timeline',
  FLOWCHART: 'flowchart',
  MAP: 'map',
}

const VIEW_MODE_LABELS = {
  [VIEW_MODES.STORY]: '📖 스토리',
  [VIEW_MODES.TIMELINE]: '⏰ 타임라인',
  [VIEW_MODES.FLOWCHART]: '🔄 플로우차트',
  [VIEW_MODES.MAP]: '🗺️ 지도',
}

async function callEdgeFunction(fnName, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `HTTP ${res.status}`)
  }
  return res.json()
}

export default function TravelPlanner() {
  const [formData, setFormData] = useState({
    destination: '',
    startDate: '',
    endDate: '',
    arrivalTime: '',
    departureTime: '',
    options: [],
    adults: 2,
    children: 0,
    childAges: '',
  })
  const [status, setStatus] = useState('idle') // idle, loading, done, error
  const [result, setResult] = useState('')
  const [viewMode, setViewMode] = useState(VIEW_MODES.STORY)
  const [error, setError] = useState('')
  const resultRef = useRef(null)
  
  // API 데이터 상태
  const [travelData, setTravelData] = useState(null)
  const [routeData, setRouteData] = useState(null)

  const optionItems = [
    { id: 'tour', label: '🏛️ 투어 중심' },
    { id: 'relax', label: '🏖️ 휴양' },
    { id: 'withkids', label: '👶 아이와 함께' },
    { id: 'foodie', label: '🍽️ 맛집 탐방' },
    { id: 'shopping', label: '🛍️ 쇼핑' },
    { id: 'adventure', label: '🏔️ 액티비티' },
    { id: 'culture', label: '🎭 문화체험' },
    { id: 'nightlife', label: '🌃 나이트라이프' },
  ]

  const handleOptionToggle = (optionId) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options.includes(optionId)
        ? prev.options.filter(o => o !== optionId)
        : [...prev.options, optionId]
    }))
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleNumberChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: parseInt(value) || 0 }))
  }

  const handleSubmit = async () => {
    if (!formData.destination || !formData.startDate || !formData.endDate) {
      setError('여행지와 기간을 입력해주세요.')
      return
    }

    setStatus('loading')
    setError('')
    setResult('')

    try {
      const prompt = buildPrompt()
      const data = await callEdgeFunction('query-gemini', {
        messages: [{ role: 'user', content: prompt }],
        model: 'gemini-2.5-flash-lite',
      })
      setResult(data.result)
      
      // 여행지에 따른 동적 데이터 생성
      const destination = formData.destination
      const mockTravelData = {
        destination: destination,
        origin: { name: '서울', coords: [37.5665, 126.9780] },
        destinationCoords: getDestinationCoords(destination),
        flights: [
          {
            airline: '대한항공',
            departure: '인천',
            arrival: destination,
            departure_time: '10:00',
          }
        ],
        accommodations: [
          {
            name: `${destination} 그랜드 호텔`,
            rating: 4.5,
            location: `${destination} 시내`,
            coords: getDestinationCoords(destination),
          }
        ],
        attractions: getAttractions(destination),
        weather: {
          city: destination,
          forecasts: [{ temp: 18, description: '맑음' }],
        },
      }
      setTravelData(mockTravelData)
      
      // 경로 데이터 생성
      setRouteData({
        geometry: {
          coordinates: [
            [126.9780, 37.5665],
            ...getRouteCoords(destination),
          ],
        },
      })
      
      setStatus('done')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  // 여행지별 좌표 반환
  const getDestinationCoords = (destination) => {
    const coords = {
      '도쿄': [35.6762, 139.6503],
      '오사카': [34.6937, 135.5023],
      '제주': [33.4996, 126.5312],
      '부산': [35.1796, 129.0756],
      '서울': [37.5665, 126.9780],
      '다낭': [16.0544, 108.2022],
      '나트랑': [12.2388, 109.1967],
      '푸꾸옥': [10.2899, 103.9841],
      '발리': [-8.3405, 115.0920],
      '방콕': [13.7563, 100.5018],
      '싱가포르': [1.3521, 103.8198],
      '대만': [25.0330, 121.5654],
      '타이페이': [25.0330, 121.5654],
      '홍콩': [22.3193, 114.1694],
      '괌': [13.4443, 144.7937],
      '사이판': [15.1778, 145.7500],
      '하와이': [21.3099, -157.8581],
      '호놀룰루': [21.3099, -157.8581],
      '로스앤젤레스': [34.0522, -118.2437],
      '뉴욕': [40.7128, -74.0060],
      '샌프란시스코': [37.7749, -122.4194],
      '라스베이거스': [36.1699, -115.1398],
      '시드니': [-33.8688, 151.2093],
      '멜버른': [-37.8136, 144.9631],
      '오클랜드': [-36.8509, 174.7645],
      '파리': [48.8566, 2.3522],
      '런던': [51.5074, -0.1278],
      '로마': [41.9028, 12.4964],
      '바르셀로나': [41.3851, 2.1734],
      '마드리드': [40.4168, -3.7038],
      '베를린': [52.5200, 13.4050],
      '취리히': [47.3769, 8.5417],
      '빈': [48.2082, 16.3738],
      '프라하': [50.0755, 14.4378],
      '두바이': [25.2048, 55.2708],
      '이스탄불': [41.0082, 28.9784],
      '모스크바': [55.7558, 37.6173],
      '상하이': [31.2304, 121.4737],
      '베이징': [39.9042, 116.4074],
      ' 홍콩': [22.3193, 114.1694],
    }
    // 기본값 (도쿄)
    for (const [key, value] of Object.entries(coords)) {
      if (destination.includes(key)) return value
    }
    return [35.6762, 139.6503] // 도쿄 기본값
  }

  // 여행지별 관광명소 반환
  const getAttractions = (destination) => {
    const attractions = {
      '도쿄': [
        { name: '시부야 스크램블 교차로', coords: [35.6595, 139.7004] },
        { name: '아사쿠사 센소지', coords: [35.7148, 139.7967] },
        { name: '도쿄타워', coords: [35.6586, 139.7454] },
      ],
      '오사카': [
        { name: '도톤보리', coords: [34.6686, 135.5023] },
        { name: '오사카성', coords: [34.6873, 135.5262] },
        { name: '유니버설 스튜디오 재팬', coords: [34.6654, 135.4329] },
      ],
      '제주': [
        { name: '한라산', coords: [33.3615, 126.5351] },
        { name: '성산일출봉', coords: [33.4595, 126.9436] },
        { name: '천제연 폭포', coords: [33.2502, 126.4297] },
      ],
      '부산': [
        { name: '해운대 해수욕장', coords: [35.1585, 129.1603] },
        { name: '감천문화마을', coords: [35.1020, 129.0248] },
        { name: '광안리 해수욕장', coords: [35.1475, 129.1136] },
      ],
      '다낭': [
        { name: '미케 비치', coords: [16.0678, 108.2442] },
        { name: '바나힐', coords: [15.9372, 107.9906] },
        { name: '마블 마운틴', coords: [16.0054, 108.2581] },
      ],
      '발리': [
        { name: '우붓 몽키 포레스트', coords: [-8.5173, 115.2624] },
        { name: '타나롯 사원', coords: [-8.6211, 115.0868] },
        { name: '꾸따 비치', coords: [-8.7184, 115.1686] },
      ],
      '방콕': [
        { name: '왕궁', coords: [13.7500, 100.4914] },
        { name: '왓 아룬', coords: [13.7437, 100.4887] },
        { name: '카오산 로드', coords: [13.7589, 100.4977] },
      ],
      '싱가포르': [
        { name: '마리나 베이 샌즈', coords: [1.2834, 103.8607] },
        { name: '가든스 바이 더 베이', coords: [1.2816, 103.8636] },
        { name: '센토사 섬', coords: [1.2494, 103.8303] },
      ],
      '파리': [
        { name: '에펠탑', coords: [48.8584, 2.2945] },
        { name: '루브르 박물관', coords: [48.8606, 2.3376] },
        { name: '노트르담 대성당', coords: [48.8530, 2.3499] },
      ],
      '런던': [
        { name: '빅벤', coords: [51.5007, -0.1246] },
        { name: '런던아이', coords: [51.5033, -0.1196] },
        { name: '타워브리지', coords: [51.5055, -0.0754] },
      ],
      '로마': [
        { name: '콜로세움', coords: [41.8902, 12.4922] },
        { name: '바티칸 시국', coords: [41.9029, 12.4534] },
        { name: '트레비 분수', coords: [41.9009, 12.4833] },
      ],
    }
    
    for (const [key, value] of Object.entries(attractions)) {
      if (destination.includes(key)) return value
    }
    return [
      { name: `${destination} 시내 관광`, coords: getDestinationCoords(destination) },
      { name: `${destination} 박물관`, coords: getDestinationCoords(destination) },
      { name: `${destination} 시장`, coords: getDestinationCoords(destination) },
    ]
  }

  // 경로 좌표 생성
  const getRouteCoords = (destination) => {
    const destCoords = getDestinationCoords(destination)
    const midPoints = [
      [(126.9780 + destCoords[1]) / 2 + (Math.random() - 0.5) * 10, 
       (37.5665 + destCoords[0]) / 2 + (Math.random() - 0.5) * 5],
      [destCoords[1] - 2 + Math.random() * 4, destCoords[0] - 1 + Math.random() * 2],
    ]
    return midPoints
  }

  const buildPrompt = () => {
    const optionsText = formData.options.length > 0
      ? formData.options.map(o => optionItems.find(item => item.id === o)?.label).join(', ')
      : '특정 옵션 없음'

    const childrenText = formData.children > 0
      ? `아이 ${formData.children}명 (${formData.childAges || '나이 미기재'})`
      : '아이 없음'

    const timeText = [
      formData.arrivalTime && `도착시간: ${formData.arrivalTime}`,
      formData.departureTime && `출발시간: ${formData.departureTime}`,
    ].filter(Boolean).join(', ')

    return `
여행 플래너로서 다음 정보를 바탕으로 상세한 여행 일정을 만들어주세요.

【여행 정보】
- 여행지: ${formData.destination}
- 여행 기간: ${formData.startDate} ~ ${formData.endDate}
- 시간 정보: ${timeText || '미정'}
- 여행 옵션: ${optionsText}
- 여행 인원: 어른 ${formData.adults}명, ${childrenText}

【요청 사항】
1. 추천 관광명소 (옵션에 맞게)
2. 추천 숙소 (인원과 옵션에 맞게)
3. 일일 상세 일정표 (시간대별)
4. 이동 경로 및 교통수단
5. 예산 추정치
6. 팁 및 주의사항

【출력 형식】
- 마크다운 형식으로 작성
- 일정은 시간대별로 상세히
- 추천 장소는 이유와 함께
- 가족 단위 여행객에게 유용한 정보 포함
- 가능한 구체적인 정보 (주소, 영업시간, 요금 등)
`
  }

  const handleReset = () => {
    setFormData({
      destination: '',
      startDate: '',
      endDate: '',
      arrivalTime: '',
      departureTime: '',
      options: [],
      adults: 2,
      children: 0,
      childAges: '',
    })
    setStatus('idle')
    setResult('')
    setError('')
    setViewMode(VIEW_MODES.STORY)
    setTravelData(null)
    setRouteData(null)
  }

  useEffect(() => {
    if (resultRef.current && status === 'done') {
      resultRef.current.scrollTop = 0
    }
  }, [status, viewMode])

  const renderViewMode = () => {
    switch (viewMode) {
      case VIEW_MODES.STORY:
        return (
          <div className="result-content story-view" ref={resultRef}>
            {status === 'loading' && (
              <div className="loading-state">
                <div className="loading-dots">
                  <span /><span /><span />
                </div>
                <p>여행 일정을 생성하고 있습니다...</p>
              </div>
            )}
            {status === 'done' && (
              <ReactMarkdown className="markdown-content">
                {result}
              </ReactMarkdown>
            )}
          </div>
        )
      case VIEW_MODES.TIMELINE:
        return (
          <div className="result-content timeline-view" ref={resultRef}>
            {status === 'loading' && (
              <div className="loading-state">
                <div className="loading-dots">
                  <span /><span /><span />
                </div>
                <p>타임라인을 생성하고 있습니다...</p>
              </div>
            )}
            {status === 'done' && travelData && (
              <div className="timeline-container">
                <div className="timeline-visual">
                  <div className="timeline-item start">
                    <div className="timeline-marker">🛫</div>
                    <div className="timeline-content">
                      <h4>출발</h4>
                      <p>서울 → {travelData.destination}</p>
                    </div>
                  </div>
                  
                  {travelData.flights && travelData.flights.length > 0 && (
                    <div className="timeline-item">
                      <div className="timeline-marker">✈️</div>
                      <div className="timeline-content">
                        <h4>{travelData.flights[0].airline}</h4>
                        <p>{travelData.flights[0].departure} → {travelData.flights[0].arrival}</p>
                        <p className="time">{travelData.flights[0].departure_time}</p>
                      </div>
                    </div>
                  )}
                  
                  {travelData.accommodations && travelData.accommodations.length > 0 && (
                    <div className="timeline-item">
                      <div className="timeline-marker">🏨</div>
                      <div className="timeline-content">
                        <h4>{travelData.accommodations[0].name}</h4>
                        <p>⭐ {travelData.accommodations[0].rating}</p>
                      </div>
                    </div>
                  )}
                  
                  {travelData.attractions && travelData.attractions.map((attr, idx) => (
                    <div className="timeline-item" key={idx}>
                      <div className="timeline-marker">🎯</div>
                      <div className="timeline-content">
                        <h4>{attr.name}</h4>
                      </div>
                    </div>
                  ))}
                  
                  <div className="timeline-item end">
                    <div className="timeline-marker">🏠</div>
                    <div className="timeline-content">
                      <h4>귀국</h4>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      case VIEW_MODES.FLOWCHART:
        return (
          <div className="result-content flowchart-view" ref={resultRef}>
            {status === 'loading' && (
              <div className="loading-state">
                <div className="loading-dots">
                  <span /><span /><span />
                </div>
                <p>플로우차트를 생성하고 있습니다...</p>
              </div>
            )}
            {status === 'done' && travelData && (
              <div className="flowchart-container">
                <h3>🔄 플로우차트 뷰</h3>
                <p className="view-description">여행 흐름을 도식화하여 표시합니다.</p>
                <TravelFlowChart travelData={travelData} />
              </div>
            )}
          </div>
        )
      case VIEW_MODES.MAP:
        return (
          <div className="result-content map-view" ref={resultRef}>
            {status === 'loading' && (
              <div className="loading-state">
                <div className="loading-dots">
                  <span /><span /><span />
                </div>
                <p>지도 정보를 생성하고 있습니다...</p>
              </div>
            )}
            {status === 'done' && travelData && (
              <div className="map-container">
                <h3>🗺️ 지도 뷰</h3>
                <p className="view-description">여행지의 지리적 위치와 경로를 표시합니다.</p>
                <TravelMap travelData={travelData} routeData={routeData} />
              </div>
            )}
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="travel-planner">
      <div className="tp-header">
        <h1>✈️ 여행 플래너</h1>
        <p>여행 정보를 입력하시면 AI가 맞춤형 여행 일정을 만들어드립니다</p>
      </div>

      <div className="tp-container">
        {/* 입력 폼 */}
        <div className="tp-form">
          <h2>여행 정보 입력</h2>
          
          <div className="form-group">
            <label>여행지 *</label>
            <input
              type="text"
              name="destination"
              value={formData.destination}
              onChange={handleInputChange}
              placeholder="예: 일본 오사카, 제주, 베트남 다낭"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>시작일 *</label>
              <input
                type="date"
                name="startDate"
                value={formData.startDate}
                onChange={handleInputChange}
              />
            </div>
            <div className="form-group">
              <label>종료일 *</label>
              <input
                type="date"
                name="endDate"
                value={formData.endDate}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>도착시간</label>
              <input
                type="time"
                name="arrivalTime"
                value={formData.arrivalTime}
                onChange={handleInputChange}
              />
            </div>
            <div className="form-group">
              <label>출발시간</label>
              <input
                type="time"
                name="departureTime"
                value={formData.departureTime}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label>여행 옵션</label>
            <div className="options-grid">
              {optionItems.map(item => (
                <label key={item.id} className="option-checkbox">
                  <input
                    type="checkbox"
                    checked={formData.options.includes(item.id)}
                    onChange={() => handleOptionToggle(item.id)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>어른 인원</label>
              <input
                type="number"
                name="adults"
                value={formData.adults}
                onChange={handleNumberChange}
                min="1"
                max="10"
              />
            </div>
            <div className="form-group">
              <label>아이 인원</label>
              <input
                type="number"
                name="children"
                value={formData.children}
                onChange={handleNumberChange}
                min="0"
                max="10"
              />
            </div>
          </div>

          {formData.children > 0 && (
            <div className="form-group">
              <label>아이 나이 (선택사항)</label>
              <input
                type="text"
                name="childAges"
                value={formData.childAges}
                onChange={handleInputChange}
                placeholder="예: 5세, 7세"
              />
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button
              className="btn-reset"
              onClick={handleReset}
              disabled={status === 'loading'}
            >
              초기화
            </button>
            <button
              className="btn-submit"
              onClick={handleSubmit}
              disabled={status === 'loading'}
            >
              {status === 'loading' ? '일정 생성 중...' : '여행 일정 만들기'}
            </button>
          </div>
        </div>

        {/* 결과 영역 */}
        {(status === 'loading' || status === 'done' || status === 'error') && result && (
          <div className="tp-result">
            <div className="result-header">
              <h2>📋 생성된 여행 일정</h2>
              <div className="view-modes">
                {Object.entries(VIEW_MODE_LABELS).map(([mode, label]) => (
                  <button
                    key={mode}
                    className={`view-btn ${viewMode === mode ? 'active' : ''}`}
                    onClick={() => setViewMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {renderViewMode()}
          </div>
        )}
      </div>
    </div>
  )
}