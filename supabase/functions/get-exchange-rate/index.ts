import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// TODO: 실제 환율 API URL로 교체 (예: Exchangerate-API, Open Exchange Rates 등)
// 무료 API는 제한이 있을 수 있으므로, 필요시 사용자에게 API Key 설정을 안내해야 함.
const EXCHANGE_RATE_API_URL = Deno.env.get("EXCHANGE_RATE_API_URL") || "https://api.exchangerate-api.com/v4/latest/USD"

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const response = await fetch(EXCHANGE_RATE_API_URL)
    if (!response.ok) {
      throw new Error(`Failed to fetch exchange rate: ${response.statusText}`)
    }
    const data = await response.json()
    const usdToKrwRate = data.rates.KRW

    return new Response(
      JSON.stringify({ usdToKrw: usdToKrwRate }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    console.error(`Error fetching exchange rate: ${error.message}`)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
