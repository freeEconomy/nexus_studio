import React, { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './MultiAgent.css'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const MODELS = [
  {
    id: 'compound',
    name: 'Compound (실시간검색)',
    provider: 'Groq',
    color: '#ef4444',
    icon: '🌐',
    fn: 'query-groq',
    model: 'compound-beta-mini',
    hidden: true,
  },
  {
    id: 'gpt120b',
    name: 'GPT-OSS 120B',
    provider: 'OpenAI / Groq',
    color: '#10b981',
    icon: '🟢',
    fn: 'query-groq',
    model: 'openai/gpt-oss-120b',
  },
  {
    id: 'gpt20b',
    name: 'GPT-OSS 20B',
    provider: 'OpenAI / Groq',
    color: '#34d399',
    icon: '🟩',
    fn: 'query-groq',
    model: 'openai/gpt-oss-20b',
  },
  {
    id: 'llama70b',
    name: 'Llama 3.3 70B',
    provider: 'Groq',
    color: '#f59e0b',
    icon: '🟡',
    fn: 'query-groq',
    model: 'llama-3.3-70b-versatile',
  },
  {
    id: 'qwen',
    name: 'Qwen3 32B',
    provider: 'Groq',
    color: '#8b5cf6',
    icon: '🟣',
    fn: 'query-groq',
    model: 'qwen/qwen3-32b',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek R1 70B',
    provider: 'Groq',
    color: '#06b6d4',
    icon: '🩵',
    fn: 'query-groq',
    model: 'deepseek-r1-distill-llama-70b',
  },
]

const VISIBLE_MODELS = MODELS.filter(m => !m.hidden)

const STATUS = { IDLE: 'idle', LOADING: 'loading', DONE: 'done', ERROR: 'error' }

const initResult = () => ({
  status: STATUS.IDLE,
  text: '',
  time: null,
  raw: '',
  display: '',
  thinking: false,
})

// Parse <think>...</think> blocks out of streamed raw text.
// Returns display (text outside think blocks) and thinking (still inside a think block).
// Handles partial tags split across SSE chunks via trailing-tag regex strip.
function parseThinkContent(raw) {
  let display = ''
  let thinking = false
  let i = 0
  while (i < raw.length) {
    if (!thinking) {
      const start = raw.indexOf('<think>', i)
      if (start === -1) {
        let rest = raw.slice(i)
        // Strip any trailing partial <think> / </think> tag
        rest = rest.replace(/<\/?(?:t(?:h(?:i(?:n(?:k>?)?)?)?)?)?$/, '')
        display += rest
        break
      }
      display += raw.slice(i, start)
      i = start + 7
      thinking = true
    } else {
      const end = raw.indexOf('</think>', i)
      if (end === -1) break // still inside think block
      i = end + 8
      thinking = false
    }
  }
  return { display, thinking }
}

async function streamModelResponse({ fnName, body, onChunk, onDone, onError }) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ ...body, stream: true }),
    })

    if (!res.ok) {
      const errText = await res.text()
      let errMsg = errText || `HTTP ${res.status}`
      try {
        const j = JSON.parse(errText)
        errMsg = (typeof j.error === 'string' ? j.error : j.error?.message) || errMsg
      } catch { /* not JSON */ }
      throw new Error(errMsg)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() // retain incomplete last line for next iteration

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') { onDone(); return }
        try {
          const parsed = JSON.parse(data)
          if (parsed.error) {
            const msg = typeof parsed.error === 'string'
              ? parsed.error
              : parsed.error?.message || JSON.stringify(parsed.error)
            onError(new Error(msg))
            return
          }
          const content = parsed.choices?.[0]?.delta?.content
          if (content) onChunk(content)
        } catch { /* skip malformed JSON */ }
      }
    }
    onDone()
  } catch (err) {
    onError(err)
  }
}

export default function MultiAgent() {
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState(VISIBLE_MODELS[0].id)
  const [webSearch, setWebSearch] = useState(true)
  const [histories, setHistories] = useState(
    Object.fromEntries(VISIBLE_MODELS.map(m => [m.id, []]))
  )
  const [results, setResults] = useState(
    Object.fromEntries(VISIBLE_MODELS.map(m => [m.id, initResult()]))
  )
  const textareaRef = useRef(null)
  const chatContainerRef = useRef(null)

  // textarea 자동 높이 조절 (위로 확장)
  const autoResize = (el) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  // query 초기화 시 높이 리셋
  useEffect(() => {
    if (!query && textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [query])

  // ── 타이핑 애니메이션 (compound 전체·일반 스트리밍 모두 부드럽게) ──
  const [streamDisplay, setStreamDisplay] = useState('')
  const streamPosRef  = useRef(0)
  const streamRafRef  = useRef(null)

  const isLoading = Object.values(results).some(r => r.status === STATUS.LOADING)
  const hasContent = Object.values(histories).some(h => h.length > 0) ||
    Object.values(results).some(r => r.status === STATUS.ERROR)

  // ── 타이핑 애니메이션: activeResult.display 변화 → 글자씩 표시 ──
  const activeDisplayTarget = results[activeTab]?.display || ''

  useEffect(() => {
    cancelAnimationFrame(streamRafRef.current)

    if (!activeDisplayTarget) {
      streamPosRef.current = 0
      setStreamDisplay('')
      return
    }

    // 탭 전환·새 메시지 시작 시 위치가 앞서면 초기화
    if (streamPosRef.current > activeDisplayTarget.length) {
      streamPosRef.current = 0
      setStreamDisplay('')
    }

    if (streamPosRef.current >= activeDisplayTarget.length) return

    const CHARS_PER_FRAME = 12 // ~720자/초 @60fps

    const tick = () => {
      if (streamPosRef.current >= activeDisplayTarget.length) return
      streamPosRef.current = Math.min(
        streamPosRef.current + CHARS_PER_FRAME,
        activeDisplayTarget.length
      )
      setStreamDisplay(activeDisplayTarget.slice(0, streamPosRef.current))
      if (streamPosRef.current < activeDisplayTarget.length) {
        streamRafRef.current = requestAnimationFrame(tick)
      }
    }

    streamRafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(streamRafRef.current)
  }, [activeDisplayTarget])

  // 탭 전환 시 애니메이션 위치 초기화
  useEffect(() => {
    cancelAnimationFrame(streamRafRef.current)
    streamPosRef.current = 0
    setStreamDisplay('')
  }, [activeTab])

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.focus()
  }, [])

  useEffect(() => {
    if (chatContainerRef.current) {
      // 새로운 메시지가 추가될 때 상단으로 스크롤 (Gemini 스타일)
      chatContainerRef.current.scrollTop = 0
    }
  }, [results, histories, activeTab])

  // 항상 입력창에 포커스 유지
  useEffect(() => {
    const focusTextarea = () => {
      if (textareaRef.current && !isLoading) {
        textareaRef.current.focus()
      }
    }
    
    focusTextarea()
    
    // 모든 상황에서 포커스 복원
    const restoreFocus = () => setTimeout(focusTextarea, 0)
    window.addEventListener('click', restoreFocus)
    window.addEventListener('focus', restoreFocus)
    
    return () => {
      window.removeEventListener('click', restoreFocus)
      window.removeEventListener('focus', restoreFocus)
    }
  }, [isLoading])

  const handleSubmit = async () => {
    if (!query.trim() || isLoading) return

    const userMessage = query.trim()
    setQuery('')
    
    // 포커스 즉시 복원
    setTimeout(() => {
      if (textareaRef.current) textareaRef.current.focus()
    }, 0)

    // Show user message immediately in all tabs
    setHistories(Object.fromEntries(
      VISIBLE_MODELS.map(m => [m.id, [{ role: 'user', content: userMessage }]])
    ))
    setResults(Object.fromEntries(
      VISIBLE_MODELS.map(m => [m.id, { ...initResult(), status: STATUS.LOADING }])
    ))

    const startTimes = Object.fromEntries(VISIBLE_MODELS.map(m => [m.id, Date.now()]))

    const promises = VISIBLE_MODELS.map(async (model) => {
      const rawRef = { current: '' }

      await streamModelResponse({
        fnName: model.fn,
        body: { messages: [{ role: 'user', content: userMessage }], model: model.model, useWebSearch: webSearch },
        onChunk: (chunk) => {
          rawRef.current += chunk
          const { display, thinking } = parseThinkContent(rawRef.current)
          setResults(prev => ({
            ...prev,
            [model.id]: { ...prev[model.id], raw: rawRef.current, display, thinking },
          }))
        },
        onDone: () => {
          const elapsed = ((Date.now() - startTimes[model.id]) / 1000).toFixed(1)
          const { display } = parseThinkContent(rawRef.current)
          // Fallback if everything was inside <think> (no actual answer)
          let finalText = display
          if (!finalText && rawRef.current) {
            finalText = rawRef.current
              .replace(/<think>[\s\S]*?<\/think>/g, '')
              .replace(/<\/?think>/g, '')
              .trim()
          }
          setHistories(prev => ({
            ...prev,
            [model.id]: [
              { role: 'user', content: userMessage },
              { role: 'assistant', content: finalText || '(응답 없음)' },
            ],
          }))
          setResults(prev => ({
            ...prev,
            [model.id]: {
              status: STATUS.DONE,
              text: finalText,
              time: elapsed,
              raw: rawRef.current,
              display: finalText,
              thinking: false,
            },
          }))
        },
        onError: (err) => {
          const elapsed = ((Date.now() - startTimes[model.id]) / 1000).toFixed(1)
          setResults(prev => ({
            ...prev,
            [model.id]: { ...initResult(), status: STATUS.ERROR, text: err.message, time: elapsed },
          }))
        },
      })
    })

    await Promise.allSettled(promises)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleReset = () => {
    setQuery('')
    setHistories(Object.fromEntries(VISIBLE_MODELS.map(m => [m.id, []])))
    setResults(Object.fromEntries(VISIBLE_MODELS.map(m => [m.id, initResult()])))
  }

  const activeModel = VISIBLE_MODELS.find(m => m.id === activeTab)
  const activeResult = results[activeTab]
  const activeHistory = histories[activeTab]

  // Show streaming bubble when thinking or text has started arriving
  const showStreaming = activeResult.status === STATUS.LOADING &&
    (activeResult.thinking || activeResult.display.length > 0)

  return (
    <div className="multi-agent">
      <div className="ma-header">
        <h1>AI Lab</h1>
        <p>하나의 질문을 여러 AI 모델에 동시에 요청하고 결과를 비교합니다</p>
      </div>

      {(hasContent || isLoading) && (
        <div className="ma-results">
          {/* 탭 헤더 */}
          <div className="ma-tabs">
            {VISIBLE_MODELS.map(model => {
              const r = results[model.id]
              return (
                <button
                  key={model.id}
                  className={`ma-tab ${activeTab === model.id ? 'active' : ''}`}
                  style={{ '--tab-color': model.color }}
                  onClick={() => setActiveTab(model.id)}
                >
                  <span className="tab-icon">{model.icon}</span>
                  <span className="tab-name">{model.name}</span>
                  <span className={`tab-badge ${r.status}`}>
                    {r.status === STATUS.LOADING && <span className="spinner" />}
                    {r.status === STATUS.DONE && `${r.time}s`}
                    {r.status === STATUS.ERROR && '오류'}
                  </span>
                </button>
              )
            })}
          </div>

          {/* 탭 콘텐츠 */}
          <div className="ma-tab-content">
            <div className="ma-tab-meta">
              <span style={{ color: activeModel.color }}>
                {activeModel.icon} {activeModel.name}
              </span>
              <span className="tab-provider">{activeModel.provider}</span>
              {activeResult.time && (
                <span className="tab-time">응답시간: {activeResult.time}s</span>
              )}
            </div>

            {/* 채팅 영역 */}
            <div className="ma-chat-container" ref={chatContainerRef}>
              {/* 완료된 메시지 히스토리 */}
              {activeHistory.map((msg, idx) => (
                <div
                  key={idx}
                  className={`ma-chat-message ${msg.role === 'user' ? 'user' : 'assistant'}`}
                >
                  <div className="ma-chat-role">
                    {msg.role === 'user' ? '👤 나' : `${activeModel.icon} ${activeModel.name}`}
                  </div>
                  <div className="ma-chat-content">
                    {msg.role === 'assistant' ? (
                      <ReactMarkdown className="ma-markdown" remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}

              {/* 아직 청크 미도착 — 대기 애니메이션 */}
              {activeResult.status === STATUS.LOADING && !showStreaming && (
                <div className="ma-loading">
                  <div className="loading-dots">
                    <span /><span /><span />
                  </div>
                  <p>응답을 기다리는 중...</p>
                </div>
              )}

              {/* 스트리밍 중 어시스턴트 버블 */}
              {showStreaming && (
                <div className="ma-chat-message assistant">
                  <div className="ma-chat-role">{activeModel.icon} {activeModel.name}</div>
                  <div className="ma-chat-content">
                    {activeResult.thinking && (
                      <div className="ma-thinking-wrap">
                        <span className="ma-thinking-brain">🧠</span>
                        <div className="ma-thinking-text">
                          <span>AI가 생각 중</span>
                          <div className="ma-thinking-dots">
                            <span /><span /><span />
                          </div>
                        </div>
                      </div>
                    )}
                    {streamDisplay && (
                      <div className="ma-streaming-markdown">
                        <ReactMarkdown className="ma-markdown" remarkPlugins={[remarkGfm]}>
                          {streamDisplay}
                        </ReactMarkdown>
                        <span className="ma-stream-cursor" />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 오류 */}
              {activeResult.status === STATUS.ERROR && (
                <div className="ma-chat-message error">
                  <div className="ma-chat-role">⚠️ 오류</div>
                  <div className="ma-chat-content ma-error-content">
                    <p>{activeResult.text}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 입력 영역 */}
      <div className="ma-input-area">
        <div className="ma-input-area-inner">
          <div className="ma-input-row">
            <textarea
              ref={textareaRef}
              className="ma-textarea"
              placeholder="질문을 입력하세요..."
              value={query}
              onChange={e => { setQuery(e.target.value); autoResize(e.target) }}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isLoading}
            />
            <button
              className={`btn-web-search ${webSearch ? 'active' : ''}`}
              onClick={() => setWebSearch(v => !v)}
              disabled={isLoading}
              title={webSearch ? '웹 검색 ON — 클릭하여 끄기' : '웹 검색 OFF — 클릭하여 켜기'}
            >
              🌐 {webSearch ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="ma-input-footer">
            <span className="ma-hint">Enter 전송 · Shift+Enter 줄바꿈</span>
            {hasContent && (
              <button className="btn-reset" onClick={handleReset} disabled={isLoading}>
                초기화
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
