// supabase/functions/fetch-image/index.ts
// Fetch image URL by querying Unsplash then Pexels, with Supabase REST caching.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { query } = await req.json()
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

    // Try cache via Supabase REST (if service key and url present)
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
            // if cached recently (30 days)
            if (item.created_at && (new Date(item.created_at) > new Date(Date.now() - 30 * 24 * 3600 * 1000))) {
              return new Response(JSON.stringify({ url: item.url, provider: item.provider || 'cache' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              })
            }
          }
        }
      } catch (e) {
        // ignore cache errors
        console.log('cache check failed', (e as any)?.message || String(e))
      }
    }

    let imageUrl: string | null = null
    let provider = 'picsum'

    // 1) Unsplash
    if (UNSPLASH_KEY) {
      try {
        const u = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1`, {
          headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` },
        })
        if (u.ok) {
          const body = await u.json()
          imageUrl = body.results?.[0]?.urls?.regular || null
          if (imageUrl) provider = 'unsplash'
        }
      } catch (e) {
        console.log('unsplash error', (e as any)?.message || String(e))
      }
    }

    // 2) Pexels
    if (!imageUrl && PEXELS_KEY) {
      try {
        const p = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`, {
          headers: { Authorization: PEXELS_KEY },
        })
        if (p.ok) {
          const body = await p.json()
          imageUrl = body.photos?.[0]?.src?.large || body.photos?.[0]?.src?.medium || null
          if (imageUrl) provider = 'pexels'
        }
      } catch (e) {
        console.log('pexels error', (e as any)?.message || String(e))
      }
    }

    // 3) fallback: always use Picsum when providers fail
    if (!imageUrl) {
      imageUrl = `https://picsum.photos/seed/${encodeURIComponent(query)}/800/600`
      provider = 'picsum'
    }

    // Cache insert/upsert (best-effort)
    if (SUPABASE_URL && SERVICE_KEY) {
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
      } catch (e) {
        console.log('cache write failed', (e as any)?.message || String(e))
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
