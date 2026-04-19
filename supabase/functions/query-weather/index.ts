// supabase/functions/query-weather/index.ts
// OpenWeatherMap API 연동 Edge Function

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 한글 도시명 → 영문 변환 매핑
const koreanToEnglish: Record<string, string> = {
  '도쿄': 'Tokyo', '오사카': 'Osaka', '교토': 'Kyoto', '나고야': 'Nagoya', '삿포로': 'Sapporo', '후쿠오카': 'Fukuoka',
  '서울': 'Seoul', '부산': 'Busan', '제주': 'Jeju', '인천': 'Incheon', '대구': 'Daegu', '광주': 'Gwangju',
  '뉴욕': 'New York', '로스앤젤레스': 'Los Angeles', '시카고': 'Chicago', '하와이': 'Honolulu', '라스베가스': 'Las Vegas',
  '파리': 'Paris', '런던': 'London', '베를린': 'Berlin', '로마': 'Rome', '마드리드': 'Madrid', '바르셀로나': 'Barcelona',
  '암스테르담': 'Amsterdam', '프라하': 'Prague', '비엔나': 'Vienna', '취리히': 'Zurich',
  '방콕': 'Bangkok', '싱가포르': 'Singapore', '홍콩': 'Hong Kong', '마카오': 'Macao',
  '베이징': 'Beijing', '상하이': 'Shanghai', '광저우': 'Guangzhou',
  '시드니': 'Sydney', '멜버른': 'Melbourne', '브리즈번': 'Brisbane',
  '하노이': 'Hanoi', '호치민': 'Ho Chi Minh City', '다낭': 'Da Nang',
  '발리': 'Denpasar', '자카르타': 'Jakarta', '쿠알라룸푸르': 'Kuala Lumpur',
  '두바이': 'Dubai', '이스탄불': 'Istanbul', '카이로': 'Cairo',
  '뭄바이': 'Mumbai', '델리': 'Delhi',
}

const generateDummyForecasts = () => {
  const now = new Date()
  const descriptions = ['맑음', '구름 조금', '흐림', '비', '구름 많음']
  const icons = ['01d', '02d', '04d', '10d', '03d']
  return Array.from({ length: 40 }, (_, i) => {
    const dt = new Date(now.getTime() + i * 3 * 60 * 60 * 1000)
    const temp = 15 + Math.sin(i / 8) * 8
    const idx = i % 5
    return {
      datetime: dt.toISOString().replace('T', ' ').slice(0, 19),
      temp: Math.round(temp * 10) / 10,
      feels_like: Math.round((temp - 2) * 10) / 10,
      humidity: 55 + (i % 30),
      description: descriptions[idx],
      icon: icons[idx],
      wind_speed: 2 + (i % 4),
      wind_deg: (i * 45) % 360,
    }
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { city, lat, lon } = await req.json()

    if (!city && (!lat || !lon)) {
      return new Response(JSON.stringify({ error: 'city or coordinates (lat, lon) are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const weatherKey = Deno.env.get('OPENWEATHER_API_KEY')

    let forecasts: any[] = []
    let cityName = city || ''
    let country = ''

    // API 키가 있을 때만 호출
    if (weatherKey) {
      try {
        let url = ''
        if (city) {
          // 한글 도시명을 영문으로 변환
          const cityEn = koreanToEnglish[city] || city
          url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(cityEn)}&appid=${weatherKey}&units=metric&lang=kr`
        } else {
          url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${weatherKey}&units=metric&lang=kr`
        }

        const response = await fetch(url)

        if (response.ok) {
          const data = await response.json()
          cityName = data.city?.name || city
          country = data.city?.country || ''
          forecasts = data.list?.map((item: any) => ({
            datetime: item.dt_txt,
            temp: item.main?.temp,
            feels_like: item.main?.feels_like,
            humidity: item.main?.humidity,
            description: item.weather?.[0]?.description,
            icon: item.weather?.[0]?.icon,
            wind_speed: item.wind?.speed,
            wind_deg: item.wind?.deg,
          })) || []
        } else {
          console.log(`OpenWeatherMap API 응답 오류 (${response.status}), 더미데이터 사용`)
        }
      } catch (apiError) {
        console.log('OpenWeatherMap API 호출 실패, 더미데이터 사용:', (apiError as Error).message)
      }
    }

    // API 실패 또는 키 없을 때 더미데이터 반환
    if (forecasts.length === 0) {
      forecasts = generateDummyForecasts()
    }

    return new Response(JSON.stringify({ city: cityName, country, forecasts }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
