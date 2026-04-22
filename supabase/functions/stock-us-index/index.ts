// @ts-nocheck
// Yahoo Finance로 S&P 500(^GSPC) / NASDAQ(^IXIC) 실제 지수값 조회
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const INDICES = [
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^IXIC', name: 'NASDAQ' },
]

async function fetchYahoo(symbol: string, name: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Supabase/1.0)',
      'Accept': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`)
  const json = await res.json()
  const meta = json?.chart?.result?.[0]?.meta
  if (!meta || !meta.regularMarketPrice) return { name, value: 'N/A', change: '0.00' }

  const price    = meta.regularMarketPrice
  const prevClose = meta.chartPreviousClose || meta.previousClose || price
  const changePct = prevClose ? ((price - prevClose) / prevClose * 100) : 0

  return {
    name,
    value: price,
    change: changePct.toFixed(2),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const results = await Promise.all(
      INDICES.map(idx => fetchYahoo(idx.symbol, idx.name))
    )

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('stock-us-index error:', err)
    // Finnhub fallback (SPY, QQQ)
    try {
      const apiKey = Deno.env.get('FINNHUB_API_KEY')
      if (apiKey) {
        const fallback = await Promise.all(
          [{ symbol: 'SPY', name: 'S&P 500' }, { symbol: 'QQQ', name: 'NASDAQ' }].map(async idx => {
            const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${idx.symbol}&token=${apiKey}`)
            const d = await r.json()
            return {
              name: idx.name,
              value: d.c || 'N/A',
              change: d.pc && d.c ? ((d.c - d.pc) / d.pc * 100).toFixed(2) : '0.00',
            }
          })
        )
        return new Response(JSON.stringify(fallback), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } catch {}

    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
