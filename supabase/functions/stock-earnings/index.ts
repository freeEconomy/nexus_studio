// @ts-nocheck
// 실적발표 캘린더 조회
// US : Finnhub earnings calendar API
// KR : OpenDART (금감독원 전자공시) 실시간 API
//
// 필요 환경변수:
//   FINNHUB_API_KEY   - Finnhub API 키
//   OPENDART_API_KEY  - https://opendart.fss.or.kr 무료 발급
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── 캐시 TTL ─────────────────────────────────────────────────
const CACHE_TTL_HOURS = 6

// ── KR 주요 종목 watchlist (DART corp_code 매핑 포함) ─────────
// corp_code: OpenDART 기업코드 (8자리), stock_code: KRX 종목코드 (6자리)
const KR_WATCHLIST = [
  { corp_code: '00126380', stock_code: '005930', name: '삼성전자' },
  { corp_code: '00164779', stock_code: '000660', name: 'SK하이닉스' },
  { corp_code: '00266961', stock_code: '035420', name: 'NAVER' },
  { corp_code: '00401731', stock_code: '035720', name: '카카오' },
  { corp_code: '00164788', stock_code: '005380', name: '현대자동차' },
  { corp_code: '00120329', stock_code: '000270', name: '기아' },
  { corp_code: '00356360', stock_code: '051910', name: 'LG화학' },
  { corp_code: '00421045', stock_code: '068270', name: '셀트리온' },
  { corp_code: '00126362', stock_code: '006400', name: '삼성SDI' },
  { corp_code: '00164786', stock_code: '005490', name: 'POSCO홀딩스' },
  { corp_code: '00164742', stock_code: '000830', name: '삼성물산' },
  { corp_code: '00149655', stock_code: '012330', name: '현대모비스' },
  { corp_code: '00541628', stock_code: '207940', name: '삼성바이오로직스' },
  { corp_code: '00426543', stock_code: '066570', name: 'LG전자' },
  { corp_code: '00126186', stock_code: '003550', name: 'LG' },
  { corp_code: '00293180', stock_code: '105560', name: 'KB금융' },
  { corp_code: '00382199', stock_code: '055550', name: '신한지주' },
  { corp_code: '00164711', stock_code: '086790', name: '하나금융지주' },
  { corp_code: '00277365', stock_code: '032830', name: '삼성생명' },
  { corp_code: '00631518', stock_code: '373220', name: 'LG에너지솔루션' },
]

// ── 보고서명 → 분기 라벨 파싱 ────────────────────────────────
function parseQuarter(reportNm: string, rceptDt: string): string {
  const year = rceptDt.slice(0, 4)
  if (reportNm.includes('사업보고서'))       return `${year}Q4(연간)`
  if (reportNm.includes('반기보고서'))       return `${year}Q2(반기)`
  if (reportNm.includes('분기보고서')) {
    // 접수일 기준으로 Q1/Q3 구분
    const month = parseInt(rceptDt.slice(4, 6))
    return month <= 6 ? `${year}Q1` : `${year}Q3`
  }
  // 실적발표예고, 매출액변동 등
  if (reportNm.includes('매출액') || reportNm.includes('손익구조'))
    return `${year} 실적변동공시`
  return year
}

// ── 보고서명 우선순위 (낮을수록 높은 우선순위) ────────────────
function reportPriority(reportNm: string): number {
  if (reportNm.includes('사업보고서'))  return 1
  if (reportNm.includes('반기보고서'))  return 2
  if (reportNm.includes('분기보고서'))  return 3
  if (reportNm.includes('매출액'))      return 4
  return 5
}

// ── OpenDART 공시 검색 ─────────────────────────────────────
async function fetchDartList(params: Record<string, string>, apiKey: string) {
  const url = new URL('https://opendart.fss.or.kr/api/list.json')
  url.searchParams.set('crtfc_key', apiKey)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NexusStudio/1.0)' },
  })
  if (!res.ok) throw new Error(`OpenDART HTTP ${res.status}`)
  const data = await res.json()
  // status "000" = 성공, "013" = 데이터 없음
  if (data.status !== '000' && data.status !== '013') {
    throw new Error(`OpenDART error: ${data.status} ${data.message}`)
  }
  return data.list || []
}

// ── KR 실적발표 공시 수집 ─────────────────────────────────
async function fetchKrEarnings(
  fromDate: string,  // YYYY-MM-DD
  toDate: string,
  apiKey: string
): Promise<any[]> {
  const bgn = fromDate.replace(/-/g, '')
  const end  = toDate.replace(/-/g, '')

  // 두 가지 공시 유형 병렬 조회
  // F001: 실적발표(예고) - "매출액또는손익구조30%이상변동" 등
  // A   (pblntf_ty): 정기공시 - 사업/분기/반기 보고서
  const [disclosureRes, regularRes] = await Promise.allSettled([
    // ① 실적변동 공시 (즉시 발표)
    fetchDartList({
      bgn_de: bgn,
      end_de:  end,
      pblntf_detail_ty: 'F001',
      page_count: '100',
    }, apiKey),
    // ② 정기보고서 (분기/반기/사업보고서)
    fetchDartList({
      bgn_de: bgn,
      end_de:  end,
      pblntf_ty: 'A',
      page_count: '100',
    }, apiKey),
  ])

  const disclosures = disclosureRes.status === 'fulfilled' ? disclosureRes.value : []
  const regulars    = regularRes.status   === 'fulfilled' ? regularRes.value   : []
  const allItems    = [...disclosures, ...regulars]

  // watchlist stock_code Set
  const watchSet = new Set(KR_WATCHLIST.map(w => w.stock_code))
  const watchMap  = Object.fromEntries(KR_WATCHLIST.map(w => [w.stock_code, w]))

  // watchlist 종목만 필터 + 중복 제거 (종목 당 우선순위 1개)
  const byTicker: Record<string, any> = {}

  for (const item of allItems) {
    const code = item.stock_code
    if (!code || !watchSet.has(code)) continue

    const existing = byTicker[code]
    const priority  = reportPriority(item.report_nm || '')

    if (!existing || priority < reportPriority(existing.report_nm || '')) {
      byTicker[code] = item
    }
  }

  // 응답 형태 변환
  return Object.values(byTicker).map(item => {
    const meta    = watchMap[item.stock_code] || {}
    const rceptDt = item.rcept_dt || ''          // YYYYMMDD
    const dateStr = rceptDt
      ? `${rceptDt.slice(0,4)}-${rceptDt.slice(4,6)}-${rceptDt.slice(6,8)}`
      : ''

    return {
      ticker:     item.stock_code,
      name:       item.corp_name || meta.name || item.stock_code,
      market:     'KR',
      date:       dateStr,
      quarter:    parseQuarter(item.report_nm || '', rceptDt),
      report_nm:  item.report_nm,
      dart_url:   item.rcept_no
        ? `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no}`
        : null,
      time:       '장마감후',
      eps_est:    null,
      eps_actual: null,
      rev_est_B:  null,
      surprise_pct: null,
    }
  }).filter(e => e.date).sort((a, b) => a.date.localeCompare(b.date))
}

// ── Finnhub US 실적 ────────────────────────────────────────
const US_WATCHLIST = new Set([
  'NVDA','AAPL','MSFT','GOOGL','GOOG','META','AMZN','TSLA','AVGO','AMD',
  'INTC','MU','QCOM','ARM','AMAT','LRCX','KLAC','MRVL','SMCI',
  'JPM','BAC','GS','MS','WFC','C',
  'JNJ','PFE','UNH','ABBV','MRK',
  'XOM','CVX','COP',
  'WMT','COST','TGT','NKE','MCD',
  'NFLX','DIS','SPOT',
  'TSM','ASML','PLTR','SNOW','CRM','ORCL','SAP',
])

async function fetchFinnhubEarnings(from: string, to: string, apiKey: string) {
  const url = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${apiKey}`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`)
  const data = await res.json()
  return (data.earningsCalendar || [])
    .filter((e: any) => US_WATCHLIST.has(e.symbol))
    .map((e: any) => ({
      ticker:       e.symbol,
      name:         e.symbol,
      market:       'US',
      date:         e.date,
      quarter:      e.quarter || '',
      eps_est:      e.epsEstimate      ?? null,
      eps_actual:   e.epsActual        ?? null,
      rev_est_B:    e.revenueEstimate  ? (e.revenueEstimate / 1e9).toFixed(2) : null,
      rev_actual_B: e.revenueActual    ? (e.revenueActual   / 1e9).toFixed(2) : null,
      time:         e.hour === 'bmo'   ? 'BMO (장 전)' : e.hour === 'amc' ? 'AMC (장 후)' : '미정',
      surprise_pct: e.surprisePercent  ?? null,
      dart_url:     null,
    }))
    .sort((a: any, b: any) => a.date.localeCompare(b.date))
}

// ══════════════════════════════════════════════════════════
//  MAIN HANDLER
// ══════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const now   = new Date()
    const targetYear  = body.year  || now.getFullYear()
    const targetMonth = body.month || now.getMonth() + 1

    const fromDate = `${targetYear}-${String(targetMonth).padStart(2,'0')}-01`
    const lastDay  = new Date(targetYear, targetMonth, 0).getDate()
    const toDate   = `${targetYear}-${String(targetMonth).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`

    const CACHE_KEY      = `earnings_${targetYear}_${targetMonth}`
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')
    const serviceKey     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const finnhubKey     = Deno.env.get('FINNHUB_API_KEY')
    const dartKey        = Deno.env.get('OPENDART_API_KEY')

    // ── 1. 캐시 확인 ──────────────────────────────────
    if (supabaseUrl && serviceKey) {
      try {
        const cacheRes = await fetch(
          `${supabaseUrl}/rest/v1/stock_quote_cache?ticker=eq.${CACHE_KEY}&select=data,updated_at`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
        )
        const cached = await cacheRes.json()
        if (Array.isArray(cached) && cached.length > 0) {
          const ageMs = Date.now() - new Date(cached[0].updated_at).getTime()
          const cachedMeta = cached[0].data?.meta || {}
          const secretMismatch = (
            !!dartKey !== !!cachedMeta.dartEnabled ||
            !!finnhubKey !== !!cachedMeta.finnhubEnabled
          )
          if (!secretMismatch && ageMs < CACHE_TTL_HOURS * 60 * 60 * 1000) {
            return new Response(JSON.stringify(cached[0].data), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
        }
      } catch (e) {
        console.warn('Cache read failed:', e.message)
      }
    }

    // ── 2. US + KR 병렬 조회 ─────────────────────────
    const result = { us: [] as any[], kr: [] as any[], meta: { dartEnabled: !!dartKey, finnhubEnabled: !!finnhubKey } }

    const [usResult, krResult] = await Promise.allSettled([
      finnhubKey
        ? fetchFinnhubEarnings(fromDate, toDate, finnhubKey)
        : Promise.resolve([]),
      dartKey
        ? fetchKrEarnings(fromDate, toDate, dartKey)
        : Promise.resolve([]),
    ])

    if (usResult.status === 'fulfilled') {
      result.us = usResult.value
    } else {
      console.warn('US earnings failed:', usResult.reason?.message)
    }

    if (krResult.status === 'fulfilled') {
      result.kr = krResult.value
    } else {
      console.warn('KR earnings (OpenDART) failed:', krResult.reason?.message)
      // OpenDART 실패 시 경고 메시지 포함
      result.kr = []
      ;(result as any).kr_error = krResult.reason?.message || 'OpenDART 조회 실패'
    }

    // ── 3. 캐시 저장 ──────────────────────────────────
    if (supabaseUrl && serviceKey) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/stock_quote_cache`, {
          method: 'POST',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            ticker:     CACHE_KEY,
            data:       result,
            updated_at: new Date().toISOString(),
          }),
        })
      } catch (e) {
        console.warn('Cache write failed:', e.message)
      }
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