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
    model: 'groq/compound-mini',  // ← compound → compound-mini
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

const STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  DONE: 'done',
  ERROR: 'error',
}

async function callEdgeFunction(fnName, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `HTTP ${res.status}`)
  }
  return res.json()
}

export default function MultiAgent() {
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState(MODELS[0].id)
  // 각 모델별 대화 내역 (messages 배열)
  const [histories, setHistories] = useState(
    Object.fromEntries(MODELS.map(m => [m.id, []]))
  )
  // 각 모델별 응답 상태
  const [results, setResults] = useState(
    Object.fromEntries(MODELS.map(m => [m.id, { status: STATUS.IDLE, text: '', time: null }]))
  )
  const textareaRef = useRef(null)
  const chatContainerRef = useRef(null)

  const isLoading = Object.values(results).some(r => r.status === STATUS.LOADING)
  const hasResults = Object.values(results).some(r => r.status === STATUS.DONE || r.status === STATUS.ERROR)

  // 페이지 로드 시 입력창에 자동 포커스
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  // 채팅 컨테이너 자동 스크롤
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [results, histories, activeTab])

  const handleSubmit = async () => {
    if (!query.trim() || isLoading) return

    const userMessage = query.trim()

    // 초기화
    setResults(Object.fromEntries(
      MODELS.map(m => [m.id, { status: STATUS.LOADING, text: '', time: null }])
    ))

    const startTimes = Object.fromEntries(MODELS.map(m => [m.id, Date.now()]))

    // 모든 모델에 동시 요청
    const promises = MODELS.map(async (model) => {
      try {
        const history = histories[model.id]
        // 대화 내역에 현재 사용자 메시지 포함
        const messages = [{ role: 'user', content: userMessage }]

        const body = { messages }
        if (model.model) body.model = model.model

        const data = await callEdgeFunction(model.fn, body)
        const elapsed = ((Date.now() - startTimes[model.id]) / 1000).toFixed(1)

        // 대화 내역 업데이트 (사용자 메시지 + AI 응답)
        setHistories(prev => ({
          ...prev,
          [model.id]: [...messages, { role: 'assistant', content: data.result }]
        }))

        setResults(prev => ({
          ...prev,
          [model.id]: { status: STATUS.DONE, text: data.result, time: elapsed },
        }))
      } catch (err) {
        const elapsed = ((Date.now() - startTimes[model.id]) / 1000).toFixed(1)
        setResults(prev => ({
          ...prev,
          [model.id]: { status: STATUS.ERROR, text: err.message, time: elapsed },
        }))
      }
    })

    await Promise.allSettled(promises)
    setQuery('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      // Shift+Enter: 줄바꿈 허용 (기본 동작)
      if (e.shiftKey) {
        return
      }
      // Enter만 누르면 전송
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleReset = () => {
    setQuery('')
    setHistories(Object.fromEntries(MODELS.map(m => [m.id, []])))
    setResults(Object.fromEntries(MODELS.map(m => [m.id, { status: STATUS.IDLE, text: '', time: null }])))
  }

  const activeModel = MODELS.find(m => m.id === activeTab)
  const activeResult = results[activeTab]
  const activeHistory = histories[activeTab]

  return (
    <div className="multi-agent">
      <div className="ma-header">
        <h1>🤖 멀티 AI</h1>
        <p>하나의 질문을 여러 AI 모델에 동시에 요청하고 결과를 비교합니다</p>
      </div>

      {/* 탭 + 결과 (채팅 형태) */}
      {(hasResults || isLoading || activeHistory.length > 0) && (
        <div className="ma-results">
          {/* 탭 헤더 */}
          <div className="ma-tabs">
            {MODELS.map(model => {
              const r = results[model.id]
              const h = histories[model.id]
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

          {/* 탭 콘텐츠 (채팅 형태) */}
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

            {/* 채팅 내역 */}
            <div className="ma-chat-container" ref={chatContainerRef}>
              {activeHistory.length === 0 && activeResult.status === STATUS.LOADING && (
                <div className="ma-loading">
                  <div className="loading-dots">
                    <span /><span /><span />
                  </div>
                  <p>응답을 기다리는 중...</p>
                </div>
              )}

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

              {activeResult.status === STATUS.ERROR && (
                <div className="ma-chat-message error">
                  <div className="ma-chat-role">⚠️ 오류</div>
                  <div className="ma-chat-content">
                    <p>{activeResult.text}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 입력 영역 (하단 고정) */}
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
            {hasResults && (
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