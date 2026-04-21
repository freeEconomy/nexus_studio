// @ts-nocheck
// Finnhub 무료 플랜은 ^GSPC, ^IXIC 인덱스 심볼 미지원
// SPY(S&P 500 ETF), QQQ(NASDAQ ETF)로 대체
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const INDICES = [
  { symbol: 'SPY',  name: 'S&P 500' },
  { symbol: 'QQQ',  name: 'NASDAQ' },
]

const CACHE_TTL_MINUTES = 5

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const apiKey      = Deno.env.get('FINNHUB_API_KEY')

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results = await Promise.all(
      INDICES.map(async (index) => {
        // 캐시 확인
        if (supabaseUrl && serviceKey) {
          const cacheRes = await fetch(
            `${supabaseUrl}/rest/v1/stock_quote_cache?ticker=eq.${index.symbol}&select=data,updated_at`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
          )
          const cached = await cacheRes.json()
          if (Array.isArray(cached) && cached.length > 0) {
            const ageMs = Date.now() - new Date(cached[0].updated_at).getTime()
            if (ageMs < CACHE_TTL_MINUTES * 60 * 1000) {
              return cached[0].data
            }
          }
        }

        // Finnhub 호출
        const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${index.symbol}&token=${apiKey}`)
        const data = await response.json()

        if (data.error || !data.c) {
          return { name: index.name, value: 'N/A', change: '0.00' }
        }

        const result = {
          name: index.name,
          value: data.c,
          change: ((data.c - data.pc) / data.pc * 100).toFixed(2),
        }

        // 캐시 저장
        if (supabaseUrl && serviceKey) {
          await fetch(`${supabaseUrl}/rest/v1/stock_quote_cache`, {
            method: 'POST',
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates',
            },
            body: JSON.stringify({ ticker: index.symbol, data: result, updated_at: new Date().toISOString() }),
          })
        }

        return result
      })
    )

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
