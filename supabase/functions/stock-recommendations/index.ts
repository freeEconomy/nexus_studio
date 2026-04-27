// @ts-nocheck
import { getKisToken } from '../_shared/kis-token.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const CACHE_TTL_MS = 60 * 60 * 1000  // 1 hour

const US_CANDIDATES = [
  { ticker: 'NVDA',  name: 'NVIDIA',           sector: 'AI반도체' },
  { ticker: 'AMD',   name: 'AMD',               sector: 'AI반도체' },
  { ticker: 'AVGO',  name: 'Broadcom',          sector: 'AI반도체' },
  { ticker: 'TSM',   name: 'TSMC',              sector: 'AI반도체' },
  { ticker: 'MU',    name: 'Micron',            sector: 'AI반도체' },
  { ticker: 'INTC',  name: 'Intel',             sector: 'AI반도체' },
  { ticker: 'MSFT',  name: 'Microsoft',         sector: 'AI/테크' },
  { ticker: 'GOOGL', name: 'Alphabet',          sector: 'AI/테크' },
  { ticker: 'META',  name: 'Meta',              sector: 'AI/테크' },
  { ticker: 'AAPL',  name: 'Apple',             sector: 'AI/테크' },
  { ticker: 'AMZN',  name: 'Amazon',            sector: '클라우드' },
  { ticker: 'ORCL',  name: 'Oracle',            sector: '클라우드' },
  { ticker: 'CRM',   name: 'Salesforce',        sector: '클라우드' },
  { ticker: 'NFLX',  name: 'Netflix',           sector: '미디어' },
  { ticker: 'TSLA',  name: 'Tesla',             sector: '전기차' },
  { ticker: 'XOM',   name: 'ExxonMobil',        sector: '에너지' },
  { ticker: 'CVX',   name: 'Chevron',           sector: '에너지' },
  { ticker: 'JPM',   name: 'JPMorgan',          sector: '금융' },
  { ticker: 'BAC',   name: 'Bank of America',   sector: '금융' },
  { ticker: 'GS',    name: 'Goldman Sachs',     sector: '금융' },
  { ticker: 'JNJ',   name: 'J&J',              sector: '헬스케어' },
  { ticker: 'UNH',   name: 'UnitedHealth',      sector: '헬스케어' },
  { ticker: 'MRNA',  name: 'Moderna',           sector: '헬스케어' },
  { ticker: 'NKE',   name: 'Nike',              sector: '소비재' },
  { ticker: 'MCD',   name: "McDonald's",        sector: '소비재' },
]

const KR_CANDIDATES = [
  { ticker: '005930', name: '삼성전자',         sector: '반도체' },
  { ticker: '000660', name: 'SK하이닉스',       sector: '반도체' },
  { ticker: '035420', name: 'NAVER',            sector: '플랫폼' },
  { ticker: '035720', name: '카카오',           sector: '플랫폼' },
  { ticker: '005380', name: '현대차',           sector: '자동차' },
  { ticker: '000270', name: '기아',             sector: '자동차' },
  { ticker: '012330', name: '현대모비스',       sector: '자동차부품' },
  { ticker: '051910', name: 'LG화학',           sector: '화학/배터리' },
  { ticker: '373220', name: 'LG에너지솔루션',   sector: '배터리' },
  { ticker: '006400', name: '삼성SDI',          sector: '배터리' },
  { ticker: '068270', name: '셀트리온',         sector: '바이오' },
  { ticker: '207940', name: '삼성바이오로직스', sector: '바이오' },
  { ticker: '105560', name: 'KB금융',           sector: '금융' },
  { ticker: '055550', name: '신한지주',         sector: '금융' },
  { ticker: '086790', name: '하나금융지주',     sector: '금융' },
  { ticker: '066570', name: 'LG전자',           sector: '전자' },
  { ticker: '259960', name: '크래프톤',         sector: '게임' },
  { ticker: '036570', name: 'NC소프트',         sector: '게임' },
  { ticker: '034730', name: 'SK',               sector: '지주' },
  { ticker: '028260', name: '삼성물산',         sector: '건설/지주' },
]

function extractJSON(text: string): any {
  text = text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim()
  text = text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) text = text.slice(start, end + 1)
  return JSON.parse(text)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { market = 'US' } = await req.json()
    const mkt = market === 'KR' ? 'KR' : 'US'
    const cacheKey = `__REC2_${mkt}__`

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const groqKey     = Deno.env.get('GROQ_API_KEY')
    const finnhubKey  = Deno.env.get('FINNHUB_API_KEY')

    // ── 캐시 확인 (1시간 TTL) ────────────────────────
    if (supabaseUrl && serviceKey) {
      const cacheRes = await fetch(
        `${supabaseUrl}/rest/v1/stock_quote_cache?ticker=eq.${encodeURIComponent(cacheKey)}&select=data,updated_at`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
      )
      const cached = await cacheRes.json()
      if (Array.isArray(cached) && cached.length > 0) {
        const ageMs = Date.now() - new Date(cached[0].updated_at).getTime()
        if (ageMs < CACHE_TTL_MS) {
          return new Response(JSON.stringify(cached[0].data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
    }

    // ── 주식 데이터 수집 ──────────────────────────────
    let stockData: any[] = []
    const now   = new Date()
    const today = now.toISOString().split('T')[0]

    if (mkt === 'US') {
      // Finnhub 시세 병렬 조회
      const quoteResults = await Promise.allSettled(
        US_CANDIDATES.map(async (c) => {
          const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${c.ticker}&token=${finnhubKey}`)
          const d = await r.json()
          return { ...c, c: d.c ?? 0, dp: d.dp ?? 0, h: d.h ?? 0, l: d.l ?? 0, pc: d.pc ?? 0 }
        })
      )
      stockData = quoteResults
        .filter(r => r.status === 'fulfilled' && (r.value as any).c > 0)
        .map(r => (r as any).value)
        .sort((a, b) => Math.abs(b.dp) - Math.abs(a.dp))

      // 상위 10개 종목 감성 분석
      const topTickers = stockData.slice(0, 10).map(s => s.ticker)
      const sentResults = await Promise.allSettled(
        topTickers.map(async (ticker) => {
          const r = await fetch(`https://finnhub.io/api/v1/news-sentiment?symbol=${ticker}&token=${finnhubKey}`)
          const d = await r.json()
          return {
            ticker,
            bullishPercent:  d.sentiment?.bullishPercent  ?? null,
            articleCount:    d.buzz?.articlesInLastWeek   ?? 0,
            weeklyAvgScore:  d.sentiment?.score           ?? null,
          }
        })
      )
      const sentMap: Record<string, any> = {}
      sentResults.forEach(r => {
        if (r.status === 'fulfilled') sentMap[(r.value as any).ticker] = r.value
      })
      stockData = stockData.map(s => ({ ...s, sentiment: sentMap[s.ticker] ?? null }))

    } else {
      // KIS API 시세 병렬 조회
      const appKey    = Deno.env.get('KIS_APP_KEY')
      const appSecret = Deno.env.get('KIS_APP_SECRET')
      if (!appKey || !appSecret) throw new Error('KIS credentials not configured')

      const accessToken = await getKisToken(appKey, appSecret)
      const krResults = await Promise.allSettled(
        KR_CANDIDATES.map(async (c) => {
          const code = c.ticker.padStart(6, '0')
          const url  = new URL('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price')
          url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J')
          url.searchParams.set('FID_INPUT_ISCD', code)
          const r = await fetch(url.toString(), {
            headers: {
              authorization: `Bearer ${accessToken}`,
              appkey:    appKey,
              appsecret: appSecret,
              tr_id:     'FHKST01010100',
            },
          })
          const d = await r.json()
          if (d.rt_cd !== '0') return null
          const o = d.output
          return {
            ...c,
            price:         parseFloat(o.stck_prpr),
            changePercent: parseFloat(o.prdy_ctrt),
            change:        parseFloat(o.prdy_vrss),
            volume:        parseInt(o.acml_vol),
            high52:        parseFloat(o.w52_hgpr),
            low52:         parseFloat(o.w52_lwpr),
            per:           parseFloat(o.per),
            pbr:           parseFloat(o.pbr),
            foreignRatio:  parseFloat(o.hts_frgn_ehrt),
          }
        })
      )
      stockData = krResults
        .filter(r => r.status === 'fulfilled' && (r.value as any))
        .map(r => (r as any).value)
    }

    if (stockData.length === 0) throw new Error('주식 데이터를 가져올 수 없습니다')

    // ── LLM 데이터 테이블 구성 ────────────────────────
    let dataTable = ''
    if (mkt === 'US') {
      dataTable = stockData.map(s => {
        const dp    = (s.dp ?? 0).toFixed(2)
        const bull  = s.sentiment?.bullishPercent != null ? (s.sentiment.bullishPercent * 100).toFixed(0) + '%' : 'N/A'
        const art   = s.sentiment?.articleCount ?? 0
        return `${s.ticker}(${s.name})[${s.sector}]: $${(s.c ?? 0).toFixed(2)}, ${Number(dp) >= 0 ? '+' : ''}${dp}%, Bullish ${bull}, 기사수 ${art}`
      }).join('\n')
    } else {
      dataTable = stockData.map(s => {
        const pct = (s.changePercent ?? 0).toFixed(2)
        return `${s.ticker}(${s.name})[${s.sector}]: ₩${(s.price ?? 0).toLocaleString('ko-KR')}, ${Number(pct) >= 0 ? '+' : ''}${pct}%, PER ${(s.per ?? 0).toFixed(1)}, PBR ${(s.pbr ?? 0).toFixed(2)}, 외국인 ${(s.foreignRatio ?? 0).toFixed(1)}%`
      }).join('\n')
    }

    // ── Groq LLM 호출 ─────────────────────────────────
    if (!groqKey) throw new Error('Groq API key not configured')
    const groqHeaders = { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' }

    let model: string
    let systemPrompt: string
    let userPrompt: string

    if (mkt === 'US') {
      model = 'compound-beta'
      systemPrompt = `당신은 미국 주식 전문 투자 분석가입니다. 투자자에게 오늘 가장 유망한 종목을 추천해주세요. 반드시 한국어로 답변하고, 지시한 JSON 형식으로만 출력하세요.`
      userPrompt = `오늘 날짜: ${today}

다음 미국 주식 실시간 데이터를 분석해주세요:
${dataTable}

추천 기준 (복합 스코어링):
① 모멘텀(30%): 최근 상승 추세, 52주 신고가 근접, 거래량 급증(200% 이상)
② 뉴스 감성(25%): Finnhub Bullish % 상위, 기사수 많은 종목, 애널리스트 목표가 상향
③ 기술적 지표(25%): RSI 30 이하 과매도 반등, 골든크로스(5일선>20일선), 볼린저밴드 하단 반등
④ 섹터 테마(20%): 오늘의 핫한 섹터(AI·반도체 강세 등), 실적 발표 예정, 금리·환율 수혜 종목

S&P500 대비 초과 수익 가능 TOP 10 종목을 선정하고 아래 JSON만 출력하세요 (다른 텍스트 없이):
{
  "marketSummary": "오늘 미국 시장 한 줄 요약",
  "hotSectors": ["섹터1", "섹터2", "섹터3"],
  "recommendations": [
    {
      "rank": 1,
      "ticker": "NVDA",
      "name": "NVIDIA",
      "sector": "AI반도체",
      "compositeScore": 87,
      "scoreBreakdown": { "momentum": 90, "sentiment": 88, "technical": 82, "volume": 85 },
      "reason": "추천 근거 2~3문장 (한국어)",
      "keyNews": ["최근 관련 뉴스 헤드라인1", "헤드라인2"],
      "targetPrice": "$1,050",
      "riskLevel": "낮음"
    },
    { "rank": 2, "ticker": "...", "name": "...", "sector": "...", "compositeScore": 85, "scoreBreakdown": { "momentum": 88, "sentiment": 85, "technical": 80, "volume": 82 }, "reason": "...", "keyNews": ["..."], "targetPrice": "$...", "riskLevel": "중간" }
  ]
}`
    } else {
      model = 'qwen/qwen3-32b'
      systemPrompt = `당신은 한국 주식 전문 투자 분석가입니다. 투자자에게 오늘 가장 유망한 국내 종목을 추천해주세요. 반드시 한국어로만 답변하고, <think> 태그 없이 지시한 JSON 형식으로만 출력하세요.`
      userPrompt = `오늘 날짜: ${today}

다음 국내 주식 실시간 데이터를 분석해주세요:
${dataTable}

추천 기준 (복합 스코어링):
① 모멘텀(30%): 최근 상승 추세, 거래량 급증(200% 이상), 52주 신고가 근접
② 외국인/기관(25%): 외국인 보유 비율 변화, 기관 순매수 동향, 프로그램 매매
③ 기술적 지표(25%): RSI 30 이하 과매도 반등, 골든크로스(5일선>20일선), 볼린저밴드 하단 반등
④ 섹터 테마(20%): 오늘의 핫한 섹터(AI·반도체·2차전지·바이오), 실적 발표 예정, 금리·환율 수혜

KOSPI 대비 초과 수익 가능 TOP 10 종목을 선정하고 아래 JSON만 출력하세요 (<think> 없이):
{
  "marketSummary": "오늘 코스피/코스닥 시장 한 줄 요약",
  "hotSectors": ["섹터1", "섹터2", "섹터3"],
  "recommendations": [
    {
      "rank": 1, "ticker": "005930", "name": "삼성전자", "sector": "반도체", "compositeScore": 85,
      "scoreBreakdown": { "momentum": 80, "institutional": 88, "technical": 84, "volume": 82 },
      "reason": "추천 근거 2~3문장 (한국어)",
      "keyNews": ["관련 뉴스 헤드라인1", "헤드라인2"],
      "targetPrice": "₩85,000",
      "riskLevel": "낮음"
    },
    { "rank": 2, "ticker": "...", "name": "...", "sector": "...", "compositeScore": 82, "scoreBreakdown": { "momentum": 78, "institutional": 85, "technical": 80, "volume": 79 }, "reason": "...", "keyNews": ["..."], "targetPrice": "₩...", "riskLevel": "중간" }
  ]
}`
    }

    const llmRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: groqHeaders,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   },
        ],
        max_tokens: 3500,
        temperature: 0.4,
      }),
    })
    const llmData = await llmRes.json()
    const rawText = llmData.choices?.[0]?.message?.content || ''

    let result: any
    try {
      result = extractJSON(rawText)
    } catch {
      // compound-beta 파싱 실패 시 llama-3.3-70b fallback
      const fallbackRes = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: groqHeaders,
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt   },
          ],
          max_tokens: 3500,
          temperature: 0.4,
        }),
      })
      const fallbackData = await fallbackRes.json()
      const fallbackText = fallbackData.choices?.[0]?.message?.content || '{}'
      result = JSON.parse(fallbackText)
    }

    result.updatedAt = new Date().toISOString()
    result.market    = mkt

    // ── 추천 종목에 현재가 enrichment ─────────────────
    if (Array.isArray(result.recommendations)) {
      const priceMap: Record<string, any> = {}
      stockData.forEach(s => { priceMap[s.ticker] = s })

      result.recommendations = result.recommendations.map((rec: any) => {
        const s = priceMap[rec.ticker]
        if (!s) return rec
        return mkt === 'US'
          ? { ...rec, currentPrice: s.c,     changePercent: s.dp }
          : { ...rec, currentPrice: s.price, changePercent: s.changePercent }
      })
    }

    // ── 캐시 저장 ─────────────────────────────────────
    if (supabaseUrl && serviceKey) {
      await fetch(`${supabaseUrl}/rest/v1/stock_quote_cache`, {
        method: 'POST',
        headers: {
          apikey:        serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer:         'resolution=merge-duplicates',
        },
        body: JSON.stringify({ ticker: cacheKey, data: result, updated_at: new Date().toISOString() }),
      })
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
