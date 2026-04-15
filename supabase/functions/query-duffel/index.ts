// supabase/functions/query-duffel/index.ts
// Duffel API 연동 Edge Function

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { origin, destination, date, passengers = 1, cabin_class = 'economy' } = await req.json()

    if (!origin || !destination || !date) {
      return new Response(JSON.stringify({ error: 'origin, destination, and date are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const duffelKey = Deno.env.get('DUFFEL_API_KEY')
    if (!duffelKey) throw new Error('DUFFEL_API_KEY not set')

    // Duffel API 호출
    const response = await fetch('https://api.duffel.com/air/offers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${duffelKey}`,
        'Duffel-Version': 'v1',
      },
      body: JSON.stringify({
        slices: [{
          origin,
          destination,
          departure_date: date,
        }],
        passengers: Array.from({ length: passengers }, () => ({ type: 'adult' })),
        cabin_class,
        limit: 5,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Duffel API error: ${errText}`)
    }

    const data = await response.json()
    
    // 결과 포맷 변환
    const flights = data.data?.map(offer => ({
      id: offer.id,
      price: offer.total_amount,
      currency: offer.total_currency,
      airline: offer.owner?.name || 'Unknown',
      flight_number: offer.slices?.[0]?.segments?.[0]?.flight_number || 'N/A',
      departure: offer.slices?.[0]?.segments?.[0]?.origin?.name,
      arrival: offer.slices?.[0]?.segments?.[0]?.destination?.name,
      departure_time: offer.slices?.[0]?.segments?.[0]?.departing_at,
      arrival_time: offer.slices?.[0]?.segments?.[0]?.arriving_at,
      duration: offer.slices?.[0]?.duration,
    })) || []

    return new Response(JSON.stringify({ flights }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})