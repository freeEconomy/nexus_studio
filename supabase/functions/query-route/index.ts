// supabase/functions/query-route/index.ts
// OpenRouteService API 연동 Edge Function

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { start, end, profile = 'driving-car' } = await req.json()

    if (!start || !end) {
      return new Response(JSON.stringify({ error: 'start and end coordinates are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const orsKey = Deno.env.get('OPENROUTESERVICE_API_KEY')
    if (!orsKey) throw new Error('OPENROUTESERVICE_API_KEY not set')

    // OpenRouteService API 호출
    const response = await fetch('https://api.openrouteservice.org/v2/directions/' + profile, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': orsKey,
      },
      body: JSON.stringify({
        coordinates: [
          start, // [longitude, latitude]
          end,   // [longitude, latitude]
        ],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`OpenRouteService API error: ${errText}`)
    }

    const data = await response.json()
    
    // 결과 포맷 변환
    const route = data.features?.[0]
    const geometry = route?.geometry
    const properties = route?.properties
    
    const segments = properties?.segments?.map((seg: any) => ({
      distance: seg.distance,
      duration: seg.duration,
      steps: seg.steps?.map((step: any) => ({
        instruction: step.instruction,
        distance: step.distance,
        duration: step.duration,
        type: step.type,
      })) || [],
    })) || []

    return new Response(JSON.stringify({
      geometry,
      distance: properties?.summary?.distance,
      duration: properties?.summary?.duration,
      segments,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})