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
    const { query, summarize = true, lang = 'ko' } = await req.json()

    if (!query) {
      return new Response(JSON.stringify({ error: 'query is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const tavilyKey = Deno.env.get('TAVILY_API_KEY')
    if (!tavilyKey) {
      return new Response(JSON.stringify({ error: 'TAVILY_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Tavily 검색
    const tavilyRes = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyKey,
        query,
        search_depth: 'basic',
        include_answer: true,
        max_results: 5,
      }),
    })

    if (!tavilyRes.ok) {
      const errText = await tavilyRes.text()
      throw new Error(`Tavily API error: ${errText}`)
    }

    const tavilyData = await tavilyRes.json()

    // Tavily answer 또는 검색 결과 snippet 조합
    const context = tavilyData.answer
      || tavilyData.results?.slice(0, 5).map((r: any) => r.content).join('\n\n')
      || ''

    if (!summarize || !context) {
      return new Response(JSON.stringify({ result: context, sources: tavilyData.results || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Groq llama-3.1-8b-instant 로 한국어 요약
    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (!groqKey) throw new Error('GROQ_API_KEY not set')

    const langInstr = lang === 'ko' ? '한국어로' : 'in English'
    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `당신은 금융 뉴스 요약 전문가입니다. 검색 결과를 바탕으로 핵심 내용만 ${langInstr} 간결하게 요약하세요.`,
          },
          {
            role: 'user',
            content: `다음 검색 결과를 ${langInstr} 3~5줄로 핵심만 요약해주세요:\n\n${context}`,
          },
        ],
        max_tokens: 400,
        temperature: 0.3,
      }),
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      throw new Error(`Groq API error: ${errText}`)
    }

    const groqData = await groqRes.json()
    const result = groqData.choices?.[0]?.message?.content || context

    return new Response(JSON.stringify({ result, sources: tavilyData.results || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
