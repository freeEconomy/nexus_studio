import React, { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
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
  },
  {
    id: 'llama4scout',
    name: 'Llama 4 Scout',
    provider: 'Groq',
    color: '#4285f4',
    icon: '🔵',
    fn: 'query-groq',
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
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
]

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
  const [activeTab, setActiveTab] = useState(MODELS[0].id)
  const [histories, setHistories] = useState(
    Object.fromEntries(MODELS.map(m => [m.id, []]))
  )
  const [results, setResults] = useState(
    Object.fromEntries(MODELS.map(m => [m.id, initResult()]))
  )
  const textareaRef = useRef(null)
  const chatContainerRef = useRef(null)

  const isLoading = Object.values(results).some(r => r.status === STATUS.LOADING)
  const hasContent = Object.values(histories).some(h => h.length > 0) ||
    Object.values(results).some(r => r.status === STATUS.ERROR)

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.focus()
  }, [])

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [results, histories, activeTab])

  const handleSubmit = async () => {
    if (!query.trim() || isLoading) return

    const userMessage = query.trim()
    setQuery('')

    // Show user message immediately in all tabs
    setHistories(Object.fromEntries(
      MODELS.map(m => [m.id, [{ role: 'user', content: userMessage }]])
    ))
    setResults(Object.fromEntries(
      MODELS.map(m => [m.id, { ...initResult(), status: STATUS.LOADING }])
    ))

    const startTimes = Object.fromEntries(MODELS.map(m => [m.id, Date.now()]))

    const promises = MODELS.map(async (model) => {
      const rawRef = { current: '' }

      await streamModelResponse({
        fnName: model.fn,
        body: { messages: [{ role: 'user', content: userMessage }], model: model.model },
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
    setHistories(Object.fromEntries(MODELS.map(m => [m.id, []])))
    setResults(Object.fromEntries(MODELS.map(m => [m.id, initResult()])))
  }

  const activeModel = MODELS.find(m => m.id === activeTab)
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
            {MODELS.map(model => {
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
                      <ReactMarkdown className="ma-markdown">{msg.content}</ReactMarkdown>
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
                    {activeResult.display && (
                      <p className="ma-streaming-content">{activeResult.display}</p>
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
        <textarea
          ref={textareaRef}
          className="ma-textarea"
          placeholder="질문을 입력하세요... (Enter로 전송, Shift+Enter로 줄바꿈)"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          disabled={isLoading}
        />
        <div className="ma-input-actions">
          <span className="ma-hint">Enter로 전송, Shift+Enter로 줄바꿈</span>
          <div className="ma-buttons">
            {hasContent && (
              <button className="btn-reset" onClick={handleReset} disabled={isLoading}>
                초기화
              </button>
            )}
            <button
              className="btn-submit"
              onClick={handleSubmit}
              disabled={!query.trim() || isLoading}
            >
              {isLoading ? '응답 중...' : '전송'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
