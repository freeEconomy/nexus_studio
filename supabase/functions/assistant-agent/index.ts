// @ts-nocheck
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const SYSTEM_PROMPT = `당신은 MAMF 회사의 AI 비서입니다. MC(AI Marketing Consult)와 MS(AI Marketing Studio) 두 서비스의 업무를 관리합니다.

업무 상태 종류:
- received(접수): 새로 들어온 업무
- analyzing(분석중): 요구사항 분석 필요
- in_progress(진행중): 현재 작업 중
- hold(보류): 대기/블로커 있음
- done(완료): 완료된 업무

우선순위: high(높음), normal(보통), low(낮음)

사용자 요청에 따라 적절한 툴을 사용해 업무를 등록·조회·수정하세요.
응답은 항상 한국어로 친절하게 해주세요.`

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'add_task',
      description: '새 업무를 DB에 추가합니다.',
      parameters: {
        type: 'object',
        properties: {
          service:     { type: 'string', enum: ['MC', 'MS', 'COMMON'], description: '서비스 구분' },
          title:       { type: 'string', description: '업무 제목' },
          description: { type: 'string', description: '업무 상세 내용' },
          status:      { type: 'string', enum: ['received', 'analyzing', 'in_progress', 'hold', 'done'], description: '업무 상태' },
          priority:    { type: 'string', enum: ['high', 'normal', 'low'], description: '우선순위' },
          requester:   { type: 'string', description: '요청자' },
          due_date:    { type: 'string', description: '마감일 (YYYY-MM-DD)' },
          memo:        { type: 'string', description: '메모' },
        },
        required: ['service', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_tasks',
      description: '업무 목록을 조회합니다.',
      parameters: {
        type: 'object',
        properties: {
          service: { type: 'string', enum: ['MC', 'MS', 'COMMON', 'ALL'], description: '서비스 필터 (ALL이면 전체)' },
          status:  { type: 'string', description: '상태 필터 (미입력시 전체)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: '기존 업무의 상태나 정보를 수정합니다.',
      parameters: {
        type: 'object',
        properties: {
          task_id:     { type: 'string', description: '업무 ID' },
          status:      { type: 'string', enum: ['received', 'analyzing', 'in_progress', 'hold', 'done'] },
          priority:    { type: 'string', enum: ['high', 'normal', 'low'] },
          memo:        { type: 'string' },
          due_date:    { type: 'string' },
          description: { type: 'string' },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_weekly_report',
      description: '지정한 서비스와 주차의 주간보고를 생성합니다.',
      parameters: {
        type: 'object',
        properties: {
          service:     { type: 'string', enum: ['MC', 'MS', 'ALL'] },
          week_number: { type: 'number', description: '주차 (미입력시 이번주)' },
        },
      },
    },
  },
]

async function executeTool(name: string, args: any, supabaseUrl: string, serviceKey: string) {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  if (name === 'add_task') {
    const now = new Date()
    const weekNumber = Math.ceil((now.getDate() - now.getDay() + 1) / 7) +
      (now.getMonth() * 4)
    const body = { ...args, week_number: weekNumber }
    const res = await fetch(`${supabaseUrl}/rest/v1/tasks`, {
      method: 'POST', headers,
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return { success: true, task: Array.isArray(data) ? data[0] : data }
  }

  if (name === 'get_tasks') {
    let url = `${supabaseUrl}/rest/v1/tasks?select=*&order=created_at.desc`
    if (args.service && args.service !== 'ALL') url += `&service=eq.${args.service}`
    if (args.status) url += `&status=eq.${args.status}`
    const res = await fetch(url, { headers })
    const tasks = await res.json()
    return { tasks }
  }

  if (name === 'update_task') {
    const { task_id, ...updates } = args
    const res = await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${task_id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify(updates),
    })
    const data = await res.json()
    return { success: true, task: Array.isArray(data) ? data[0] : data }
  }

  if (name === 'generate_weekly_report') {
    let url = `${supabaseUrl}/rest/v1/tasks?select=*&order=status.asc`
    if (args.service && args.service !== 'ALL') url += `&service=eq.${args.service}`
    if (args.week_number) url += `&week_number=eq.${args.week_number}`
    const res = await fetch(url, { headers })
    const tasks = await res.json()
    return { tasks, service: args.service || 'ALL', week_number: args.week_number }
  }

  return { error: 'Unknown tool' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { message, history = [] } = await req.json()

    const groqKey     = Deno.env.get('GROQ_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!groqKey) throw new Error('GROQ_API_KEY not set')

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.slice(-10),
      { role: 'user', content: message },
    ]

    // 1차 호출 (tool calling)
    const firstRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        max_tokens: 2048,
        temperature: 0.3,
      }),
    })
    const firstData = await firstRes.json()
    const assistantMsg = firstData.choices?.[0]?.message

    if (!assistantMsg) throw new Error('No response from AI')

    // tool call 없으면 바로 반환
    if (!assistantMsg.tool_calls?.length) {
      return new Response(JSON.stringify({
        reply: assistantMsg.content || '',
        tasks: null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // tool call 실행
    messages.push(assistantMsg)
    let latestTasks = null

    for (const call of assistantMsg.tool_calls) {
      const args = JSON.parse(call.function.arguments || '{}')
      const result = await executeTool(call.function.name, args, supabaseUrl, serviceKey)
      if (result.tasks) latestTasks = result.tasks
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      })
    }

    // 2차 호출 (최종 응답 생성)
    const secondRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 2048,
        temperature: 0.4,
      }),
    })
    const secondData = await secondRes.json()
    const reply = secondData.choices?.[0]?.message?.content || ''

    return new Response(JSON.stringify({ reply, tasks: latestTasks }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
