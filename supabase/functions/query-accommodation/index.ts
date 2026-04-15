// supabase/functions/query-accommodation/index.ts
// RapidAPI (Booking.com / TripAdvisor) 연동 Edge Function

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { destination, checkin, checkout, guests = 1, type = 'booking' } = await req.json()

    if (!destination || !checkin || !checkout) {
      return new Response(JSON.stringify({ error: 'destination, checkin, and checkout are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rapidApiKey = Deno.env.get('RAPIDAPI_KEY')
    if (!rapidApiKey) throw new Error('RAPIDAPI_KEY not set')

    const rapidApiHost = type === 'tripadvisor' 
      ? 'tripadvisor16.p.rapidapi.com' 
      : 'booking16.p.rapidapi.com'

    // RapidAPI 호출 (Booking.com 또는 TripAdvisor)
    let url = ''
    let headers = {
      'X-RapidAPI-Key': rapidApiKey,
      'X-RapidAPI-Host': rapidApiHost,
    }

    if (type === 'tripadvisor') {
      url = `https://tripadvisor16.p.rapidapi.com/api/v1/hotels/search?location=${encodeURIComponent(destination)}&checkin=${checkin}&checkout=${checkout}&guests=${guests}&limit=10`
    } else {
      url = `https://booking16.p.rapidapi.com/api/v1/hotels/search?location=${encodeURIComponent(destination)}&checkin_date=${checkin}&checkout_date=${checkout}&adults_number=${guests}&limit=10`
    }

    const response = await fetch(url, { headers })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`RapidAPI error: ${errText}`)
    }

    const data = await response.json()
    
    // 결과 포맷 변환
    const accommodations = type === 'tripadvisor' 
      ? (data.data?.map(hotel => ({
          id: hotel.id,
          name: hotel.name,
          rating: hotel.rating,
          review_count: hotel.review_count,
          price: hotel.price,
          currency: 'USD',
          location: hotel.location?.address,
          image: hotel.images?.[0],
          amenities: hotel.amenities?.map(a => a.name).join(', '),
        })) || [])
      : (data.data?.map(hotel => ({
          id: hotel.hotel_id,
          name: hotel.hotel_name,
          rating: hotel.review_score,
          review_count: hotel.review_count,
          price: hotel.min_total_price,
          currency: hotel.currency_code,
          location: hotel.address,
          image: hotel.main_photo_url,
          amenities: hotel.facilities?.map(f => f.name).join(', '),
        })) || [])

    return new Response(JSON.stringify({ accommodations }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})