// @ts-nocheck
// 미국 주식 검색 - 한글 이름 정적 디렉터리 + Yahoo Finance 하이브리드
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── 한글 이름 → 미국 주식 디렉터리 ─────────────────────────────────
// 국내 투자자들이 자주 검색하는 미국 주식 한글명 매핑
const US_STOCKS_KR = [
  // 빅테크
  { symbol: 'AAPL',  kr: ['애플'],                       name: 'Apple Inc.' },
  { symbol: 'MSFT',  kr: ['마이크로소프트', '마소'],       name: 'Microsoft Corporation' },
  { symbol: 'GOOGL', kr: ['구글', '알파벳', '알파벳A'],   name: 'Alphabet Inc.' },
  { symbol: 'GOOG',  kr: ['구글C', '알파벳C'],            name: 'Alphabet Inc. (Class C)' },
  { symbol: 'AMZN',  kr: ['아마존'],                      name: 'Amazon.com Inc.' },
  { symbol: 'META',  kr: ['메타', '페이스북'],             name: 'Meta Platforms Inc.' },
  { symbol: 'TSLA',  kr: ['테슬라'],                      name: 'Tesla Inc.' },
  { symbol: 'NFLX',  kr: ['넷플릭스'],                    name: 'Netflix Inc.' },
  { symbol: 'UBER',  kr: ['우버'],                        name: 'Uber Technologies Inc.' },
  { symbol: 'LYFT',  kr: ['리프트'],                      name: 'Lyft Inc.' },
  { symbol: 'SNAP',  kr: ['스냅', '스냅챗'],               name: 'Snap Inc.' },
  { symbol: 'X',     kr: ['트위터', '엑스'],               name: 'X Corp.' },
  { symbol: 'SPOT',  kr: ['스포티파이'],                   name: 'Spotify Technology SA' },

  // 반도체·AI
  { symbol: 'NVDA',  kr: ['엔비디아'],                    name: 'NVIDIA Corporation' },
  { symbol: 'AMD',   kr: ['에이엠디', 'AMD'],              name: 'Advanced Micro Devices Inc.' },
  { symbol: 'INTC',  kr: ['인텔'],                        name: 'Intel Corporation' },
  { symbol: 'QCOM',  kr: ['퀄컴'],                        name: 'Qualcomm Incorporated' },
  { symbol: 'AVGO',  kr: ['브로드컴'],                    name: 'Broadcom Inc.' },
  { symbol: 'TSM',   kr: ['TSMC', '대만반도체'],          name: 'Taiwan Semiconductor Manufacturing' },
  { symbol: 'ASML',  kr: ['ASML', '에이에스엠엘'],        name: 'ASML Holding NV' },
  { symbol: 'MU',    kr: ['마이크론'],                    name: 'Micron Technology Inc.' },
  { symbol: 'AMAT',  kr: ['어플라이드머티리얼즈'],        name: 'Applied Materials Inc.' },
  { symbol: 'LRCX',  kr: ['램리서치'],                    name: 'Lam Research Corporation' },
  { symbol: 'KLAC',  kr: ['KLA'],                         name: 'KLA Corporation' },
  { symbol: 'ARM',   kr: ['ARM', '암홀딩스'],              name: 'Arm Holdings plc' },

  // 금융
  { symbol: 'JPM',   kr: ['JP모건', '제이피모건'],        name: 'JPMorgan Chase & Co.' },
  { symbol: 'BAC',   kr: ['뱅크오브아메리카', 'BOA'],     name: 'Bank of America Corporation' },
  { symbol: 'GS',    kr: ['골드만삭스'],                  name: 'The Goldman Sachs Group Inc.' },
  { symbol: 'MS',    kr: ['모건스탠리'],                  name: 'Morgan Stanley' },
  { symbol: 'V',     kr: ['비자'],                        name: 'Visa Inc.' },
  { symbol: 'MA',    kr: ['마스터카드'],                  name: 'Mastercard Incorporated' },
  { symbol: 'PYPL',  kr: ['페이팔'],                      name: 'PayPal Holdings Inc.' },
  { symbol: 'COIN',  kr: ['코인베이스'],                  name: 'Coinbase Global Inc.' },
  { symbol: 'SQ',    kr: ['스퀘어', '블록'],              name: 'Block Inc.' },
  { symbol: 'HOOD',  kr: ['로빈후드'],                    name: 'Robinhood Markets Inc.' },
  { symbol: 'BRK-B', kr: ['버크셔해서웨이'],              name: 'Berkshire Hathaway Inc.' },

  // 헬스케어·바이오
  { symbol: 'JNJ',   kr: ['존슨앤존슨', 'J&J'],          name: 'Johnson & Johnson' },
  { symbol: 'PFE',   kr: ['화이자'],                      name: 'Pfizer Inc.' },
  { symbol: 'MRNA',  kr: ['모더나'],                      name: 'Moderna Inc.' },
  { symbol: 'UNH',   kr: ['유나이티드헬스'],              name: 'UnitedHealth Group Incorporated' },
  { symbol: 'LLY',   kr: ['일라이릴리'],                  name: 'Eli Lilly and Company' },
  { symbol: 'ABBV',  kr: ['애브비'],                      name: 'AbbVie Inc.' },
  { symbol: 'GILD',  kr: ['길리어드'],                    name: 'Gilead Sciences Inc.' },
  { symbol: 'REGN',  kr: ['리제네론'],                    name: 'Regeneron Pharmaceuticals Inc.' },

  // 에너지
  { symbol: 'XOM',   kr: ['엑슨모빌'],                   name: 'Exxon Mobil Corporation' },
  { symbol: 'CVX',   kr: ['셰브론', '쉐브론'],            name: 'Chevron Corporation' },
  { symbol: 'COP',   kr: ['코노코필립스'],                name: 'ConocoPhillips' },

  // 소비재·유통
  { symbol: 'COST',  kr: ['코스트코'],                    name: 'Costco Wholesale Corporation' },
  { symbol: 'WMT',   kr: ['월마트'],                      name: 'Walmart Inc.' },
  { symbol: 'TGT',   kr: ['타겟'],                        name: 'Target Corporation' },
  { symbol: 'AMZN',  kr: ['아마존'],                      name: 'Amazon.com Inc.' },
  { symbol: 'SBUX',  kr: ['스타벅스'],                    name: 'Starbucks Corporation' },
  { symbol: 'MCD',   kr: ['맥도날드'],                    name: "McDonald's Corporation" },
  { symbol: 'NKE',   kr: ['나이키'],                      name: 'Nike Inc.' },
  { symbol: 'LULU',  kr: ['룰루레몬'],                    name: 'Lululemon Athletica Inc.' },

  // 자동차·EV
  { symbol: 'F',     kr: ['포드'],                        name: 'Ford Motor Company' },
  { symbol: 'GM',    kr: ['제너럴모터스', 'GM'],          name: 'General Motors Company' },
  { symbol: 'RIVN',  kr: ['리비안'],                      name: 'Rivian Automotive Inc.' },
  { symbol: 'LCID',  kr: ['루시드'],                      name: 'Lucid Group Inc.' },
  { symbol: 'NIO',   kr: ['니오'],                        name: 'NIO Inc.' },
  { symbol: 'XPEV',  kr: ['샤오펑', '소붕'],              name: 'XPeng Inc.' },
  { symbol: 'LI',    kr: ['리오토'],                      name: 'Li Auto Inc.' },

  // 우주·방산
  { symbol: 'BA',    kr: ['보잉'],                        name: 'The Boeing Company' },
  { symbol: 'LMT',   kr: ['록히드마틴'],                  name: 'Lockheed Martin Corporation' },
  { symbol: 'RTX',   kr: ['레이시온'],                    name: 'RTX Corporation' },
  { symbol: 'SPCE',  kr: ['버진갤럭틱'],                  name: 'Virgin Galactic Holdings Inc.' },
  { symbol: 'RKLB',  kr: ['로켓랩'],                      name: 'Rocket Lab USA Inc.' },

  // AI·소프트웨어
  { symbol: 'PLTR',  kr: ['팔란티어'],                    name: 'Palantir Technologies Inc.' },
  { symbol: 'CRM',   kr: ['세일즈포스'],                  name: 'Salesforce Inc.' },
  { symbol: 'ORCL',  kr: ['오라클'],                      name: 'Oracle Corporation' },
  { symbol: 'NOW',   kr: ['서비스나우'],                   name: 'ServiceNow Inc.' },
  { symbol: 'SNOW',  kr: ['스노우플레이크'],               name: 'Snowflake Inc.' },
  { symbol: 'DDOG',  kr: ['데이터독'],                    name: 'Datadog Inc.' },
  { symbol: 'CRWD',  kr: ['크라우드스트라이크'],           name: 'CrowdStrike Holdings Inc.' },
  { symbol: 'ZS',    kr: ['지스케일러'],                   name: 'Zscaler Inc.' },
  { symbol: 'OKTA',  kr: ['옥타'],                        name: 'Okta Inc.' },
  { symbol: 'SHOP',  kr: ['쇼피파이'],                    name: 'Shopify Inc.' },
  { symbol: 'MSTR',  kr: ['마이크로스트래티지', '마스'],   name: 'MicroStrategy Incorporated' },

  // 통신
  { symbol: 'T',     kr: ['AT&T', '에이티앤티'],          name: 'AT&T Inc.' },
  { symbol: 'VZ',    kr: ['버라이즌'],                    name: 'Verizon Communications Inc.' },
  { symbol: 'TMUS',  kr: ['T모바일'],                     name: 'T-Mobile US Inc.' },

  // 주요 ETF
  { symbol: 'SPY',   kr: ['SPY', 'S&P500ETF'],            name: 'SPDR S&P 500 ETF Trust' },
  { symbol: 'QQQ',   kr: ['QQQ', '나스닥ETF'],             name: 'Invesco QQQ Trust' },
  { symbol: 'TQQQ',  kr: ['TQQQ', '나스닥3배'],            name: 'ProShares UltraPro QQQ' },
  { symbol: 'SOXL',  kr: ['SOXL', '반도체3배'],            name: 'Direxion Daily Semiconductor Bull 3X' },
  { symbol: 'SOXS',  kr: ['SOXS', '반도체3배인버스'],       name: 'Direxion Daily Semiconductor Bear 3X' },
  { symbol: 'ARKK',  kr: ['아크', 'ARKK'],                 name: 'ARK Innovation ETF' },
]

// ── 디렉터리 검색 (한글명·영문명·심볼 모두 대소문자 무관) ───────────
function searchDir(query: string): any[] {
  const q = query.trim().toLowerCase()
  const matched: any[] = []
  const seen = new Set<string>()
  for (const s of US_STOCKS_KR) {
    if (seen.has(s.symbol)) continue
    const symbolMatch = s.symbol.toLowerCase().startsWith(q) || s.symbol.toLowerCase() === q
    const krMatch     = s.kr.some(k => k.toLowerCase().includes(q) || q.includes(k.toLowerCase()))
    const nameMatch   = s.name.toLowerCase().includes(q)
    if (symbolMatch || krMatch || nameMatch) {
      matched.push({ symbol: s.symbol, description: s.name })
      seen.add(s.symbol)
    }
  }
  return matched.slice(0, 10)
}

// ── Yahoo Finance 검색 (미국 상장 주식만) ────────────────────────
async function searchYahoo(query: string): Promise<any[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&listsCount=0`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`Yahoo Finance error: ${res.status}`)
  const data = await res.json()
  return (data.quotes ?? [])
    .filter((q: any) =>
      // EQUITY(주식) + ETF 모두 허용
      (q.quoteType === 'EQUITY' || q.quoteType === 'ETF') &&
      // 미국 외 거래소 제외: 심볼에 점이 없거나 BRK-B 형태만 허용
      (!/\./.test(q.symbol) || /^[A-Z]+-[A-Z]$/.test(q.symbol))
    )
    .slice(0, 10)
    .map((q: any) => ({
      symbol: q.symbol,
      description: q.longname ?? q.shortname ?? q.symbol,
    }))
}

// ── Main Handler ─────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { query } = await req.json()
    if (!query) {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const trimmed = query.trim()
    let results: any[] = []

    // 한글 포함 → 디렉터리 우선, Yahoo 보완
    if (/[가-힣]/.test(trimmed)) {
      results = searchDir(trimmed)
      if (results.length < 3) {
        try {
          const yResults = await searchYahoo(trimmed)
          const seen = new Set(results.map(r => r.symbol))
          results = [...results, ...yResults.filter(r => !seen.has(r.symbol))].slice(0, 10)
        } catch {}
      }
    } else {
      // 영문/티커 → 디렉터리 먼저 (TSMC→TSM 등 우선 매칭), Yahoo로 보완
      results = searchDir(trimmed)
      try {
        const yResults = await searchYahoo(trimmed)
        const seen = new Set(results.map(r => r.symbol))
        results = [...results, ...yResults.filter(r => !seen.has(r.symbol))].slice(0, 10)
      } catch {}
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
