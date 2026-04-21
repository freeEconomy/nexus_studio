// @ts-nocheck
// Finnhub 무료 플랜은 /stock/candle 미지원 → Yahoo Finance로 대체
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1시간

// period → Yahoo Finance interval/range 매핑
const PERIOD_MAP: Record<string, { interval: string; range: string }> = {
  '1M': { interval: '1d', range: '1mo' },
  '3M': { interval: '1d', range: '3mo' },
  '6M': { interval: '1d', range: '6mo' },
  '1Y': { interval: '1wk', range: '1y' },
  '2Y': { interval: '1wk', range: '2y' },
  D:   { interval: '1d', range: '3mo' },
  W:   { interval: '1wk', range: '1y' },
  M:   { interval: '1mo', range: '5y' },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { ticker, period = 'D', startDate, endDate } = await req.json()

    if (!ticker) {
      return new Response(JSON.stringify({ error: 'Ticker is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const cacheKey    = `chart_${ticker}_${period}_${startDate || ''}_${endDate || ''}`

    // 1. DB 캐시 확인
    if (supabaseUrl && serviceKey) {
      const cacheRes = await fetch(
        `${supabaseUrl}/rest/v1/stock_quote_cache?ticker=eq.${encodeURIComponent(cacheKey)}&select=data,updated_at`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
      )
      const cached = await cacheRes.json()
      if (Array.isArray(cached) && cached.length > 0) {
        const ageMs = Date.now() - new Date(cached[0].updated_at).getTime()
        if (ageMs < CACHE_TTL_MS) {
          return new Response(JSON.stringify(cached[0].data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
    }

    // 2. Yahoo Finance 호출
    let yahooUrl: string
    if (startDate && endDate) {
      const from = Math.floor(new Date(startDate).getTime() / 1000)
      const to   = Math.floor(new Date(endDate).getTime() / 1000)
      yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&period1=${from}&period2=${to}&includePrePost=false`
    } else {
      const { interval, range } = PERIOD_MAP[period] || PERIOD_MAP['D']
      yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${range}&includePrePost=false`
    }

    const response = await fetch(yahooUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Yahoo Finance error: ${response.status}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const json = await response.json()
    const chartResult = json?.chart?.result?.[0]

    if (!chartResult?.timestamp) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { timestamp, indicators } = chartResult
    const quote = indicators.quote[0]

    const result = timestamp
      .map((ts: number, i: number) => ({
        time:   ts,
        open:   quote.open[i],
        high:   quote.high[i],
        low:    quote.low[i],
        close:  quote.close[i],
        volume: quote.volume[i],
      }))
      .filter(d => d.close != null && d.open != null)

    // 3. DB 캐시 저장
    if (supabaseUrl && serviceKey && result.length > 0) {
      await fetch(`${supabaseUrl}/rest/v1/stock_quote_cache`, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ ticker: cacheKey, data: result, updated_at: new Date().toISOString() }),
      })
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
