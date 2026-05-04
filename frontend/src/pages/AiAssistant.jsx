import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Sparkles, User, Trash2, Info, X } from 'lucide-react'
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
  { id: 'chat',   label: '💬 에이전트' },
  { id: 'tasks',  label: '📋 업무 현황' },
  { id: 'report', label: '📊 주간보고' },
]

const SERVICE_FILTERS = ['전체', 'MC', 'MS']

// ── 헬퍼 ────────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : ''
const dDay = (due) => {
  if (!due) return null
  const diff = Math.ceil((new Date(due) - new Date()) / 86400000)
  if (diff === 0) return 'D-day'
  if (diff > 0) return `D-${diff}`
  return `D+${Math.abs(diff)}`
}

  // ── 형식 도움말 모달 ────────────────────────────────────
  function FormatHelpModal({ onClose, onSelectFormat }) {
    const formats = [
      {
        label: "📋 업무 등록/수정 형식",
        content: `유형 : 등록 / 수정
업무 : 업무 제목
내용 : 업무 상세 내용
이슈번호 : 지라 번호 (선택)
상태 : 접수 / 분석중 / 진행중 / 보류 / 완료
서비스 : MC 또는 MS
우선순위 : 높음 / 보통 / 낮음 (선택)`
    }
  ]

  return (
    <div className="format-modal-overlay" onClick={onClose}>
      <div className="format-modal" onClick={e => e.stopPropagation()}>
        <div className="format-modal-header">
          <div className="header-title">
            <span className="header-icon">📋</span>
            <h3>직접 입력 형식 안내</h3>
          </div>
          <button className="close-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="format-modal-body">
          <p className="modal-intro">원하는 형식을 선택하거나, 복사하여 사용하세요.</p>
          <div className="format-list">
            {formats.map((fmt, index) => (
              <div key={index} className="format-item">
                <div className="format-item-header">
                  <h4>{fmt.label}</h4>
                </div>
                <div className="format-code-wrap">
                  <pre className="format-code">{fmt.content}</pre>
                  <CopyButton text={fmt.content} />
                </div>
                <button className="select-format-btn" onClick={() => onSelectFormat(fmt.content)}>
                  이 형식으로 입력
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 채팅 메시지 목록 (입력란 제외) ──────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button className="msg-copy-btn" onClick={handleCopy} title="복사">
      {copied ? '✓' : '⎘'}
    </button>
  )
}

function ChatTab({ messages, loading, onOptionClick, onFormatClick }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // '형식' 텍스트를 클릭 가능한 링크로 변환
  const renderContent = (content) => {
    if (content.includes('형식')) {
      const parts = content.split('형식')
      return (
        <span>
          {parts[0]}
          <span className="format-link-trigger" onClick={onFormatClick}>형식</span>
          {parts[1]}
        </span>
      )
    }
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
  }

  return (
    <div className="chat-tab">
      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role}`}>
            {m.role === 'assistant' && <span className="chat-avatar ai-avatar"><Sparkles size={15} strokeWidth={1.8} /></span>}
            <div className="chat-content-wrap">
              <div className="chat-content">
                {m.role === 'user'
                  ? <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
                  : (
                    <>
                      {i === 0 ? renderContent(m.content) : <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>}
                      {m.options && (
                        <div className="chat-options">
                          {m.options.map(opt => (
                            <button 
                              key={typeof opt === 'string' ? opt : opt.id} 
                              className={`chat-option-btn ${opt === '취소' ? 'opt-cancel' : ''}`}
                              onClick={() => onOptionClick(typeof opt === 'string' ? opt : opt.label, opt)}
                            >
                              {typeof opt === 'string' ? opt : opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )
                }
              </div>
              <CopyButton text={m.content} />
            </div>
            {m.role === 'user' && <span className="chat-avatar user-avatar"><User size={14} strokeWidth={1.8} /></span>}
          </div>
        ))}
        {loading && (
          <div className="chat-bubble assistant">
            <span className="chat-avatar ai-avatar"><Sparkles size={15} strokeWidth={1.8} /></span>
            <div className="chat-content typing">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ── 업무 카드 ────────────────────────────────────────────
function TaskCard({ task, onUpdate }) {
  const [open, setOpen] = useState(false)
  const [editStatus, setEditStatus] = useState(task.status)
  const [memo, setMemo] = useState(task.memo || '')
  const [issue, setIssue] = useState(task.issue || '')
  const [saving, setSaving] = useState(false)
  const sm = STATUS_META[task.status] || STATUS_META.received
  const dd = dDay(task.due_date)

  const save = async () => {
    setSaving(true)
    await supabase.from('tasks').update({ 
      status: editStatus, 
      memo, 
      issue,
      updated_at: new Date().toISOString() 
    }).eq('id', task.id)
    onUpdate()
    setSaving(false)
    setOpen(false)
  }

  const deleteTask = async (e) => {
    e.stopPropagation()
    if (!confirm(`'${task.title}' 업무를 삭제하시겠습니까?`)) return
    setSaving(true)
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) alert('삭제 실패: ' + error.message)
    onUpdate()
    setSaving(false)
  }

  return (
    <div className={`task-card status-${sm.color}`} onClick={() => setOpen(!open)}>
      <div className="task-card-top">
        <span className={`status-badge badge-${sm.color}`}>{sm.emoji} {sm.label}</span>
        <span className={`svc-badge svc-${task.service.toLowerCase()}`}>{task.service}</span>
        {dd && <span className={`dday ${dd.startsWith('D+') ? 'overdue' : dd === 'D-day' ? 'today' : ''}`}>{dd}</span>}
        <span className={`priority-dot pri-${task.priority}`} title={PRIORITY_META[task.priority]?.label} />
        <button className="task-delete-btn" onClick={deleteTask} title="삭제">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="task-title">{task.title}</div>
      {task.requester && <div className="task-meta">요청자: {task.requester}</div>}
      {task.due_date && <div className="task-meta">마감: {fmtDate(task.due_date)}</div>}
      {task.issue && (
        <div className="task-meta task-issue">
          🔗{' '}
          {task.issue.startsWith('http') ? (
            <a href={task.issue} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
              {task.issue}
            </a>
          ) : (
            <span>{task.issue}</span>
          )}
        </div>
      )}

      {open && (
        <div className="task-edit" onClick={e => e.stopPropagation()}>
          {task.description && <p className="task-desc">{task.description}</p>}

          <label>상태 변경</label>
          <select value={editStatus} onChange={e => setEditStatus(e.target.value)}>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.label}</option>
            ))}
          </select>

          <label>이슈 번호 / 링크</label>
          <input
            type="text"
            value={issue}
            onChange={e => setIssue(e.target.value)}
            placeholder="https://jira.example.com/browse/PROJ-123"
            className="task-issue-input"
          />

          <label>메모</label>
          <textarea 
            value={memo} 
            onChange={e => setMemo(e.target.value)} 
            rows={2} 
            placeholder="메모 입력..." 
          />

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
          <h3 className="tasks-section-title">진행 중 업무 ({active.length}건)</h3>
          {active.length === 0
            ? <p className="empty-tasks">진행 중인 업무가 없습니다</p>
            : <div className="tasks-grid">
                {active.map(t => <TaskCard key={t.id} task={t} onUpdate={onRefresh} />)}
              </div>
          }
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
    const svcLabel = svc === '전체' ? 'ALL' : svc
    const msg = `${svc} 서비스 주간보고를 작성해줘.`
    const { data } = await supabase.functions.invoke('assistant-agent', {
      body: { message: msg, report_service: svcLabel },
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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
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
  const [showFormatModal, setShowFormatModal] = useState(false)

  // 채팅 state
  const [messages, setMessages] = useState([
    { 
      role: 'assistant', 
      content: `안녕하세요! MAMF AI 비서입니다. 업무 등록, 현황 조회, 주간보고 생성을 도와드립니다.

📋 **업무 관리 방법**

"업무 등록" 또는 "업무 수정"이라고 말씀하시거나, 아래 버튼을 눌러 단계별로 진행할 수 있습니다.
(형식을 맞춰 한 번에 입력하셔도 됩니다.)`
    }
  ])

  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const textareaRef = useRef(null)

  // 단계별 업무 등록/수정 상태
  const [regStep, setRegStep] = useState(null) // null | service | type | task_select | title | content | status | priority | confirm
  const [taskDraft, setTaskDraft] = useState({
    id: '', // 수정 시 사용
    service: '',
    type: '',
    title: '',
    content: '',
    status: '',
    priority: '',
    issue: '',
    oldContent: '', // 기존 내용 보관용
    oldIssue: ''    // 기존 이슈 보관용
  })

  // textarea 자동 높이 조절
  const autoResize = (el) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  useEffect(() => {
    if (!input && textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [input])

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

  useEffect(() => {
    if (activeTab === 'chat') textareaRef.current?.focus()
  }, [activeTab])

  useEffect(() => {
    if (!chatLoading && activeTab === 'chat') {
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [chatLoading])

  const handleRegistration = async (displayValue, originalOpt) => {
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: displayValue }])
    
    if (displayValue === '취소') {
      setMessages(prev => [...prev, { role: 'assistant', content: '업무 관리를 취소했습니다. 무엇을 도와드릴까요?' }])
      setRegStep(null)
      setTaskDraft({
        id: '', service: '', type: '', title: '', content: '', status: '', priority: '', issue: '', oldContent: '', oldIssue: ''
      })
      return
    }

    let nextStep = null
    let assistantMsg = ''
    let options = null
    const updatedDraft = { ...taskDraft }

    if (regStep === 'service') {
      updatedDraft.service = displayValue.toUpperCase()
      
      if (updatedDraft.type === '등록') {
        assistantMsg = '**업무 제목**을 입력해주세요. (취소를 원하시면 "취소" 입력)'
        options = ['취소']
        nextStep = 'title'
      } else {
        const svcTasks = tasks.filter(t => t.service === updatedDraft.service && t.status !== 'done')
        if (svcTasks.length === 0) {
          assistantMsg = `${updatedDraft.service} 서비스에 진행 중인 업무가 없습니다. 새로운 업무를 **등록**하시겠습니까?`
          options = ['등록', '취소']
          nextStep = 'type'
        } else {
          assistantMsg = '수정할 업무를 선택해주세요.'
          options = [...svcTasks.slice(0, 10).map(t => ({ id: t.id, label: t.title, task: t })), '취소']
          nextStep = 'task_select'
        }
      }
    } else if (regStep === 'type') {
      updatedDraft.type = displayValue
      assistantMsg = `알겠습니다. 먼저 어떤 **서비스**의 업무인가요?`
      options = ['MC', 'MS', '취소']
      nextStep = 'service'
    } else if (regStep === 'task_select') {
      const selectedTask = originalOpt?.task
      if (selectedTask) {
        updatedDraft.id = selectedTask.id
        updatedDraft.title = selectedTask.title
        updatedDraft.content = selectedTask.description || ''
        updatedDraft.oldContent = selectedTask.description || '(내용 없음)'
        updatedDraft.status = Object.entries(STATUS_META).find(([k,v]) => k === selectedTask.status)?.[1].label || selectedTask.status
        updatedDraft.priority = Object.entries(PRIORITY_META).find(([k,v]) => k === selectedTask.priority)?.[1].label || selectedTask.priority
        updatedDraft.issue = selectedTask.issue || ''
        updatedDraft.oldIssue = selectedTask.issue || '(없음)'
        
        assistantMsg = `[${selectedTask.title}] 업무를 선택하셨습니다. 변경할 **상세 내용**을 입력해주세요. (유지하려면 "유지", 취소는 "취소" 입력)
        
**기존 내용:**
> ${updatedDraft.oldContent}`
        options = ['유지', '취소']
        nextStep = 'content'
      } else {
        assistantMsg = '업무를 다시 선택해주세요.'
        options = ['취소']
        nextStep = 'task_select'
      }
    } else if (regStep === 'title') {
      updatedDraft.title = displayValue
      assistantMsg = '**상세 내용**을 입력해주세요. (취소는 "취소" 입력)'
      options = ['취소']
      nextStep = 'content'
    } else if (regStep === 'content') {
      if (displayValue !== '유지') {
        updatedDraft.content = displayValue
      }
      assistantMsg = '업무의 **현재 상태**는 무엇인가요?'
      options = ['접수', '분석중', '진행중', '보류', '완료', '취소']
      nextStep = 'status'
    } else if (regStep === 'status') {
      updatedDraft.status = displayValue
      if (updatedDraft.type === '수정') {
        assistantMsg = `마지막으로 **지라 번호**가 있다면 입력해주세요. (없으면 "없음", 기존 유지 시 "유지", 취소는 "취소" 입력)
        
**기존 정보:** ${updatedDraft.oldIssue}`
        options = ['유지', '없음', '취소']
        nextStep = 'confirm'
      } else {
        assistantMsg = '**우선순위**를 선택해주세요.'
        options = ['높음', '보통', '낮음', '취소']
        nextStep = 'priority'
      }
    } else if (regStep === 'priority') {
      updatedDraft.priority = displayValue
      assistantMsg = '마지막으로 **지라 번호**가 있다면 입력해주세요. (없으면 "없음", 취소는 "취소" 입력)'
      options = ['없음', '취소']
      nextStep = 'confirm'
    } else if (regStep === 'confirm') {
      if (displayValue !== '유지') {
        updatedDraft.issue = (displayValue === '없음' || displayValue === '없어') ? '' : displayValue
      }
      
      let finalMsg = ''
      if (updatedDraft.type === '수정') {
        finalMsg = `유형 : 수정
업무ID : ${updatedDraft.id}
업무 : ${updatedDraft.title}
내용 : ${updatedDraft.content}
이슈번호 : ${updatedDraft.issue}
상태 : ${updatedDraft.status}
서비스 : ${updatedDraft.service}`
      } else {
        finalMsg = `유형 : 등록
업무 : ${updatedDraft.title}
내용 : ${updatedDraft.content}
이슈번호 : ${updatedDraft.issue}
상태 : ${updatedDraft.status}
서비스 : ${updatedDraft.service}
우선순위 : ${updatedDraft.priority}`
      }

      setChatLoading(true)
      const { data, error } = await supabase.functions.invoke('assistant-agent', {
        body: { message: finalMsg },
      })
      
      if (error || !data) {
        assistantMsg = '처리 중 오류가 발생했습니다. 다시 시도해주세요.'
      } else {
        assistantMsg = data.reply
        if (data.tasks !== null) loadTasks()
      }
      setRegStep(null)
      setChatLoading(false)
    }

    setTaskDraft(updatedDraft)
    if (assistantMsg) {
      setMessages(prev => [...prev, { role: 'assistant', content: assistantMsg, options }])
    }
    setRegStep(nextStep)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const sendMessage = async (msg, originalOpt) => {
    if (!msg.trim() || chatLoading) return

    if (regStep) {
      handleRegistration(msg, originalOpt)
      return
    }

    if (msg.includes('업무 등록') || msg.includes('업무등록')) {
      setInput('')
      setMessages(prev => [...prev, 
        { role: 'user', content: msg },
        { role: 'assistant', content: '업무 등록을 도와드릴게요. 먼저 어떤 **서비스**의 업무인가요?', options: ['MC', 'MS', '취소'] }
      ])
      setRegStep('service')
      setTaskDraft(prev => ({ ...prev, type: '등록' }))
      return
    }

    if (msg.includes('업무 수정') || msg.includes('업무수정')) {
      setInput('')
      setMessages(prev => [...prev, 
        { role: 'user', content: msg },
        { role: 'assistant', content: '업무 수정을 도와드릴게요. 먼저 어떤 **서비스**의 업무인가요?', options: ['MC', 'MS', '취소'] }
      ])
      setRegStep('service')
      setTaskDraft(prev => ({ ...prev, type: '수정' }))
      return
    }

    setInput('')
    setTimeout(() => textareaRef.current?.focus(), 0)
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setChatLoading(true)

    const { data, error } = await supabase.functions.invoke('assistant-agent', {
      body: { message: msg },
    })

    if (error || !data) {
      setMessages(prev => [...prev, { role: 'assistant', content: '오류가 발생했습니다. 다시 시도해주세요.' }])
    } else {
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      if (data.tasks !== null) loadTasks()
    }
    setChatLoading(false)
    textareaRef.current?.focus()
  }

  const send = () => sendMessage(input.trim())
  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

const CHIPS = [
    '업무 등록',
    '업무 수정',
    'MC 업무 현황 알려줘',
    'MS 업무 현황 알려줘',
  ]



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
      {activeTab === 'chat'   && (
          <ChatTab 
            messages={messages} 
            loading={chatLoading} 
            onOptionClick={sendMessage} 
            onFormatClick={() => setShowFormatModal(true)}
          />
        )}

      {showFormatModal && (
        <FormatHelpModal 
          onClose={() => setShowFormatModal(false)} 
          onSelectFormat={(content) => {
            setInput(content);
            setShowFormatModal(false);
            // 약간의 지연 후 높이 조절 및 포커스
            setTimeout(() => {
              if (textareaRef.current) {
                autoResize(textareaRef.current);
                textareaRef.current.focus();
              }
            }, 0);
          }} 
        />
      )}
        {activeTab === 'tasks'  && <TasksTab tasks={tasks} loading={tasksLoading} onRefresh={loadTasks} />}
        {activeTab === 'report' && <ReportTab tasks={tasks} />}
      </div>

      {activeTab === 'chat' && (
        <div className="chat-input-fixed">
          <div className="chat-input-inner">
            <div className="chat-chips">
              {CHIPS.map(chip => (
                <button
                  key={chip}
                  className="chat-chip"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => sendMessage(chip)}
                  disabled={chatLoading}
                >
                  {chip}
                </button>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={input}
              onChange={e => { setInput(e.target.value); autoResize(e.target) }}
              onKeyDown={handleKey}
              placeholder={regStep ? "답변을 입력하세요..." : "업무 내용을 입력하세요... (Enter 전송, Shift+Enter 줄바꿈)"}
              rows={1}
              disabled={chatLoading}
            />
          </div>
        </div>
      )}

    </div>
  )
}
