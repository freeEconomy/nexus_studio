// supabase/functions/query-groq/index.ts
// 429 Rate Limit 발생 시 FALLBACK_MODELS 순으로 자동 재시도
// stream: true 시 SSE 스트리밍 응답 파이프

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FALLBACK_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'llama-3.2-3b-preview',
  'llama-3.2-11b-vision-preview',
]

const COMPOUND_FALLBACK = [
  'compound-beta-mini',
  'compound-beta',
  'llama-3.1-8b-instant',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.2-3b-preview',
]

function truncateMessages(messages: any[], maxChars: number): any[] {
  const total = messages.reduce((s, m) => s + (m.content?.length || 0), 0)
  if (total <= maxChars) return messages
  const result = [...messages]
  for (let i = 1; i < result.length - 1; i++) {
    const over = result.reduce((s, m) => s + (m.content?.length || 0), 0) - maxChars
    if (over <= 0) break
    const cut = Math.min(over + 200, result[i].content.length)
    result[i] = { ...result[i], content: result[i].content.slice(0, result[i].content.length - cut) }
  }
  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      query,
      messages,
      model = 'llama-3.3-70b-versatile',
      stream: streamMode = false,
    } = await req.json()

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

    const isCompound = model.startsWith('compound') || model.startsWith('groq/compound')
    const baseChain = isCompound ? COMPOUND_FALLBACK : FALLBACK_MODELS
    const modelChain = [model, ...baseChain.filter(m => m !== model)]
    const truncatedMessages = truncateMessages(messageList, 12000)

    let lastError = ''

    if (streamMode) {
      // SSE streaming: find first working model and pipe its stream
      for (const tryModel of modelChain) {
        const isCompoundModel = tryModel.startsWith('compound') || tryModel.startsWith('groq/')
        const requestBody: Record<string, unknown> = {
          model: tryModel,
          messages: truncatedMessages,
          max_tokens: isCompoundModel ? 512 : 2048,
          stream: true,
        }
        if (!isCompoundModel) requestBody.temperature = 0.7

        const response = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify(requestBody),
        })

        if (response.ok) {
          return new Response(response.body, {
            headers: {
              ...corsHeaders,
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'X-Accel-Buffering': 'no',
              'X-Used-Model': tryModel,
            },
          })
        }

        const errText = await response.text()
        const isRetryable = response.status === 429 || response.status === 413 ||
          response.status === 404 ||
          errText.includes('model_decommissioned') || errText.includes('rate_limit_exceeded') ||
          errText.includes('model_not_found') || errText.includes('invalid_model')
        if (isRetryable) {
          console.log(`[query-groq stream] ${tryModel} failed (${response.status}), trying next...`)
          lastError = errText
          continue
        }
        // Non-retryable error — send as SSE error event
        return new Response(
          `data: ${JSON.stringify({ error: errText })}\n\ndata: [DONE]\n\n`,
          { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } },
        )
      }
      // All models failed
      return new Response(
        `data: ${JSON.stringify({ error: `All models failed. ${lastError}` })}\n\ndata: [DONE]\n\n`,
        { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } },
      )
    }

    // Non-streaming mode (unchanged)
    for (const tryModel of modelChain) {
      const isCompoundModel = tryModel.startsWith('compound') || tryModel.startsWith('groq/')
      const requestBody: Record<string, unknown> = {
        model: tryModel,
        messages: truncatedMessages,
        max_tokens: isCompoundModel ? 512 : 2048,
      }
      if (!isCompoundModel) requestBody.temperature = 0.7

      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify(requestBody),
      })

      if (response.ok) {
        const data = await response.json()
        const result = data.choices?.[0]?.message?.content ?? ''
        return new Response(JSON.stringify({ result, model: tryModel }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const errText = await response.text()
      const isRetryable = response.status === 429 || response.status === 413 ||
        errText.includes('model_decommissioned') || errText.includes('rate_limit_exceeded')
      if (isRetryable) {
        console.log(`[query-groq] ${tryModel} failed (${response.status}), trying next model...`)
        lastError = errText
        continue
      }
      throw new Error(`Groq API error: ${errText}`)
    }

    throw new Error(`All models failed. Last error: ${lastError}`)
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
