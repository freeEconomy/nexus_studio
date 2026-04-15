// supabase/functions/query-weather/index.ts
// OpenWeatherMap API 연동 Edge Function

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { city, date, lat, lon } = await req.json()

    if (!city && (!lat || !lon)) {
      return new Response(JSON.stringify({ error: 'city or coordinates (lat, lon) are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const weatherKey = Deno.env.get('OPENWEATHER_API_KEY')
    if (!weatherKey) throw new Error('OPENWEATHER_API_KEY not set')

    let url = ''
    if (city) {
      url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${weatherKey}&units=metric`
    } else {
      url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${weatherKey}&units=metric`
    }

    const response = await fetch(url)

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`OpenWeatherMap API error: ${errText}`)
    }

    const data = await response.json()
    
    // 결과 포맷 변환
    const forecasts = data.list?.map((item: any) => ({
      datetime: item.dt_txt,
      temp: item.main?.temp,
      feels_like: item.main?.feels_like,
      humidity: item.main?.humidity,
      description: item.weather?.[0]?.description,
      icon: item.weather?.[0]?.icon,
      wind_speed: item.wind?.speed,
      wind_deg: item.wind?.deg,
    })) || []

    return new Response(JSON.stringify({
      city: data.city?.name || city,
      country: data.city?.country,
      forecasts,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})