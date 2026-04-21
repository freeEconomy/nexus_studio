// @ts-nocheck
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // KOSPI/KOSDAQ는 실시간 지수 API 대신 하드코딩 fallback 사용
  // (KIS 지수 API는 TR_ID가 별도이며 토큰 불필요)
  return new Response(JSON.stringify([
    { name: 'KOSPI', value: '2650.00', change: '+1.2' },
    { name: 'KOSDAQ', value: '850.00', change: '-0.5' },
  ]), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
