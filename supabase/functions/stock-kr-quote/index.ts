// @ts-nocheck
import { getKisToken } from '../_shared/kis-token.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CACHE_TTL_MINUTES = 5

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { ticker } = await req.json()

    if (!ticker) {
      return new Response(JSON.stringify({ error: 'Ticker is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    // 1. DB 캐시 확인 (5분 이내)
    if (supabaseUrl && serviceKey) {
      const cacheRes = await fetch(
        `${supabaseUrl}/rest/v1/stock_quote_cache?ticker=eq.${ticker}&select=data,updated_at`,
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
    }

    // 2. KIS API 호출
    const appKey = Deno.env.get('KIS_APP_KEY')
    const appSecret = Deno.env.get('KIS_APP_SECRET')

    if (!appKey || !appSecret) {
      return new Response(JSON.stringify({ error: 'KIS credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const accessToken = await getKisToken(appKey, appSecret)

    const code = ticker.replace(/\.(KS|KQ)$/, '').padStart(6, '0')
    const quoteUrl = new URL('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price')
    quoteUrl.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J')
    quoteUrl.searchParams.set('FID_INPUT_ISCD', code)

    const quoteResponse = await fetch(quoteUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${accessToken}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: 'FHKST01010100',
      },
    })
    const quoteData = await quoteResponse.json()

    if (quoteData.rt_cd !== '0') {
      return new Response(JSON.stringify({ error: quoteData.msg1 }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const output = quoteData.output
    const result = {
      price: parseFloat(output.stck_prpr),
      change: parseFloat(output.prdy_vrss),
      changePercent: parseFloat(output.prdy_ctrt),
      volume: parseInt(output.acml_vol),
      high52: parseFloat(output.w52_hgpr),
      low52: parseFloat(output.w52_lwpr),
      per: parseFloat(output.per),
      pbr: parseFloat(output.pbr),
    }

    // 3. DB 캐시 저장 (upsert)
    if (supabaseUrl && serviceKey) {
      await fetch(`${supabaseUrl}/rest/v1/stock_quote_cache`, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ ticker, data: result, updated_at: new Date().toISOString() }),
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
