import React, { useState } from "react"
import { createClient } from '@supabase/supabase-js'
import "./TravelPlanner.css"
import PlacesTab from "../components/travel/PlacesTab"
import RestaurantsTab from "../components/travel/RestaurantsTab"
import ActivitiesTab from "../components/travel/ActivitiesTab"
import ItineraryTab from "../components/travel/ItineraryTab"
import MapTab from "../components/travel/MapTab"
import WeatherTab from "../components/travel/WeatherTab"

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

const TABS = [
  { id: "places",      label: "추천 장소",    icon: "📍" },
  { id: "restaurants", label: "맛집",         icon: "🍽️" },
  { id: "activities",  label: "경험·액티비티", icon: "🎭" },
  { id: "itinerary",   label: "일정표",        icon: "📅" },
  { id: "map",         label: "지도",          icon: "🗺️" },
  { id: "weather",     label: "날씨",          icon: "🌤️" },
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

   const handleSubmit = async (data = formData) => {
     if (!data.destination || !data.startDate || !data.endDate) {
       setError("여행지와 기간을 입력해주세요.")
       return
     }

     setStatus("loading")
     setError("")

     try {
       const destination = data.destination
       const startDate = new Date(data.startDate)
       const endDate = new Date(data.endDate)
       const dayCount = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1

       // API 연동 (실패시 자동으로 더미데이터로 폴백)
       let generatedData;
       
       try {
         generatedData = await generateTravelData(destination, dayCount, data.startDate);
       } catch (apiError) {
         console.log("generateTravelData 실패, 최소 fallback 사용:", apiError.message);
         const coordinates = await geocodeDestination(destination)
         generatedData = {
           destination,
           startDate: data.startDate,
           endDate: data.endDate,
           dayCount,
           coordinates,
           places: getMinimalFallback(destination, coordinates, 'places'),
           restaurants: getMinimalFallback(destination, coordinates, 'restaurants'),
           activities: getMinimalFallback(destination, coordinates, 'activities'),
           itinerary: generateItinerary(destination, dayCount),
           weather: generateWeather(dayCount, data.startDate),
           routeCoordinates: generateRouteCoordinates(coordinates),
         }
       }

       setTravelData(generatedData)
       setIsGenerated(true)
       setStatus("done")
       
       // 최근 검색 저장
       saveRecentSearch({
         destination,
         startDate: data.startDate,
         endDate: data.endDate,
         adults: data.adults,
         children: data.children,
         childAges: data.childAges,
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

const generateTravelData = async (destination, dayCount, startDate) => {
  const coordinates = await geocodeDestination(destination)

  // query-places 실패 시 프론트 폴백 (AI 직접 호출)
  const generatePlacesWithAI = async (type) => {
    const labelMap = {
      places: '관광 명소와 랜드마크',
      restaurants: '맛집, 카페, 길거리 음식',
      activities: '투어, 체험, 쇼핑, 야경 스팟, 계절 이벤트',
    }
    const label = labelMap[type] || '관광 명소'
    const subcatMap = {
      places: '"랜드마크", "필수 관광지", "숨겨진 명소", "현지 핫플" 중 하나',
      restaurants: '"현지 맛집", "카페·디저트", "길거리 음식" 중 하나',
      activities: '"투어·체험", "쇼핑", "야경 스팟", "계절 이벤트" 중 하나',
    }
    try {
      const { data, error } = await supabase.functions.invoke('query-groq', {
        body: {
          model: 'llama-3.3-70b-versatile',
          messages: [{
            role: 'system',
            content: '당신은 10년 이상 경력의 전문 여행 가이드입니다. 실제로 존재하는 장소만 추천하세요. JSON 배열만 반환하세요.',
          }, {
            role: 'user',
            content: `${destination}의 실제 유명한 ${label} 8곳을 JSON 배열로만 답해줘.
형식: [{"name":"한국어명 (현지문자)","category":"한국어","subcategory":${subcatMap[type]},"rating":4.2,"address":"현지어 주소","hours":"영업시간","price":"가격대","duration":"소요시간","description":"전문 가이드 관점의 실용적 설명","tips":"현지 전문가 팁","imageKeyword":"English keyword"}]
다른 텍스트 없이 JSON 배열만.`
          }]
        }
      })
      if (error || !data?.result) return null
      const raw = data.result.replace(/```json\s*|\s*```/g, '').trim()
      const match = raw.match(/\[[\s\S]*\]/)
      if (!match) return null
      const parsed = JSON.parse(match[0])
      if (!Array.isArray(parsed) || !parsed.length) return null

      const imageCategory = type === 'restaurants' ? 'restaurant food' : type === 'activities' ? 'activity tour' : 'landmark tourist'
      const places = await Promise.all(parsed.map(async (p, i) => {
        const imageKeyword = p.imageKeyword || `${destination} ${imageCategory}`
        let imageUrl = getImageUrl(imageKeyword)
        try {
          const { data: imgData } = await supabase.functions.invoke('fetch-image', {
            body: { query: imageKeyword, categoryQuery: `${destination} ${imageCategory}` }
          })
          if (imgData?.url) imageUrl = imgData.url
        } catch { /* use picsum fallback */ }

        return {
          id: i + 1,
          name: p.name || `${destination} ${i + 1}`,
          category: p.category || label,
          subcategory: p.subcategory || '',
          rating: p.rating ? Math.round(Number(p.rating) * 10) / 10 : null,
          reviews: 0,
          image: imageUrl,
          address: p.address || destination,
          hours: p.hours || '정보 없음',
          openNow: null,
          price: p.price || '정보 없음',
          duration: p.duration || '1~2시간',
          description: p.description || '',
          tips: p.tips || '',
          coords: { lat: coordinates.lat, lng: coordinates.lng },
        }
      }))
      return places
    } catch {
      return null
    }
  }

  const [weatherRes, routeRes, itineraryRes, placesRes, restaurantsRes, activitiesRes] = await Promise.allSettled([
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
    // 3. AI 일정 생성 (전문 가이드 관점)
    supabase.functions.invoke('query-groq', {
      body: {
        model: "llama-3.3-70b-versatile",
        messages: [{
          role: "system",
          content: "당신은 10년 이상 경력의 전문 여행 가이드입니다. 실제 존재하는 장소만 일정에 포함하세요. 이동 시간, 혼잡도, 최적 방문 시간대를 고려한 현실적인 일정을 만드세요. 관광객 함정을 피하고 현지인처럼 여행할 수 있도록 조언하세요."
        }, {
          role: "user",
          content: `${destination} ${dayCount}일 여행 일정을 JSON으로 만들어주세요.
실제 존재하는 장소명만 사용하고, 장소 이동 시간과 혼잡도를 고려한 현실적인 일정으로 구성하세요.
아침/점심/저녁 식사와 주요 관광지, 액티비티를 적절히 배분하세요.
형식: [{"day":1,"date":"1일차","activities":[{"time":"09:00","title":"실제 장소명","duration":"2시간","cost":0,"type":"attraction","tip":"한줄 팁"}]}]
type: attraction(관광)/lunch(식사)/activity(체험)/shopping(쇼핑)/nightview(야경)/checkin(체크인)/free(자유시간)`
        }]
      }
    }),
    // 4. 추천 장소
    supabase.functions.invoke('query-places', {
      body: { destination, type: 'places', lat: coordinates.lat, lng: coordinates.lng }
    }),
    // 5. 맛집
    supabase.functions.invoke('query-places', {
      body: { destination, type: 'restaurants', lat: coordinates.lat, lng: coordinates.lng }
    }),
    // 6. 경험·액티비티
    supabase.functions.invoke('query-places', {
      body: { destination, type: 'activities', lat: coordinates.lat, lng: coordinates.lng }
    }),
  ])

  // 날씨: 3시간 예보 → 일별 변환
  let weather = generateWeather(dayCount, startDate)
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

  // 장소/맛집/액티비티: edge function 결과 → AI fallback → 최소 fallback 순으로 시도
  const placesData      = placesRes.status      === 'fulfilled' ? placesRes.value.data      : null
  const restaurantsData = restaurantsRes.status  === 'fulfilled' ? restaurantsRes.value.data  : null
  const activitiesData  = activitiesRes.status   === 'fulfilled' ? activitiesRes.value.data   : null
  const needPlacesAI      = !placesData?.places?.length      || placesData.fallback
  const needRestaurantsAI = !restaurantsData?.places?.length  || restaurantsData.fallback
  const needActivitiesAI  = !activitiesData?.places?.length   || activitiesData?.fallback

  const [placesAI, restaurantsAI, activitiesAI] = await Promise.all([
    needPlacesAI      ? generatePlacesWithAI('places')      : Promise.resolve(null),
    needRestaurantsAI ? generatePlacesWithAI('restaurants')  : Promise.resolve(null),
    needActivitiesAI  ? generatePlacesWithAI('activities')   : Promise.resolve(null),
  ])

  const places = needPlacesAI
    ? (placesAI || getMinimalFallback(destination, coordinates, 'places'))
    : placesData.places
  const restaurants = needRestaurantsAI
    ? (restaurantsAI || getMinimalFallback(destination, coordinates, 'restaurants'))
    : restaurantsData.places
  const activities = needActivitiesAI
    ? (activitiesAI || getMinimalFallback(destination, coordinates, 'activities'))
    : activitiesData.places

  return {
    destination,
    startDate: formData.startDate,
    endDate: formData.endDate,
    dayCount,
    coordinates,
    places,
    restaurants,
    activities,
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
    const updatedFormData = {
      destination: search.destination,
      startDate: search.startDate,
      endDate: search.endDate,
      adults: search.adults,
      children: search.children,
      childAges: search.childAges || "",
    }
    setFormData(updatedFormData)
    setShowRecentSearches(false)
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
            {error && (
              <div className="error-message">
                {error}
                <button className="error-close" onClick={() => setError("")}>×</button>
              </div>
            )}
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
                onClick={() => handleSubmit()}
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
        {activeTab === "places"      && <PlacesTab places={travelData.places} destination={travelData.destination} />}
        {activeTab === "restaurants" && <RestaurantsTab restaurants={travelData.restaurants} destination={travelData.destination} />}
        {activeTab === "activities"  && <ActivitiesTab activities={travelData.activities} destination={travelData.destination} />}
        {activeTab === "itinerary"   && <ItineraryTab itinerary={travelData.itinerary} destination={travelData.destination} dayCount={travelData.dayCount} />}
        {activeTab === "map"         && <MapTab places={travelData.places} restaurants={travelData.restaurants} activities={travelData.activities} destination={travelData.destination} coordinates={travelData.coordinates} routeCoordinates={travelData.routeCoordinates} />}
        {activeTab === "weather"     && <WeatherTab weather={travelData.weather} destination={travelData.destination} startDate={travelData.startDate} />}
      </div>
    )
  }

  return (
    <div className="travel-planner">
      <div className="tp-header">
        <h1>Journey</h1>
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

// API 전체 실패 시 최소 fallback — 이름·좌표만 제공
const getMinimalFallback = (destination, coords, type) => {
  const c = coords
  if (type === 'restaurants') {
    return [
      { id: 1, name: `${destination} 현지 맛집`, category: '현지음식', subcategory: '현지 맛집', rating: null, reviews: 0, image: getImageUrl(`${destination} restaurant`), address: destination, hours: '정보 없음', price: '정보 없음', duration: '1시간', description: `${destination} 현지 음식`, tips: '', coords: { lat: c.lat + 0.005, lng: c.lng - 0.005 } },
      { id: 2, name: `${destination} 카페`, category: '카페', subcategory: '카페·디저트', rating: null, reviews: 0, image: getImageUrl(`${destination} cafe`), address: destination, hours: '정보 없음', price: '정보 없음', duration: '1시간', description: `${destination} 카페`, tips: '', coords: { lat: c.lat - 0.005, lng: c.lng + 0.005 } },
    ]
  }
  if (type === 'activities') {
    return [
      { id: 1, name: `${destination} 현지 투어`, category: '투어', subcategory: '투어·체험', rating: null, reviews: 0, image: getImageUrl(`${destination} tour`), address: destination, hours: '정보 없음', price: '정보 없음', duration: '2~3시간', description: `${destination} 현지 투어`, tips: '', coords: { lat: c.lat + 0.01, lng: c.lng } },
      { id: 2, name: `${destination} 야경 스팟`, category: '야경', subcategory: '야경 스팟', rating: null, reviews: 0, image: getImageUrl(`${destination} night view`), address: destination, hours: '정보 없음', price: '정보 없음', duration: '1~2시간', description: `${destination} 야경`, tips: '', coords: { lat: c.lat - 0.01, lng: c.lng + 0.01 } },
    ]
  }
  return [
    { id: 1, name: `${destination} 주요 명소`, category: '관광명소', subcategory: '필수 관광지', rating: null, reviews: 0, image: getImageUrl(`${destination} attraction`), address: destination, hours: '정보 없음', price: '정보 없음', duration: '1~2시간', description: `${destination} 관광 명소`, tips: '', coords: { lat: c.lat + 0.01, lng: c.lng } },
    { id: 2, name: `${destination} 랜드마크`, category: '랜드마크', subcategory: '랜드마크', rating: null, reviews: 0, image: getImageUrl(`${destination} landmark`), address: destination, hours: '정보 없음', price: '정보 없음', duration: '1~2시간', description: `${destination} 랜드마크`, tips: '', coords: { lat: c.lat - 0.01, lng: c.lng + 0.01 } },
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
