import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { createChart } from 'lightweight-charts'
import './Stock.css'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// ── Constants ────────────────────────────────────────────
const USD_KRW = 1380

const TABS = [
  { id: 'dashboard',  label: '대시보드' },
  { id: 'us-stocks',  label: '미국주식' },
  { id: 'kr-stocks',  label: '국내주식' },
  { id: 'portfolio',  label: '내 포트폴리오' },
  { id: 'search',     label: '종목검색' },
]

const US_SECTORS = [
  { name: '반도체',   tickers: ['NVDA', 'AMD', 'AVGO'] },
  { name: 'AI/테크',  tickers: ['MSFT', 'GOOGL', 'META'] },
  { name: '에너지',   tickers: ['XOM', 'CVX', 'COP'] },
  { name: '금융',     tickers: ['JPM', 'BAC', 'GS'] },
  { name: '헬스케어', tickers: ['JNJ', 'PFE', 'UNH'] },
  { name: '소비재',   tickers: ['TSLA', 'NKE', 'MCD'] },
]

const KR_MAJOR = [
  { ticker: '005930', name: '삼성전자' },
  { ticker: '000660', name: 'SK하이닉스' },
  { ticker: '035420', name: 'NAVER' },
  { ticker: '005380', name: '현대차' },
  { ticker: '051910', name: 'LG화학' },
  { ticker: '068270', name: '셀트리온' },
  { ticker: '035720', name: '카카오' },
]

// ── Helpers ──────────────────────────────────────────────
const fmtPrice = (p, market) => {
  if (p == null || isNaN(p)) return 'N/A'
  if (market === 'KR') return `₩${Number(p).toLocaleString('ko-KR')}`
  return `$${Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const fmtPct = (p) => {
  if (p == null || isNaN(p)) return 'N/A'
  const sign = Number(p) >= 0 ? '+' : ''
  return `${sign}${Number(p).toFixed(2)}%`
}

const upDown = (p) => (Number(p) > 0 ? 'up' : Number(p) < 0 ? 'down' : 'flat')

const heatColor = (pct) => {
  if (pct == null) return { bg: '#374151', text: '#fff' }
  if (pct >= 3)    return { bg: '#991b1b', text: '#fff' }
  if (pct >= 1.5)  return { bg: '#dc2626', text: '#fff' }
  if (pct >= 0.3)  return { bg: '#f87171', text: '#fff' }
  if (pct >= 0)    return { bg: '#fca5a5', text: '#7f1d1d' }
  if (pct >= -0.3) return { bg: '#bfdbfe', text: '#1e3a5f' }
  if (pct >= -1.5) return { bg: '#3b82f6', text: '#fff' }
  if (pct >= -3)   return { bg: '#2563eb', text: '#fff' }
  return { bg: '#1d4ed8', text: '#fff' }
}

const calcDateRange = (period) => {
  const end = new Date()
  const start = new Date()
  if (period === '1M') start.setMonth(start.getMonth() - 1)
  else if (period === '3M') start.setMonth(start.getMonth() - 3)
  else if (period === '6M') start.setMonth(start.getMonth() - 6)
  else if (period === '1Y') start.setFullYear(start.getFullYear() - 1)
  else if (period === '2Y') start.setFullYear(start.getFullYear() - 2)
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  }
}

const toDateStr = (ts) => new Date(ts * 1000).toISOString().split('T')[0]

// ── Reusable Chart Widget ────────────────────────────────
function ChartWidget({ ticker, market, height = 300, type = 'candlestick', startDate, endDate }) {
  const containerRef = useRef(null)
  const [chartError, setChartError] = useState(null)
  const [chartEmpty, setChartEmpty] = useState(false)

  useEffect(() => {
    if (!containerRef.current || !ticker) return
    let destroyed = false
    setChartError(null)
    setChartEmpty(false)

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth || 600,
      height,
      layout: {
        background: { type: 'solid', color: '#ffffff' },
        textColor: '#64748b',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#f1f5f9' },
        horzLines: { color: '#f1f5f9' },
      },
      rightPriceScale: { borderColor: '#e2e8f0' },
      timeScale: { borderColor: '#e2e8f0', timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
    })

    let series
    if (type === 'area') {
      series = chart.addAreaSeries({
        lineColor: '#2563eb',
        topColor: 'rgba(37,99,235,0.22)',
        bottomColor: 'rgba(37,99,235,0)',
        lineWidth: 2,
      })
    } else {
      series = chart.addCandlestickSeries({
        upColor: '#dc2626',
        downColor: '#2563eb',
        borderUpColor: '#dc2626',
        borderDownColor: '#2563eb',
        wickUpColor: '#dc2626',
        wickDownColor: '#2563eb',
      })
    }

    const fn = market === 'US' ? 'stock-us-chart' : 'stock-kr-chart'
    supabase.functions
      .invoke(fn, { body: { ticker, period: 'D', startDate: startDate || '', endDate: endDate || '' } })
      .then(({ data, error }) => {
        if (destroyed) return
        if (error) { setChartError(error.message || '차트 로딩 실패'); return }
        if (data?.error) { setChartError(data.error); return }
        if (!Array.isArray(data) || data.length === 0) { setChartEmpty(true); return }
        const seen = new Set()
        const mapped = data
          .filter(d => d.time && d.close != null)
          .map(d => {
            const t = typeof d.time === 'number' ? toDateStr(d.time) : d.time
            return type === 'area'
              ? { time: t, value: d.close }
              : { time: t, open: d.open, high: d.high, low: d.low, close: d.close }
          })
          .filter(d => { if (seen.has(d.time)) return false; seen.add(d.time); return true })
          .sort((a, b) => (a.time > b.time ? 1 : -1))
        if (mapped.length > 0) {
          series.setData(mapped)
          chart.timeScale().fitContent()
        } else {
          setChartEmpty(true)
        }
      })
      .catch(e => { if (!destroyed) setChartError(e.message) })

    const ro = new ResizeObserver(entries => {
      if (destroyed) return
      const w = entries[0]?.contentRect?.width
      if (w) chart.applyOptions({ width: w })
    })
    ro.observe(containerRef.current)

    return () => {
      destroyed = true
      ro.disconnect()
      chart.remove()
    }
  }, [ticker, market, startDate, endDate, type, height])

  if (chartError) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: 13 }}>
      차트 오류: {chartError}
    </div>
  )
  if (chartEmpty) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
      차트 데이터 없음
    </div>
  )
  return <div ref={containerRef} style={{ width: '100%', minHeight: height }} />
}

// ── Spinner ──────────────────────────────────────────────
function Spinner() {
  return (
    <div className="spinner">
      <div className="spin-ring" />
    </div>
  )
}

// ── Period Buttons ───────────────────────────────────────
function PeriodBtns({ value, onChange, options = ['1M', '3M', '6M', '1Y'] }) {
  return (
    <div className="period-btns">
      {options.map(p => (
        <button
          key={p}
          className={`period-btn ${value === p ? 'active' : ''}`}
          onClick={() => onChange(p)}
        >{p}</button>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  MAIN STOCK PAGE
// ═══════════════════════════════════════════════════════
export default function Stock() {
  const [activeTab, setActiveTab] = useState('dashboard')

  const content = {
    dashboard: <DashboardTab />,
    'us-stocks': <USStocksTab />,
    'kr-stocks': <KRStocksTab />,
    portfolio: <PortfolioTab />,
    search: <SearchTab />,
  }

  return (
    <div className="stock-page">
      <nav className="stock-nav">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`snav-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="stock-body">{content[activeTab]}</div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  DASHBOARD TAB
// ═══════════════════════════════════════════════════════
function DashboardTab() {
  const [indices, setIndices] = useState([])
  const [portfolio, setPortfolio] = useState([])
  const [news, setNews] = useState('')
  const [loading, setLoading] = useState(true)
  const [chartPeriod, setChartPeriod] = useState('1M')

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    const [usIdx, krIdx, pfRes, newsRes] = await Promise.allSettled([
      supabase.functions.invoke('stock-us-index', { body: {} }),
      supabase.functions.invoke('stock-kr-index', { body: {} }),
      supabase.from('portfolio').select('*').limit(8),
      supabase.functions.invoke('query-tavily', {
        body: {
          query: 'global stock market major news today S&P500 NASDAQ',
          summarize: true,
          lang: 'ko',
        },
      }),
    ])

    const usData = usIdx.status === 'fulfilled' ? (usIdx.value.data || []) : []
    const krData = krIdx.status === 'fulfilled' ? (krIdx.value.data || []) : []
    setIndices([...usData, ...krData])

    if (pfRes.status === 'fulfilled' && !pfRes.value.error) {
      const rows = pfRes.value.data || []
      const withPx = await Promise.allSettled(
        rows.map(async s => {
          const fn = s.market === 'US' ? 'stock-us-quote' : 'stock-kr-quote'
          const { data: q } = await supabase.functions.invoke(fn, { body: { ticker: s.ticker } })
          const price = s.market === 'US' ? q?.c : q?.price
          const pct = price ? ((price - s.avg_price) / s.avg_price * 100) : 0
          return { ...s, currentPrice: price, changePercent: pct }
        })
      )
      setPortfolio(withPx.filter(r => r.status === 'fulfilled').map(r => r.value))
    }

    if (newsRes.status === 'fulfilled') {
      setNews(newsRes.value.data?.result || '')
    }
    setLoading(false)
  }

  const { startDate, endDate } = calcDateRange(chartPeriod)

  return (
    <div className="dash-tab">
      <div className="dash-header">
        <h1 className="dash-title">Markets</h1>
        <span className="dash-time">
          {new Date().toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* Index cards */}
          <div className="idx-grid">
            {indices.map((idx, i) => {
              const pct = parseFloat(idx.change)
              const val = typeof idx.value === 'number'
                ? idx.value.toLocaleString('en-US', { maximumFractionDigits: 2 })
                : idx.value
              return (
                <div key={i} className={`idx-card ${upDown(pct)}`}>
                  <span className="idx-name">{idx.name}</span>
                  <span className="idx-value">{val}</span>
                  <span className="idx-change">{fmtPct(pct)} {pct >= 0 ? '▲' : '▼'}</span>
                </div>
              )
            })}
          </div>

          {/* Market chart */}
          <div className="dash-card">
            <div className="card-header">
              <h3 className="card-title">S&amp;P 500 (SPY) 시장 추이</h3>
              <PeriodBtns value={chartPeriod} onChange={setChartPeriod} />
            </div>
            <ChartWidget
              key={`spy-${chartPeriod}`}
              ticker="SPY"
              market="US"
              height={240}
              type="area"
              startDate={startDate}
              endDate={endDate}
            />
          </div>

          {/* Bottom row */}
          <div className="dash-row2">
            <div className="dash-card">
              <h3 className="card-title">보유종목 요약</h3>
              <div className="pf-mini-list">
                {portfolio.length === 0 ? (
                  <p className="empty-msg">포트폴리오 데이터가 없습니다</p>
                ) : portfolio.map((s, i) => (
                  <div key={i} className={`pf-mini-item ${upDown(s.changePercent)}`}>
                    <span className="pf-mini-ticker">{s.name || s.ticker}</span>
                    <span className="pf-mini-mkt">{s.market}</span>
                    <span className={`pf-mini-pct ${upDown(s.changePercent)}`}>{fmtPct(s.changePercent)}</span>
                    <span className="pf-mini-arrow">{s.changePercent >= 0 ? '▲' : '▼'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="dash-card">
              <h3 className="card-title">오늘의 뉴스 (AI 요약)</h3>
              <div className="news-body">
                {news
                  ? news.split('\n').filter(l => l.trim()).map((l, i) => (
                    <p key={i} className="news-line">{l}</p>
                  ))
                  : <p className="empty-msg">뉴스 로딩 중...</p>
                }
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  US STOCKS TAB
// ═══════════════════════════════════════════════════════
function USStocksTab() {
  const [sectors, setSectors] = useState([])
  const [allStocks, setAllStocks] = useState([])
  const [news, setNews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    const allTickers = US_SECTORS.flatMap(s => s.tickers)

    const quoteResults = await Promise.allSettled(
      allTickers.map(ticker =>
        supabase.functions.invoke('stock-us-quote', { body: { ticker } }).then(r => ({ ticker, ...r.data }))
      )
    )

    const priceMap = {}
    quoteResults.forEach(r => {
      if (r.status === 'fulfilled' && r.value.ticker) {
        priceMap[r.value.ticker] = r.value
      }
    })

    const sectorData = US_SECTORS.map(sec => {
      const stocks = sec.tickers.map(t => priceMap[t]).filter(Boolean)
      const avgDp = stocks.length > 0
        ? stocks.reduce((s, q) => s + (q.dp || 0), 0) / stocks.length
        : null
      return { ...sec, avgDp, stocks: sec.tickers.map(t => ({ ticker: t, ...priceMap[t] })) }
    })
    setSectors(sectorData)

    const flat = Object.values(priceMap)
    setAllStocks(flat)

    // News from Finnhub
    const { data: newsData } = await supabase.functions.invoke('stock-us-news', { body: { ticker: 'AAPL' } })
    setNews(newsData?.news?.slice(0, 8) || [])
    setLoading(false)
  }

  const gainers = [...allStocks].sort((a, b) => (b.dp || 0) - (a.dp || 0)).slice(0, 5)
  const losers  = [...allStocks].sort((a, b) => (a.dp || 0) - (b.dp || 0)).slice(0, 5)

  return (
    <div className="us-tab">
      <h2 className="tab-title">US Markets</h2>
      {loading ? <Spinner /> : (
        <>
          {/* Sector Heatmap */}
          <div className="dash-card">
            <h3 className="card-title">섹터별 히트맵</h3>
            <div className="heatmap-grid">
              {sectors.map(sec => {
                const { bg, text } = heatColor(sec.avgDp)
                return (
                  <div key={sec.name} className="heat-card" style={{ background: bg, color: text }}>
                    <div className="heat-sector">{sec.name}</div>
                    <div className="heat-pct">{sec.avgDp != null ? fmtPct(sec.avgDp) : '—'}</div>
                    <div className="heat-tickers">
                      {sec.stocks.map(s => (
                        <span key={s.ticker} className="heat-tick">
                          {s.ticker} <small>{s.dp != null ? fmtPct(s.dp) : ''}</small>
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Gainers / Losers */}
          <div className="gl-grid">
            <div className="dash-card">
              <h3 className="card-title" style={{ color: '#dc2626' }}>급등 TOP 5 ▲</h3>
              {gainers.map(s => (
                <div key={s.ticker} className="gl-row">
                  <span className="gl-ticker">{s.ticker}</span>
                  <span className="gl-price">${s.c?.toFixed(2) ?? '—'}</span>
                  <span className="gl-pct up">{fmtPct(s.dp)}</span>
                </div>
              ))}
            </div>
            <div className="dash-card">
              <h3 className="card-title" style={{ color: '#2563eb' }}>급락 TOP 5 ▼</h3>
              {losers.map(s => (
                <div key={s.ticker} className="gl-row">
                  <span className="gl-ticker">{s.ticker}</span>
                  <span className="gl-price">${s.c?.toFixed(2) ?? '—'}</span>
                  <span className="gl-pct down">{fmtPct(s.dp)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* News Feed */}
          <div className="dash-card">
            <h3 className="card-title">Finnhub 실시간 뉴스</h3>
            <div className="news-feed">
              {news.length === 0
                ? <p className="empty-msg">뉴스를 불러올 수 없습니다</p>
                : news.map((item, i) => {
                  const dt = new Date(item.datetime * 1000)
                  const bullish = item.sentiment?.bullishPercent
                  const sentiment = bullish == null ? null : bullish > 0.6 ? 'positive' : bullish < 0.4 ? 'negative' : 'neutral'
                  return (
                    <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className="news-item">
                      <div className="news-meta">
                        <span className="news-source">{item.source}</span>
                        <span className="news-dt">{dt.toLocaleDateString('ko-KR')}</span>
                        {sentiment && (
                          <span className={`sentiment-badge ${sentiment}`}>
                            {sentiment === 'positive' ? '긍정' : sentiment === 'negative' ? '부정' : '중립'}
                          </span>
                        )}
                      </div>
                      <p className="news-headline">{item.headline}</p>
                    </a>
                  )
                })
              }
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  KR STOCKS TAB
// ═══════════════════════════════════════════════════════
function KRStocksTab() {
  const [indices, setIndices] = useState([])
  const [stocks, setStocks] = useState([])
  const [news, setNews] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    const [idxRes, newsRes] = await Promise.allSettled([
      supabase.functions.invoke('stock-kr-index', { body: {} }),
      supabase.functions.invoke('query-tavily', {
        body: {
          query: '한국 코스피 코스닥 주요 뉴스 오늘 KOSPI KOSDAQ',
          summarize: true,
          lang: 'ko',
        },
      }),
    ])

    if (idxRes.status === 'fulfilled') setIndices(idxRes.value.data || [])
    if (newsRes.status === 'fulfilled') setNews(newsRes.value.data?.result || '')

    const stockResults = await Promise.allSettled(
      KR_MAJOR.map(s =>
        supabase.functions.invoke('stock-kr-quote', { body: { ticker: s.ticker } })
          .then(r => ({ ...s, ...(r.data || {}) }))
      )
    )
    setStocks(stockResults.filter(r => r.status === 'fulfilled').map(r => r.value))
    setLoading(false)
  }

  return (
    <div className="kr-tab">
      <h2 className="tab-title">KR Markets</h2>
      {loading ? <Spinner /> : (
        <>
          {/* KOSPI / KOSDAQ */}
          <div className="idx-grid kr-idx-grid">
            {indices.map((idx, i) => {
              const pct = parseFloat(idx.change)
              return (
                <div key={i} className={`idx-card idx-card-lg ${upDown(pct)}`}>
                  <span className="idx-name">{idx.name}</span>
                  <span className="idx-value">
                    {typeof idx.value === 'number' ? idx.value.toLocaleString() : idx.value}
                  </span>
                  <span className="idx-change">{fmtPct(pct)} {pct >= 0 ? '▲' : '▼'}</span>
                </div>
              )
            })}
          </div>

          {/* Sector bar chart */}
          <div className="dash-card">
            <h3 className="card-title">업종별 등락률 (주요 종목 기준)</h3>
            <div className="sector-bars">
              {stocks.map(s => {
                const pct = s.changePercent || 0
                const barW = Math.min(Math.abs(pct) * 15, 100)
                return (
                  <div key={s.ticker} className="sb-row">
                    <span className="sb-name">{s.name}</span>
                    <div className="sb-track">
                      <div className={`sb-fill ${upDown(pct)}`} style={{ width: `${barW}%` }} />
                    </div>
                    <span className={`sb-pct ${upDown(pct)}`}>{fmtPct(pct)}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* KIS Real-time quotes */}
          <div className="dash-card">
            <h3 className="card-title">KIS API 실시간 시세</h3>
            <div className="kr-table">
              <div className="krt-head">
                <span>종목</span>
                <span>현재가</span>
                <span>전일비</span>
                <span>등락률</span>
                <span>거래량</span>
                <span>52주 고/저</span>
              </div>
              {stocks.map(s => (
                <div key={s.ticker} className={`krt-row ${upDown(s.changePercent)}`}>
                  <span className="krt-name">
                    {s.name}
                    <small>{s.ticker}</small>
                  </span>
                  <span className="krt-price">₩{s.price?.toLocaleString('ko-KR') ?? '—'}</span>
                  <span className={`krt-chg ${upDown(s.changePercent)}`}>
                    {s.change >= 0 ? '+' : ''}{s.change?.toLocaleString('ko-KR') ?? '—'}
                  </span>
                  <span className={`krt-pct ${upDown(s.changePercent)}`}>{fmtPct(s.changePercent)}</span>
                  <span className="krt-vol">{s.volume?.toLocaleString('ko-KR') ?? '—'}</span>
                  <span className="krt-52">
                    {s.high52 ? `↑${s.high52?.toLocaleString('ko-KR')}` : '—'} / {s.low52 ? `↓${s.low52?.toLocaleString('ko-KR')}` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* News */}
          <div className="dash-card">
            <h3 className="card-title">국내 주요 뉴스 (AI)</h3>
            <div className="news-body">
              {news
                ? news.split('\n').filter(l => l.trim()).map((l, i) => (
                  <p key={i} className="news-line">{l}</p>
                ))
                : <p className="empty-msg">뉴스 로딩 중...</p>
              }
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  PORTFOLIO TAB
// ═══════════════════════════════════════════════════════
function PortfolioTab() {
  const [portfolios, setPortfolios] = useState([])
  const [stocks, setStocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [selected, setSelected] = useState(null)
  const [chartPeriod, setChartPeriod] = useState('1M')
  const [aiData, setAiData] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    const [{ data: pfRows }, { data: stockRows, error }] = await Promise.all([
      supabase.from('portfolios').select('*').order('id'),
      supabase.from('portfolio').select('*'),
    ])
    setPortfolios(pfRows?.length ? pfRows : [
      { id: 1, name: '포트폴리오 1' },
      { id: 2, name: '포트폴리오 2' },
      { id: 3, name: '포트폴리오 3' },
    ])
    if (!error && stockRows) {
      const withPx = await Promise.allSettled(
        stockRows.map(async s => {
          const fn = s.market === 'US' ? 'stock-us-quote' : 'stock-kr-quote'
          const { data: q } = await supabase.functions.invoke(fn, { body: { ticker: s.ticker } })
          const price = s.market === 'US' ? q?.c : q?.price
          const pct = price ? ((price - s.avg_price) / s.avg_price * 100) : 0
          return { ...s, currentPrice: price, changePercent: pct }
        })
      )
      setStocks(withPx.filter(r => r.status === 'fulfilled').map(r => r.value))
    }
    setLoading(false)
  }

  const saveName = async (id) => {
    setPortfolios(pfs => pfs.map(p => p.id === id ? { ...p, name: editName } : p))
    await supabase.from('portfolios').update({ name: editName }).eq('id', id)
    setEditingId(null)
  }

  const handleCardClick = async (stock) => {
    setSelected(stock)
    setAiData(null)
    setAiLoading(true)
    const { data } = await supabase.functions.invoke('stock-ai-analyze', {
      body: { ticker: stock.ticker, market: stock.market },
    })
    setAiData(data || null)
    setAiLoading(false)
  }

  const getColStats = useCallback((pfId) => {
    const col = stocks.filter(s => s.portfolio_id === pfId)
    const usTotal = col.filter(s => s.market === 'US').reduce((sum, s) => sum + s.quantity * (s.currentPrice || s.avg_price), 0)
    const krTotal = col.filter(s => s.market === 'KR').reduce((sum, s) => sum + s.quantity * (s.currentPrice || s.avg_price), 0)
    return { col, usTotal, krTotal, totalKRW: usTotal * USD_KRW + krTotal }
  }, [stocks])

  const { startDate, endDate } = calcDateRange(chartPeriod)

  return (
    <div className="pf-tab">
      {loading ? <Spinner /> : (
        <div className="pf-multi-cols">
          {portfolios.map(pf => {
            const { col, usTotal, krTotal, totalKRW } = getColStats(pf.id)
            return (
              <div key={pf.id} className="pf-col">
                <div className="pf-col-hdr">
                  {editingId === pf.id ? (
                    <input
                      className="pf-col-name-input"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={() => saveName(pf.id)}
                      onKeyDown={e => e.key === 'Enter' && saveName(pf.id)}
                      autoFocus
                    />
                  ) : (
                    <span
                      className="pf-col-name"
                      onClick={() => { setEditingId(pf.id); setEditName(pf.name) }}
                    >{pf.name} <span className="pf-col-edit-icon">✎</span></span>
                  )}
                  <div className="pf-col-total">
                    ₩{totalKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}
                  </div>
                  <div className="pf-col-subs">
                    <span>🇺🇸 ${usTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                    <span>🇰🇷 ₩{krTotal.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
                <div className="pf-col-stocks">
                  {col.length === 0 ? (
                    <p className="empty-msg" style={{ padding: '1.5rem', textAlign: 'center' }}>종목 없음</p>
                  ) : col.map(s => (
                    <div
                      key={s.id}
                      className={`pf-col-card ${upDown(s.changePercent)} ${selected?.id === s.id ? 'selected' : ''}`}
                      onClick={() => handleCardClick(s)}
                    >
                      <div className="pfc-header">
                        <div className="pfc-ticker-wrap">
                          <span className="pfc-ticker">{s.ticker}</span>
                          {s.name && <span className="pfc-name">{s.name}</span>}
                        </div>
                        <span className={`pfc-pct ${upDown(s.changePercent)}`}>{fmtPct(s.changePercent)}</span>
                      </div>
                      <div className="pfc-row">
                        <span className="pfc-label">수량</span>
                        <span className="pfc-val">{s.quantity}주</span>
                      </div>
                      <div className="pfc-row">
                        <span className="pfc-label">현재가</span>
                        <span className="pfc-val">{fmtPrice(s.currentPrice, s.market)}</span>
                      </div>
                      <div className="pfc-row">
                        <span className="pfc-label">평가금액</span>
                        <span className="pfc-val pfc-eval">
                          {fmtPrice(s.quantity * (s.currentPrice || s.avg_price), s.market)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <div className="pf-detail">
          <div className="pf-detail-hdr">
            <div>
              <h3>{selected.ticker} 차트</h3>
              <small style={{ color: '#94a3b8' }}>{selected.market === 'US' ? '미국주식' : '국내주식'}</small>
            </div>
            <PeriodBtns value={chartPeriod} onChange={setChartPeriod} />
          </div>
          <ChartWidget
            key={`${selected.ticker}-${chartPeriod}`}
            ticker={selected.ticker}
            market={selected.market}
            height={260}
            type="candlestick"
            startDate={startDate}
            endDate={endDate}
          />
          <div className="ai-panel">
            <h4>AI 분석 코멘트</h4>
            {aiLoading ? <Spinner /> : aiData ? (
              <div className="ai-blocks">
                <div className="ai-block">
                  <span className="ai-badge qwen">Qwen3 · 수치 분석</span>
                  <p>{aiData.analysis || '—'}</p>
                </div>
                <div className="ai-block">
                  <span className="ai-badge compound">Tavily · 뉴스 요약</span>
                  <p>{aiData.newsSummary || '—'}</p>
                </div>
              </div>
            ) : (
              <p className="empty-msg">종목 카드를 클릭하면 AI 분석이 표시됩니다</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  SEARCH TAB
// ═══════════════════════════════════════════════════════
function SearchTab() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const doSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setSearched(false)
    setDetail(null)
    const [usRes, krRes] = await Promise.allSettled([
      supabase.functions.invoke('stock-us-search', { body: { query } }),
      supabase.functions.invoke('stock-kr-search', { body: { query } }),
    ])
    const us = usRes.status === 'fulfilled' && Array.isArray(usRes.value.data)
      ? usRes.value.data.map(s => ({ ...s, market: 'US' })) : []
    const kr = krRes.status === 'fulfilled' && Array.isArray(krRes.value.data)
      ? krRes.value.data.map(s => ({ ...s, market: 'KR' })) : []
    setResults([...us.slice(0, 6), ...kr.slice(0, 6)])
    setSearched(true)
    setSearching(false)
  }

  const selectStock = async (stock) => {
    setDetailLoading(true)
    const ticker = stock.symbol || stock.ticker
    const market = stock.market
    const fn = market === 'US' ? 'stock-us-quote' : 'stock-kr-quote'

    const [quoteRes, newsRes, aiRes] = await Promise.allSettled([
      supabase.functions.invoke(fn, { body: { ticker } }),
      market === 'US'
        ? supabase.functions.invoke('stock-us-news', { body: { ticker } })
        : Promise.resolve({ data: { news: [] } }),
      supabase.functions.invoke('stock-ai-analyze', { body: { ticker, market } }),
    ])

    const quote = quoteRes.status === 'fulfilled' ? (quoteRes.value.data || {}) : {}
    const news  = newsRes.status === 'fulfilled'  ? (newsRes.value.data?.news?.slice(0, 5) || []) : []
    const ai    = aiRes.status === 'fulfilled'    ? (aiRes.value.data || {}) : {}

    // Compute 52W for US stocks from 1-year weekly chart
    let high52 = quote.high52 ?? null
    let low52  = quote.low52  ?? null
    if (market === 'US' && !high52) {
      try {
        const { startDate: s, endDate: e } = calcDateRange('1Y')
        const { data: chartData } = await supabase.functions.invoke('stock-us-chart', {
          body: { ticker, period: 'W', startDate: s, endDate: e },
        })
        if (Array.isArray(chartData) && chartData.length > 0) {
          high52 = Math.max(...chartData.map(d => d.high))
          low52  = Math.min(...chartData.map(d => d.low))
        }
      } catch {}
    }

    setDetail({
      ticker,
      name: stock.description || stock.name || ticker,
      market,
      quote,
      news,
      ai,
      high52,
      low52,
    })
    setDetailLoading(false)
  }

  const q = detail?.quote || {}
  const price = detail?.market === 'US' ? q.c : q.price
  const pct   = detail?.market === 'US' ? q.dp : q.changePercent
  const dayH  = detail?.market === 'US' ? q.h  : null
  const dayL  = detail?.market === 'US' ? q.l  : null
  const vol   = q.volume ?? null
  const per   = q.per ?? null
  const pbr   = q.pbr ?? null

  const { startDate: c3m, endDate: c3me } = calcDateRange('3M')

  return (
    <div className="search-tab">
      {/* Search bar */}
      <div className={`search-bar ${query ? 'focused' : ''}`}>
        <span className="search-icon">🔍</span>
        <input
          type="text"
          className="search-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doSearch()}
          placeholder="종목명 또는 티커 입력 (예: NVDA, 삼성전자, 005930)"
        />
        <button className="search-btn" onClick={doSearch} disabled={searching}>
          {searching ? '검색 중...' : '검색'}
        </button>
      </div>

      {/* Result list */}
      {!detail && searched && (
        results.length > 0 ? (
          <div className="sr-list">
            {results.map((s, i) => (
              <div key={i} className="sr-item" onClick={() => selectStock(s)}>
                <div className="sr-left">
                  <span className="sr-ticker">{s.symbol || s.ticker}</span>
                  <span className="sr-name">{s.description || s.name}</span>
                </div>
                <span className={`sr-badge ${s.market === 'US' ? 'us' : 'kr'}`}>{s.market}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-msg" style={{ marginTop: '2rem', textAlign: 'center' }}>
            "{query}" 검색 결과가 없습니다
          </p>
        )
      )}

      {detailLoading && <Spinner />}

      {/* Detail view */}
      {detail && !detailLoading && (
        <div className="stock-detail">
          <button className="back-btn" onClick={() => setDetail(null)}>← 검색 결과로</button>

          {/* Header */}
          <div className="sd-head dash-card">
            <div className="sd-head-left">
              <h2 className="sd-name">{detail.name}</h2>
              <div className="sd-badges">
                <span className="sr-badge sd-market-badge">{detail.market === 'US' ? 'US' : 'KR'}</span>
                <span className="sd-ticker-tag">{detail.ticker}</span>
              </div>
            </div>
            <div className="sd-head-right">
              <span className="sd-price">{fmtPrice(price, detail.market)}</span>
              <span className={`sd-pct ${upDown(pct)}`}>{fmtPct(pct)} {Number(pct) >= 0 ? '▲' : '▼'}</span>
            </div>
          </div>

          {/* Metrics */}
          <div className="sd-metrics">
            {detail.market === 'US' && (
              <>
                <MetricCard label="당일 고가" value={dayH ? `$${dayH.toFixed(2)}` : 'N/A'} />
                <MetricCard label="당일 저가" value={dayL ? `$${dayL.toFixed(2)}` : 'N/A'} />
              </>
            )}
            <MetricCard label="52주 고가" value={detail.high52 ? fmtPrice(detail.high52, detail.market) : 'N/A'} />
            <MetricCard label="52주 저가" value={detail.low52  ? fmtPrice(detail.low52,  detail.market) : 'N/A'} />
            <MetricCard label="거래량" value={vol ? Number(vol).toLocaleString() : 'N/A'} />
            <MetricCard label="PER" value={per != null && !isNaN(per) ? Number(per).toFixed(2) : 'N/A'} />
            <MetricCard label="PBR" value={pbr != null && !isNaN(pbr) ? Number(pbr).toFixed(2) : 'N/A'} />
          </div>

          {/* Chart */}
          <div className="dash-card sd-chart">
            <h3 className="card-title">{detail.ticker} 차트 (3개월)</h3>
            <ChartWidget
              ticker={detail.ticker}
              market={detail.market}
              height={240}
              type="candlestick"
              startDate={c3m}
              endDate={c3me}
            />
          </div>

          {/* News */}
          {detail.news.length > 0 && (
            <div className="dash-card">
              <h3 className="card-title">관련 뉴스 (Finnhub)</h3>
              <div className="news-feed">
                {detail.news.map((n, i) => (
                  <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className="news-item">
                    <div className="news-meta">
                      <span className="news-source">{n.source}</span>
                      <span className="news-dt">{new Date(n.datetime * 1000).toLocaleDateString('ko-KR')}</span>
                    </div>
                    <p className="news-headline">{n.headline}</p>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* AI Analysis */}
          <div className="dash-card">
            <h3 className="card-title">AI 종목 분석</h3>
            <div className="ai-blocks">
              <div className="ai-block">
                <span className="ai-badge qwen">Qwen3 · 수치 분석</span>
                <p>{detail.ai?.analysis || '분석 데이터 없음'}</p>
              </div>
              <div className="ai-block">
                <span className="ai-badge compound">Tavily · 최신 뉴스 요약</span>
                <p>{detail.ai?.newsSummary || '뉴스 요약 없음'}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value }) {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <span className="metric-val">{value}</span>
    </div>
  )
}
