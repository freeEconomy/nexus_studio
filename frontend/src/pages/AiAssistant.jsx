import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import ReactMarkdown from 'react-markdown'
import './AiAssistant.css'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// ── 상수 ────────────────────────────────────────────────
const STATUS_META = {
  received:    { label: '접수',   color: 'red',    emoji: '🔴' },
  analyzing:   { label: '분석중', color: 'yellow', emoji: '🟡' },
  in_progress: { label: '진행중', color: 'blue',   emoji: '🔵' },
  hold:        { label: '보류',   color: 'orange', emoji: '🟠' },
  done:        { label: '완료',   color: 'green',  emoji: '✅' },
}

const PRIORITY_META = {
  high:   { label: '높음', color: 'high' },
  normal: { label: '보통', color: 'normal' },
  low:    { label: '낮음', color: 'low' },
}

const TABS = [
  { id: 'chat',   label: '💬 채팅' },
  { id: 'tasks',  label: '📋 업무 현황' },
  { id: 'report', label: '📊 주간보고' },
]

const SERVICE_FILTERS = ['전체', 'MC', 'MS']

// ── 헬퍼 ────────────────────────────────────────────────
const getWeekNumber = () => {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  return Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7)
}

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : ''
const dDay = (due) => {
  if (!due) return null
  const diff = Math.ceil((new Date(due) - new Date()) / 86400000)
  if (diff === 0) return 'D-day'
  if (diff > 0) return `D-${diff}`
  return `D+${Math.abs(diff)}`
}

// ── 채팅 탭 ─────────────────────────────────────────────
function ChatTab({ onTasksRefresh }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '안녕하세요! MAMF AI 비서입니다. 업무 등록, 현황 조회, 주간보고 생성을 도와드립니다.\n\n💡 예시:\n- "MC에 SKT 캠페인 분석 업무 추가해줘 - 진행중, 요청자: 김팀장, D-2"\n- "오늘 MS 업무 현황 알려줘"\n- "MC 주간보고 만들어줘"' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)

    const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))

    const { data, error } = await supabase.functions.invoke('assistant-agent', {
      body: { message: msg, history },
    })

    if (error || !data) {
      setMessages(prev => [...prev, { role: 'assistant', content: '오류가 발생했습니다. 다시 시도해주세요.' }])
    } else {
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      if (data.tasks !== null) onTasksRefresh()
    }
    setLoading(false)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div className="chat-tab">
      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role}`}>
            {m.role === 'assistant' && <span className="chat-avatar">🤖</span>}
            <div className="chat-content">
              <ReactMarkdown>{m.content}</ReactMarkdown>
            </div>
            {m.role === 'user' && <span className="chat-avatar user-avatar">👤</span>}
          </div>
        ))}
        {loading && (
          <div className="chat-bubble assistant">
            <span className="chat-avatar">🤖</span>
            <div className="chat-content typing">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-wrap">
        <textarea
          ref={textareaRef}
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="업무 내용을 입력하세요... (Enter 전송, Shift+Enter 줄바꿈)"
          rows={2}
        />
        <button className="chat-send" onClick={send} disabled={loading || !input.trim()}>
          전송
        </button>
      </div>
    </div>
  )
}

// ── 업무 카드 ────────────────────────────────────────────
function TaskCard({ task, onUpdate }) {
  const [open, setOpen] = useState(false)
  const [editStatus, setEditStatus] = useState(task.status)
  const [memo, setMemo] = useState(task.memo || '')
  const [saving, setSaving] = useState(false)
  const sm = STATUS_META[task.status] || STATUS_META.received
  const dd = dDay(task.due_date)

  const save = async () => {
    setSaving(true)
    await supabase.from('tasks').update({ status: editStatus, memo, updated_at: new Date().toISOString() }).eq('id', task.id)
    onUpdate()
    setSaving(false)
    setOpen(false)
  }

  return (
    <div className={`task-card status-${sm.color}`} onClick={() => setOpen(!open)}>
      <div className="task-card-top">
        <span className={`status-badge badge-${sm.color}`}>{sm.emoji} {sm.label}</span>
        <span className={`svc-badge svc-${task.service.toLowerCase()}`}>{task.service}</span>
        {dd && <span className={`dday ${dd.startsWith('D+') ? 'overdue' : dd === 'D-day' ? 'today' : ''}`}>{dd}</span>}
        <span className={`priority-dot pri-${task.priority}`} title={PRIORITY_META[task.priority]?.label} />
      </div>
      <div className="task-title">{task.title}</div>
      {task.requester && <div className="task-meta">요청자: {task.requester}</div>}
      {task.due_date && <div className="task-meta">마감: {fmtDate(task.due_date)}</div>}

      {open && (
        <div className="task-edit" onClick={e => e.stopPropagation()}>
          {task.description && <p className="task-desc">{task.description}</p>}
          <label>상태 변경</label>
          <select value={editStatus} onChange={e => setEditStatus(e.target.value)}>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.label}</option>
            ))}
          </select>
          <label>메모</label>
          <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2} placeholder="메모 입력..." />
          <button className="save-btn" onClick={save} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── 업무 현황 탭 ─────────────────────────────────────────
function TasksTab({ tasks, loading, onRefresh }) {
  const [svcFilter, setSvcFilter] = useState('전체')

  const filtered = tasks.filter(t =>
    svcFilter === '전체' || t.service === svcFilter
  )

  const countBy = (status) => filtered.filter(t => t.status === status).length
  const active  = filtered.filter(t => t.status !== 'done')
  const done    = filtered.filter(t => t.status === 'done')

  return (
    <div className="tasks-tab">
      {/* 서비스 필터 */}
      <div className="svc-filter">
        {SERVICE_FILTERS.map(f => (
          <button
            key={f}
            className={`svc-btn ${svcFilter === f ? 'active' : ''}`}
            onClick={() => setSvcFilter(f)}
          >
            {f}
          </button>
        ))}
        <button className="refresh-btn" onClick={onRefresh} title="새로고침">↻</button>
      </div>

      {/* 상태 요약 */}
      <div className="status-summary">
        {Object.entries(STATUS_META).map(([k, v]) => (
          <div key={k} className={`summary-card badge-${v.color}`}>
            <span className="summary-emoji">{v.emoji}</span>
            <span className="summary-label">{v.label}</span>
            <span className="summary-count">{countBy(k)}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="tasks-loading">불러오는 중...</div>
      ) : (
        <>
          {/* 진행 중 업무 */}
          <h3 className="tasks-section-title">진행 중 업무 ({active.length}건)</h3>
          {active.length === 0
            ? <p className="empty-tasks">진행 중인 업무가 없습니다</p>
            : <div className="tasks-grid">
                {active.map(t => <TaskCard key={t.id} task={t} onUpdate={onRefresh} />)}
              </div>
          }

          {/* 완료 업무 */}
          {done.length > 0 && (
            <>
              <h3 className="tasks-section-title done-title">✅ 완료 ({done.length}건)</h3>
              <div className="tasks-grid">
                {done.slice(0, 6).map(t => <TaskCard key={t.id} task={t} onUpdate={onRefresh} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── 주간보고 탭 ──────────────────────────────────────────
function ReportTab({ tasks }) {
  const [svc, setSvc] = useState('전체')
  const [report, setReport] = useState('')
  const [generating, setGenerating] = useState(false)

  const generate = async () => {
    setGenerating(true)
    const filtered = svc === '전체' ? tasks : tasks.filter(t => t.service === svc)
    const weekNo = getWeekNumber()

    const msg = `${svc} 서비스 ${weekNo}주차 주간보고를 작성해줘. 업무 데이터:\n${JSON.stringify(filtered, null, 2)}`
    const { data } = await supabase.functions.invoke('assistant-agent', {
      body: { message: msg, history: [] },
    })
    setReport(data?.reply || '보고서 생성 실패')
    setGenerating(false)
  }

  const copy = () => navigator.clipboard.writeText(report)

  return (
    <div className="report-tab">
      <div className="report-controls">
        <div className="svc-filter">
          {SERVICE_FILTERS.map(f => (
            <button key={f} className={`svc-btn ${svc === f ? 'active' : ''}`} onClick={() => setSvc(f)}>{f}</button>
          ))}
        </div>
        <button className="generate-btn" onClick={generate} disabled={generating}>
          {generating ? '생성 중...' : '🤖 AI 주간보고 생성'}
        </button>
      </div>

      {report ? (
        <div className="report-preview">
          <div className="report-actions">
            <button className="copy-btn" onClick={copy}>📋 복사</button>
          </div>
          <div className="report-body">
            <ReactMarkdown>{report}</ReactMarkdown>
          </div>
        </div>
      ) : (
        <div className="report-empty">
          <p>서비스를 선택하고 AI 주간보고 생성 버튼을 눌러주세요.</p>
          <p className="report-hint">현재 등록된 업무 데이터를 바탕으로 자동 작성됩니다.</p>
        </div>
      )}
    </div>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────
export default function AiAssistant() {
  const [activeTab, setActiveTab] = useState('chat')
  const [tasks, setTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(false)

  const loadTasks = async () => {
    setTasksLoading(true)
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })
    setTasks(data || [])
    setTasksLoading(false)
  }

  useEffect(() => { loadTasks() }, [])

  return (
    <div className="ai-assistant">
      <div className="ai-header">
        <div className="ai-header-left">
          <h1 className="ai-title">Nexus Agent</h1>
          <span className="ai-subtitle">MAMF 업무 관리 에이전트</span>
        </div>
        <div className="ai-badge-wrap">
          <span className="svc-badge svc-mc">MC</span>
          <span className="svc-badge svc-ms">MS</span>
        </div>
      </div>

      <div className="ai-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`ai-tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
            {t.id === 'tasks' && tasks.filter(t => t.status !== 'done').length > 0 && (
              <span className="tab-badge">{tasks.filter(t => t.status !== 'done').length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="ai-content">
        {activeTab === 'chat' && <ChatTab onTasksRefresh={loadTasks} />}
        {activeTab === 'tasks' && <TasksTab tasks={tasks} loading={tasksLoading} onRefresh={loadTasks} />}
        {activeTab === 'report' && <ReportTab tasks={tasks} />}
      </div>
    </div>
  )
}
