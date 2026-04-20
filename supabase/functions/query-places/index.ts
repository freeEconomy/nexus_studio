// @ts-nocheck
// supabase/functions/query-places/index.ts
// Foursquare Places API v3 + Groq compound-beta-mini 실시간 리뷰 보강
// FOURSQUARE_API_KEY 없으면 fallback:true 반환 → 클라이언트가 최소 fallback 사용

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FSQ_BASE = 'https://api.foursquare.com/v3'
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const PRICE_MAP: Record<number, string> = {
  1: '$ (저렴)',
  2: '$$ (보통)',
  3: '$$$ (고가)',
  4: '$$$$ (럭셔리)',
}

function mapCategory(categories: any[]): string {
  const name = categories?.[0]?.name || ''
  if (/museum|gallery|갤러리|박물관/i.test(name)) return '박물관/미술관'
  if (/theme park|amusement|놀이공원|테마/i.test(name)) return '테마파크'
  if (/park|garden|nature|forest|공원|자연|숲/i.test(name)) return '자연'
  if (/temple|shrine|church|cathedral|mosque|사원|신궁|신사|성당|절/i.test(name)) return '종교/역사'
  if (/castle|palace|fort|historic|성|궁|역사/i.test(name)) return '역사'
  if (/beach|lake|mountain|ocean|해변|바다|산/i.test(name)) return '자연'
  if (/zoo|aquarium|동물원|수족관/i.test(name)) return '동물원/수족관'
  if (/café|cafe|coffee|tea|카페|커피/i.test(name)) return '카페'
  if (/bakery|patisserie|베이커리/i.test(name)) return '베이커리'
  if (/bar|pub|izakaya|이자카야|바/i.test(name)) return '바/펍'
  if (/ramen|sushi|yakiniku|라멘|스시|야키니쿠/i.test(name)) return '일식'
  if (/korean bbq|한식|고기/i.test(name)) return '한식'
  if (/pizza|italian|파스타/i.test(name)) return '이탈리안'
  if (/restaurant|bistro|dining|레스토랑|식당/i.test(name)) return '레스토랑'
  if (/shopping|market|mall|마켓|시장|쇼핑/i.test(name)) return '쇼핑'
  if (/spa|wellness|스파/i.test(name)) return '스파'
  return name || '관광명소'
}

function mapDuration(categories: any[]): string {
  const name = categories?.[0]?.name || ''
  if (/theme park|amusement/i.test(name)) return '하루 종일'
  if (/zoo|aquarium/i.test(name)) return '3~4시간'
  if (/museum|gallery/i.test(name)) return '2~3시간'
  if (/park|garden|mountain/i.test(name)) return '1~3시간'
  if (/castle|palace|temple/i.test(name)) return '1~2시간'
  if (/shopping|market/i.test(name)) return '2~3시간'
  if (/café|cafe|coffee|bakery/i.test(name)) return '1시간'
  if (/restaurant|ramen|sushi/i.test(name)) return '1~2시간'
  return '1~2시간'
}

function buildPhotoUrl(photos: any[]): string {
  if (!photos?.length) return ''
  const p = photos[0]
  if (p?.prefix && p?.suffix) return `${p.prefix}800x600${p.suffix}`
  return ''
}

function formatHours(hours: any): string {
  if (!hours?.regular?.length) return '정보 없음'
  const dayOfWeek = new Date().getDay() // 0=Sun
  const fsqDay = dayOfWeek === 0 ? 7 : dayOfWeek // Foursquare: 1=Mon, 7=Sun
  const todayEntry = hours.regular.find((r: any) => r.day === fsqDay)
  if (!todayEntry) return '오늘 휴무'
  const o = String(todayEntry.open ?? '').padStart(4, '0')
  const c = String(todayEntry.close ?? '').padStart(4, '0')
  if (!o) return '휴무'
  const close = c === '0000' ? '24:00' : `${c.slice(0, 2)}:${c.slice(2)}`
  return `오늘 ${o.slice(0, 2)}:${o.slice(2)} ~ ${close}`
}

// Groq compound-beta-mini로 상위 N개 장소 일괄 팁 보강 (웹검색 내장)
async function enrichTipsWithGroq(places: any[], groqKey: string): Promise<string[]> {
  try {
    const list = places
      .map((p, i) => `${i + 1}. ${p.name} (${p.address || ''})`)
      .join('\n')

    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: 'compound-beta-mini',
        messages: [
          {
            role: 'user',
            content: `아래 장소들의 현재 영업 여부와 핵심 방문 팁을 각각 한 문장으로 알려줘. 최신 실제 정보 기반으로. JSON 배열로만 답해 (다른 텍스트 없이): ["팁1", "팁2", ...]\n\n${list}`,
          },
        ],
        max_tokens: 600,
      }),
    })

    if (!res.ok) return places.map(() => '')

    const data = await res.json()
    const content: string = data.choices?.[0]?.message?.content || ''
    const match = content.match(/\[[\s\S]*?\]/)
    if (match) {
      const parsed = JSON.parse(match[0])
      if (Array.isArray(parsed)) return parsed.map((t) => String(t))
    }
  } catch (e) {
    console.log('Groq enrichment failed:', (e as Error).message)
  }
  return places.map(() => '')
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

    const fsqKey = Deno.env.get('FOURSQUARE_API_KEY')
    if (!fsqKey) {
      return new Response(JSON.stringify({ places: [], fallback: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const query = type === 'restaurants'
      ? `restaurants in ${destination}`
      : `tourist attractions in ${destination}`

    const fields = 'fsq_id,name,categories,location,geocodes,rating,price,hours,photos,stats,description,tips'

    const params = new URLSearchParams({
      query,
      ll: `${lat},${lng}`,
      radius: '50000',
      limit: '20',
      fields,
    })

    const searchRes = await fetch(`${FSQ_BASE}/places/search?${params}`, {
      headers: { Authorization: fsqKey, accept: 'application/json', 'X-Places-Api-Version': '1970-01-01' },
    })

    if (!searchRes.ok) {
      const errorText = await searchRes.text()
      return new Response(JSON.stringify({ places: [], fallback: true, _debug: { status: searchRes.status, body: errorText } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { results } = await searchRes.json()

    // rating이 있는 경우 7.0 이상만, 없는 경우 그대로 포함
    const filtered = (results || []).filter((p: any) => p.rating == null || p.rating >= 7.0)
    const top10 = filtered.slice(0, 10)

    const places = top10.map((p: any, idx: number) => ({
      id: idx + 1,
      name: p.name,
      category: mapCategory(p.categories),
      rating: p.rating != null ? Math.round(p.rating * 10) / 10 : null,
      reviews: p.stats?.total_ratings ?? p.stats?.total_tips ?? 0,
      image: buildPhotoUrl(p.photos) || `https://picsum.photos/seed/${encodeURIComponent(p.name)}/800/600`,
      address: [p.location?.address, p.location?.locality, p.location?.country]
        .filter(Boolean)
        .join(', '),
      hours: formatHours(p.hours),
      openNow: p.hours?.open_now ?? null,
      price: p.price ? (PRICE_MAP[p.price] ?? '정보 없음') : '정보 없음',
      duration: mapDuration(p.categories),
      description: p.description || p.tips?.[0]?.text || '',
      tips: '',
      coords: {
        lat: p.geocodes?.main?.latitude ?? lat,
        lng: p.geocodes?.main?.longitude ?? lng,
      },
    }))

    // Groq compound-beta-mini로 상위 5개 팁 보강 (API 키 있을 때만)
    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (groqKey && places.length > 0) {
      const top5 = places.slice(0, 5)
      const tips = await enrichTipsWithGroq(top5, groqKey)
      tips.forEach((tip, i) => {
        if (tip) places[i].tips = tip
      })
    }

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
