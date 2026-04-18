import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { method } = req

  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.json()
    const { ticker, market } = body

    if (!ticker) {
      return new Response(JSON.stringify({ error: 'Ticker is required' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (!groqKey) {
      return new Response(JSON.stringify({ error: 'Groq API key not configured' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    // Qwen3 for analysis
    const analysisQuery = `${market} 주식 ${ticker}에 대한 투자 분석을 해주세요. 현재 시장 상황, 재무 지표, 미래 전망을 포함해서.`
    const analysisResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen/qwen3-32b',
        messages: [{ role: 'user', content: analysisQuery }],
        max_tokens: 1000,
      }),
    })

    const analysisData = await analysisResponse.json()
    const analysis = analysisData.choices[0].message.content

    // Compound for news summary
    const newsQuery = `${ticker} 관련 최신 뉴스 요약`
    const newsResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'groq/compound',
        messages: [{ role: 'user', content: newsQuery }],
        max_tokens: 500,
      }),
    })

    const newsData = await newsResponse.json()
    const newsSummary = newsData.choices[0].message.content

    const result = {
      analysis,
      newsSummary,
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