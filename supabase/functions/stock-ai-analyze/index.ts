// @ts-nocheck
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { ticker, market } = await req.json()

    if (!ticker) {
      return new Response(JSON.stringify({ error: 'Ticker is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (!groqKey) {
      return new Response(JSON.stringify({ error: 'Groq API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const headers = {
      Authorization: `Bearer ${groqKey}`,
      'Content-Type': 'application/json',
    }

    const [analysisResponse, newsResponse] = await Promise.all([
      fetch(GROQ_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'qwen/qwen3-32b',
          messages: [{ role: 'user', content: `${market} 주식 ${ticker}에 대한 투자 분석을 해주세요. 현재 시장 상황, 재무 지표, 미래 전망을 포함해서.` }],
          max_tokens: 1000,
        }),
      }),
      fetch(GROQ_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'compound-beta-mini',
          messages: [{ role: 'user', content: `${ticker} 관련 최신 뉴스 요약` }],
          max_tokens: 500,
        }),
      }),
    ])

    const analysisData = await analysisResponse.json()
    const newsData = await newsResponse.json()

    return new Response(JSON.stringify({
      analysis: analysisData.choices?.[0]?.message?.content || '',
      newsSummary: newsData.choices?.[0]?.message?.content || '',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
