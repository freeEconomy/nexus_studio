import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

console.log("Hello from Functions!")

serve(async (req) => {
  const { url, method } = req

  // This is needed if you're planning to invoke your function from a browser.
  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.json()
    const { ticker } = body

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

    const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`)
    const data = await response.json()

    if (data.error) {
      return new Response(JSON.stringify({ error: data.error }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    return new Response(JSON.stringify(data), {
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