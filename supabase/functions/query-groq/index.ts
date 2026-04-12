// supabase/functions/query-groq/index.ts
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query, messages, model = 'llama-3.3-70b-versatile' } = await req.json()

    const messageList = messages && Array.isArray(messages)
      ? messages
      : [{ role: 'user', content: query }]

    if (!query && (!messageList || messageList.length === 0)) {
      return new Response(JSON.stringify({ error: 'query or messages is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (!groqKey) throw new Error('GROQ_API_KEY not set')

    const isCompound = model.startsWith('groq/compound')

    const requestBody: Record<string, unknown> = {
      model,
      messages: messageList,
      max_tokens: isCompound ? 512 : 2048,
    }

    // compound는 temperature 미지원
    if (!isCompound) {
      requestBody.temperature = 0.7
    }

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Groq API error: ${errText}`)
    }

    const data = await response.json()
    const result = data.choices?.[0]?.message?.content ?? ''

    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})