// @ts-nocheck
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CACHE_TTL_MS = 30 * 60 * 1000 // 30분
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

function extractJSONArray(text: string): string[] {
  try {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    const target = fence ? fence[1].trim() : text.trim()
    const s = target.indexOf('['), e = target.lastIndexOf(']')
    if (s === -1 || e === -1) return []
    return JSON.parse(target.slice(s, e + 1))
  } catch { return [] }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { ticker } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const apiKey      = Deno.env.get('FINNHUB_API_KEY')
    const groqKey     = Deno.env.get('GROQ_API_KEY')

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const dbHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    }

    // 캐시 조회
    if (supabaseUrl && serviceKey) {
      const cacheRes = await fetch(
        `${supabaseUrl}/rest/v1/stock_news_cache?ticker=eq.${ticker}&select=data,updated_at`,
        { headers: dbHeaders }
      )
      if (cacheRes.ok) {
        const rows = await cacheRes.json()
        if (rows.length > 0) {
          const age = Date.now() - new Date(rows[0].updated_at).getTime()
          if (age < CACHE_TTL_MS) {
            return new Response(JSON.stringify({ ...rows[0].data, cached: true }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
        }
      }
    }

    // Finnhub API 호출
    const to   = new Date().toISOString().split('T')[0]
    const from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const [newsResponse, sentimentResponse] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${apiKey}`),
      fetch(`https://finnhub.io/api/v1/news-sentiment?symbol=${ticker}&token=${apiKey}`),
    ])

    const newsData      = await newsResponse.json()
    const sentimentData = await sentimentResponse.json()

    let news: any[] = (Array.isArray(newsData) ? newsData : []).slice(0, 10)

    // ── 헤드라인 한국어 번역 (Groq llama-3.1-8b-instant) ──────────────
    if (groqKey && news.length > 0) {
      try {
        const headlines = news.map((n, i) => `${i + 1}. ${n.headline}`).join('\n')
        const translateRes = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [{
              role: 'user',
              content: `다음 영어 주식 뉴스 헤드라인들을 자연스러운 한국어로 번역하세요. 반드시 JSON 배열 형식으로만 응답하세요: ["번역1", "번역2", ...]\n\n${headlines}`,
            }],
            max_tokens: 800,
            temperature: 0.1,
          }),
        })
        const translateData = await translateRes.json()
        const raw           = translateData.choices?.[0]?.message?.content ?? '[]'
        const translations  = extractJSONArray(raw)
        if (translations.length > 0) {
          news = news.map((n, i) => ({
            ...n,
            headline_ko: translations[i] || n.headline,
          }))
        }
      } catch {
        // 번역 실패 시 원문 유지
      }
    }

    const payload = { news, sentiment: sentimentData }

    // 캐시 저장
    if (supabaseUrl && serviceKey) {
      await fetch(`${supabaseUrl}/rest/v1/stock_news_cache`, {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ ticker, data: payload, updated_at: new Date().toISOString() }),
      })
    }

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
