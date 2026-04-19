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

    let accommodations: any[] = [];

    // API 키가 있을 때만 RapidAPI 호출
    if (rapidApiKey) {
      const rapidApiHost = type === 'tripadvisor'
        ? 'tripadvisor16.p.rapidapi.com'
        : 'booking-com.p.rapidapi.com'

      let url = ''
      const headers = {
        'X-RapidAPI-Key': rapidApiKey,
        'X-RapidAPI-Host': rapidApiHost,
      }

      if (type === 'tripadvisor') {
        url = `https://tripadvisor16.p.rapidapi.com/api/v1/hotels/search?location=${encodeURIComponent(destination)}&checkin=${checkin}&checkout=${checkout}&guests=${guests}&limit=10`
      } else {
        url = `https://booking-com.p.rapidapi.com/v1/hotels/search?dest_type=city&query=${encodeURIComponent(destination)}&checkin_date=${checkin}&checkout_date=${checkout}&adults_number=${guests}&order_by=popularity&filter_by_currency=KRW&locale=ko&room_number=1&units=metric&page_number=0`
      }

      try {
        const response = await fetch(url, { headers })

        if (response.ok) {
          const data = await response.json()

          accommodations = type === 'tripadvisor'
            ? (data.data?.map((hotel: any) => ({
                id: hotel.id,
                name: hotel.name,
                rating: hotel.rating,
                review_count: hotel.review_count,
                price: hotel.price,
                currency: 'USD',
                location: hotel.location?.address,
                image: hotel.images?.[0],
                amenities: hotel.amenities?.map((a: any) => a.name).join(', '),
              })) || [])
            : (data.result?.map((hotel: any) => ({
                id: hotel.hotel_id,
                name: hotel.hotel_name,
                rating: hotel.review_score,
                review_count: hotel.review_nr,
                price: hotel.price_breakdown?.gross_price,
                currency: hotel.price_breakdown?.currency,
                location: hotel.address,
                image: hotel.main_photo_url,
                amenities: '',
              })) || [])
        } else {
          console.log(`RapidAPI 응답 오류 (${response.status}), 더미데이터 사용`)
        }
      } catch (apiError) {
        console.log('RapidAPI 호출 실패, 더미데이터 사용:', (apiError as Error).message)
      }
    }

    // API 실패시 더미데이터 반환
    if (accommodations.length === 0) {
      accommodations = [
        { id: 1, name: "프리미엄 호텔", rating: 4.8, review_count: 2340, price: 120000, currency: "KRW", location: destination + " 시내 중심가", image: "🏨", amenities: "무료 와이파이, 주차, 조식" },
        { id: 2, name: "게스트 하우스", rating: 4.5, review_count: 1250, price: 55000, currency: "KRW", location: destination + " 역 도보 5분", image: "🏠", amenities: "공유 주방, 라운지" },
        { id: 3, name: "리조트", rating: 4.7, review_count: 3120, price: 210000, currency: "KRW", location: destination + " 해변가", image: "🌴", amenities: "수영장, 스파, 레스토랑" },
        { id: 4, name: "비즈니스 호텔", rating: 4.3, review_count: 980, price: 85000, currency: "KRW", location: destination + " 비즈니스 지구", image: "💼", amenities: "컨퍼런스룸, 피트니스" },
      ]
    }

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