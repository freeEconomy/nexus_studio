// @ts-nocheck
// query-places: Groq 기반 장소/맛집/액티비티 추천 + 모델 자동 폴백 (429 Rate Limit 대응)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const MODEL_CHAIN = [
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'llama-3.1-8b-instant',
]

async function callGroqWithFallback(
  groqKey: string,
  messages: any[],
  maxTokens = 4000,
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
        temperature: 0.2,
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

// 타입별 설정
const TYPE_CONFIG = {
  places: {
    count: 10,
    label: 'tourist attractions and sightseeing spots',
    categoryKo: '관광명소',
    subcategories: ['랜드마크', '필수 관광지', '숨겨진 명소', '현지 핫플'],
    subcategoryDesc: '반드시 "랜드마크", "필수 관광지", "숨겨진 명소", "현지 핫플" 중 하나',
    imageCategory: 'landmark tourist',
  },
  restaurants: {
    count: 10,
    label: 'restaurants, cafes, and street food spots',
    categoryKo: '음식점',
    subcategories: ['현지 맛집', '카페·디저트', '길거리 음식'],
    subcategoryDesc: '반드시 "현지 맛집", "카페·디저트", "길거리 음식" 중 하나',
    imageCategory: 'restaurant food',
  },
  activities: {
    count: 10,
    label: 'tours, experiences, shopping areas, night view spots, and seasonal events',
    categoryKo: '체험',
    subcategories: ['투어·체험', '쇼핑', '야경 스팟', '계절 이벤트'],
    subcategoryDesc: '반드시 "투어·체험", "쇼핑", "야경 스팟", "계절 이벤트" 중 하나',
    imageCategory: 'activity tour experience',
  },
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

    const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.places
    const centerLat = lat ?? 0
    const centerLng = lng ?? 0

    const systemPrompt = `당신은 10년 이상 경력의 전문 여행 가이드입니다.
실제로 존재하는 장소만 추천하세요. 존재하지 않는 가상의 장소나 이름을 절대 만들어내지 마세요.
여행자에게 진짜 필요한 실용적인 정보 (운영시간, 가격, 이동 팁, 주의사항, 베스트 방문 시간대)를 제공하세요.
현지인들이 실제 가는 곳 위주로, 관광객 함정을 피할 수 있도록 솔직하게 조언하세요.
JSON 형식으로만 응답하세요.`

    const userPrompt = `"${destination}"에 실제로 존재하는 ${cfg.label} 10곳을 추천해주세요.

⚠️ 중요: 실제 존재하는 장소만 포함하세요. 가상의 이름은 절대 금지입니다.
위치: 위도 ${centerLat}, 경도 ${centerLng} 근처

언어 규칙:
1. "name": 한국어 표기 먼저, 현지 문자는 괄호 안에. 예: "아사쿠사지 (浅草寺)", "에펠탑 (Tour Eiffel)"
2. "category": 한국어 (예: "불교 사원", "라멘 전문점", "나이트 투어")
3. "subcategory": ${cfg.subcategoryDesc}
4. "description": 한국어로, 전문 가이드 관점의 실용적 설명 (왜 가야 하는지, 무엇이 특별한지)
5. "tips": 한국어로, 현지 전문가 조언 (베스트 방문 시간, 줄 서는 법, 주의사항, 숨겨진 팁)
6. "address": 현지어
7. "imageKeyword": 영어 2-5단어 (이미지 검색용)

JSON 형식:
{"places":[{
  "name":"한국어명 (현지문자)",
  "category":"한국어",
  "subcategory":"${cfg.subcategories[0]}",
  "rating":4.5,
  "address":"현지어 주소",
  "hours":"운영시간",
  "price":"가격대",
  "duration":"권장 체류시간",
  "description":"전문 가이드의 실용적 설명",
  "tips":"현지 전문가 팁",
  "imageKeyword":"English keyword",
  "lat":${centerLat},
  "lng":${centerLng}
}]}`

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

    // 이름 기준 중복 제거
    const normalize = (s: string) => s.toLowerCase().replace(/[\s()\[\]·・]/g, '')
    const seen = new Set<string>()
    parsed = parsed.filter(p => {
      const key = normalize(p.name || '')
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })

    const places = await Promise.all(
      parsed.map(async (p: any, i: number) => {
        const imageKeyword = p.imageKeyword || `${destination} ${cfg.imageCategory}`
        const categoryEn = `${destination} ${cfg.imageCategory}`
        const imageUrl = await fetchPlaceImage(SUPABASE_URL, ANON_KEY, imageKeyword, categoryEn)

        return {
          id: i + 1,
          name: p.name || `${destination} ${i + 1}`,
          category: p.category || cfg.categoryKo,
          subcategory: p.subcategory || cfg.subcategories[i % cfg.subcategories.length],
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
