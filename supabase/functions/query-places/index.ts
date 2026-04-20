// @ts-nocheck
// query-places: Groq llama-3.3-70b-versatile 기반 장소/맛집 추천
// 외부 Places API 불필요 — GROQ_API_KEY 만 있으면 동작

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { destination, type = 'places', lat, lng } = await req.json()

    if (!destination) {
      return new Response(JSON.stringify({ error: 'destination is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (!groqKey) {
      return new Response(JSON.stringify({ places: [], fallback: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const isRestaurant = type === 'restaurants'
    const label = isRestaurant ? '맛집과 레스토랑' : '관광 명소와 여행지'
    const centerLat = lat ?? 0
    const centerLng = lng ?? 0

    const systemPrompt = `You are a travel guide API. You MUST respond with ONLY a valid JSON array, no other text. All string values in the JSON must be properly quoted. Do not include any explanation or markdown.`

    const userPrompt = `List exactly 10 famous ${isRestaurant ? 'restaurants and local food spots' : 'tourist attractions and landmarks'} physically located inside the city of "${destination}". Every single place MUST be in ${destination} — do NOT include places from any other city. Use real latitude/longitude near center (lat ${centerLat}, lng ${centerLng}).

Return a JSON object with key "places" containing an array of 10 items:
{"places":[{"name":"Korean place name","category":"Korean category","rating":4.3,"address":"real Korean address","hours":"business hours","price":"price range","duration":"visit duration","description":"one-line Korean description","tips":"Korean visitor tip","lat":latitude_number,"lng":longitude_number}]}`

    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 3000,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return new Response(JSON.stringify({ places: [], fallback: true, _debug: errText }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await res.json()
    const content: string = data.choices?.[0]?.message?.content || ''

    // json_object mode wraps in an object — extract the array from it
    let parsed: any[] = []
    try {
      const outer = JSON.parse(content)
      // find the array inside the object (e.g. { places: [...] } or { restaurants: [...] })
      if (Array.isArray(outer)) {
        parsed = outer
      } else {
        const arrKey = Object.keys(outer).find(k => Array.isArray(outer[k]))
        if (arrKey) parsed = outer[arrKey]
      }
    } catch {
      // fallback: try to extract raw array from text
      const clean = content.replace(/```json\s*|\s*```/g, '').trim()
      const match = clean.match(/\[[\s\S]*\]/)
      if (match) {
        try { parsed = JSON.parse(match[0]) } catch { /* ignore */ }
      }
    }

    if (!Array.isArray(parsed) || !parsed.length) {
      return new Response(JSON.stringify({ places: [], fallback: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const places = parsed.map((p: any, i: number) => ({
      id: i + 1,
      name: p.name || `${destination} ${label} ${i + 1}`,
      category: p.category || label,
      rating: p.rating ? Math.round(Number(p.rating) * 10) / 10 : null,
      reviews: 0,
      image: `https://picsum.photos/seed/${encodeURIComponent(p.name || destination + i)}/800/600`,
      address: p.address || destination,
      hours: p.hours || '정보 없음',
      openNow: null,
      price: p.price || '정보 없음',
      duration: p.duration || '1~2시간',
      description: p.description || '',
      tips: p.tips || '',
      coords: {
        lat: Number(p.lat) || centerLat,
        lng: Number(p.lng) || centerLng,
      },
    }))

    return new Response(JSON.stringify({ places }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message, places: [], fallback: true }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
