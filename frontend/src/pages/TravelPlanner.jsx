import React, { useState } from "react"
import { createClient } from '@supabase/supabase-js'
import "./TravelPlanner.css"
import PlacesTab from "../components/travel/PlacesTab"
import RestaurantsTab from "../components/travel/RestaurantsTab"
import ItineraryTab from "../components/travel/ItineraryTab"
import MapTab from "../components/travel/MapTab"
import WeatherTab from "../components/travel/WeatherTab"

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

const TABS = [
  { id: "places", label: "여행지", icon: "📍" },
  { id: "restaurants", label: "맛집", icon: "🍽️" },
  { id: "itinerary", label: "일정", icon: "📅" },
  { id: "map", label: "지도", icon: "🗺️" },
  { id: "weather", label: "날씨", icon: "🌤️" },
]

export default function TravelPlanner() {
  const [formData, setFormData] = useState({
    destination: "",
    startDate: "",
    endDate: "",
    adults: 2,
    children: 0,
    childAges: "",
  })
  const [activeTab, setActiveTab] = useState("places")
  const [status, setStatus] = useState("idle")
  const [error, setError] = useState("")
  const [travelData, setTravelData] = useState(null)
  const [isGenerated, setIsGenerated] = useState(false)
  const [recentSearches, setRecentSearches] = useState([])
  const [showRecentSearches, setShowRecentSearches] = useState(false)

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleNumberChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: parseInt(value) || 0 }))
  }

  const handleTextChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

   const handleSubmit = async () => {
     if (!formData.destination || !formData.startDate || !formData.endDate) {
       setError("여행지와 기간을 입력해주세요.")
       return
     }

     setStatus("loading")
     setError("")

     try {
       const destination = formData.destination
       const startDate = new Date(formData.startDate)
       const endDate = new Date(formData.endDate)
       const dayCount = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1

       // API 연동 (실패시 자동으로 더미데이터로 폴백)
       let generatedData;
       
       try {
         generatedData = await generateTravelData(destination, dayCount);
       } catch (apiError) {
         console.log("API 호출 실패, 더미데이터로 대체:", apiError.message);
         const coordinates = await geocodeDestination(destination)
         generatedData = {
           destination,
           startDate: formData.startDate,
           endDate: formData.endDate,
           dayCount,
           coordinates,
           places: getPlacesData(destination, coordinates),
           restaurants: getRestaurantsData(destination, coordinates),
           itinerary: generateItinerary(destination, dayCount),
           weather: generateWeather(dayCount),
           routeCoordinates: generateRouteCoordinates(coordinates),
         }
       }

       setTravelData(generatedData)
       setIsGenerated(true)
       setStatus("done")
       
       // 최근 검색 저장
       saveRecentSearch({
         destination,
         startDate: formData.startDate,
         endDate: formData.endDate,
         adults: formData.adults,
         children: formData.children,
         childAges: formData.childAges,
       })
     } catch (err) {
       setError(err.message)
       setStatus("error")
     }
   }

// 3시간 간격 API 예보 → 일별 날씨 데이터로 변환
const processForecasts = (forecasts, dayCount) => {
  const byDate = {}
  forecasts.forEach(f => {
    const date = f.datetime?.split(' ')[0]
    if (!date) return
    if (!byDate[date]) byDate[date] = []
    byDate[date].push(f)
  })
  return Object.entries(byDate).slice(0, dayCount).map(([, items], idx) => {
    const temps = items.map(i => i.temp).filter(t => t != null)
    const mid = items[Math.floor(items.length / 2)] || items[0]
    return {
      day: idx + 1,
      maxTemp: Math.round(Math.max(...temps)),
      minTemp: Math.round(Math.min(...temps)),
      description: mid?.description || '맑음',
      humidity: Math.round(items.reduce((s, i) => s + (i.humidity || 0), 0) / items.length),
      windSpeed: Math.round((mid?.wind_speed || 0) * 3.6), // m/s → km/h
      uvIndex: 5,
    }
  })
}

// AI가 반환한 일정 JSON을 ItineraryTab 형식으로 정규화
const normalizeItinerary = (raw, destination, dayCount) => {
  try {
    // raw가 배열인지 { days: [...] } 구조인지 확인
    const days = Array.isArray(raw) ? raw : (raw.days || raw.itinerary || raw.schedule || [])
    if (!days.length) return generateItinerary(destination, dayCount)
    return days.slice(0, dayCount).map((day, idx) => ({
      day: day.day || idx + 1,
      date: day.date || `${idx + 1}일차`,
      activities: (day.activities || day.schedule || []).map((act, i) => ({
        id: act.id || i + 1,
        time: act.time || act.start_time || '10:00',
        title: act.title || act.activity || act.name || act.description || '활동',
        duration: act.duration || '1시간',
        cost: act.cost || act.price || 0,
        type: act.type || 'attraction',
      }))
    }))
  } catch {
    return generateItinerary(destination, dayCount)
  }
}

const generateTravelData = async (destination, dayCount) => {
  // 좌표를 먼저 자동 취득 (Nominatim geocoding)
  const coordinates = await geocodeDestination(destination)

  const [weatherRes, routeRes, itineraryRes] = await Promise.allSettled([
    // 1. 날씨 예보
    supabase.functions.invoke('query-weather', {
      body: { city: destination }
    }),
    // 2. 경로 정보
    supabase.functions.invoke('query-route', {
      body: {
        start: [coordinates.lng, coordinates.lat],
        end: [coordinates.lng, coordinates.lat],
      }
    }),
    // 3. AI 일정 생성
    supabase.functions.invoke('query-groq', {
      body: {
        model: "groq/compound-mini",
        messages: [{
          role: "user",
          content: `${destination} 여행 ${dayCount}일 일정을 JSON 배열로 만들어주세요. 형식: [{day:1, date:"1일차", activities:[{time:"09:00", title:"활동명", duration:"1시간", cost:0, type:"attraction"}]}]`
        }]
      }
    })
  ])

  // 날씨: 3시간 예보 → 일별 변환
  let weather = generateWeather(dayCount)
  if (weatherRes.status === 'fulfilled') {
    const forecasts = weatherRes.value.data?.forecasts
    if (forecasts?.length > 0) {
      const processed = processForecasts(forecasts, dayCount)
      if (processed.length > 0) weather = processed
    }
  }

  // 일정: AI 결과 정규화, 실패 시 더미데이터
  let itinerary = generateItinerary(destination, dayCount)
  if (itineraryRes.status === 'fulfilled') {
    const result = itineraryRes.value.data?.result
    if (result) {
      try {
        const jsonStr = typeof result === 'string'
          ? result.replace(/```json\s*|\s*```/g, '').trim()
          : JSON.stringify(result)
        itinerary = normalizeItinerary(JSON.parse(jsonStr), destination, dayCount)
      } catch {
        // 파싱 실패 → 더미데이터 유지
      }
    }
  }

  // 경로: GeoJSON [lng, lat] → Leaflet [lat, lng] 변환
  let routeCoordinates = generateRouteCoordinates(coordinates)
  if (routeRes.status === 'fulfilled') {
    const geom = routeRes.value.data?.geometry
    if (geom?.length > 0) {
      routeCoordinates = geom.map(coord => [coord[1], coord[0]])
    }
  }

  // prepare places and restaurants then enrich with images via fetch-image function
  let places = getPlacesData(destination, coordinates)
  let restaurants = getRestaurantsData(destination, coordinates)

  try {
    places = await Promise.all(places.map(async (p) => ({ ...p, image: await fetchImageFor(p.name) })))
  } catch (e) {
    console.log('places image enrichment failed', e.message)
    places = places.map(p => ({ ...p, image: getImageUrl(p.name) }))
  }

  try {
    restaurants = await Promise.all(restaurants.map(async (r) => ({ ...r, image: await fetchImageFor(r.name) })))
  } catch (e) {
    console.log('restaurants image enrichment failed', e.message)
    restaurants = restaurants.map(r => ({ ...r, image: getImageUrl(r.name) }))
  }

  return {
    destination,
    startDate: formData.startDate,
    endDate: formData.endDate,
    dayCount,
    coordinates,
    places,
    restaurants,
    itinerary,
    weather,
    routeCoordinates,
  }
}

  // 최근 검색 저장
  const saveRecentSearch = (data) => {
    const recent = JSON.parse(localStorage.getItem('travelRecentSearches') || '[]')
    const newSearch = {
      destination: data.destination,
      startDate: data.startDate,
      endDate: data.endDate,
      adults: data.adults,
      children: data.children,
      childAges: data.childAges || "",
      timestamp: new Date().toISOString(),
    }
    // 중복 제거 및 최대 5개 저장
    const filtered = recent.filter(r => 
      !(r.destination === newSearch.destination && r.startDate === newSearch.startDate)
    )
    const updated = [newSearch, ...filtered].slice(0, 5)
    localStorage.setItem('travelRecentSearches', JSON.stringify(updated))
    setRecentSearches(updated)
  }

  // 최근 검색 불러오기
  const loadRecentSearch = (search) => {
    setFormData({
      destination: search.destination,
      startDate: search.startDate,
      endDate: search.endDate,
      adults: search.adults,
      children: search.children,
      childAges: search.childAges || "",
    })
    setShowRecentSearches(false)
    handleSubmit()
  }

  // 컴포넌트 마운트 시 최근 검색 불러오기
  React.useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('travelRecentSearches') || '[]')
    setRecentSearches(saved)
  }, [])

  const handleReset = () => {
    setFormData({
      destination: "",
      startDate: "",
      endDate: "",
      adults: 2,
      children: 0,
      childAges: "",
    })
    setStatus("idle")
    setError("")
    setTravelData(null)
    setIsGenerated(false)
    setActiveTab("places")
  }

  const renderContent = () => {
    if (!isGenerated) {
      return (
        <div className="tp-form-container">
          <div className="tp-form-content">
            <h2>여행 계획하기</h2>
            {error && <div className="error-message">{error}</div>}
            <div className="form-group">
              <label htmlFor="destination">여행지 *</label>
              <input
                id="destination"
                type="text"
                name="destination"
                placeholder="예: 도쿄, 제주"
                value={formData.destination}
                onChange={handleInputChange}
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="startDate">출발일 *</label>
                <input
                  id="startDate"
                  type="date"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label htmlFor="endDate">귀국일 *</label>
                <input
                  id="endDate"
                  type="date"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="adults">성인</label>
                <input
                  id="adults"
                  type="number"
                  name="adults"
                  min="1"
                  value={formData.adults}
                  onChange={handleNumberChange}
                />
              </div>
              <div className="form-group">
                <label htmlFor="children">아이</label>
                <input
                  id="children"
                  type="number"
                  name="children"
                  min="0"
                  value={formData.children}
                  onChange={handleNumberChange}
                />
              </div>
            </div>
            {formData.children > 0 && (
              <div className="form-group">
                <label htmlFor="childAges">아이 나이 (쉼표로 구분)</label>
                <input
                  id="childAges"
                  type="text"
                  name="childAges"
                  placeholder="예: 5, 7, 10"
                  value={formData.childAges}
                  onChange={handleTextChange}
                />
              </div>
            )}
            <div className="form-actions">
              {recentSearches.length > 0 && (
                <button
                  className="btn-recent"
                  onClick={() => setShowRecentSearches(!showRecentSearches)}
                >
                  최근 검색
                </button>
              )}
              <button
                className="btn-submit"
                onClick={handleSubmit}
                disabled={status === "loading"}
              >
                {status === "loading" ? (
                  <span className="btn-loading">
                    <span className="spinner"></span>
                    생성 중...
                  </span>
                ) : "여행 계획 생성"}
              </button>
            </div>

            {showRecentSearches && recentSearches.length > 0 && (
              <div className="recent-searches">
                <h3>최근 검색</h3>
                <ul>
                  {recentSearches.map((search, idx) => (
                    <li key={idx} onClick={() => loadRecentSearch(search)}>
                      <span className="recent-destination">{search.destination}</span>
                      <span className="recent-date">
                        {new Date(search.startDate).toLocaleDateString('ko-KR')} ~ {new Date(search.endDate).toLocaleDateString('ko-KR')}
                      </span>
                      <span className="recent-people">
                        {search.adults + search.children}명
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="tp-content-wrapper">
        {activeTab === "places" && <PlacesTab places={travelData.places} destination={travelData.destination} />}
        {activeTab === "restaurants" && <RestaurantsTab restaurants={travelData.restaurants} destination={travelData.destination} />}
        {activeTab === "itinerary" && <ItineraryTab itinerary={travelData.itinerary} destination={travelData.destination} />}
        {activeTab === "map" && <MapTab places={travelData.places} restaurants={travelData.restaurants} destination={travelData.destination} coordinates={travelData.coordinates} routeCoordinates={travelData.routeCoordinates} />}
        {activeTab === "weather" && <WeatherTab weather={travelData.weather} destination={travelData.destination} />}
      </div>
    )
  }

  return (
    <div className="travel-planner">
      <div className="tp-header">
        <h1>✈️ 여행 플래너</h1>
        <p>나만의 맞춤 여행 계획을 만들어보세요</p>
      </div>
      {isGenerated && (
        <div className="tp-nav-bar">
          <div className="tp-nav-content">
            <div className="tp-title">
              <div className="destination-name">{travelData.destination}</div>
              <div className="date-range">
                {new Date(travelData.startDate).toLocaleDateString("ko-KR")} ~ {new Date(travelData.endDate).toLocaleDateString("ko-KR")}
              </div>
            </div>
            <div className="tp-tabs">
              {TABS.map(tab => (
                <button key={tab.id} className={`tp-tab ${activeTab === tab.id ? "active" : ""}`} onClick={() => setActiveTab(tab.id)}>
                  <span className="tab-icon">{tab.icon}</span>
                  <span className="tab-label">{tab.label}</span>
                </button>
              ))}
            </div>
            <button className="btn-reset" onClick={handleReset}>
              처음부터
            </button>
          </div>
        </div>
      )}
      {renderContent()}
    </div>
  )
}

// Nominatim(OpenStreetMap) 지오코딩 — API 키 불필요, 어떤 도시든 자동 처리
const geocodeDestination = async (destination) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(destination)}&format=json&limit=1&accept-language=ko`,
      { headers: { 'User-Agent': 'NexusStudio-TravelPlanner/1.0' } }
    )
    const data = await res.json()
    if (data[0]) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    }
  } catch (e) {
    console.log('Geocoding 실패:', e.message)
  }
  return { lat: 37.5665, lng: 126.9780 } // 기본값: 서울
}

const getPlacesData = (destination, coords = { lat: 37.5665, lng: 126.9780 }) => {
  const places = {
    "도쿄": [
      { id: 1, name: "센소지 사원", category: "역사", rating: 4.8, reviews: 2340, image: "⛩️", address: "타이토구", hours: "06:00-17:00", price: "무료", duration: "2시간", tips: "아침 방문 추천", description: "도쿄 가장 오래된 사원", coords: { lat: 35.7149, lng: 139.7967 } },
      { id: 2, name: "시부야 스크램블", category: "현대", rating: 4.6, reviews: 5210, image: "🏙️", address: "시부야구", hours: "24h", price: "무료", duration: "1시간", tips: "밤 야경 추천", description: "세계 최대 횡단보도", coords: { lat: 35.6595, lng: 139.7004 } },
      { id: 3, name: "메이지 신궁", category: "자연", rating: 4.7, reviews: 1890, image: "🌲", address: "시부야구", hours: "09:00-16:30", price: "무료", duration: "1.5시간", tips: "조용한 숲 산책", description: "넓은 신궁 숲", coords: { lat: 35.6762, lng: 139.6997 } },
      { id: 4, name: "도쿄 타워", category: "현대", rating: 4.5, reviews: 3450, image: "🗼", address: "미나토구", hours: "09:00-23:00", price: "900엔~", duration: "1.5시간", tips: "저녁 야경 추천", description: "도쿄 상징 철탑", coords: { lat: 35.6586, lng: 139.7454 } },
    ],
    "제주": [
      { id: 1, name: "한라산", category: "자연", rating: 4.9, reviews: 4560, image: "⛰️", address: "제주시", hours: "07:00-일몰", price: "무료", duration: "6시간", tips: "편한 신발 필수", description: "한국 최고봉 1,950m", coords: { lat: 33.3618, lng: 126.5296 } },
      { id: 2, name: "성산 일출봉", category: "자연", rating: 4.8, reviews: 3210, image: "🌅", address: "서귀포시", hours: "상시", price: "2000원", duration: "2시간", tips: "일출 감상 추천", description: "유네스코 세계자연유산", coords: { lat: 33.4608, lng: 126.9426 } },
      { id: 3, name: "용머리 해안", category: "자연", rating: 4.6, reviews: 2890, image: "🏖️", address: "서귀포시", hours: "08:00-일몰", price: "무료", duration: "1.5시간", tips: "물때 확인 필수", description: "신비로운 해안 절벽", coords: { lat: 33.2422, lng: 126.2629 } },
      { id: 4, name: "여미지 식물원", category: "공원", rating: 4.5, reviews: 1540, image: "🌺", address: "서귀포시", hours: "09:00-18:00", price: "12000원", duration: "2시간", tips: "사진 명소", description: "열대 식물원", coords: { lat: 33.2516, lng: 126.4088 } },
    ],
    "서울": [
      { id: 1, name: "경복궁", category: "역사", rating: 4.8, reviews: 5600, image: "🏯", address: "종로구", hours: "09:00-18:00", price: "3000원", duration: "2시간", tips: "한복 대여 추천", description: "조선 왕조 정궁", coords: { lat: 37.5796, lng: 126.9770 } },
      { id: 2, name: "남산 서울타워", category: "현대", rating: 4.7, reviews: 4200, image: "🗼", address: "용산구", hours: "10:00-23:00", price: "21000원~", duration: "2시간", tips: "야경 추천", description: "서울 전경 조망 명소", coords: { lat: 37.5512, lng: 126.9882 } },
      { id: 3, name: "북촌 한옥마을", category: "역사", rating: 4.5, reviews: 2890, image: "🏘️", address: "종로구", hours: "상시", price: "무료", duration: "2시간", tips: "이른 아침 방문", description: "전통 한옥 골목", coords: { lat: 37.5830, lng: 126.9837 } },
      { id: 4, name: "홍대 거리", category: "문화", rating: 4.4, reviews: 3100, image: "🎨", address: "마포구", hours: "24h", price: "무료", duration: "3시간", tips: "저녁 활기참", description: "예술·문화·쇼핑 거리", coords: { lat: 37.5563, lng: 126.9233 } },
    ],
    "오사카": [
      { id: 1, name: "오사카성", category: "역사", rating: 4.7, reviews: 4800, image: "🏯", address: "주오구", hours: "09:00-17:00", price: "600엔", duration: "2시간", tips: "벚꽃 시즌 추천", description: "도요토미 히데요시의 성", coords: { lat: 34.6873, lng: 135.5262 } },
      { id: 2, name: "도톤보리", category: "현대", rating: 4.6, reviews: 6300, image: "🦀", address: "나니와구", hours: "24h", price: "무료", duration: "2시간", tips: "저녁 네온사인 추천", description: "오사카 대표 번화가", coords: { lat: 34.6687, lng: 135.5013 } },
      { id: 3, name: "유니버설 스튜디오", category: "테마파크", rating: 4.8, reviews: 8900, image: "🎢", address: "사쿠시마", hours: "09:00-21:00", price: "8600엔~", duration: "하루 종일", tips: "패스트패스 추천", description: "세계적 테마파크", coords: { lat: 34.6654, lng: 135.4324 } },
      { id: 4, name: "신사이바시", category: "쇼핑", rating: 4.4, reviews: 3200, image: "🛍️", address: "주오구", hours: "11:00-21:00", price: "무료", duration: "2시간", tips: "쇼핑 천국", description: "아케이드 쇼핑거리", coords: { lat: 34.6721, lng: 135.5013 } },
    ],
  }
  if (places[destination]) return places[destination].map(p => ({ ...p, image: getImageUrl(p.name) }))

  // 알 수 없는 여행지: geocoding으로 받은 coords 사용
  const c = coords
  return [
    { id: 1, name: `${destination} 구시가지`, category: "역사", rating: 4.5, reviews: 1800, image: getImageUrl(`${destination} 구시가지`), address: destination, hours: "09:00-18:00", price: "무료", duration: "2시간", tips: "아침 방문 추천", description: `${destination}의 역사적 중심지`, coords: { lat: c.lat + 0.01, lng: c.lng } },
    { id: 2, name: `${destination} 중앙공원`, category: "자연", rating: 4.3, reviews: 1200, image: getImageUrl(`${destination} 중앙공원`), address: destination, hours: "06:00-22:00", price: "무료", duration: "1.5시간", tips: "산책 코스", description: "도심 속 자연 휴식처", coords: { lat: c.lat - 0.01, lng: c.lng + 0.01 } },
    { id: 3, name: `${destination} 전통시장`, category: "문화", rating: 4.2, reviews: 950, image: getImageUrl(`${destination} 전통시장`), address: destination, hours: "09:00-20:00", price: "무료", duration: "1시간", tips: "로컬 음식 추천", description: "현지 문화 체험 최적", coords: { lat: c.lat, lng: c.lng + 0.015 } },
    { id: 4, name: `${destination} 전망대`, category: "현대", rating: 4.6, reviews: 2800, image: getImageUrl(`${destination} 전망대`), address: destination, hours: "10:00-22:00", price: "10,000원~", duration: "1시간", tips: "일몰 감상 추천", description: "도시 전체가 한눈에", coords: { lat: c.lat + 0.015, lng: c.lng - 0.01 } },
    { id: 5, name: `${destination} 박물관`, category: "역사", rating: 4.4, reviews: 1600, image: getImageUrl(`${destination} 박물관`), address: destination, hours: "09:00-17:00", price: "5,000원~", duration: "2시간", tips: "오디오 가이드 활용", description: "지역 역사와 문화 전시", coords: { lat: c.lat - 0.015, lng: c.lng - 0.01 } },
  ]
}

const getRestaurantsData = (destination, coords = { lat: 37.5665, lng: 126.9780 }) => {
  const restaurants = {
    "도쿄": {
      "일식": [
        { id: 1, name: "오마카세", cuisine: "일식", category: "일식", rating: 4.9, reviews: 850, image: "🍣", price: "¥¥¥¥", description: "고급 오마카세", tips: "예약 필수", address: "긴자", hours: "18:00-22:00", coords: { lat: 35.6711, lng: 139.7280 } },
        { id: 2, name: "쓰키지 해산물", cuisine: "일식", category: "일식", rating: 4.6, reviews: 2100, image: "🍙", price: "¥¥", description: "신선 회덮밥", tips: "오전 방문", address: "쓰키지", hours: "05:00-14:00", coords: { lat: 35.6650, lng: 139.7710 } },
      ],
      "라멘": [
        { id: 3, name: "이치란 라멘", cuisine: "라멘", category: "라멘", rating: 4.5, reviews: 4320, image: "🍜", price: "¥¥", description: "진한 국물 라멘", tips: "줄 필수", address: "신주쿠", hours: "24시간", coords: { lat: 35.6645, lng: 139.7590 } },
        { id: 4, name: "후지야마 라멘", cuisine: "라멘", category: "라멘", rating: 4.4, reviews: 2850, image: "🥢", price: "¥¥", description: "독특한 맛의 라멘", tips: "점심 붐빔", address: "아키하바라", hours: "11:00-22:00", coords: { lat: 35.6700, lng: 139.7610 } },
      ],
    },
    "제주": {
      "흑돼지": [
        { id: 5, name: "흑돼지 거리", cuisine: "흑돼지", category: "흑돼지", rating: 4.7, reviews: 1250, image: "🐷", price: "₩₩₩", description: "제주 흑돼지 구이 전문", tips: "저녁 예약 필수", address: "제주 연동", hours: "17:00-22:00", coords: { lat: 33.5034, lng: 126.4920 } },
      ],
      "향토": [
        { id: 6, name: "제주 고등어국밥", cuisine: "향토", category: "향토", rating: 4.5, reviews: 890, image: "🍲", price: "₩₩", description: "제주 향토 음식", tips: "점심만 운영", address: "제주 동문시장", hours: "09:00-15:00", coords: { lat: 33.5021, lng: 126.4855 } },
      ],
    },
    "서울": {
      "한식": [
        { id: 7, name: "광장시장 빈대떡", cuisine: "한식", category: "한식", rating: 4.7, reviews: 3200, image: "🥞", price: "₩", description: "전통 빈대떡·마약김밥", tips: "줄 서서 먹는 맛", address: "종로 광장시장", hours: "08:00-23:00", coords: { lat: 37.5699, lng: 126.9994 } },
        { id: 8, name: "명동 칼국수", cuisine: "한식", category: "한식", rating: 4.5, reviews: 1800, image: "🍜", price: "₩₩", description: "시원한 칼국수", tips: "점심 줄 선다", address: "명동", hours: "10:30-21:00", coords: { lat: 37.5636, lng: 126.9822 } },
      ],
      "카페": [
        { id: 9, name: "익선동 카페거리", cuisine: "카페", category: "카페", rating: 4.4, reviews: 2100, image: "☕", price: "₩₩", description: "한옥 카페 밀집지", tips: "인스타 명소", address: "종로 익선동", hours: "11:00-22:00", coords: { lat: 37.5746, lng: 126.9937 } },
      ],
    },
    "오사카": {
      "오사카 음식": [
        { id: 10, name: "도톤보리 타코야키", cuisine: "타코야키", category: "오사카 음식", rating: 4.6, reviews: 5400, image: "🐙", price: "¥", description: "오사카 명물 타코야키", tips: "갓 나온 것 추천", address: "도톤보리", hours: "11:00-23:00", coords: { lat: 34.6687, lng: 135.5013 } },
        { id: 11, name: "쿠로몬 시장", cuisine: "현지음식", category: "오사카 음식", rating: 4.5, reviews: 2300, image: "🦐", price: "¥¥", description: "오사카의 부엌", tips: "오전 활기참", address: "주오구", hours: "08:00-18:00", coords: { lat: 34.6696, lng: 135.5078 } },
      ],
    },
  }
  const categoryData = restaurants[destination]
  if (categoryData) return Object.values(categoryData).flat().map(r => ({ ...r, image: getImageUrl(r.name) }))

  // 알 수 없는 여행지: geocoding으로 받은 coords 사용
  const c = coords
  return [
    { id: 1, name: `${destination} 대표 레스토랑`, cuisine: "현지음식", category: "현지음식", rating: 4.5, reviews: 1200, image: getImageUrl(`${destination} 대표 레스토랑`), price: "₩₩", description: `${destination} 현지 대표 요리`, tips: "예약 추천", address: destination, hours: "11:00-21:00", coords: { lat: c.lat + 0.005, lng: c.lng - 0.005 } },
    { id: 2, name: `${destination} 전통 시장 음식`, cuisine: "길거리음식", category: "길거리음식", rating: 4.3, reviews: 870, image: getImageUrl(`${destination} 전통 시장 음식`), price: "₩", description: "현지인이 사랑하는 맛", tips: "저녁 방문", address: destination, hours: "18:00-23:00", coords: { lat: c.lat - 0.005, lng: c.lng + 0.008 } },
    { id: 3, name: `${destination} 카페`, cuisine: "카페", category: "카페", rating: 4.2, reviews: 640, image: getImageUrl(`${destination} 카페`), price: "₩", description: "현지 인기 카페", tips: "오전 한가함", address: destination, hours: "08:00-20:00", coords: { lat: c.lat + 0.008, lng: c.lng + 0.005 } },
    { id: 4, name: `${destination} 해산물 식당`, cuisine: "해산물", category: "해산물", rating: 4.4, reviews: 980, image: getImageUrl(`${destination} 해산물 식당`), price: "₩₩₩", description: "신선한 현지 해산물", tips: "점심 추천", address: destination, hours: "11:00-20:00", coords: { lat: c.lat - 0.008, lng: c.lng - 0.008 } },
  ]
}

const generateItinerary = (destination, dayCount) => {
  const itineraries = {
    "도쿄": [
      { day: 1, date: "1일차", activities: [{ id: 1, time: "09:00", title: "호텔 체크인", duration: "1시간", cost: 0, type: "checkin" }, { id: 2, time: "14:00", title: "아사쿠사·센소지 관광", duration: "2시간", cost: 0, type: "attraction" }, { id: 3, time: "18:00", title: "저녁 식사", duration: "1.5시간", cost: 8000, type: "lunch" }] },
      { day: 2, date: "2일차", activities: [{ id: 4, time: "08:00", title: "조식", duration: "1시간", cost: 0, type: "lunch" }, { id: 5, time: "10:00", title: "메이지 신궁 방문", duration: "1.5시간", cost: 0, type: "attraction" }, { id: 6, time: "12:30", title: "점심 식사", duration: "1시간", cost: 5000, type: "lunch" }, { id: 7, time: "14:00", title: "시부야 스크램블 관광", duration: "2시간", cost: 0, type: "attraction" }] },
      { day: 3, date: "3일차", activities: [{ id: 8, time: "09:00", title: "자유 쇼핑", duration: "4시간", cost: 30000, type: "free" }, { id: 9, time: "13:30", title: "점심 식사", duration: "1시간", cost: 5000, type: "lunch" }, { id: 10, time: "16:00", title: "도쿄 타워 야경", duration: "2시간", cost: 3000, type: "attraction" }] },
    ],
    "제주": [
      { day: 1, date: "1일차", activities: [{ id: 1, time: "09:00", title: "제주 공항 도착·체크인", duration: "2시간", cost: 0, type: "checkin" }, { id: 2, time: "14:00", title: "함덕 해수욕장 산책", duration: "2시간", cost: 0, type: "attraction" }, { id: 3, time: "18:00", title: "흑돼지 저녁", duration: "1.5시간", cost: 20000, type: "lunch" }] },
      { day: 2, date: "2일차", activities: [{ id: 4, time: "07:00", title: "한라산 등산", duration: "6시간", cost: 0, type: "attraction" }, { id: 5, time: "14:00", title: "점심 식사", duration: "1시간", cost: 10000, type: "lunch" }, { id: 6, time: "16:00", title: "성산 일출봉 방문", duration: "2시간", cost: 2000, type: "attraction" }] },
      { day: 3, date: "3일차", activities: [{ id: 7, time: "09:00", title: "용머리 해안 탐방", duration: "2시간", cost: 0, type: "attraction" }, { id: 8, time: "12:00", title: "점심 식사", duration: "1시간", cost: 10000, type: "lunch" }, { id: 9, time: "14:00", title: "제주 공항 이동·출발", duration: "1시간", cost: 0, type: "checkin" }] },
    ],
    "서울": [
      { day: 1, date: "1일차", activities: [{ id: 1, time: "10:00", title: "경복궁 관람", duration: "2시간", cost: 3000, type: "attraction" }, { id: 2, time: "13:00", title: "점심 - 광장시장", duration: "1.5시간", cost: 10000, type: "lunch" }, { id: 3, time: "15:00", title: "북촌 한옥마을 산책", duration: "2시간", cost: 0, type: "attraction" }] },
      { day: 2, date: "2일차", activities: [{ id: 4, time: "10:00", title: "남산 서울타워 방문", duration: "2시간", cost: 21000, type: "attraction" }, { id: 5, time: "13:00", title: "명동 점심", duration: "1시간", cost: 12000, type: "lunch" }, { id: 6, time: "16:00", title: "홍대 쇼핑·카페", duration: "3시간", cost: 20000, type: "free" }] },
    ],
    "오사카": [
      { day: 1, date: "1일차", activities: [{ id: 1, time: "10:00", title: "오사카성 관람", duration: "2시간", cost: 600, type: "attraction" }, { id: 2, time: "13:00", title: "점심 - 쿠로몬 시장", duration: "1.5시간", cost: 3000, type: "lunch" }, { id: 3, time: "16:00", title: "도톤보리 야경", duration: "2시간", cost: 0, type: "attraction" }] },
      { day: 2, date: "2일차", activities: [{ id: 4, time: "09:00", title: "유니버설 스튜디오", duration: "하루", cost: 8600, type: "attraction" }] },
    ],
  }
  if (itineraries[destination]) {
    return itineraries[destination].slice(0, dayCount)
  }

  // 알 수 없는 여행지: 범용 일정 생성
  return Array.from({ length: Math.min(dayCount, 7) }, (_, i) => ({
    day: i + 1,
    date: `${i + 1}일차`,
    activities: [
      { id: i * 4 + 1, time: "09:00", title: i === 0 ? "호텔 체크인" : "아침 산책", duration: "1시간", cost: 0, type: i === 0 ? "checkin" : "free" },
      { id: i * 4 + 2, time: "11:00", title: `${destination} 주요 관광지 방문`, duration: "2.5시간", cost: 5000, type: "attraction" },
      { id: i * 4 + 3, time: "13:30", title: "점심 식사", duration: "1시간", cost: 12000, type: "lunch" },
      i < dayCount - 1
        ? { id: i * 4 + 4, time: "15:30", title: "자유 시간 및 쇼핑", duration: "3시간", cost: 20000, type: "free" }
        : { id: i * 4 + 4, time: "15:00", title: "공항 이동 및 출발", duration: "1.5시간", cost: 0, type: "checkin" },
    ],
  }))
}

const generateWeather = (dayCount, startDate) => {
  const baseDate = startDate ? new Date(startDate) : new Date()
  const weatherData = []
  const descriptions = ["맑음", "맑음", "흐림", "맑음", "비", "흐림", "맑음"]
  const temps = [
    { max: 22, min: 14 },
    { max: 24, min: 16 },
    { max: 19, min: 12 },
    { max: 26, min: 18 },
    { max: 21, min: 14 },
    { max: 23, min: 15 },
    { max: 25, min: 17 },
  ]
  
  for (let i = 0; i < dayCount && i < 7; i++) {
    const date = new Date(baseDate)
    date.setDate(date.getDate() + i)
    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`
    
    weatherData.push({
      day: i + 1,
      date: dateStr,
      maxTemp: temps[i].max,
      minTemp: temps[i].min,
      description: descriptions[i],
      humidity: 55 + Math.floor(Math.random() * 30),
      windSpeed: 4 + Math.floor(Math.random() * 15),
      uvIndex: 2 + Math.floor(Math.random() * 6),
    })
  }
  return weatherData
}

const generateRouteCoordinates = ({ lat, lng }) => {
  // geocoding으로 받은 좌표 기준으로 샘플 경로 생성 (Leaflet [lat, lng])
  return [
    [lat, lng],
    [lat + 0.02, lng + 0.01],
    [lat + 0.01, lng + 0.03],
    [lat - 0.01, lng + 0.02],
    [lat - 0.02, lng - 0.01],
  ]
}

const getImageUrl = (name) => `https://picsum.photos/seed/${encodeURIComponent(name)}/800/600`

// Fetch image URL from Supabase Edge Function 'fetch-image'
const fetchImageFor = async (query) => {
  try {
    const res = await supabase.functions.invoke('fetch-image', { body: { query } })
    // supabase.functions.invoke returns { data, error }
    if (res?.data?.url) return res.data.url
    if (res?.url) return res.url
  } catch (e) {
    console.log('fetchImageFor error', e?.message || String(e))
  }
  // local fallback image
  return '/images/fallback.svg'
}
