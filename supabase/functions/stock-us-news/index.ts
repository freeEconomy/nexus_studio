// @ts-nocheck
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CACHE_TTL_MS = 30 * 60 * 1000 // 30분

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { ticker } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const apiKey = Deno.env.get('FINNHUB_API_KEY')

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
    const to = new Date().toISOString().split('T')[0]
    const from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const [newsResponse, sentimentResponse] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${apiKey}`),
      fetch(`https://finnhub.io/api/v1/news-sentiment?symbol=${ticker}&token=${apiKey}`),
    ])

    const newsData = await newsResponse.json()
    const sentimentData = await sentimentResponse.json()

    const payload = {
      news: (Array.isArray(newsData) ? newsData : []).slice(0, 10),
      sentiment: sentimentData,
    }

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
