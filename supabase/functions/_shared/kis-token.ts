// @ts-nocheck
const KIS_TOKEN_URL = 'https://openapi.koreainvestment.com:9443/oauth2/tokenP'

export async function getKisToken(appKey: string, appSecret: string): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  // 1. DB 캐시 확인
  if (supabaseUrl && serviceKey) {
    const cacheRes = await fetch(
      `${supabaseUrl}/rest/v1/kis_token_cache?select=access_token,expires_at&id=eq.1`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    )
    const cached = await cacheRes.json()

    if (Array.isArray(cached) && cached.length > 0) {
      const { access_token, expires_at } = cached[0]
      if (access_token && new Date(expires_at) > new Date()) {
        return access_token
      }
    }
  }

  // 2. KIS 신규 토큰 발급
  const tokenRes = await fetch(KIS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', appkey: appKey, appsecret: appSecret }),
  })
  const tokenData = await tokenRes.json()

  if (!tokenData.access_token) {
    throw new Error(`KIS token error: ${JSON.stringify(tokenData)}`)
  }

  // 3. DB에 캐싱 (23시간 유효, id=1 고정 row upsert)
  if (supabaseUrl && serviceKey) {
    await fetch(`${supabaseUrl}/rest/v1/kis_token_cache`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: 1,
        access_token: tokenData.access_token,
        expires_at: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
      }),
    })
  }

  return tokenData.access_token
}
