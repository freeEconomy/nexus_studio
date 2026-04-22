// @ts-nocheck
// Yahoo Finance로 한국 주식 차트 조회 (005930.KS / 000660.KQ 등)
// KIS API inquire-daily-price가 output1 빈 배열 반환 문제로 Yahoo Finance 사용
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1시간

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

    // 티커 정규화: 005930 → 005930.KS / 005930.KS → 그대로
    let symbol = ticker
    if (/^\d{6}$/.test(ticker)) {
      symbol = `${ticker}.KS`
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const cacheKey    = `kr_chart_${symbol}_${period}_${startDate || ''}_${endDate || ''}`

    // 1. DB 캐시 확인
    if (supabaseUrl && serviceKey) {
      try {
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
      } catch {}
    }

    // 2. Yahoo Finance 호출
    let yahooUrl: string
    if (startDate && endDate) {
      const from = Math.floor(new Date(startDate).getTime() / 1000)
      const to   = Math.floor(new Date(endDate).getTime() / 1000)
      yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${from}&period2=${to}&includePrePost=false`
    } else {
      // period 기본값: D → 3개월 일봉
      const rangeMap: Record<string, string> = {
        D: '3mo', W: '1y', M: '5y',
        '1M': '1mo', '3M': '3mo', '6M': '6mo', '1Y': '1y', '2Y': '2y',
      }
      const range = rangeMap[period] || '3mo'
      yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}&includePrePost=false`
    }

    let res = await fetch(yahooUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    })

    // .KS 실패 시 .KQ로 재시도
    if (!res.ok && symbol.endsWith('.KS')) {
      const altSymbol = symbol.replace('.KS', '.KQ')
      const altUrl = yahooUrl.replace(encodeURIComponent(symbol), encodeURIComponent(altSymbol))
      const altRes = await fetch(altUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      })
      if (altRes.ok) res = altRes
    }

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Yahoo Finance error: ${res.status}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const json = await res.json()
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
      try {
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
      } catch {}
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
