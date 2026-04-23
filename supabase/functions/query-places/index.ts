// @ts-nocheck
// query-places: Groq 기반 장소/맛집 추천 + 모델 자동 폴백 (429 Rate Limit 대응)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

// 폐기 모델은 에러 핸들러가 자동 스킵하므로 후보를 넉넉히 유지
const MODEL_CHAIN = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'llama-3.2-3b-preview',
  'llama-3.2-11b-vision-preview',
]

async function callGroqWithFallback(
  groqKey: string,
  messages: any[],
  maxTokens = 3500,
): Promise<{ content: string; model: string }> {
  let lastError = ''
  for (const model of MODEL_CHAIN) {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    })

    if (res.ok) {
      const data = await res.json()
      return { content: data.choices?.[0]?.message?.content || '', model }
    }

    const errText = await res.text()
    const isRetryable = res.status === 429 || res.status === 413 ||
      errText.includes('model_decommissioned') || errText.includes('rate_limit_exceeded')
    if (isRetryable) {
      console.log(`[query-places] ${model} failed (${res.status}), trying next model...`)
      lastError = errText
      continue
    }
    throw new Error(`Groq error (${model}): ${errText}`)
  }
  throw new Error(`All models rate limited. ${lastError}`)
}

async function fetchPlaceImage(
  supabaseUrl: string,
  anonKey: string,
  query: string,
  categoryQuery: string,
): Promise<string> {
  if (!supabaseUrl || !anonKey) {
    return `https://picsum.photos/seed/${encodeURIComponent(query)}/800/600`
  }
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/fetch-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({ query, categoryQuery }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.url) return data.url
    }
  } catch {
    // fall through to picsum
  }
  return `https://picsum.photos/seed/${encodeURIComponent(query)}/800/600`
}

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

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''

    const isRestaurant = type === 'restaurants'
    const centerLat = lat ?? 0
    const centerLng = lng ?? 0

    const systemPrompt = `You are a travel guide API. Respond with ONLY a valid JSON object, no other text.`

    const userPrompt = `List exactly 10 famous ${isRestaurant ? 'restaurants and local food spots' : 'tourist attractions and landmarks'} physically located inside the city of "${destination}". Every place MUST be in ${destination}. Use real latitude/longitude near center (lat ${centerLat}, lng ${centerLng}).

STRICT LANGUAGE RULES:
1. "name": Korean transliteration FIRST, local script in parentheses. Examples: "아사쿠사지 (浅草寺)", "만리장성 (万里长城)", "에펠탑 (Tour Eiffel)"
2. "category": Korean only. Examples: "불교 사원", "라멘 전문점", "야시장"
3. "description": Korean only.
4. "tips": Korean only.
5. "address": local language of ${destination}.
6. "imageKeyword": 2-5 English words for photo search (no Korean). Examples: "Senso-ji Temple Tokyo", "Beijing roast duck restaurant".

Return JSON: {"places":[{"name":"한국어명 (현지문자)","category":"한국어","rating":4.3,"address":"현지어","hours":"영업시간","price":"가격대","duration":"방문시간","description":"한국어","tips":"한국어","imageKeyword":"English","lat":${centerLat},"lng":${centerLng}}]}`

    const { content, model: usedModel } = await callGroqWithFallback(groqKey, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ])

    let parsed: any[] = []
    try {
      const outer = JSON.parse(content)
      if (Array.isArray(outer)) {
        parsed = outer
      } else {
        const arrKey = Object.keys(outer).find(k => Array.isArray(outer[k]))
        if (arrKey) parsed = outer[arrKey]
      }
    } catch {
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

    // 이름 기준 중복 제거 (대소문자·괄호·공백 무시)
    const normalize = (s: string) => s.toLowerCase().replace(/[\s()\[\]·・]/g, '')
    const seen = new Set<string>()
    parsed = parsed.filter(p => {
      const key = normalize(p.name || '')
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })

    const defaultCategoryEn = isRestaurant ? 'restaurant food' : 'tourist attraction landmark'
    const places = await Promise.all(
      parsed.map(async (p: any, i: number) => {
        const imageKeyword = p.imageKeyword || `${destination} ${isRestaurant ? 'restaurant' : 'attraction'}`
        const categoryEn = `${destination} ${isRestaurant ? 'restaurant food' : 'landmark tourist'}`
        const imageUrl = await fetchPlaceImage(SUPABASE_URL, ANON_KEY, imageKeyword, categoryEn)

        return {
          id: i + 1,
          name: p.name || `${destination} ${i + 1}`,
          category: p.category || (isRestaurant ? '음식점' : '관광명소'),
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
          coords: {
            lat: Number(p.lat) || centerLat,
            lng: Number(p.lng) || centerLng,
          },
          _model: usedModel,
        }
      })
    )

    return new Response(JSON.stringify({ places, _model: usedModel }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message, places: [], fallback: true }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
