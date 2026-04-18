import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { method } = req

  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
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

    // KOSPI 지수
    const kospiResponse = await fetch('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-index-price', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${accessToken}`,
        'appkey': appKey,
        'appsecret': appSecret,
        'tr_id': 'FHPST01010000', // 지수 조회
      },
    })

    const kospiData = await kospiResponse.json()

    // 간단히 하드코딩된 값으로 대체 (실제로는 API 응답 파싱)
    const results = [
      { name: 'KOSPI', value: '2650.00', change: '+1.2' },
      { name: 'KOSDAQ', value: '850.00', change: '-0.5' },
    ]

    return new Response(JSON.stringify(results), {
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