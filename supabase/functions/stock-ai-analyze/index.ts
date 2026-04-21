// @ts-nocheck
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const TAVILY_API_URL = 'https://api.tavily.com/search'

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

    const tavilyKey = Deno.env.get('TAVILY_API_KEY')

    const groqHeaders = {
      Authorization: `Bearer ${groqKey}`,
      'Content-Type': 'application/json',
    }

    // 1. Groq 투자 분석 + Tavily 뉴스 검색 병렬 실행
    const tasks: Promise<any>[] = [
      fetch(GROQ_API_URL, {
        method: 'POST',
        headers: groqHeaders,
        body: JSON.stringify({
          model: 'qwen/qwen3-32b',
          messages: [{ role: 'user', content: `${market} 주식 ${ticker}에 대한 투자 분석을 해주세요. 현재 시장 상황, 재무 지표, 미래 전망을 포함해서.` }],
          max_tokens: 1000,
        }),
      }),
    ]

    if (tavilyKey) {
      tasks.push(
        fetch(TAVILY_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: tavilyKey,
            query: `${ticker} stock news latest 2024 2025`,
            search_depth: 'basic',
            include_answer: true,
            max_results: 5,
          }),
        })
      )
    }

    const [analysisRes, tavilyRes] = await Promise.all(tasks)

    const analysisData = await analysisRes.json()
    const analysis = analysisData.choices?.[0]?.message?.content || ''

    // 2. Tavily 결과 → Groq llama-3.1-8b-instant 로 한국어 요약
    let newsSummary = ''

    if (tavilyRes) {
      const tavilyData = await tavilyRes.json()
      const context = tavilyData.answer
        || tavilyData.results?.slice(0, 5).map((r: any) => r.content).join('\n\n')
        || ''

      if (context) {
        const summaryRes = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: groqHeaders,
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [
              {
                role: 'system',
                content: '당신은 금융 뉴스 요약 전문가입니다. 검색 결과를 바탕으로 핵심 내용만 한국어로 간결하게 요약하세요.',
              },
              {
                role: 'user',
                content: `${ticker} 관련 최신 뉴스를 다음 검색 결과를 바탕으로 한국어로 3~4줄로 요약해주세요:\n\n${context}`,
              },
            ],
            max_tokens: 300,
            temperature: 0.3,
          }),
        })
        const summaryData = await summaryRes.json()
        newsSummary = summaryData.choices?.[0]?.message?.content || ''
      }
    }

    return new Response(JSON.stringify({ analysis, newsSummary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
