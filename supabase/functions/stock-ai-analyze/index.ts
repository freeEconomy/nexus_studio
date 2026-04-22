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

    // 현재 날짜 (뉴스 검색 최신성 확보)
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = now.getMonth() + 1
    const dateLabel = `${yyyy}년 ${mm}월`

    // 뉴스 검색 쿼리: 종목명 기반으로 한국어/영문 분리
    const isKR = market === 'KR'
    const code = ticker.replace(/\.(KS|KQ)$/, '')
    const newsQuery = isKR
      ? `${code} 주식 최신 뉴스 ${yyyy}년`
      : `${ticker} stock news ${yyyy} ${mm}`

    // 1. Groq 투자 분석 + Tavily 뉴스 검색 병렬 실행
    const tasks: Promise<any>[] = [
      // Qwen3 - 수치 분석 (반드시 한국어로)
      fetch(GROQ_API_URL, {
        method: 'POST',
        headers: groqHeaders,
        body: JSON.stringify({
          model: 'qwen/qwen3-32b',
          messages: [
            {
              role: 'system',
              content: '당신은 한국의 주식 투자 전문 애널리스트입니다. 반드시 한국어로만 답변하세요. 영어로 답변하지 마세요.',
            },
            {
              role: 'user',
              content: `${market === 'KR' ? '한국' : '미국'} 주식 ${ticker}에 대한 투자 분석을 해주세요. 현재 시장 상황, 주요 재무 지표(PER, PBR 등), 업종 동향, 투자 의견을 포함하여 3~5문장으로 핵심만 요약해주세요.`,
            },
          ],
          max_tokens: 600,
          temperature: 0.7,
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
            query: newsQuery,
            search_depth: 'basic',
            include_answer: false,
            max_results: 5,
            days: 30, // 최근 30일 뉴스만
          }),
        })
      )
    }

    const [analysisRes, tavilyRes] = await Promise.all(tasks)

    const analysisData = await analysisRes.json()
    // Qwen3는 <think>...</think> 사고 과정을 포함하므로 제거
    const rawAnalysis = analysisData.choices?.[0]?.message?.content || ''
    const analysis = rawAnalysis.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim()

    // 2. Tavily 결과 → Groq llama로 한국어 요약
    let newsSummary = ''

    if (tavilyRes) {
      const tavilyData = await tavilyRes.json()
      // include_answer: false이므로 results에서 content 추출
      const snippets = (tavilyData.results || [])
        .slice(0, 5)
        .map((r: any) => `[${r.title || ''}] ${r.content || ''}`)
        .join('\n\n')

      if (snippets) {
        const summaryRes = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: groqHeaders,
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [
              {
                role: 'system',
                content: `당신은 금융 뉴스 요약 전문가입니다. 반드시 한국어로만 답변하세요. 주어진 뉴스 내용을 바탕으로 핵심 내용만 간결하게 요약하세요.${isKR ? ' 한국 주식 가격은 소수점 없이 정수로만 표시하세요 (예: 152,300원).' : ''}`,
              },
              {
                role: 'user',
                content: `${ticker} 관련 ${dateLabel} 최신 뉴스입니다. 한국어로 3~4줄로 핵심만 요약해주세요:\n\n${snippets}`,
              },
            ],
            max_tokens: 300,
            temperature: 0.3,
          }),
        })
        const summaryData = await summaryRes.json()
        newsSummary = summaryData.choices?.[0]?.message?.content || ''
        // 국내주식: 소수점 불필요한 숫자 정리 (152,300.0 → 152,300)
        if (isKR) {
          newsSummary = newsSummary.replace(/(\d[\d,]*)\.0+(?=\s|원|주|배|%|,|$)/g, '$1')
        }
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
