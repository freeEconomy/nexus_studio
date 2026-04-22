// @ts-nocheck
// KOSPI / KOSDAQ 실시간 지수 조회
// 네이버 금융 polling API (확인된 엔드포인트)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function fetchNaverIndex(indexCode: string, displayName: string) {
  const url = `https://polling.finance.naver.com/api/realtime/domestic/index/${indexCode}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Referer': 'https://m.stock.naver.com/',
      'Accept': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Naver HTTP ${res.status}`)
  const json = await res.json()
  const data = json?.datas?.[0]
  if (!data) throw new Error('Naver: empty datas')

  // Raw 필드가 있으면 사용, 없으면 콤마 제거 후 파싱
  const price   = parseFloat(data.closePriceRaw   ?? data.closePrice?.replace(/,/g, '')   ?? '0')
  const changePct = parseFloat(data.fluctuationsRatioRaw ?? data.fluctuationsRatio?.replace(/,/g, '') ?? '0')

  if (!price || isNaN(price)) throw new Error('Naver: invalid price')

  return {
    name: displayName,
    value: price,
    change: changePct.toFixed(2),
  }
}

async function fetchYahooIndex(symbol: string, displayName: string) {
  const enc = encodeURIComponent(symbol)
  for (const host of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
    try {
      const url = `https://${host}/v8/finance/chart/${enc}?interval=1d&range=5d`
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://finance.yahoo.com/',
          'Accept': 'application/json',
        },
      })
      if (!res.ok) continue
      const json = await res.json()
      const meta = json?.chart?.result?.[0]?.meta
      if (!meta) continue
      const price     = meta.regularMarketPrice || meta.chartPreviousClose
      const prevClose = meta.chartPreviousClose  || price
      if (!price || price <= 0) continue
      const pct = prevClose ? ((price - prevClose) / prevClose * 100) : 0
      return { name: displayName, value: price, change: pct.toFixed(2) }
    } catch {}
  }
  throw new Error(`Yahoo: no data for ${symbol}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const INDICES = [
    { naver: 'KOSPI',  yahoo: '^KS11', name: 'KOSPI'  },
    { naver: 'KOSDAQ', yahoo: '^KQ11', name: 'KOSDAQ' },
  ]

  const results = await Promise.all(
    INDICES.map(async idx => {
      try {
        return await fetchNaverIndex(idx.naver, idx.name)
      } catch (e1) {
        console.warn(`[Naver] ${idx.name}: ${e1.message}`)
        try {
          return await fetchYahooIndex(idx.yahoo, idx.name)
        } catch (e2) {
          console.warn(`[Yahoo] ${idx.name}: ${e2.message}`)
          return { name: idx.name, value: 'N/A', change: '0' }
        }
      }
    })
  )

  return new Response(JSON.stringify(results), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
