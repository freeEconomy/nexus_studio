import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const INDICES = [
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^IXIC', name: 'NASDAQ' },
  // 한국 지수는 Finnhub에서 지원하지 않음
  // { symbol: '^KS11', name: 'KOSPI' },
  // { symbol: '^KQ11', name: 'KOSDAQ' },
]

serve(async (req) => {
  const { method } = req

  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const apiKey = Deno.env.get('FINNHUB_API_KEY')
    console.log('FINNHUB_API_KEY exists:', !!apiKey)
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    const results = await Promise.all(
      INDICES.map(async (index) => {
        console.log(`Fetching ${index.symbol}...`)
        const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${index.symbol}&token=${apiKey}`)
        const data = await response.json()
        console.log(`${index.symbol} data:`, data)
        
        if (data.error) {
          console.error(`Error for ${index.symbol}:`, data.error)
          return {
            name: index.name,
            value: 'N/A',
            change: '0.00',
          }
        }
        
        return {
          name: index.name,
          value: data.c,
          change: ((data.c - data.pc) / data.pc * 100).toFixed(2),
        }
      })
    )

    console.log('Final results:', results)
    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in stock-us-index:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})