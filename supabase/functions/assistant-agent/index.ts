// @ts-nocheck
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'



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
          description: { type: ['string', 'null'], description: '업무 상세 내용' },
          status:      { type: ['string', 'null'], description: '업무 상태: received / analyzing / in_progress / hold / done' },
          priority:    { type: ['string', 'null'], description: '우선순위: high / normal / low' },
          memo:        { type: ['string', 'null'], description: '메모' },
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
          status:  { type: ['string', 'null'], description: '상태 필터 (미입력시 전체)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: '기존 업무의 상태나 정보를 수정합니다. 반드시 get_tasks를 먼저 호출하여 task_id를 확인한 후 사용하세요. 변경할 필드만 포함하고 나머지 필드는 절대 포함하지 마세요.',
      parameters: {
        type: 'object',
        properties: {
          task_id:     { type: ['string', 'null'], description: 'get_tasks로 조회한 실제 업무 ID. 절대 추측하거나 빈 값 사용 금지' },
          status:      { type: ['string', 'null'], description: '변경할 상태: received / analyzing / in_progress / hold / done. 변경 불필요시 이 필드 제외' },
          priority:    { type: ['string', 'null'], description: '변경할 우선순위: high / normal / low. 변경 불필요시 이 필드 제외' },
          memo:        { type: ['string', 'null'], description: '메모. 변경 불필요시 이 필드 제외' },
          description: { type: ['string', 'null'], description: '상세 내용. 변경 불필요시 이 필드 제외' },
        },
        required: [],
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
        },
      },
    },
  },
]

const STATUS_MAP: Record<string, string> = {
  '접수': 'received', '분석중': 'analyzing', '진행중': 'in_progress', '보류': 'hold', '완료': 'done',
}
const PRIORITY_MAP: Record<string, string> = {
  '높음': 'high', '보통': 'normal', '낮음': 'low',
}

const normalizeFields = (obj: any) => {
  if (obj.status   && STATUS_MAP[obj.status])   obj.status   = STATUS_MAP[obj.status]
  if (obj.priority && PRIORITY_MAP[obj.priority]) obj.priority = PRIORITY_MAP[obj.priority]
  return obj
}

async function executeTool(name: string, args: any, supabaseUrl: string, serviceKey: string) {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  // 공통: 전체 task 목록 조회 (쓰기 후 갱신용)
  const fetchAllTasks = async () => {
    const r = await fetch(`${supabaseUrl}/rest/v1/tasks?select=*&order=created_at.desc`, { headers })
    return r.ok ? r.json() : []
  }

  // 공통: HTTP 오류 파싱
  const parseErr = async (res: Response) => {
    try {
      const j = await res.json()
      return j.message || j.hint || j.details || `HTTP ${res.status}`
    } catch { return `HTTP ${res.status}` }
  }

  if (name === 'add_task') {
    const now = new Date()
    const weekNumber = Math.ceil(
      ((now - new Date(now.getFullYear(), 0, 0) as any) / 86400000 + now.getDay()) / 7
    )
    const body = normalizeFields({ priority: 'normal', ...args, week_number: weekNumber })
    const res = await fetch(`${supabaseUrl}/rest/v1/tasks`, {
      method: 'POST', headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errMsg = await parseErr(res)
      console.log(`[assistant-agent] add_task failed: ${errMsg}`)
      return { success: false, error: errMsg }
    }
    const data = await res.json()
    const task = Array.isArray(data) ? data[0] : data
    const tasks = await fetchAllTasks()   // 목록 반환 → 프런트 갱신 트리거
    return { success: true, task, tasks }
  }

  if (name === 'get_tasks') {
    let url = `${supabaseUrl}/rest/v1/tasks?select=*&order=created_at.desc`
    if (args.service && args.service !== 'ALL') url += `&service=eq.${args.service}`
    if (args.status) url += `&status=eq.${args.status}`
    else url += `&status=not.in.(done,hold)`
    const res = await fetch(url, { headers })
    if (!res.ok) return { tasks: [], error: await parseErr(res) }
    const tasks = await res.json()
    return { tasks }
  }

  if (name === 'update_task') {
    const task_id = args.task_id || args.id
    if (!task_id) return { success: false, error: 'task_id가 없습니다. get_tasks로 업무 목록을 먼저 조회하세요.' }
    // id/task_id 및 수정 불필요 필드 제외, 빈값 제거
    const EXCLUDE = new Set(['task_id', 'id', 'title', 'service', 'week_number', 'created_at', 'updated_at'])
    const updates = normalizeFields(
      Object.fromEntries(
        Object.entries(args).filter(([k, v]) => !EXCLUDE.has(k) && v !== '' && v !== null && v !== undefined)
      )
    )
    updates.updated_at = new Date().toISOString()
    const res = await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${task_id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      const errMsg = await parseErr(res)
      console.log(`[assistant-agent] update_task failed: ${errMsg}`)
      return { success: false, error: errMsg }
    }
    const data = await res.json()
    const task = Array.isArray(data) ? data[0] : data
    const tasks = await fetchAllTasks()   // 목록 반환 → 프런트 갱신 트리거
    return { success: true, task, tasks }
  }

  if (name === 'generate_weekly_report') {
    let url = `${supabaseUrl}/rest/v1/tasks?select=*&status=not.in.(done,hold)&order=status.asc`
    if (args.service && args.service !== 'ALL') url += `&service=eq.${args.service}`
    if (args.week_number) url += `&week_number=eq.${args.week_number}`
    const res = await fetch(url, { headers })
    if (!res.ok) return { tasks: [], error: await parseErr(res) }
    const rawTasks = await res.json()
    const tasks = rawTasks.map(({ title, description }: any) => ({ title, description: description || '' }))

    // 보고서 템플릿 조회
    let report_template = null
    try {
      const tplRes = await fetch(
        `${supabaseUrl}/rest/v1/report_templates?select=template&order=created_at.desc&limit=1`,
        { headers }
      )
      if (tplRes.ok) {
        const tplData = await tplRes.json()
        if (tplData[0]?.template) report_template = tplData[0].template
      }
    } catch { /* 템플릿 없으면 자유 형식 */ }

    return { tasks, service: args.service || 'ALL', week_number: args.week_number, report_template }
  }

  return { error: 'Unknown tool' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { message, history = [], report_service } = await req.json()

    const groqKey     = Deno.env.get('GROQ_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!groqKey) throw new Error('GROQ_API_KEY not set')

    const dbHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    }
    let SYSTEM_PROMPT = ''
    try {
      const promptRes = await fetch(
        `${supabaseUrl}/rest/v1/system_prompts?menu=eq.nexus_agent&is_active=eq.true`,
        { headers: dbHeaders }
      )
      if (promptRes.ok) {
        const promptData = await promptRes.json()
        if (promptData[0]?.system_prompt) SYSTEM_PROMPT = promptData[0].system_prompt
      }
    } catch { /* DB 조회 실패 시 fallback 사용 */ }

    // 유형 필드 파싱으로 tool_choice 강제 지정
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.slice(-10),
      { role: 'user', content: message },
    ]

    // tool calling 지원 모델 폴백 체인
    const TOOL_MODELS = [
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'meta-llama/llama-4-maverick-17b-128e-instruct',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
    ]

    const isRetryable = (msg: string) =>
      msg.includes('429') || msg.includes('413') || msg.includes('404') ||
      msg.includes('rate_limit') || msg.includes('model_decommissioned') ||
      msg.includes('model_not_found') || msg.includes('invalid_model') ||
      msg.includes('does not exist')

    const groqPost = async (body: Record<string, unknown>) => {
      const res = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Groq ${res.status}: ${errText}`)
      }
      return res.json()
    }

    // 주간보고 직접 생성 (report_service 파라미터가 있을 때) — 툴 없이 바로 텍스트 생성
    if (report_service) {
      const toolResult = await executeTool(
        'generate_weekly_report',
        { service: report_service },
        supabaseUrl,
        serviceKey
      )

      const tasks = toolResult.tasks
        .map((t: any) => `- ${t.title}${t.description ? ': ' + t.description.replace(/[\r\n]+/g, ' ').trim() : ''}`)
        .join('\n')

      const reportSystemPrompt = `주간보고 작성 전문가입니다. 업무 목록을 받아 아래 규칙대로 보고서를 작성합니다.

규칙:
1. 섹션: 기획 / 디자인/퍼블 / 개발 / 기타 (업무가 없는 섹션은 출력하지 않음)
2. 분류 우선순위: ①기획안·기획서 포함→기획 ②디자인·시안·퍼블·목업 포함→디자인/퍼블 ③API·개발·배포·구현·서버 포함→개발 ④나머지→기타
3. 각 업무는 반드시 하나의 섹션에만 배치 (중복 금지)
4. 출력 형식 (반드시 준수):
- 기획
  - 업무제목: 내용요약
- 개발
  - 업무제목: 내용요약`

      const reportMessages = [
        { role: 'system', content: reportSystemPrompt },
        { role: 'user', content: `${report_service} 주간보고\n\n${tasks}` },
      ]

      let reportData: any = null
      let lastError = ''
      for (const m of TOOL_MODELS) {
        try {
          reportData = await groqPost({ model: m, messages: reportMessages, max_tokens: 1024, temperature: 0.1 })
          break
        } catch (e: any) {
          lastError = e.message
          if (!isRetryable(e.message)) throw e
        }
      }
      if (!reportData) throw new Error(`All models failed. Last error: ${lastError}`)
      const reply = reportData.choices?.[0]?.message?.content || '보고서 생성 실패'
      return new Response(JSON.stringify({ reply, tasks: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1차 호출 (tool calling) — 모델 폴백 포함
    let firstData: any = null
    let usedModel = TOOL_MODELS[0]
    for (const m of TOOL_MODELS) {
      try {
        firstData = await groqPost({
          model: m,
          messages,
          tools: TOOLS,
          tool_choice: 'auto',
          max_tokens: 2048,
          temperature: 0.3,
        })
        usedModel = m
        break
      } catch (e: any) {
        if (!isRetryable(e.message)) throw e
        console.log(`[assistant-agent] ${m} failed, trying next...`)
      }
    }
    if (!firstData) throw new Error('All models failed for tool calling')

    const assistantMsg = firstData.choices?.[0]?.message
    if (!assistantMsg) {
      throw new Error(`Groq returned no message. Raw: ${JSON.stringify(firstData).slice(0, 300)}`)
    }

    // tool call 루프 (get_tasks → update_task 같은 연속 호출 지원, 최대 5회)
    let latestTasks = null
    let currentMsg = assistantMsg
    const MAX_ROUNDS = 5

    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (!currentMsg.tool_calls?.length) break

      messages.push(currentMsg)
      for (const call of currentMsg.tool_calls) {
        const args = JSON.parse(call.function.arguments || '{}')
        const result = await executeTool(call.function.name, args, supabaseUrl, serviceKey)
        if (result.tasks) latestTasks = result.tasks
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        })
      }

      // 다음 라운드 호출
      const nextData = await groqPost({
        model: usedModel,
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        max_tokens: 2048,
        temperature: 0.4,
      })
      currentMsg = nextData.choices?.[0]?.message
      if (!currentMsg) break
    }

    const reply = currentMsg?.content || ''

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
