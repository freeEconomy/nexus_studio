// @ts-nocheck
import { getKisToken } from '../_shared/kis-token.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { ticker } = await req.json()
    if (!ticker) throw new Error('Ticker is required')

    const appKey = Deno.env.get('KIS_APP_KEY')
    const appSecret = Deno.env.get('KIS_APP_SECRET')
    const accessToken = await getKisToken(appKey, appSecret)

    const code = ticker.replace(/\.(KS|KQ)$/, '').padStart(6, '0')
    const url = new URL('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-investor')
    url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J')
    url.searchParams.set('FID_INPUT_ISCD', code)

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${accessToken}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: 'FHKST01010900',
      },
    })
    const data = await response.json()

    return new Response(JSON.stringify(data.output || []), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
