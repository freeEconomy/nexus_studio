import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { method } = req

  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.json()
    const { ticker } = body

    const apiKey = Deno.env.get('FINNHUB_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    // Get news
    const newsResponse = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=2023-01-01&to=2024-12-31&token=${apiKey}`)
    const newsData = await newsResponse.json()

    // Get sentiment
    const sentimentResponse = await fetch(`https://finnhub.io/api/v1/news-sentiment?symbol=${ticker}&token=${apiKey}`)
    const sentimentData = await sentimentResponse.json()

    const result = {
      news: newsData.slice(0, 10), // 최근 10개
      sentiment: sentimentData,
    }

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