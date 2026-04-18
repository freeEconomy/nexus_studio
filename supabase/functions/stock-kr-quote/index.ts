import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { method } = req

  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.json()
    const { ticker } = body

    if (!ticker) {
      return new Response(JSON.stringify({ error: 'Ticker is required' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Get token
    const appKey = Deno.env.get('KIS_APP_KEY')
    const appSecret = Deno.env.get('KIS_APP_SECRET')
    const accountNo = Deno.env.get('KIS_ACCOUNT_NO')

    if (!appKey || !appSecret) {
      return new Response(JSON.stringify({ error: 'KIS credentials not configured' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    const tokenResponse = await fetch('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: appKey,
        appsecret: appSecret,
      }),
    })

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Failed to get access token' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    // Get quote
    const quoteResponse = await fetch('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${accessToken}`,
        'appkey': appKey,
        'appsecret': appSecret,
        'tr_id': 'FHKST01010100', // 시세 조회
      },
      body: JSON.stringify({
        fid_cond_mrkt_div_code: 'J', // 주식
        fid_input_iscd: ticker.padStart(6, '0'), // 종목코드 6자리
      }),
    })

    const quoteData = await quoteResponse.json()

    if (quoteData.rt_cd !== '0') {
      return new Response(JSON.stringify({ error: quoteData.msg1 }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Parse response
    const output = quoteData.output
    const result = {
      price: parseFloat(output.stck_prpr), // 현재가
      change: parseFloat(output.prdy_vrss), // 전일대비
      changePercent: parseFloat(output.prdy_ctrt), // 전일대비율
      volume: parseInt(output.acml_vol), // 누적거래량
      high52: parseFloat(output.w52_hgpr), // 52주 최고가
      low52: parseFloat(output.w52_lwpr), // 52주 최저가
      per: parseFloat(output.per), // PER
      pbr: parseFloat(output.pbr), // PBR
    }

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})