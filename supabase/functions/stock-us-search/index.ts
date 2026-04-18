import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { method } = req

  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.json()
    const { query } = body

    if (!query) {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
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

    const response = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${apiKey}`)
    const data = await response.json()

    if (data.error) {
      return new Response(JSON.stringify({ error: data.error }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Filter to stocks
    const results = data.result.filter(item => item.type === 'Common Stock').slice(0, 10)

    return new Response(JSON.stringify(results), {
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