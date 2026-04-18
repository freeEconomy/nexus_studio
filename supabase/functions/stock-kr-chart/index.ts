import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { method } = req

  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.json()
    const { ticker, period = 'D' } = body

    if (!ticker) {
      return new Response(JSON.stringify({ error: 'Ticker is required' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Get token
    const appKey = Deno.env.get('KIS_APP_KEY')
    const appSecret = Deno.env.get('KIS_APP_SECRET')

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

    // Get chart data
    const chartResponse = await fetch('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-daily-price', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${accessToken}`,
        'appkey': appKey,
        'appsecret': appSecret,
        'tr_id': 'FHKST01010400', // 일별 시세
      },
    })

    // Note: KIS API requires query params, but fetch body is for POST. Adjust accordingly.
    // Actually, for GET, use URL params
    const url = new URL('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-daily-price')
    url.searchParams.set('fid_cond_mrkt_div_code', 'J')
    url.searchParams.set('fid_input_iscd', ticker.padStart(6, '0'))
    url.searchParams.set('fid_period_div_code', period)
    url.searchParams.set('fid_org_adj_prc', '0')

    const chartResponse2 = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${accessToken}`,
        'appkey': appKey,
        'appsecret': appSecret,
        'tr_id': 'FHKST01010400',
      },
    })

    const chartData = await chartResponse2.json()

    if (chartData.rt_cd !== '0') {
      return new Response(JSON.stringify({ error: chartData.msg1 }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Parse output1
    const data = chartData.output1.map(item => ({
      time: new Date(item.stck_bsop_date).getTime() / 1000, // timestamp
      open: parseFloat(item.stck_oprc),
      high: parseFloat(item.stck_hgpr),
      low: parseFloat(item.stck_lwpr),
      close: parseFloat(item.stck_clpr),
      volume: parseInt(item.acml_vol),
    }))

    return new Response(JSON.stringify(data), {
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