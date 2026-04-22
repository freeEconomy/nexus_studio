// @ts-nocheck
// 한국 주식 검색 - Static Directory + Naver AC + Yahoo Finance 하이브리드
// Yahoo Finance는 한글 검색 미지원 → 정적 목록 + Naver 자동완성으로 보완
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── 주요 한국 주식 정적 목록 (KOSPI/KOSDAQ 시가총액 상위) ──────────
const KR_STOCKS = [
  // KOSPI
  { code: '005930', name: '삼성전자',         market: 'KS' },
  { code: '000660', name: 'SK하이닉스',        market: 'KS' },
  { code: '207940', name: '삼성바이오로직스',   market: 'KS' },
  { code: '005380', name: '현대자동차',         market: 'KS' },
  { code: '000270', name: '기아',              market: 'KS' },
  { code: '068270', name: '셀트리온',           market: 'KS' },
  { code: '028260', name: '삼성물산',           market: 'KS' },
  { code: '105560', name: 'KB금융',            market: 'KS' },
  { code: '035420', name: 'NAVER',             market: 'KS' },
  { code: '003550', name: 'LG',                market: 'KS' },
  { code: '055550', name: '신한지주',           market: 'KS' },
  { code: '051910', name: 'LG화학',            market: 'KS' },
  { code: '006400', name: '삼성SDI',           market: 'KS' },
  { code: '035720', name: '카카오',             market: 'KS' },
  { code: '030200', name: 'KT',                market: 'KS' },
  { code: '086790', name: '하나금융지주',        market: 'KS' },
  { code: '066570', name: 'LG전자',            market: 'KS' },
  { code: '015760', name: '한국전력',           market: 'KS' },
  { code: '017670', name: 'SK텔레콤',          market: 'KS' },
  { code: '032830', name: '삼성생명',           market: 'KS' },
  { code: '012330', name: '현대모비스',          market: 'KS' },
  { code: '034730', name: 'SK',               market: 'KS' },
  { code: '000810', name: '삼성화재',           market: 'KS' },
  { code: '090430', name: '아모레퍼시픽',        market: 'KS' },
  { code: '010130', name: '고려아연',           market: 'KS' },
  { code: '096770', name: 'SK이노베이션',        market: 'KS' },
  { code: '033780', name: 'KT&G',             market: 'KS' },
  { code: '078930', name: 'GS',               market: 'KS' },
  { code: '010950', name: 'S-Oil',            market: 'KS' },
  { code: '011200', name: 'HMM',              market: 'KS' },
  { code: '034020', name: '두산에너빌리티',      market: 'KS' },
  { code: '003490', name: '대한항공',           market: 'KS' },
  { code: '097950', name: 'CJ제일제당',         market: 'KS' },
  { code: '005490', name: 'POSCO홀딩스',        market: 'KS' },
  { code: '024110', name: '기업은행',           market: 'KS' },
  { code: '316140', name: '우리금융지주',        market: 'KS' },
  { code: '028050', name: '삼성엔지니어링',      market: 'KS' },
  { code: '000720', name: '현대건설',           market: 'KS' },
  { code: '180640', name: '한진칼',            market: 'KS' },
  { code: '003670', name: '포스코퓨처엠',        market: 'KS' },
  { code: '009150', name: '삼성전기',           market: 'KS' },
  { code: '047050', name: '포스코인터내셔널',     market: 'KS' },
  { code: '018260', name: '삼성SDS',           market: 'KS' },
  { code: '071050', name: '한국금융지주',        market: 'KS' },
  { code: '055016', name: '메리츠금융지주',       market: 'KS' },
  { code: '000100', name: '유한양행',           market: 'KS' },
  { code: '011170', name: '롯데케미칼',          market: 'KS' },
  { code: '032640', name: 'LG유플러스',         market: 'KS' },
  { code: '009830', name: '한화솔루션',          market: 'KS' },
  { code: '012450', name: '한화에어로스페이스',    market: 'KS' },
  { code: '042660', name: '한화오션',           market: 'KS' },
  { code: '267250', name: '현대일렉트릭',        market: 'KS' },
  { code: '323410', name: '카카오뱅크',          market: 'KS' },
  { code: '377300', name: '카카오페이',          market: 'KS' },
  { code: '011790', name: 'SKC',              market: 'KS' },
  { code: '002790', name: '아모레G',           market: 'KS' },
  { code: '004020', name: '현대제철',           market: 'KS' },
  { code: '000080', name: '하이트진로',          market: 'KS' },
  { code: '036460', name: '한국가스공사',        market: 'KS' },
  { code: '005830', name: 'DB손해보험',         market: 'KS' },
  { code: '010140', name: '삼성중공업',          market: 'KS' },
  // KOSDAQ
  { code: '247540', name: '에코프로비엠',        market: 'KQ' },
  { code: '086520', name: '에코프로',           market: 'KQ' },
  { code: '196170', name: '알테오젠',           market: 'KQ' },
  { code: '352820', name: '하이브',            market: 'KQ' },
  { code: '041510', name: '에스엠',            market: 'KQ' },
  { code: '035900', name: 'JYP엔터테인먼트',    market: 'KQ' },
  { code: '293490', name: '카카오게임즈',        market: 'KQ' },
  { code: '036570', name: 'NC소프트',          market: 'KQ' },
  { code: '263750', name: '펄어비스',           market: 'KQ' },
  { code: '145020', name: '휴젤',             market: 'KQ' },
  { code: '214150', name: '클래시스',          market: 'KQ' },
  { code: '091990', name: '셀트리온헬스케어',   market: 'KQ' },
  { code: '112040', name: '위메이드',          market: 'KQ' },
  { code: '251270', name: '넷마블',           market: 'KQ' },
  { code: '357780', name: '솔브레인',          market: 'KQ' },
  { code: '131290', name: '티씨케이',          market: 'KQ' },
  { code: '166090', name: '하나머티리얼즈',     market: 'KQ' },
  { code: '319660', name: '피에스케이',         market: 'KQ' },
  { code: '067160', name: '아프리카TV',         market: 'KQ' },
  { code: '035760', name: 'CJ ENM',          market: 'KQ' },
]

// ── 정적 목록 검색 ───────────────────────────────────────────────
function searchDir(query: string): any[] {
  const q = query.trim()
  const ql = q.toLowerCase()
  return KR_STOCKS
    .filter(s =>
      s.name.includes(q) ||
      s.name.toLowerCase().includes(ql) ||
      s.code.startsWith(q)
    )
    .slice(0, 10)
    .map(s => ({ symbol: `${s.code}.${s.market}`, description: s.name }))
}

// ── Naver 자동완성 (한글/영문) ────────────────────────────────────
async function searchNaverAC(query: string): Promise<any[]> {
  const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(query)}&target=stock`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      'Referer': 'https://m.stock.naver.com/',
      'Accept': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Naver AC ${res.status}`)
  const json = await res.json()

  // 응답 형식 처리 (배열 또는 객체)
  const raw: any[] = json?.items ?? json?.result?.list ?? []
  if (!Array.isArray(raw) || raw.length === 0) return []

  return raw.slice(0, 20).map((item: any) => {
    // 배열 형식 대응 (구형 API)
    if (Array.isArray(item)) {
      const code = String(item[0] ?? '').trim()
      const name = item[1] ?? code
      const mCode = String(item[2] ?? '')
      if (!/^\d{6}$/.test(code)) return null
      const market = mCode === '2' ? 'KQ' : 'KS'
      return { symbol: `${code}.${market}`, description: name }
    }
    // 객체 형식 (현재 Naver AC 응답)
    const code       = String(item.code ?? item.itemCode ?? '').trim()
    const name       = item.name ?? item.itemName ?? code
    const typeCode   = String(item.typeCode ?? '')   // "KOSPI", "KOSDAQ", "NASDAQ" 등
    const nationCode = String(item.nationCode ?? '') // "KOR", "USA" 등
    // 한국 국적 + KOSPI/KOSDAQ만 허용 (해외주식 완전 제외)
    if (nationCode && nationCode !== 'KOR') return null
    if (!typeCode.includes('KOSPI') && !typeCode.includes('KOSDAQ')) return null
    // 6자리 숫자 코드만 (신주인수권·ELW 등 비정형 코드 제외)
    if (!/^\d{6}$/.test(code)) return null
    const market = typeCode.includes('KOSDAQ') ? 'KQ' : 'KS'
    return { symbol: `${code}.${market}`, description: name }
  }).filter(Boolean)
}

// ── Naver polling 단일 종목 (숫자 코드) ──────────────────────────
async function fetchNaverByCode(code: string): Promise<any[]> {
  const padded = code.padStart(6, '0')

  // 정적 목록 우선 조회
  const found = KR_STOCKS.find(s => s.code === padded)
  if (found) {
    return [{ symbol: `${padded}.${found.market}`, description: found.name }]
  }

  // Naver polling으로 이름 조회
  const url = `https://polling.finance.naver.com/api/realtime/domestic/stock/${padded}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://m.stock.naver.com/',
    },
  })
  if (!res.ok) throw new Error(`Naver polling ${res.status}`)
  const json = await res.json()
  const data = json?.datas?.[0]
  if (!data) throw new Error('No data')
  const name = data.stockName ?? data.itemName ?? data.itemCode ?? padded
  return [{ symbol: `${padded}.KS`, description: name }]
}

// ── Yahoo Finance 검색 (영문/티커) ────────────────────────────────
async function searchYahoo(query: string): Promise<any[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&listsCount=0`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`Yahoo ${res.status}`)
  const data = await res.json()
  return (data.quotes ?? [])
    .filter((q: any) => q.quoteType === 'EQUITY' && /\.(KS|KQ)$/i.test(q.symbol))
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

    // 1. 숫자 코드 (4~6자리) → Naver polling / 정적 목록
    if (/^\d{4,6}$/.test(trimmed)) {
      try {
        results = await fetchNaverByCode(trimmed)
      } catch (e) {
        console.warn('Code lookup failed:', e.message)
        const padded = trimmed.padStart(6, '0')
        results = [{ symbol: `${padded}.KS`, description: padded }]
      }
    }
    // 2. 한글 포함 → 정적 목록 + Naver 자동완성
    else if (/[가-힣]/.test(trimmed)) {
      results = searchDir(trimmed)
      if (results.length < 5) {
        try {
          const acResults = await searchNaverAC(trimmed)
          const existing = new Set(results.map(r => r.symbol))
          results = [
            ...results,
            ...acResults.filter(r => !existing.has(r.symbol)),
          ].slice(0, 10)
        } catch (e) {
          console.warn('Naver AC failed:', e.message)
        }
      }
    }
    // 3. 영문/티커 → Yahoo Finance + 정적 목록
    else {
      try {
        results = await searchYahoo(trimmed)
      } catch (e) {
        console.warn('Yahoo search failed:', e.message)
      }
      if (results.length < 3) {
        const dirResults = searchDir(trimmed)
        const existing = new Set(results.map(r => r.symbol))
        results = [
          ...results,
          ...dirResults.filter(r => !existing.has(r.symbol)),
        ].slice(0, 10)
      }
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
