// supabase/functions/query-duffel/index.ts
// Duffel API 연동 Edge Function

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generateDummyFlights(origin: string, destination: string, date: string) {
  const base = new Date(date + 'T08:00:00')
  const code = (s: string) => s.charCodeAt(0) % 900
  return [
    {
      id: 'd1',
      airline: '대한항공',
      flight_number: `KE${100 + code(origin)}`,
      departure: origin,
      arrival: destination,
      departure_time: new Date(base).toISOString(),
      arrival_time: new Date(base.getTime() + 2 * 3600000).toISOString(),
      duration: 'PT2H',
      price: '89000',
      currency: 'KRW',
    },
    {
      id: 'd2',
      airline: '아시아나항공',
      flight_number: `OZ${200 + code(origin)}`,
      departure: origin,
      arrival: destination,
      departure_time: new Date(base.getTime() + 3600000).toISOString(),
      arrival_time: new Date(base.getTime() + 3.5 * 3600000).toISOString(),
      duration: 'PT2H30M',
      price: '75000',
      currency: 'KRW',
    },
    {
      id: 'd3',
      airline: '진에어',
      flight_number: `LJ${300 + code(origin)}`,
      departure: origin,
      arrival: destination,
      departure_time: new Date(base.getTime() + 6 * 3600000).toISOString(),
      arrival_time: new Date(base.getTime() + 8 * 3600000).toISOString(),
      duration: 'PT2H',
      price: '62000',
      currency: 'KRW',
    },
    {
      id: 'd4',
      airline: '제주항공',
      flight_number: `7C${400 + code(origin)}`,
      departure: origin,
      arrival: destination,
      departure_time: new Date(base.getTime() + 9 * 3600000).toISOString(),
      arrival_time: new Date(base.getTime() + 11 * 3600000).toISOString(),
      duration: 'PT2H',
      price: '58000',
      currency: 'KRW',
    },
  ]
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
    if (!duffelKey) {
      const flights = generateDummyFlights(origin, destination, date)
      return new Response(JSON.stringify({ flights, fallback: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Duffel API 호출 — offer_requests로 검색 후 offers 반환
    const response = await fetch('https://api.duffel.com/air/offer_requests?return_offers=true', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${duffelKey}`,
        'Duffel-Version': '2024-10-01',
      },
      body: JSON.stringify({
        data: {
          slices: [{
            origin,
            destination,
            departure_date: date,
          }],
          passengers: Array.from({ length: passengers }, () => ({ type: 'adult' })),
          cabin_class,
        },
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Duffel API error: ${errText}`)
    }

    const data = await response.json()
    const offers: any[] = (data.data?.offers || []).slice(0, 5)

    const flights = offers.map((offer: any) => ({
      id: offer.id,
      price: offer.total_amount,
      currency: offer.total_currency,
      airline: offer.owner?.name || 'Unknown',
      flight_number: offer.slices?.[0]?.segments?.[0]?.marketing_carrier_flight_number || 'N/A',
      departure: offer.slices?.[0]?.segments?.[0]?.origin?.iata_code,
      arrival: offer.slices?.[0]?.segments?.[0]?.destination?.iata_code,
      departure_time: offer.slices?.[0]?.segments?.[0]?.departing_at,
      arrival_time: offer.slices?.[0]?.segments?.[0]?.arriving_at,
      duration: offer.slices?.[0]?.duration,
    }))

    return new Response(JSON.stringify({ flights }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
