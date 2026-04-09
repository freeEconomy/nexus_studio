import React, { useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import './MultiAgent.css'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const MODELS = [
  {
    id: 'gemini',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    color: '#4285f4',
    icon: '🔵',
    fn: 'query-gemini',
  },
  {
    id: 'llama',
    name: 'Llama 3.3 70B',
    provider: 'Groq',
    color: '#f59e0b',
    icon: '🟡',
    fn: 'query-groq',
    model: 'llama-3.3-70b-versatile',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek V3',
    provider: 'Groq',
    color: '#10b981',
    icon: '🟢',
    fn: 'query-groq',
    model: 'deepseek-r1-distill-llama-70b',
  },
  {
    id: 'gemma',
    name: 'Gemma 3 27B',
    provider: 'Groq',
    color: '#8b5cf6',
    icon: '🟣',
    fn: 'query-groq',
    model: 'gemma2-9b-it',
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
  const [results, setResults] = useState(
    Object.fromEntries(MODELS.map(m => [m.id, { status: STATUS.IDLE, text: '', time: null }]))
  )
  const textareaRef = useRef(null)

  const isLoading = Object.values(results).some(r => r.status === STATUS.LOADING)
  const hasResults = Object.values(results).some(r => r.status === STATUS.DONE || r.status === STATUS.ERROR)

  const handleSubmit = async () => {
    if (!query.trim() || isLoading) return

    // 초기화
    setResults(Object.fromEntries(
      MODELS.map(m => [m.id, { status: STATUS.LOADING, text: '', time: null }])
    ))

    const startTimes = Object.fromEntries(MODELS.map(m => [m.id, Date.now()]))

    // 모든 모델에 동시 요청
    const promises = MODELS.map(async (model) => {
      try {
        const body = { query }
        if (model.model) body.model = model.model

        const data = await callEdgeFunction(model.fn, body)
        const elapsed = ((Date.now() - startTimes[model.id]) / 1000).toFixed(1)

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
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSubmit()
    }
  }

  const handleReset = () => {
    setQuery('')
    setResults(Object.fromEntries(MODELS.map(m => [m.id, { status: STATUS.IDLE, text: '', time: null }])))
  }

  const activeModel = MODELS.find(m => m.id === activeTab)
  const activeResult = results[activeTab]

  return (
    <div className="multi-agent">
      <div className="ma-header">
        <h1>🤖 멀티 에이전트</h1>
        <p>하나의 질문을 여러 AI 모델에 동시에 요청하고 결과를 비교합니다</p>
      </div>

      {/* 입력 영역 */}
      <div className="ma-input-area">
        <textarea
          ref={textareaRef}
          className="ma-textarea"
          placeholder="질문을 입력하세요... (Ctrl+Enter로 전송)"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          disabled={isLoading}
        />
        <div className="ma-input-actions">
          <span className="ma-hint">Ctrl + Enter로 전송</span>
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

      {/* 탭 + 결과 */}
      {(hasResults || isLoading) && (
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

            <div className="ma-result-body">
              {activeResult.status === STATUS.LOADING && (
                <div className="ma-loading">
                  <div className="loading-dots">
                    <span /><span /><span />
                  </div>
                  <p>응답을 기다리는 중...</p>
                </div>
              )}
              {activeResult.status === STATUS.DONE && (
                <div className="ma-markdown">
                  <ReactMarkdown>{activeResult.text}</ReactMarkdown>
                </div>
              )}
              {activeResult.status === STATUS.ERROR && (
                <div className="ma-error">
                  <span>⚠️</span>
                  <p>{activeResult.text}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
