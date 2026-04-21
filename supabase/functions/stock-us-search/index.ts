// @ts-nocheck
// Yahoo Finance 검색 사용 (Finnhub 무료 플랜 rate limit 우회)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { query } = await req.json()
    if (!query) {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&listsCount=0`
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Yahoo Finance error: ${response.status}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await response.json()

    // 미국 주식만 (KS/KQ 제외, EQUITY 타입)
    const results = (data.quotes || [])
      .filter((q: any) =>
        q.quoteType === 'EQUITY' &&
        !/\.(KS|KQ|T|SS|SZ|HK|AX|L|PA|DE|MI|SW|AS|BR|LS|MC|OL|ST|HE|CO)$/i.test(q.symbol)
      )
      .slice(0, 10)
      .map((q: any) => ({
        symbol: q.symbol,
        description: q.longname || q.shortname || q.symbol,
      }))

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
