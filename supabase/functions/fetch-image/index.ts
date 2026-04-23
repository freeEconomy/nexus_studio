// supabase/functions/fetch-image/index.ts
// Unsplash → Pexels → categoryQuery 재시도 → Picsum 순서로 이미지 조회 및 캐시

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function searchUnsplash(query: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${key}` } }
    )
    if (!res.ok) return null
    const body = await res.json()
    return body.results?.[0]?.urls?.regular || null
  } catch {
    return null
  }
}

async function searchPexels(query: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`,
      { headers: { Authorization: key } }
    )
    if (!res.ok) return null
    const body = await res.json()
    return body.photos?.[0]?.src?.large || body.photos?.[0]?.src?.medium || null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { query, categoryQuery } = await req.json()
    if (!query) {
      return new Response(JSON.stringify({ error: 'missing query' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE')
    const UNSPLASH_KEY = Deno.env.get('UNSPLASH_KEY')
    const PEXELS_KEY = Deno.env.get('PEXELS_KEY')

    // 캐시 확인 (specific query)
    if (SUPABASE_URL && SERVICE_KEY) {
      try {
        const cacheUrl = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/image_cache?select=url,provider,created_at&query=eq.${encodeURIComponent(query)}&limit=1`
        const cacheRes = await fetch(cacheUrl, {
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
        })
        if (cacheRes.ok) {
          const items = await cacheRes.json()
          if (Array.isArray(items) && items.length > 0) {
            const item = items[0]
            if (item.created_at && new Date(item.created_at) > new Date(Date.now() - 30 * 24 * 3600 * 1000)) {
              return new Response(JSON.stringify({ url: item.url, provider: item.provider || 'cache' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              })
            }
          }
        }
      } catch {
        // ignore cache errors
      }
    }

    let imageUrl: string | null = null
    let provider = 'picsum'
    let usedQuery = query

    // 1) Unsplash — specific query
    if (UNSPLASH_KEY) {
      imageUrl = await searchUnsplash(query, UNSPLASH_KEY)
      if (imageUrl) provider = 'unsplash'
    }

    // 2) Pexels — specific query
    if (!imageUrl && PEXELS_KEY) {
      imageUrl = await searchPexels(query, PEXELS_KEY)
      if (imageUrl) provider = 'pexels'
    }

    // 3) Unsplash — category fallback
    if (!imageUrl && categoryQuery && UNSPLASH_KEY) {
      imageUrl = await searchUnsplash(categoryQuery, UNSPLASH_KEY)
      if (imageUrl) { provider = 'unsplash'; usedQuery = categoryQuery }
    }

    // 4) Pexels — category fallback
    if (!imageUrl && categoryQuery && PEXELS_KEY) {
      imageUrl = await searchPexels(categoryQuery, PEXELS_KEY)
      if (imageUrl) { provider = 'pexels'; usedQuery = categoryQuery }
    }

    // 5) Picsum — category fallback seed if available, else specific query
    if (!imageUrl) {
      const seed = categoryQuery || query
      imageUrl = `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/600`
      provider = 'picsum'
      usedQuery = seed
    }

    // 캐시 저장 (best-effort)
    if (SUPABASE_URL && SERVICE_KEY && provider !== 'picsum') {
      try {
        const insertUrl = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/image_cache?on_conflict=query`
        await fetch(insertUrl, {
          method: 'POST',
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation, resolution=merge-duplicates',
          },
          body: JSON.stringify([{ query, url: imageUrl, provider }]),
        })
      } catch {
        // ignore cache write errors
      }
    }

    return new Response(JSON.stringify({ url: imageUrl, provider }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
