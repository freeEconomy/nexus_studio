import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { method } = req

  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.json()
    const { ticker, period = 'D' } = body

    if (!ticker) {
      return new Response(JSON.stringify({ error: 'Ticker is required' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const apiKey = Deno.env.get('FINNHUB_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    // Calculate date range (last 1 year)
    const to = Math.floor(Date.now() / 1000)
    const from = to - (365 * 24 * 60 * 60)

    const resolution = period === 'D' ? 'D' : period === 'W' ? 'W' : 'M'

    const response = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=${resolution}&from=${from}&to=${to}&token=${apiKey}`)
    const data = await response.json()

    if (data.error) {
      return new Response(JSON.stringify({ error: data.error }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Format for TradingView
    const result = data.t.map((time, index) => ({
      time,
      open: data.o[index],
      high: data.h[index],
      low: data.l[index],
      close: data.c[index],
      volume: data.v[index],
    }))

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})