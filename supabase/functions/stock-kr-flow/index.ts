// @ts-nocheck
// 국내 주식 외국인/기관 순매수 현황 조회
// KIS API: 주식현재가 투자자별 매매동향 (tr_id: FHKST01010900)
import { getKisToken } from '../_shared/kis-token.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 조회 대상 종목 목록 (시가총액 상위)
const TARGET_STOCKS = [
  { ticker: '005930', name: '삼성전자' },
  { ticker: '000660', name: 'SK하이닉스' },
  { ticker: '035420', name: 'NAVER' },
  { ticker: '005380', name: '현대자동차' },
  { ticker: '000270', name: '기아' },
  { ticker: '068270', name: '셀트리온' },
  { ticker: '051910', name: 'LG화학' },
  { ticker: '035720', name: '카카오' },
  { ticker: '006400', name: '삼성SDI' },
  { ticker: '105560', name: 'KB금융' },
  { ticker: '055550', name: '신한지주' },
  { ticker: '066570', name: 'LG전자' },
  { ticker: '012330', name: '현대모비스' },
  { ticker: '003550', name: 'LG' },
  { ticker: '207940', name: '삼성바이오로직스' },
]

const CACHE_TTL_MINUTES = 10

async function fetchInvestorFlow(ticker: string, token: string, appKey: string, appSecret: string) {
  // 투자자별 매매동향 조회
  const url = new URL('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-investor')
  url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J')
  url.searchParams.set('FID_INPUT_ISCD', ticker.padStart(6, '0'))

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      authorization: `Bearer ${token}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: 'FHKST01010900',
    },
  })

  if (!res.ok) throw new Error(`KIS HTTP ${res.status}`)
  const data = await res.json()

  if (data.rt_cd !== '0') throw new Error(data.msg1 || 'KIS error')

  const o = data.output
  return {
    // 외국인 순매수량 (양수=순매수, 음수=순매도)
    foreign_buy:  parseInt(o.frgn_buy_qty  || '0', 10),
    foreign_sell: parseInt(o.frgn_sell_qty || '0', 10),
    foreign_net:  parseInt(o.frgn_ntby_qty || '0', 10),
    // 기관 순매수량
    inst_buy:     parseInt(o.orgn_buy_qty  || '0', 10),
    inst_sell:    parseInt(o.orgn_sell_qty || '0', 10),
    inst_net:     parseInt(o.orgn_ntby_qty || '0', 10),
    // 개인
    indv_buy:     parseInt(o.indv_buy_qty  || '0', 10),
    indv_sell:    parseInt(o.indv_sell_qty || '0', 10),
    indv_net:     parseInt(o.indv_ntby_qty || '0', 10),
  }
}

async function fetchQuote(ticker: string, token: string, appKey: string, appSecret: string) {
  const url = new URL('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price')
  url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J')
  url.searchParams.set('FID_INPUT_ISCD', ticker.padStart(6, '0'))

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      authorization: `Bearer ${token}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: 'FHKST01010100',
    },
  })

  if (!res.ok) return null
  const data = await res.json()
  if (data.rt_cd !== '0') return null

  const o = data.output
  return {
    price:         parseFloat(o.stck_prpr || '0'),
    change:        parseFloat(o.prdy_vrss || '0'),
    changePercent: parseFloat(o.prdy_ctrt || '0'),
    volume:        parseInt(o.acml_vol || '0', 10),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const CACHE_KEY   = 'kr_flow_all'

    // 1. DB 캐시 확인
    if (supabaseUrl && serviceKey) {
      try {
        const cacheRes = await fetch(
          `${supabaseUrl}/rest/v1/stock_quote_cache?ticker=eq.${CACHE_KEY}&select=data,updated_at`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
        )
        const cached = await cacheRes.json()
        if (Array.isArray(cached) && cached.length > 0) {
          const ageMs = Date.now() - new Date(cached[0].updated_at).getTime()
          if (ageMs < CACHE_TTL_MINUTES * 60 * 1000) {
            return new Response(JSON.stringify(cached[0].data), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
        }
      } catch (e) {
        console.warn('Cache read failed:', e.message)
      }
    }

    // 2. KIS API 호출
    const appKey    = Deno.env.get('KIS_APP_KEY')
    const appSecret = Deno.env.get('KIS_APP_SECRET')

    if (!appKey || !appSecret) {
      return new Response(JSON.stringify({ error: 'KIS credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = await getKisToken(appKey, appSecret)

    // 종목별 수급 + 시세 병렬 조회 (KIS rate limit 고려하여 순차 처리)
    const results = []
    for (const stock of TARGET_STOCKS) {
      try {
        const [flow, quote] = await Promise.allSettled([
          fetchInvestorFlow(stock.ticker, token, appKey, appSecret),
          fetchQuote(stock.ticker, token, appKey, appSecret),
        ])

        const flowData  = flow.status  === 'fulfilled' ? flow.value  : null
        const quoteData = quote.status === 'fulfilled' ? quote.value : null

        results.push({
          ticker:        stock.ticker,
          name:          stock.name,
          price:         quoteData?.price         ?? null,
          change:        quoteData?.change         ?? null,
          changePercent: quoteData?.changePercent  ?? null,
          volume:        quoteData?.volume         ?? null,
          foreign_buy:   flowData?.foreign_buy     ?? null,
          foreign_sell:  flowData?.foreign_sell    ?? null,
          foreign_net:   flowData?.foreign_net     ?? null,
          inst_buy:      flowData?.inst_buy        ?? null,
          inst_sell:     flowData?.inst_sell       ?? null,
          inst_net:      flowData?.inst_net        ?? null,
          indv_buy:      flowData?.indv_buy        ?? null,
          indv_sell:     flowData?.indv_sell       ?? null,
          indv_net:      flowData?.indv_net        ?? null,
        })

        // KIS API rate limit 방지 (0.2초 간격)
        await new Promise(r => setTimeout(r, 200))
      } catch (e) {
        console.warn(`[${stock.ticker}] ${e.message}`)
        results.push({ ticker: stock.ticker, name: stock.name })
      }
    }

    // 3. 캐시 저장
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
          body: JSON.stringify({ ticker: CACHE_KEY, data: results, updated_at: new Date().toISOString() }),
        })
      } catch (e) {
        console.warn('Cache write failed:', e.message)
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