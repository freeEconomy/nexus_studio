import React, { useState, useRef, useEffect, useCallback } from 'react'
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

function parseThinkContent(raw) {
  let display = ''
  let thinking = false
  let i = 0
  while (i < raw.length) {
    if (!thinking) {
      const start = raw.indexOf('<think>', i)
      if (start === -1) {
        let rest = raw.slice(i)
        rest = rest.replace(/<\/?(?:t(?:h(?:i(?:n(?:k>?)?)?)?)?)?$/, '')
        display += rest
        break
      }
      display += raw.slice(i, start)
      i = start + 7
      thinking = true
    } else {
      const end = raw.indexOf('</think>', i)
      if (end === -1) break
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
      buffer = lines.pop()

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

function CopyButton({ text, className = '' }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [text])
  return (
    <button className={`ma-copy-btn ${className} ${copied ? 'copied' : ''}`} onClick={handleCopy} title="복사">
      {copied ? '✓' : '⎘'}
    </button>
  )
}

export default function MultiAgent() {
  const [query, setQuery] = useState('')
  const [webSearch, setWebSearch] = useState(true)
  const [selectedIds, setSelectedIds] = useState(() => new Set(VISIBLE_MODELS.map(m => m.id)))
  const [userMessage, setUserMessage] = useState('')
  const [results, setResults] = useState(
    Object.fromEntries(VISIBLE_MODELS.map(m => [m.id, initResult()]))
  )
  const textareaRef = useRef(null)

  const selectedModels = VISIBLE_MODELS.filter(m => selectedIds.has(m.id))
  const isLoading = selectedModels.some(m => results[m.id].status === STATUS.LOADING)
  const hasContent = userMessage.length > 0

  const toggleModel = (id) => {
    if (isLoading) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id) && next.size > 1) next.delete(id)
      else if (!next.has(id)) next.add(id)
      return next
    })
  }

  const autoResize = (el) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  useEffect(() => {
    if (!query && textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [query])

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.focus()
  }, [])

  useEffect(() => {
    const focusTextarea = () => {
      if (textareaRef.current && !isLoading) textareaRef.current.focus()
    }
    focusTextarea()
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
    const msg = query.trim()
    setQuery('')
    setUserMessage(msg)
    setTimeout(() => { if (textareaRef.current) textareaRef.current.focus() }, 0)

    setResults(prev => {
      const next = { ...prev }
      VISIBLE_MODELS.forEach(m => {
        next[m.id] = selectedIds.has(m.id)
          ? { ...initResult(), status: STATUS.LOADING }
          : initResult()
      })
      return next
    })

    const startTimes = Object.fromEntries(selectedModels.map(m => [m.id, Date.now()]))

    const promises = selectedModels.map(async (model) => {
      const rawRef = { current: '' }
      await streamModelResponse({
        fnName: model.fn,
        body: { messages: [{ role: 'user', content: msg }], model: model.model, useWebSearch: webSearch },
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
          let finalText = display
          if (!finalText && rawRef.current) {
            finalText = rawRef.current
              .replace(/<think>[\s\S]*?<\/think>/g, '')
              .replace(/<\/?think>/g, '')
              .trim()
          }
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
    setUserMessage('')
    setResults(Object.fromEntries(VISIBLE_MODELS.map(m => [m.id, initResult()])))
  }

  return (
    <div className="multi-agent">
      <div className="ma-header">
        <h1>AI Lab</h1>
        <p>하나의 질문을 여러 AI 모델에 동시에 요청하고 결과를 비교합니다</p>
      </div>

      {/* Model selector */}
      <div className="ma-model-selector">
        <span className="ma-selector-label">모델 선택</span>
        {VISIBLE_MODELS.map(model => {
          const isSelected = selectedIds.has(model.id)
          return (
            <button
              key={model.id}
              className={`ma-model-chip ${isSelected ? 'selected' : ''}`}
              style={isSelected ? {
                borderColor: model.color + '66',
                color: model.color,
                background: model.color + '22',
              } : {}}
              onClick={() => toggleModel(model.id)}
              disabled={isLoading}
              title={isSelected ? '클릭하여 제외' : '클릭하여 추가'}
            >
              {model.icon} {model.name}
              {isSelected && <span className="chip-check">✓</span>}
            </button>
          )
        })}
      </div>

      {hasContent && (
        <div className="ma-content">
          {/* Shared user message */}
          <div className="ma-user-msg-row">
            <div className="ma-user-bubble">
              <div className="ma-user-bubble-top">
                <span className="ma-user-label">👤 나</span>
                <CopyButton text={userMessage} className="copy-user" />
              </div>
              <p>{userMessage}</p>
            </div>
          </div>

          {/* Side-by-side comparison grid */}
          <div className="ma-grid-wrap">
            <div className="ma-grid" style={{ '--col-count': selectedModels.length }}>
              {selectedModels.map(model => {
                const result = results[model.id]
                const isModelLoading = result.status === STATUS.LOADING
                const hasDisplayContent = result.display.length > 0

                return (
                  <div key={model.id} className="ma-col">
                    {/* Column header */}
                    <div className="ma-col-header">
                      <span className="ma-col-name" style={{ color: model.color }}>
                        {model.icon} {model.name}
                      </span>
                      <span className="tab-provider">{model.provider}</span>
                      <span className={`tab-badge ${result.status}`}>
                        {isModelLoading && <span className="spinner" />}
                        {result.status === STATUS.DONE && `${result.time}s`}
                        {result.status === STATUS.ERROR && '오류'}
                      </span>
                    </div>

                    {/* Column body */}
                    <div className="ma-col-body">
                      {/* Waiting dots */}
                      {isModelLoading && !hasDisplayContent && !result.thinking && (
                        <div className="ma-loading">
                          <div className="loading-dots"><span /><span /><span /></div>
                          <p>응답을 기다리는 중...</p>
                        </div>
                      )}

                      {/* Thinking animation */}
                      {isModelLoading && result.thinking && (
                        <div className="ma-thinking-wrap">
                          <span className="ma-thinking-brain">🧠</span>
                          <div className="ma-thinking-text">
                            <span>AI가 생각 중</span>
                            <div className="ma-thinking-dots"><span /><span /><span /></div>
                          </div>
                        </div>
                      )}

                      {/* Response content */}
                      {hasDisplayContent && (
                        <div className="ma-col-response">
                          <ReactMarkdown className="ma-markdown" remarkPlugins={[remarkGfm]}>
                            {result.display}
                          </ReactMarkdown>
                          {isModelLoading && <span className="ma-stream-cursor" />}
                        </div>
                      )}

                      {/* Error */}
                      {result.status === STATUS.ERROR && (
                        <div className="ma-error-content">
                          <p>{result.text}</p>
                        </div>
                      )}
                    </div>

                    {/* Score card */}
                    {result.status === STATUS.DONE && (
                      <div className="ma-score-card">
                        <div className="ma-score-item">
                          <span className="ma-score-icon">⏱</span>
                          <span className="ma-score-label">응답시간</span>
                          <span className="ma-score-value">{result.time}s</span>
                        </div>
                        <div className="ma-score-divider" />
                        <div className="ma-score-item">
                          <span className="ma-score-icon">📝</span>
                          <span className="ma-score-label">글자수</span>
                          <span className="ma-score-value">{result.text.length.toLocaleString()}</span>
                        </div>
                        <CopyButton text={result.text} className="copy-response" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Input area */}
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
