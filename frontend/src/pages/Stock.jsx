import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { createChart } from 'lightweight-charts'
import './Stock.css'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

const TABS = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'portfolio', label: '내 포트폴리오' },
  { id: 'us-stocks', label: '미국주식' },
  { id: 'kr-stocks', label: '국내주식' },
  { id: 'earnings',  label: '실적발표' },
  { id: 'search',    label: '종목검색' },
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

const US_NAME_MAP = {
  NVDA:'엔비디아',AAPL:'애플',MSFT:'마이크로소프트',GOOGL:'알파벳',
  GOOG:'알파벳',META:'메타',AMZN:'아마존',TSLA:'테슬라',
  AVGO:'브로드컴',AMD:'AMD',INTC:'인텔',MU:'마이크론',
  QCOM:'퀄컴',ARM:'ARM',AMAT:'어플라이드머티리얼',LRCX:'램리서치',
  KLAC:'KLA',MRVL:'마벨테크놀로지',SMCI:'슈퍼마이크로',
  JPM:'JP모건',BAC:'뱅크오브아메리카',GS:'골드만삭스',
  MS:'모건스탠리',WFC:'웰스파고',C:'씨티그룹',
  JNJ:'존슨앤존슨',PFE:'화이자',UNH:'유나이티드헬스',
  ABBV:'애브비',MRK:'머크',XOM:'엑슨모빌',CVX:'쉐브론',COP:'코노코필립스',
  WMT:'월마트',COST:'코스트코',TGT:'타겟',NKE:'나이키',MCD:'맥도날드',
  NFLX:'넷플릭스',DIS:'디즈니',SPOT:'스포티파이',
  TSM:'TSMC',ASML:'ASML',PLTR:'팔란티어',
  SNOW:'스노우플레이크',CRM:'세일즈포스',ORCL:'오라클',SAP:'SAP',
}

/* ── helpers ── */
const fmtPrice = (p, market) => {
  if (p == null || isNaN(p)) return 'N/A'
  return market === 'KR'
    ? `₩${Number(p).toLocaleString('ko-KR')}`
    : `$${Number(p).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })}`
}
const fmtPct = p => {
  if (p == null || isNaN(p)) return 'N/A'
  const s = Number(p) >= 0 ? '+' : ''
  return `${s}${Number(p).toFixed(2)}%`
}
const fmtVol = v => {
  if (v == null) return '—'
  const n = Number(v)
  if (n >= 1e8) return `${(n/1e8).toFixed(1)}억주`
  if (n >= 1e4) return `${(n/1e4).toFixed(1)}만주`
  return n.toLocaleString('ko-KR') + '주'
}
const upDown = p => Number(p) > 0 ? 'up' : Number(p) < 0 ? 'down' : 'flat'
const heatColor = pct => {
  if (pct == null) return { bg:'#374151', text:'#fff' }
  if (pct >= 3)    return { bg:'#991b1b', text:'#fff' }
  if (pct >= 1.5)  return { bg:'#dc2626', text:'#fff' }
  if (pct >= 0.3)  return { bg:'#f87171', text:'#fff' }
  if (pct >= 0)    return { bg:'#fca5a5', text:'#7f1d1d' }
  if (pct >= -0.3) return { bg:'#bfdbfe', text:'#1e3a5f' }
  if (pct >= -1.5) return { bg:'#3b82f6', text:'#fff' }
  if (pct >= -3)   return { bg:'#2563eb', text:'#fff' }
  return { bg:'#1d4ed8', text:'#fff' }
}
const calcDateRange = period => {
  const end = new Date(), start = new Date()
  if (period === '1M') start.setMonth(start.getMonth()-1)
  else if (period === '3M') start.setMonth(start.getMonth()-3)
  else if (period === '6M') start.setMonth(start.getMonth()-6)
  else if (period === '1Y') start.setFullYear(start.getFullYear()-1)
  else if (period === '2Y') start.setFullYear(start.getFullYear()-2)
  return { startDate: start.toISOString().split('T')[0], endDate: end.toISOString().split('T')[0] }
}
const toDateStr = ts => new Date(ts*1000).toISOString().split('T')[0]

/* ── ChartWidget ── */
function ChartWidget({ ticker, market, height=300, type='candlestick', startDate, endDate }) {
  const ref = useRef(null)
  const [err, setErr] = useState(null)
  const [empty, setEmpty] = useState(false)
  useEffect(() => {
    if (!ref.current || !ticker) return
    let dead = false; setErr(null); setEmpty(false)
    const chart = createChart(ref.current, {
      width: ref.current.clientWidth || 600, height,
      layout:{ background:{type:'solid',color:'#ffffff'}, textColor:'#64748b', fontSize:11 },
      grid:{ vertLines:{color:'#f1f5f9'}, horzLines:{color:'#f1f5f9'} },
      rightPriceScale:{borderColor:'#e2e8f0'},
      timeScale:{borderColor:'#e2e8f0', timeVisible:true, secondsVisible:false},
      crosshair:{mode:1},
    })
    const series = type === 'area'
      ? chart.addAreaSeries({ lineColor:'#2563eb', topColor:'rgba(37,99,235,0.22)', bottomColor:'rgba(37,99,235,0)', lineWidth:2 })
      : chart.addCandlestickSeries({ upColor:'#dc2626', downColor:'#2563eb', borderUpColor:'#dc2626', borderDownColor:'#2563eb', wickUpColor:'#dc2626', wickDownColor:'#2563eb' })
    const fn = market === 'US' ? 'stock-us-chart' : 'stock-kr-chart'
    supabase.functions.invoke(fn, { body:{ ticker, period:'D', startDate:startDate||'', endDate:endDate||'' } })
      .then(({ data, error }) => {
        if (dead) return
        if (error) { setErr(error.message||'차트 로딩 실패'); return }
        if (data?.error) { setErr(data.error); return }
        if (!Array.isArray(data)||data.length===0) { setEmpty(true); return }
        const seen = new Set()
        const mapped = data
          .filter(d => d.time && d.close != null)
          .map(d => {
            const t = typeof d.time==='number' ? toDateStr(d.time) : d.time
            return type==='area' ? {time:t,value:d.close} : {time:t,open:d.open,high:d.high,low:d.low,close:d.close}
          })
          .filter(d => { if(seen.has(d.time))return false; seen.add(d.time); return true })
          .sort((a,b) => a.time>b.time?1:-1)
        if (mapped.length > 0) { series.setData(mapped); chart.timeScale().fitContent() }
        else setEmpty(true)
      })
      .catch(e => { if(!dead) setErr(e.message) })
    const ro = new ResizeObserver(entries => {
      if (!dead) { const w = entries[0]?.contentRect?.width; if(w) chart.applyOptions({width:w}) }
    })
    ro.observe(ref.current)
    return () => { dead=true; ro.disconnect(); chart.remove() }
  }, [ticker, market, startDate, endDate, type, height])
  if (err) return <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',color:'#ef4444',fontSize:13}}>차트 오류: {err}</div>
  if (empty) return <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',color:'#94a3b8',fontSize:13}}>차트 데이터 없음</div>
  return <div ref={ref} style={{width:'100%',minHeight:height}} />
}

function Spinner() {
  return <div className="spinner"><div className="spin-ring"/></div>
}
function PeriodBtns({ value, onChange, options=['1M','3M','6M','1Y'] }) {
  return (
    <div className="period-btns">
      {options.map(p => <button key={p} className={`period-btn ${value===p?'active':''}`} onClick={()=>onChange(p)}>{p}</button>)}
    </div>
  )
}

/* ══════════════════════════════════════════════
   MAIN STOCK PAGE
══════════════════════════════════════════════ */
export default function Stock() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [pendingStock, setPendingStock] = useState(null)
  const [modalStock, setModalStock] = useState(null)

  const openDetail = useCallback(stock => {
    if (activeTab === 'search') {
      setPendingStock(stock)
      setActiveTab('search')
    } else {
      setModalStock(stock)
    }
  }, [activeTab])

  const handleTabClick = id => {
    if (id !== 'search') {
      setPendingStock(null)
    } else {
      setModalStock(null)
    }
    setActiveTab(id)
  }

  const closeModal = useCallback(() => setModalStock(null), [])

  const content = {
    dashboard:   <DashboardTab onSelectStock={openDetail} />,
    'us-stocks': <USStocksTab onSelectStock={openDetail} />,
    'kr-stocks': <KRStocksTab onSelectStock={openDetail} />,
    earnings:    <EarningsTab  onSelectStock={openDetail} />,
    portfolio:   <PortfolioTab onSelectStock={openDetail} />,
    search:      <SearchTab pendingStock={pendingStock} onClearPending={()=>setPendingStock(null)} />,
  }

  return (
    <div className="stock-page">
      <nav className="stock-nav">
        {TABS.map(t => (
          <button key={t.id} className={`snav-btn ${activeTab===t.id?'active':''}`} onClick={()=>handleTabClick(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="stock-body">{content[activeTab]}</div>
      {modalStock && <StockDetailModal stock={modalStock} onClose={closeModal} />}
    </div>
  )
}

function DashboardTab({ onSelectStock }) {
  const [indices, setIndices] = useState([])
  const [portfolio, setPortfolio] = useState([])
  const [news, setNews] = useState('')
  const [loading, setLoading] = useState(true)
  const [chartPeriod, setChartPeriod] = useState('1M')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [usIdx, krIdx, pfRes, newsRes] = await Promise.allSettled([
      supabase.functions.invoke('stock-us-index', { body:{} }),
      supabase.functions.invoke('stock-kr-index', { body:{} }),
      supabase.from('portfolio').select('*').limit(8),
      supabase.functions.invoke('query-tavily', { body:{ query:'global stock market major news today S&P500 NASDAQ', summarize:true, lang:'ko' } }),
    ])
    const usData = usIdx.status==='fulfilled' ? (usIdx.value.data||[]) : []
    const krData = krIdx.status==='fulfilled' ? (krIdx.value.data||[]) : []
    setIndices([...usData,...krData])
    if (pfRes.status==='fulfilled' && !pfRes.value.error) {
      const rows = pfRes.value.data||[]
      const withPx = await Promise.allSettled(rows.map(async s => {
        const fn = s.market==='US' ? 'stock-us-quote' : 'stock-kr-quote'
        const { data:q } = await supabase.functions.invoke(fn, { body:{ticker:s.ticker} })
        const price = s.market==='US' ? q?.c : q?.price
        const pct = price ? ((price-s.avg_price)/s.avg_price*100) : 0
        return { ...s, currentPrice:price, changePercent:pct }
      }))
      setPortfolio(withPx.filter(r=>r.status==='fulfilled').map(r=>r.value))
    }
    if (newsRes.status==='fulfilled') setNews(newsRes.value.data?.result||'')
    setLoading(false)
  }

  const { startDate, endDate } = calcDateRange(chartPeriod)
  return (
    <div className="dash-tab">
      <div className="dash-header">
        <h1 className="dash-title">Markets</h1>
        <span className="dash-time">{new Date().toLocaleString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
      </div>
      {loading ? <Spinner /> : <>
        <div className="idx-grid">
          {indices.map((idx,i) => {
            const pct = parseFloat(idx.change)
            const val = typeof idx.value==='number' ? idx.value.toLocaleString('en-US',{maximumFractionDigits:2}) : idx.value
            return (
              <div key={i} className={`idx-card ${upDown(pct)}`}>
                <span className="idx-name">{idx.name}</span>
                <span className="idx-value">{val}</span>
                <span className="idx-change">{fmtPct(pct)} {pct>=0?'▲':'▼'}</span>
              </div>
            )
          })}
        </div>
        <div className="dash-card">
          <div className="card-header">
            <h3 className="card-title">S&P 500 (SPY) 시장 추이</h3>
            <PeriodBtns value={chartPeriod} onChange={setChartPeriod} />
          </div>
          <ChartWidget key={`spy-${chartPeriod}`} ticker="SPY" market="US" height={240} type="area" startDate={startDate} endDate={endDate} />
        </div>
        <div className="dash-row2">
          <div className="dash-card">
            <h3 className="card-title">보유종목 요약</h3>
            <div className="pf-mini-list">
              {portfolio.length===0 ? <p className="empty-msg">포트폴리오 데이터가 없습니다</p>
              : portfolio.map((s,i) => (
                <div key={i} className={`pf-mini-item ${upDown(s.changePercent)}`} style={{cursor:'pointer'}} onClick={()=>onSelectStock?.({ticker:s.ticker,name:s.name||s.ticker,market:s.market})}>
                  <span className="pf-mini-ticker">{s.name||s.ticker}</span>
                  <span className="pf-mini-mkt">{s.market}</span>
                  <span className={`pf-mini-pct ${upDown(s.changePercent)}`}>{fmtPct(s.changePercent)}</span>
                  <span className="pf-mini-arrow">{s.changePercent>=0?'▲':'▼'}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="dash-card">
            <h3 className="card-title">오늘의 뉴스 (AI 요약)</h3>
            <div className="news-body">
              {news ? news.split('\n').filter(l=>l.trim()).map((l,i)=><p key={i} className="news-line">{l}</p>)
              : <p className="empty-msg">뉴스 로딩 중...</p>}
            </div>
          </div>
        </div>
      </>}
    </div>
  )
}

/* ══════════════════════════════════════════════
   VALUE PICKS — 저평가 주식 추천
══════════════════════════════════════════════ */
const CRITERIA_GROUPS = {
  valuation: { label: '밸류에이션', color: '#818cf8' },
  earnings:  { label: '실적',       color: '#34d399' },
  supply:    { label: '수급',        color: '#fbbf24' },
  quality:   { label: '정성',        color: '#f472b6' },
}

function ValuePickCard({ pick, market }) {
  const [expanded, setExpanded] = useState(false)
  const total = pick.totalCriteria || (market === 'KR' ? 12 : 11)
  const count = pick.criteriaCount ?? 0
  const pct   = Math.round((count / total) * 100)
  const barColor = pct >= 70 ? '#34d399' : pct >= 50 ? '#fbbf24' : '#f87171'

  const criteriaEntries = Object.entries(pick.criteria || {})
  const grouped = {
    valuation: criteriaEntries.filter(([k]) => k.startsWith('valuation')),
    earnings:  criteriaEntries.filter(([k]) => k.startsWith('earnings')),
    supply:    criteriaEntries.filter(([k]) => k.startsWith('supply')),
    quality:   criteriaEntries.filter(([k]) => k.startsWith('quality')),
  }

  const riskClass = pick.risk === 'Low' || pick.risk === '낮음' ? 'low'
                  : pick.risk === 'High' || pick.risk === '높음' ? 'high' : 'mid'

  return (
    <div className="vp-card">
      {/* 헤더 */}
      <div className="vp-header" onClick={() => setExpanded(e => !e)} style={{cursor:'pointer'}}>
        <div className="vp-rank">#{pick.rank}</div>
        <div className="vp-info">
          <div className="vp-name-row">
            <span className="vp-name">{pick.name}</span>
            <span className="vp-ticker">{pick.ticker}</span>
            <span className="vp-sector-tag">{pick.sector}</span>
          </div>
          {pick.currentPrice != null && (
            <div className="vp-price-row">
              <span className="vp-price">
                {market === 'US' ? `$${Number(pick.currentPrice).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`
                                 : `₩${Number(pick.currentPrice).toLocaleString('ko-KR')}`}
              </span>
              {pick.changePercent != null && (
                <span className={`vp-chg ${upDown(pick.changePercent)}`}>
                  {fmtPct(pick.changePercent)}{Number(pick.changePercent)>=0?'▲':'▼'}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="vp-score-col">
          <div className="vp-score-badge" style={{color: barColor}}>{count}/{total}</div>
          <div className="vp-score-sub">조건 충족</div>
        </div>
        <span className="vp-expand-icon">{expanded ? '▲' : '▼'}</span>
      </div>

      {/* 조건 충족 프로그레스 바 */}
      <div className="vp-progress-track">
        <div className="vp-progress-fill" style={{width:`${pct}%`, background: barColor}} />
      </div>

      {/* 항상 보이는: 투자 포인트 요약 */}
      {pick.reason && (
        <div className="vp-reason">{pick.reason}</div>
      )}

      {/* 펼쳐지는 영역 */}
      {expanded && (
        <div className="vp-detail">
          {/* 조건 테이블 */}
          <div className="vp-criteria-grid">
            {Object.entries(grouped).map(([groupKey, entries]) => {
              if (entries.length === 0) return null
              const grp = CRITERIA_GROUPS[groupKey]
              return (
                <div key={groupKey} className="vp-crit-group">
                  <div className="vp-crit-group-label" style={{color: grp.color}}>{grp.label}</div>
                  {entries.map(([key, crit]) => (
                    <div key={key} className={`vp-crit-row ${crit.pass ? 'pass' : 'fail'}`}>
                      <span className="vp-crit-icon">{crit.pass ? '✅' : '❌'}</span>
                      <span className="vp-crit-label">{crit.label}</span>
                      {crit.value && <span className="vp-crit-value">{crit.value}</span>}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {/* 애널리스트 의견 */}
          {pick.analystConsensus && (
            <div className="vp-analyst-box">
              <span className="vp-analyst-icon">📊</span>
              <div className="vp-analyst-content">
                <span className="vp-analyst-rating">{pick.analystConsensus.rating}</span>
                {pick.analystConsensus.firm && (
                  <span className="vp-analyst-firm">{pick.analystConsensus.firm}</span>
                )}
                {pick.analystConsensus.targetPrice && (
                  <span className="vp-analyst-target">목표 {pick.analystConsensus.targetPrice}</span>
                )}
                {pick.analystConsensus.upside && (
                  <span className="vp-analyst-upside up">{pick.analystConsensus.upside}</span>
                )}
                {pick.analystConsensus.buyCount != null && (
                  <span className="vp-analyst-count">Buy {pick.analystConsensus.buyCount}/{pick.analystConsensus.totalCount}</span>
                )}
              </div>
            </div>
          )}

          {/* 호재 뉴스 */}
          {Array.isArray(pick.supportingNews) && pick.supportingNews.length > 0 && (
            <div className="vp-news-list">
              {pick.supportingNews.slice(0,3).map((n,i) => (
                <div key={i} className="vp-news-item">
                  <span className="vp-news-icon">📰</span>
                  <div className="vp-news-body">
                    <span className="vp-news-headline">{n.headline}</span>
                    {n.date && <span className="vp-news-date">{n.date}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="vp-footer">
        {pick.risk && <span className={`vp-risk risk-${riskClass}`}>{pick.risk}</span>}
      </div>
    </div>
  )
}

function ValuePicksSection({ market }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  useEffect(() => { loadPicks() }, [market])

  const loadPicks = async () => {
    setLoading(true); setError(null)
    const { data: result, error: err } = await supabase.functions.invoke('stock-value-picks', { body: { market } })
    if (err) setError(err.message || '저평가 분석 실패')
    else setData(result)
    setLoading(false)
  }

  const updatedTime = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="dash-card vp-section">
      <div className="rec-title-row">
        <h3 className="card-title">📊 저평가 주식 추천</h3>
        <div className="rec-header-right">
          {updatedTime && <span className="rec-updated">업데이트 {updatedTime}</span>}
          <button className="rec-refresh-btn" onClick={loadPicks} disabled={loading}>
            {loading ? '분석 중...' : '새로고침'}
          </button>
        </div>
      </div>
      {data?.marketContext && <p className="rec-market-summary">{data.marketContext}</p>}
      {loading && !data && <Spinner />}
      {loading && data  && <p className="rec-refreshing">분석 중...</p>}
      {error && <p className="rec-error">{error}</p>}
      {data?.picks?.length > 0 && (
        <div className="vp-cards-list">
          {data.picks.map((pick, i) => (
            <ValuePickCard key={i} pick={{ ...pick, totalCriteria: data.totalCriteria }} market={market} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   US STOCKS TAB
══════════════════════════════════════════════ */
function USStocksTab({ onSelectStock }) {
  const [sectors, setSectors] = useState([])
  const [allStocks, setAllStocks] = useState([])
  const [news, setNews] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(()=>{load()},[])
  const load = async () => {
    setLoading(true)
    const allTickers = US_SECTORS.flatMap(s=>s.tickers)
    const quoteResults = await Promise.allSettled(allTickers.map(ticker=>supabase.functions.invoke('stock-us-quote',{body:{ticker}}).then(r=>({ticker,...r.data}))))
    const priceMap = {}
    quoteResults.forEach(r=>{ if(r.status==='fulfilled'&&r.value.ticker) priceMap[r.value.ticker]=r.value })
    const sectorData = US_SECTORS.map(sec=>{
      const stocks = sec.tickers.map(t=>priceMap[t]).filter(Boolean)
      const avgDp = stocks.length>0 ? stocks.reduce((s,q)=>s+(q.dp||0),0)/stocks.length : null
      return { ...sec, avgDp, stocks:sec.tickers.map(t=>({ticker:t,...priceMap[t]})) }
    })
    setSectors(sectorData)
    setAllStocks(Object.values(priceMap))
    const { data:newsData } = await supabase.functions.invoke('stock-us-news',{body:{ticker:'AAPL'}})
    setNews(newsData?.news?.slice(0,8)||[])
    setLoading(false)
  }
  const gainers = [...allStocks].sort((a,b)=>(b.dp||0)-(a.dp||0)).slice(0,5)
  const losers  = [...allStocks].sort((a,b)=>(a.dp||0)-(b.dp||0)).slice(0,5)
  return (
    <div className="us-tab">
      <h2 className="tab-title">US Markets</h2>
      {loading ? <Spinner /> : <>
        <div className="dash-card">
          <h3 className="card-title">섹터별 히트맵</h3>
          <div className="heatmap-grid">
            {sectors.map(sec=>{
              const {bg,text}=heatColor(sec.avgDp)
              return (
                <div key={sec.name} className="heat-card" style={{background:bg,color:text}}>
                  <div className="heat-sector">{sec.name}</div>
                  <div className="heat-pct">{sec.avgDp!=null?fmtPct(sec.avgDp):'—'}</div>
                  <div className="heat-tickers">
                    {sec.stocks.map(s=>(
                      <span key={s.ticker} className="heat-tick" style={{cursor:'pointer'}} onClick={()=>onSelectStock?.({ticker:s.ticker,name:US_NAME_MAP[s.ticker]||s.ticker,market:'US'})}>
                        {s.ticker} <small>{s.dp!=null?fmtPct(s.dp):''}</small>
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="gl-grid">
          <div className="dash-card">
            <h3 className="card-title" style={{color:'#dc2626'}}>급등 TOP 5 ▲</h3>
            {gainers.map(s=>(
              <div key={s.ticker} className="gl-row" style={{cursor:'pointer'}} onClick={()=>onSelectStock?.({ticker:s.ticker,name:US_NAME_MAP[s.ticker]||s.ticker,market:'US'})}>
                <span className="gl-ticker">{s.ticker}</span>
                <span className="gl-price">${s.c?.toFixed(2)??'—'}</span>
                <span className="gl-pct up">{fmtPct(s.dp)}</span>
              </div>
            ))}
          </div>
          <div className="dash-card">
            <h3 className="card-title" style={{color:'#2563eb'}}>급락 TOP 5 ▼</h3>
            {losers.map(s=>(
              <div key={s.ticker} className="gl-row" style={{cursor:'pointer'}} onClick={()=>onSelectStock?.({ticker:s.ticker,name:US_NAME_MAP[s.ticker]||s.ticker,market:'US'})}>
                <span className="gl-ticker">{s.ticker}</span>
                <span className="gl-price">${s.c?.toFixed(2)??'—'}</span>
                <span className="gl-pct down">{fmtPct(s.dp)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="dash-card">
          <h3 className="card-title">Finnhub 실시간 뉴스</h3>
          <div className="news-feed">
            {news.length===0 ? <p className="empty-msg">뉴스를 불러올 수 없습니다</p>
            : news.map((item,i)=>{
              const dt = new Date(item.datetime*1000)
              const bullish = item.sentiment?.bullishPercent
              const sentiment = bullish==null?null:bullish>0.6?'positive':bullish<0.4?'negative':'neutral'
              return (
                <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className="news-item">
                  <div className="news-meta">
                    <span className="news-source">{item.source}</span>
                    <span className="news-dt">{dt.toLocaleDateString('ko-KR')}</span>
                    {sentiment&&<span className={`sentiment-badge ${sentiment}`}>{sentiment==='positive'?'긍정':sentiment==='negative'?'부정':'중립'}</span>}
                  </div>
                  <p className="news-headline">{item.headline_ko || item.headline}</p>
                </a>
              )
            })}
          </div>
        </div>
      </>}
      <ValuePicksSection market="US" />
    </div>
  )
}

/* ══════════════════════════════════════════════
   KR STOCKS TAB
══════════════════════════════════════════════ */
function KRStocksTab({ onSelectStock }) {
  const [subTab, setSubTab] = useState('market')
  const [indices, setIndices] = useState([])
  const [stocks, setStocks] = useState([])
  const [news, setNews] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(()=>{load()},[])
  const load = async () => {
    setLoading(true)
    const [idxRes,newsRes] = await Promise.allSettled([
      supabase.functions.invoke('stock-kr-index',{body:{}}),
      supabase.functions.invoke('query-tavily',{body:{query:'한국 코스피 코스닥 주요 뉴스 오늘',summarize:true,lang:'ko'}}),
    ])
    if (idxRes.status==='fulfilled') setIndices(idxRes.value.data||[])
    if (newsRes.status==='fulfilled') setNews(newsRes.value.data?.result||'')
    const stockResults = await Promise.allSettled(KR_MAJOR.map(s=>supabase.functions.invoke('stock-kr-quote',{body:{ticker:s.ticker}}).then(r=>({...s,...(r.data||{})}))))
    setStocks(stockResults.filter(r=>r.status==='fulfilled').map(r=>r.value))
    setLoading(false)
  }
  return (
    <div className="kr-tab">
      <h2 className="tab-title">KR Markets</h2>
      <div className="kr-subtabs">
        <button className={`period-btn ${subTab==='market'?'active':''}`} onClick={()=>setSubTab('market')}>시장현황</button>
        <button className={`period-btn ${subTab==='flow'?'active':''}`}   onClick={()=>setSubTab('flow')}>외국인/기관 수급</button>
      </div>
      {subTab==='market' && (loading ? <Spinner /> : <>
        <div className="idx-grid kr-idx-grid">
          {indices.map((idx,i)=>{
            const pct=parseFloat(idx.change)
            return (
              <div key={i} className={`idx-card idx-card-lg ${upDown(pct)}`}>
                <span className="idx-name">{idx.name}</span>
                <span className="idx-value">{typeof idx.value==='number'?idx.value.toLocaleString():idx.value}</span>
                <span className="idx-change">{fmtPct(pct)} {pct>=0?'▲':'▼'}</span>
              </div>
            )
          })}
        </div>
        <div className="dash-card">
          <h3 className="card-title">업종별 등락률</h3>
          <div className="sector-bars">
            {stocks.map(s=>{
              const pct=s.changePercent||0
              const barW=Math.min(Math.abs(pct)*15,100)
              return (
                <div key={s.ticker} className="sb-row" style={{cursor:'pointer'}} onClick={()=>onSelectStock?.({ticker:s.ticker,name:s.name,market:'KR'})}>
                  <span className="sb-name">{s.name}</span>
                  <div className="sb-track"><div className={`sb-fill ${upDown(pct)}`} style={{width:`${barW}%`}}/></div>
                  <span className={`sb-pct ${upDown(pct)}`}>{fmtPct(pct)}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="dash-card">
          <h3 className="card-title">KIS API 실시간 시세</h3>
          <div className="kr-table">
            <div className="krt-head">
              <span>종목</span><span>현재가</span><span>전일비</span><span>등락률</span><span>거래량</span><span>52주 고/저</span>
            </div>
            {stocks.map(s=>(
              <div key={s.ticker} className={`krt-row ${upDown(s.changePercent)}`} style={{cursor:'pointer'}} onClick={()=>onSelectStock?.({ticker:s.ticker,name:s.name,market:'KR'})}>
                <span className="krt-name">{s.name}<small>{s.ticker}</small></span>
                <span className="krt-price">₩{s.price?.toLocaleString('ko-KR')??'—'}</span>
                <span className={`krt-chg ${upDown(s.changePercent)}`}>{s.change>=0?'+':''}{s.change?.toLocaleString('ko-KR')??'—'}</span>
                <span className={`krt-pct ${upDown(s.changePercent)}`}>{fmtPct(s.changePercent)}</span>
                <span className="krt-vol">{s.volume?.toLocaleString('ko-KR')??'—'}</span>
                <span className="krt-52">{s.high52?`↑${s.high52?.toLocaleString('ko-KR')}`:''} / {s.low52?`↓${s.low52?.toLocaleString('ko-KR')}`:''}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="dash-card">
          <h3 className="card-title">국내 주요 뉴스 (AI)</h3>
          <div className="news-body">
            {news ? news.split('\n').filter(l=>l.trim()).map((l,i)=><p key={i} className="news-line">{l}</p>)
            : <p className="empty-msg">뉴스 로딩 중...</p>}
          </div>
        </div>
        <ValuePicksSection market="KR" />
      </>)}
      {subTab==='flow' && <KRFlowView onSelectStock={onSelectStock} />}
    </div>
  )
}

/* ── 외국인/기관 수급 뷰 ── */
function KRFlowView({ onSelectStock }) {
  const [data,setData]         = useState([])
  const [loading,setLoading]   = useState(true)
  const [error,setError]       = useState(null)
  const [sortKey,setSortKey]   = useState('foreign_net')
  const [sortDir,setSortDir]   = useState('desc')
  const [lastUpdated,setLastUpdated] = useState(null)

  useEffect(()=>{loadFlow()},[])

  const loadFlow = async () => {
    setLoading(true); setError(null)
    try {
      const { data:result, error:err } = await supabase.functions.invoke('stock-kr-flow',{body:{}})
      if (err) throw new Error(err.message||'수급 데이터 로딩 실패')
      setData(Array.isArray(result)?result:[])
      setLastUpdated(new Date())
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const toggleSort = key => {
    if (sortKey===key) setSortDir(d=>d==='desc'?'asc':'desc')
    else { setSortKey(key); setSortDir('desc') }
  }
  const sortArrow = key => sortKey!==key ? <span style={{opacity:0.3}}>↕</span>
    : sortDir==='desc' ? <span style={{color:'#60a5fa'}}>▼</span> : <span style={{color:'#60a5fa'}}>▲</span>

  const sorted = [...data].sort((a,b)=>{
    const av=a[sortKey]??0, bv=b[sortKey]??0
    return sortDir==='desc' ? bv-av : av-bv
  })

  const fmtNet = v => {
    if (v==null) return <span style={{color:'#475569'}}>—</span>
    const sign = v>=0?'+':''
    return <span className={v>=0?'flow-net-up':'flow-net-down'}>{sign}{Number(v).toLocaleString('ko-KR')}주</span>
  }

  return (
    <div className="kr-flow-view">
      {/* TOP5 요약 카드 */}
      {!loading && data.length>0 && (
        <div className="flow-summary-grid">
          {[
            {label:'🔴 외국인 순매수 TOP5',key:'foreign_net',dir:'desc'},
            {label:'🔵 외국인 순매도 TOP5',key:'foreign_net',dir:'asc'},
            {label:'🟠 기관 순매수 TOP5',key:'inst_net',dir:'desc'},
            {label:'🟣 기관 순매도 TOP5',key:'inst_net',dir:'asc'},
          ].map(({label,key,dir})=>(
            <div key={label} className="dash-card flow-summary-card">
              <h4 className="card-title" style={{fontSize:'12px',marginBottom:'0.75rem'}}>{label}</h4>
              {[...data].filter(s=>s[key]!=null).sort((a,b)=>dir==='desc'?b[key]-a[key]:a[key]-b[key]).slice(0,5).map(s=>(
                <div key={s.ticker} className="flow-mini-row" onClick={()=>onSelectStock?.({ticker:s.ticker,name:s.name,market:'KR'})}>
                  <span className="flow-mini-name">{s.name}</span>
                  <span className={s[key]>=0?'flow-net-up':'flow-net-down'}>{s[key]>=0?'+':''}{Number(s[key]).toLocaleString('ko-KR')}주</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 전체 테이블 */}
      <div className="dash-card">
        <div className="card-header">
          <h3 className="card-title">외국인 / 기관 순매수 현황</h3>
          <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
            {lastUpdated&&<span style={{fontSize:'11px',color:'#475569'}}>{lastUpdated.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})} 기준</span>}
            <button className="rec-refresh-btn" onClick={loadFlow} disabled={loading}>{loading?'로딩 중...':'↻ 새로고침'}</button>
          </div>
        </div>
        {loading && <Spinner />}
        {error && (
          <div style={{padding:'2rem',color:'#f87171',textAlign:'center'}}>
            <p>⚠️ {error}</p>
            <p style={{fontSize:'12px',color:'#64748b',marginTop:'0.5rem'}}>KIS API 키가 설정되지 않았거나 장이 마감된 경우 데이터를 불러올 수 없습니다.</p>
          </div>
        )}
        {!loading && !error && data.length>0 && (
          <div className="flow-table">
            <div className="flow-head">
              <span>종목</span>
              <span>현재가</span>
              <span>등락률</span>
              <span>거래량</span>
              <button className={`flow-sort-btn ${sortKey==='foreign_net'?'active':''}`} onClick={()=>toggleSort('foreign_net')}>외국인 순매수 {sortArrow('foreign_net')}</button>
              <button className={`flow-sort-btn ${sortKey==='inst_net'?'active':''}`}    onClick={()=>toggleSort('inst_net')}>기관 순매수 {sortArrow('inst_net')}</button>
              <button className={`flow-sort-btn ${sortKey==='indv_net'?'active':''}`}    onClick={()=>toggleSort('indv_net')}>개인 순매수 {sortArrow('indv_net')}</button>
            </div>
            {sorted.map(s=>(
              <div key={s.ticker} className="flow-row" style={{cursor:'pointer'}} onClick={()=>onSelectStock?.({ticker:s.ticker,name:s.name,market:'KR'})}>
                <span className="flow-name"><strong>{s.name}</strong><small>{s.ticker}</small></span>
                <span className="flow-price">{s.price!=null?`₩${Number(s.price).toLocaleString('ko-KR')}`:'—'}</span>
                <span className={`flow-pct ${s.changePercent!=null?upDown(s.changePercent):''}`}>{s.changePercent!=null?fmtPct(s.changePercent):'—'}</span>
                <span className="flow-vol">{s.volume!=null?fmtVol(s.volume):'—'}</span>
                <span>{fmtNet(s.foreign_net)}</span>
                <span>{fmtNet(s.inst_net)}</span>
                <span>{fmtNet(s.indv_net)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   EARNINGS TAB
══════════════════════════════════════════════ */
function EarningsTab({ onSelectStock }) {
  const now = new Date()
  const [yr,   setYr]   = useState(now.getFullYear())
  const [mo,   setMo]   = useState(now.getMonth()+1)
  const [filt, setFilt] = useState('ALL')
  const [data, setData] = useState({us:[],kr:[]})
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [krError, setKrError] = useState(null)   // OpenDART 부분 오류

  useEffect(()=>{ loadEarnings() },[yr,mo])

  const loadEarnings = async () => {
    setLoading(true); setError(null); setKrError(null)
    try {
      const { data:result, error:err } = await supabase.functions.invoke('stock-earnings',{body:{year:yr,month:mo}})
      if (err) throw new Error(err.message||'실적 데이터 로딩 실패')
      setData(result||{us:[],kr:[]})
      // OpenDART 부분 실패 메시지
      if (result?.kr_error) {
        setKrError(result.kr_error)
      } else if (!result?.meta?.dartEnabled) {
        setKrError('OPENDART_API_KEY 미설정 — 국내 실적 비활성화')
      }
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const prevMonth = () => { if(mo===1){setYr(y=>y-1);setMo(12)}else setMo(m=>m-1) }
  const nextMonth = () => { if(mo===12){setYr(y=>y+1);setMo(1)}else setMo(m=>m+1) }
  const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
  const today  = now.toISOString().split('T')[0]

  const combined = [
    ...(filt!=='KR' ? (data.us||[]).map(e=>({...e,market:'US'})) : []),
    ...(filt!=='US' ? (data.kr||[]).map(e=>({...e,market:'KR'})) : []),
  ].sort((a,b)=>a.date.localeCompare(b.date))

  const upcoming = combined.filter(e=>e.date>=today).length
  const done     = combined.filter(e=>e.date<today).length
  const beats    = combined.filter(e=>e.surprise_pct!=null&&e.surprise_pct>0).length
  const misses   = combined.filter(e=>e.surprise_pct!=null&&e.surprise_pct<0).length

  return (
    <div className="earnings-tab">
      <h2 className="tab-title">실적발표 캘린더</h2>

      {/* 데이터 소스 안내 배너 */}
      <div className="earn-source-bar">
        <span className="earn-source-chip us-chip">🇺🇸 US — Finnhub 실시간</span>
        <span className={`earn-source-chip ${data?.meta?.dartEnabled ? 'kr-chip' : 'kr-chip disabled'}`}>
          🇰🇷 KR — OpenDART(금감원) {data?.meta?.dartEnabled ? '실시간' : '⚠️ API 키 필요'}
        </span>
        {data?.meta?.dartEnabled && (
          <span className="earn-source-note">공시 접수일 기준 · DART 원문 링크 제공</span>
        )}
      </div>

      {/* DART 키 미설정 안내 */}
      {krError && !error && (
        <div className="earn-dart-notice">
          <span>⚠️ {krError}</span>
          <a
            href="https://opendart.fss.or.kr/uss/umt/EgovMberInsertView.do"
            target="_blank" rel="noopener noreferrer"
            className="earn-dart-link"
          >
            DART API 키 발급 →
          </a>
          <code className="earn-dart-cmd">supabase secrets set OPENDART_API_KEY=발급키</code>
        </div>
      )}

      {/* 월 네비게이션 */}
      <div className="earnings-nav">
        <button className="earn-nav-btn" onClick={prevMonth}>‹</button>
        <span className="earn-nav-label">{yr}년 {MONTHS[mo-1]}</span>
        <button className="earn-nav-btn" onClick={nextMonth}>›</button>
        <div className="earn-filter-btns">
          {[{id:'ALL',label:'전체'},{id:'US',label:'🇺🇸 US'},{id:'KR',label:'🇰🇷 KR'}].map(f=>(
            <button key={f.id} className={`period-btn ${filt===f.id?'active':''}`} onClick={()=>setFilt(f.id)}>{f.label}</button>
          ))}
        </div>
        <button className="rec-refresh-btn" onClick={loadEarnings} disabled={loading} style={{marginLeft:'auto'}}>
          {loading ? '로딩 중...' : '↻ 새로고침'}
        </button>
      </div>

      {/* 요약 카드 */}
      {!loading && combined.length>0 && (
        <div className="earn-summary-row">
          {[
            {label:'발표 예정', val:upcoming, color:''},
            {label:'공시 완료',  val:done,     color:''},
            {label:'어닝 서프라이즈', val:beats,  color:'#f87171'},
            {label:'실적 미달',  val:misses,   color:'#60a5fa'},
          ].map(({label,val,color})=>(
            <div key={label} className="dash-card earn-summary-card">
              <div className="earn-summary-label">{label}</div>
              <div className="earn-summary-val" style={color?{color}:{}}>{val}개</div>
            </div>
          ))}
        </div>
      )}

      {loading && <div className="dash-card"><Spinner /></div>}
      {error && !loading && (
        <div className="dash-card" style={{color:'#f87171',textAlign:'center',padding:'2rem'}}>⚠️ {error}</div>
      )}
      {!loading && !error && combined.length===0 && (
        <div className="dash-card" style={{textAlign:'center',padding:'3rem',color:'#94a3b8'}}>
          해당 월의 실적발표 일정이 없습니다
          {data?.meta?.dartEnabled===false && (
            <p style={{fontSize:'12px',marginTop:'0.75rem',color:'#64748b'}}>
              국내 실적은 OPENDART_API_KEY 설정 후 조회 가능합니다
            </p>
          )}
        </div>
      )}

      {/* 실적 테이블 */}
      {!loading && !error && combined.length>0 && (
        <div className="dash-card earn-table-wrap">
          {/* US 컬럼 헤더 */}
          {(filt==='ALL'||filt==='US') && (
            <div className="earn-table-head earn-head-us">
              <span>날짜/분기</span><span>종목</span><span>시장</span><span>발표 시점</span>
              <span>매출 예상</span><span>EPS 예상</span><span>EPS 실적</span><span>서프라이즈/공시</span>
            </div>
          )}
          {(filt==='KR') && (
            <div className="earn-table-head earn-head-kr">
              <span>접수일/분기</span><span>종목</span><span>시장</span><span>발표 시점</span>
              <span>공시 종류</span><span>—</span><span>—</span><span>DART 원문</span>
            </div>
          )}
          {filt==='ALL' && (
            <div className="earn-table-head">
              <span>날짜</span><span>종목</span><span>시장</span><span>발표 시점</span>
              <span>매출 예상 / 공시종류</span><span>EPS 예상</span><span>EPS 실적</span><span>서프라이즈 / DART</span>
            </div>
          )}

          {combined.map((e,i)=>{
            const isPast  = e.date < today
            const isToday = e.date === today
            return (
              <div
                key={i}
                className={`earn-row ${isPast?'past':''} ${isToday?'today':''}`}
                onClick={()=>onSelectStock?.({ticker:e.ticker,name:e.name,market:e.market})}
              >
                {/* 날짜 */}
                <span className="earn-date">
                  {isToday && <span className="earn-today-badge">오늘</span>}
                  <span>{e.date.slice(5)}</span>
                  {e.quarter && <small style={{color:'#475569',fontSize:'10px'}}>{e.quarter}</small>}
                </span>

                {/* 종목 */}
                <span className="earn-name">
                  <strong>{e.name}</strong>
                  <small>{e.ticker}</small>
                </span>

                {/* 시장 배지 */}
                <span className={`sr-badge ${e.market==='US'?'us':'kr'}`}>{e.market}</span>

                {/* 발표 시점 */}
                <span className="earn-time">{e.time}</span>

                {/* 매출 예상 / 공시 종류 */}
                <span className="earn-rev">
                  {e.market==='US'
                    ? (e.rev_est_B!=null ? `$${e.rev_est_B}B` : '—')
                    : <span className="earn-report-nm" title={e.report_nm}>{e.report_nm ? e.report_nm.slice(0,14)+(e.report_nm.length>14?'…':'') : '—'}</span>
                  }
                </span>

                {/* EPS 예상 */}
                <span className="earn-eps">
                  {e.market==='US' ? (e.eps_est!=null ? `$${Number(e.eps_est).toFixed(2)}` : '—') : '—'}
                </span>

                {/* EPS 실적 */}
                <span className="earn-eps">
                  {e.market==='US'
                    ? (e.eps_actual!=null
                        ? <strong style={{color:e.eps_actual>=(e.eps_est||0)?'#f87171':'#60a5fa'}}>${Number(e.eps_actual).toFixed(2)}</strong>
                        : <span style={{color:'#475569'}}>미발표</span>)
                    : '—'
                  }
                </span>

                {/* 서프라이즈 / DART 링크 */}
                <span className="earn-surprise">
                  {e.market==='US'
                    ? (e.surprise_pct!=null
                        ? <span className={e.surprise_pct>0?'earn-surprise-pos':e.surprise_pct<0?'earn-surprise-neg':''}>
                            {e.surprise_pct>0?'+':''}{Number(e.surprise_pct).toFixed(1)}%
                          </span>
                        : <span style={{color:'#475569'}}>—</span>)
                    : (e.dart_url
                        ? <a href={e.dart_url} target="_blank" rel="noopener noreferrer"
                            className="earn-dart-btn" onClick={ev=>ev.stopPropagation()}>
                            DART ↗
                          </a>
                        : <span style={{color:'#475569'}}>—</span>)
                  }
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   PORTFOLIO TAB
══════════════════════════════════════════════ */
function PortfolioTab({ onSelectStock }) {
  const [portfolios, setPortfolios] = useState([])
  const [stocks, setStocks]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [editingId, setEditingId]   = useState(null)
  const [editName, setEditName]     = useState('')
  const [selected, setSelected]     = useState(null)
  const [chartPeriod, setChartPeriod] = useState('1M')
  const [aiData, setAiData]         = useState(null)
  const [aiLoading, setAiLoading]   = useState(false)
  const [usdKrwRate, setUsdKrwRate] = useState(1380)
  const [showAddForm, setShowAddForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newStock, setNewStock]     = useState({ ticker:'', name:'', market:'US', quantity:'', avg_price:'', portfolio_id:'' })
  const [editingStockId, setEditingStockId] = useState(null)
  const [editStockData, setEditStockData] = useState({ quantity: '', avg_price: '' })

  useEffect(()=>{ loadAll() },[])

  const loadAll = async () => {
    setLoading(true)
    try {
      const { data:rateData } = await supabase.functions.invoke('get-exchange-rate')
      if (rateData?.usdToKrw) setUsdKrwRate(rateData.usdToKrw)
    } catch {}
    const [{ data:pfRows }, { data:stockRows, error }] = await Promise.all([
      supabase.from('portfolios').select('*').order('id'),
      supabase.from('portfolio').select('*'),
    ])
    const loadedPfs = pfRows?.length ? pfRows : [{id:1,name:'포트폴리오 1'},{id:2,name:'포트폴리오 2'},{id:3,name:'포트폴리오 3'}]
    setPortfolios(loadedPfs)
    if (!newStock.portfolio_id && loadedPfs.length>0) setNewStock(prev=>({...prev,portfolio_id:loadedPfs[0].id}))
    if (!error && stockRows) {
      const withPx = await Promise.allSettled(stockRows.map(async s=>{
        const fn = s.market==='US'?'stock-us-quote':'stock-kr-quote'
        const { data:q } = await supabase.functions.invoke(fn,{body:{ticker:s.ticker}})
        const price = s.market==='US'?q?.c:q?.price
        const pct = price?((price-s.avg_price)/s.avg_price*100):0
        const todayPct = s.market==='US'?q?.dp:q?.changePercent
        return { ...s, currentPrice:price, changePercent:pct, todayChangePercent:todayPct }
      }))
      setStocks(withPx.filter(r=>r.status==='fulfilled').map(r=>r.value))
    }
    setLoading(false)
  }

  const handleAddStock = async e => {
    e.preventDefault()
    if (!newStock.ticker||!newStock.quantity||!newStock.avg_price) { alert('모든 필드를 입력해주세요.'); return }
    setIsSubmitting(true)
    const { error } = await supabase.from('portfolio').insert([{ ...newStock, quantity:Number(newStock.quantity), avg_price:Number(newStock.avg_price), portfolio_id:Number(newStock.portfolio_id) }])
    if (error) alert('추가 실패: '+error.message)
    else { setShowAddForm(false); setNewStock({ ticker:'', name:'', market:'US', quantity:'', avg_price:'', portfolio_id:portfolios[0]?.id }); loadAll() }
    setIsSubmitting(false)
  }

  const handleDeleteStock = async stockId => {
    if (!confirm('정말로 이 종목을 포트폴리오에서 삭제하시겠습니까?')) return
    const { error } = await supabase.from('portfolio').delete().eq('id', stockId)
    if (error) alert('삭제 실패: '+error.message)
    else { if (selected?.id === stockId) setSelected(null); loadAll() }
  }

  const handleEditStock = stock => {
    setEditingStockId(stock.id)
    setEditStockData({ quantity: stock.quantity.toString(), avg_price: stock.avg_price.toString() })
  }

  const saveStockEdit = async () => {
    if (!editStockData.quantity || !editStockData.avg_price) { alert('모든 필드를 입력해주세요.'); return }
    const { error } = await supabase.from('portfolio').update({
      quantity: Number(editStockData.quantity),
      avg_price: Number(editStockData.avg_price)
    }).eq('id', editingStockId)
    if (error) alert('수정 실패: '+error.message)
    else { setEditingStockId(null); setEditStockData({ quantity: '', avg_price: '' }); loadAll() }
  }

  const cancelStockEdit = () => {
    setEditingStockId(null)
    setEditStockData({ quantity: '', avg_price: '' })
  }

  const saveName = async id => {
    setPortfolios(pfs=>pfs.map(p=>p.id===id?{...p,name:editName}:p))
    await supabase.from('portfolios').update({name:editName}).eq('id',id)
    setEditingId(null)
  }

  const handleCardClick = async stock => {
    setSelected(stock); setAiData(null); setAiLoading(true)
    const { data } = await supabase.functions.invoke('stock-ai-analyze',{body:{ticker:stock.ticker,market:stock.market}})
    setAiData(data||null); setAiLoading(false)
  }

  const getColStats = useCallback((pfId) => {
    const col = stocks.filter(s=>s.portfolio_id===pfId)
    let b=0,e=0,usE=0,krE=0
    col.forEach(s=>{
      const buy=s.quantity*s.avg_price, ev=s.quantity*(s.currentPrice||s.avg_price)
      if (s.market==='US'){usE+=ev;b+=buy*usdKrwRate;e+=ev*usdKrwRate}else{krE+=ev;b+=buy;e+=ev}
    })
    return { col, usEvalTotal:usE, krEvalTotal:krE, totalKRW:e, profitKRW:e-b, profitPct:b>0?((e-b)/b*100):0 }
  },[stocks,usdKrwRate])

  const overall = (()=>{
    let b=0,e=0
    stocks.forEach(s=>{
      const buy=s.quantity*s.avg_price,ev=s.quantity*(s.currentPrice||s.avg_price)
      if(s.market==='US'){b+=buy*usdKrwRate;e+=ev*usdKrwRate}else{b+=buy;e+=ev}
    })
    return {buyKRW:b,evalKRW:e,profitKRW:e-b,profitPct:b>0?((e-b)/b*100):0}
  })()

  const { startDate, endDate } = calcDateRange(chartPeriod)

  return (
    <div className="pf-tab">
      <div className="pf-tab-hdr">
        <h2 className="tab-title">내 포트폴리오</h2>
        <div className="pf-tab-actions">
          <button className="pf-action-btn refresh" onClick={loadAll} disabled={loading}>{loading?'...' :'↻ 새로고침'}</button>
          <button className="pf-action-btn add" onClick={()=>setShowAddForm(!showAddForm)}>{showAddForm?'닫기':'+ 종목 추가'}</button>
        </div>
      </div>

      {!loading && stocks.length>0 && (
        <div className="overall-summary dash-card">
          {[
            {label:'총 매입',val:`₩${overall.buyKRW.toLocaleString(undefined,{maximumFractionDigits:0})}`},
            {label:'총 평가',val:`₩${overall.evalKRW.toLocaleString(undefined,{maximumFractionDigits:0})}`},
            {label:'총 손익',val:`${overall.profitKRW>=0?'+':''}₩${overall.profitKRW.toLocaleString(undefined,{maximumFractionDigits:0})} (${overall.profitPct.toFixed(2)}%)`,cls:upDown(overall.profitKRW)},
          ].map(({label,val,cls})=>(
            <div key={label} className={`summary-item ${cls||''}`}>
              <span>{label}</span><strong>{val}</strong>
            </div>
          ))}
        </div>
      )}

      {showAddForm && (
        <form className="add-stock-form dash-card" onSubmit={handleAddStock}>
          <div className="form-grid">
            {[
              {label:'시장',type:'select',key:'market',opts:[{v:'US',l:'🇺🇸 미국 (US)'},{v:'KR',l:'🇰🇷 한국 (KR)'}]},
              {label:'티커/코드',type:'text',key:'ticker',ph:'AAPL 또는 005930'},
              {label:'종목명(선택)',type:'text',key:'name',ph:'애플'},
              {label:'수량',type:'number',key:'quantity',ph:'0'},
              {label:'평균단가',type:'number',key:'avg_price',ph:'0.00',step:'any'},
            ].map(f=>(
              <div key={f.key} className="form-group">
                <label>{f.label}</label>
                {f.type==='select'
                  ? <select value={newStock[f.key]} onChange={e=>setNewStock({...newStock,[f.key]:e.target.value})}>
                      {f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  : <input type={f.type} placeholder={f.ph} step={f.step} value={newStock[f.key]}
                      onChange={e=>setNewStock({...newStock,[f.key]:f.key==='ticker'?e.target.value.toUpperCase():e.target.value})} />
                }
              </div>
            ))}
            <div className="form-group">
              <label>포트폴리오</label>
              <select value={newStock.portfolio_id} onChange={e=>setNewStock({...newStock,portfolio_id:e.target.value})}>
                {portfolios.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" className="form-submit-btn" disabled={isSubmitting}>{isSubmitting?'추가 중...':'포트폴리오에 추가'}</button>
        </form>
      )}

      {loading && stocks.length===0 ? <Spinner /> : (
        <div className="pf-multi-cols">
          {portfolios.map(pf=>{
            const { col, usEvalTotal, krEvalTotal, totalKRW, profitKRW, profitPct } = getColStats(pf.id)
            return (
              <div key={pf.id} className="pf-col">
                <div className="pf-col-hdr">
                  {editingId===pf.id
                    ? <input className="pf-col-name-input" value={editName} onChange={e=>setEditName(e.target.value)} onBlur={()=>saveName(pf.id)} onKeyDown={e=>e.key==='Enter'&&saveName(pf.id)} autoFocus />
                    : <span className="pf-col-name" onClick={()=>{setEditingId(pf.id);setEditName(pf.name)}}>{pf.name} <span className="pf-col-edit-icon">✎</span></span>
                  }
                  <div className="pf-col-total">₩{totalKRW.toLocaleString('ko-KR',{maximumFractionDigits:0})}</div>
                  <div className={`pf-col-profit ${profitKRW>=0?'up':'down'}`}>{profitKRW>=0?'+':''}₩{profitKRW.toLocaleString(undefined,{maximumFractionDigits:0})} ({profitPct.toFixed(2)}%)</div>
                  <div className="pf-col-subs">
                    <span>🇺🇸 ${usEvalTotal.toLocaleString('en-US',{maximumFractionDigits:0})}</span>
                    <span>🇰🇷 ₩{krEvalTotal.toLocaleString('ko-KR',{maximumFractionDigits:0})}</span>
                  </div>
                </div>
                <div className="pf-col-stocks">
                  {col.length===0 ? <p className="empty-msg" style={{padding:'1.5rem',textAlign:'center'}}>종목 없음</p>
                  : col.map(s=>(
                    <div key={s.id} className={`pf-col-card ${upDown(s.changePercent)} ${selected?.id===s.id?'selected':''}`} onClick={()=>handleCardClick(s)}>
                      <div className="pfc-header">
                        <div className="pfc-ticker-wrap">
                          {s.name&&<span className="pfc-name">{s.name}</span>}
                          <span className="pfc-ticker">{s.ticker}</span>
                        </div>
                        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'2px'}}>
                          <span className={`pfc-pct ${upDown(s.changePercent)}`}>{fmtPct(s.changePercent)}</span>
                          <span className={`pfc-pct ${upDown(s.todayChangePercent)}`} style={{fontSize:'11px',opacity:0.85}}>📅 {fmtPct(s.todayChangePercent)}</span>
                        </div>
                      </div>
                      {editingStockId === s.id ? (
                        <div className="pfc-edit-form" onClick={e=>e.stopPropagation()}>
                          <div className="pfc-row">
                            <span className="pfc-label">수량</span>
                            <input type="number" value={editStockData.quantity} onChange={e=>setEditStockData({...editStockData, quantity: e.target.value})} style={{width:'80px',padding:'2px 4px'}} />
                          </div>
                          <div className="pfc-row">
                            <span className="pfc-label">평균단가</span>
                            <input type="number" step="any" value={editStockData.avg_price} onChange={e=>setEditStockData({...editStockData, avg_price: e.target.value})} style={{width:'80px',padding:'2px 4px'}} />
                          </div>
                          <div style={{marginTop:'0.5rem',textAlign:'right',display:'flex',gap:'4px',justifyContent:'flex-end'}}>
                            <button onClick={saveStockEdit} style={{padding:'2px 6px',fontSize:'11px',background:'#10b981',color:'white',border:'none',borderRadius:'3px'}}>저장</button>
                            <button onClick={cancelStockEdit} style={{padding:'2px 6px',fontSize:'11px',background:'#6b7280',color:'white',border:'none',borderRadius:'3px'}}>취소</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {[
                            {label:'수량',val:`${s.quantity}주`},
                            {label:'매입가',val:fmtPrice(s.avg_price,s.market)},
                            {label:'현재가',val:fmtPrice(s.currentPrice,s.market)},
                            {label:'평가금액',val:fmtPrice(s.quantity*(s.currentPrice||s.avg_price),s.market)},
                            {label:'평가손익',val:`${s.market==='US'?'$':'₩'}${((s.currentPrice-s.avg_price)*s.quantity).toLocaleString(undefined,{maximumFractionDigits:s.market==='US'?2:0})}`,cls:upDown(s.changePercent)},
                          ].map(({label,val,cls})=>(
                            <div key={label} className="pfc-row">
                              <span className="pfc-label">{label}</span>
                              <span className={`pfc-val ${cls||''}`}>{val}</span>
                            </div>
                          ))}
                          <div style={{marginTop:'0.5rem',textAlign:'right',display:'flex',gap:'4px',justifyContent:'flex-end'}}>
                            <button onClick={e=>{e.stopPropagation();handleEditStock(s)}} style={{padding:'2px 6px',fontSize:'11px',background:'#3b82f6',color:'white',border:'none',borderRadius:'3px'}}>수정</button>
                            <button onClick={e=>{e.stopPropagation();handleDeleteStock(s.id)}} style={{padding:'2px 6px',fontSize:'11px',background:'#ef4444',color:'white',border:'none',borderRadius:'3px'}}>삭제</button>
                            <span className="earn-today-badge" style={{cursor:'pointer',background:'rgba(37,99,235,0.25)'}}
                              onClick={ev=>{ev.stopPropagation();onSelectStock?.({ticker:s.ticker,name:s.name||s.ticker,market:s.market})}}>
                              상세보기 →
                            </span>
                          </div>
                        </>
                      )}
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
            <div><h3>{selected.ticker} 차트</h3><small style={{color:'#94a3b8'}}>{selected.market==='US'?'미국주식':'국내주식'}</small></div>
            <PeriodBtns value={chartPeriod} onChange={setChartPeriod} />
          </div>
          <ChartWidget key={`${selected.ticker}-${chartPeriod}`} ticker={selected.ticker} market={selected.market} height={260} type="candlestick" startDate={startDate} endDate={endDate} />
          <div className="ai-panel">
            <h4>AI 분석 코멘트</h4>
            {aiLoading ? <Spinner /> : aiData ? (
              <div className="ai-blocks">
                <div className="ai-block"><span className="ai-badge qwen">Qwen3 · 수치 분석</span><p>{aiData.analysis||'—'}</p></div>
                <div className="ai-block"><span className="ai-badge compound">Tavily · 뉴스 요약</span><p>{aiData.newsSummary||'—'}</p></div>
              </div>
            ) : <p className="empty-msg">종목 카드를 클릭하면 AI 분석이 표시됩니다</p>}
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   SEARCH TAB
══════════════════════════════════════════════ */
function SearchTab({ pendingStock, onClearPending }) {
  const [query,setQuery]           = useState('')
  const [results,setResults]       = useState([])
  const [searched,setSearched]     = useState(false)
  const [searching,setSearching]   = useState(false)
  const [detail,setDetail]         = useState(null)
  const [detailLoading,setDetailLoading] = useState(false)

  useEffect(()=>{
    if (pendingStock) { selectStock(pendingStock); onClearPending?.() }
  },[pendingStock])

  const doSearch = async () => {
    if (!query.trim()) return
    setSearching(true); setSearched(false); setDetail(null)
    const [usRes,krRes] = await Promise.allSettled([
      supabase.functions.invoke('stock-us-search',{body:{query}}),
      supabase.functions.invoke('stock-kr-search',{body:{query}}),
    ])
    const us = usRes.status==='fulfilled'&&Array.isArray(usRes.value.data)?usRes.value.data.map(s=>({...s,market:'US'})):[]
    const kr = krRes.status==='fulfilled'&&Array.isArray(krRes.value.data)?krRes.value.data.map(s=>({...s,market:'KR'})):[]
    setResults([...us.slice(0,6),...kr.slice(0,6)])
    setSearched(true); setSearching(false)
  }

  const selectStock = async stock => {
    setDetailLoading(true); setDetail(null)
    try {
      const loaded = await fetchStockDetail(stock)
      setDetail(loaded)
    } finally {
      setDetailLoading(false)
    }
  }

  const q     = detail?.quote||{}
  const price = detail?.market==='US'?q.c:q.price
  const pct   = detail?.market==='US'?q.dp:q.changePercent
  const { startDate:c3m, endDate:c3me } = calcDateRange('3M')

  return (
    <div className="search-tab">
      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input type="text" className="search-input" value={query} onChange={e=>setQuery(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&doSearch()} placeholder="종목명 또는 티커 입력 (예: NVDA, 삼성전자, 005930)" />
        <button className="search-btn" onClick={doSearch} disabled={searching}>{searching?'검색 중...':'검색'}</button>
      </div>

      {!detail&&!detailLoading&&searched&&(
        results.length>0
          ? <div className="sr-list">
              {results.map((s,i)=>(
                <div key={i} className="sr-item" onClick={()=>selectStock(s)}>
                  <div className="sr-left">
                    <span className="sr-ticker">{s.symbol||s.ticker}</span>
                    <span className="sr-name">{s.description||s.name}</span>
                  </div>
                  <span className={`sr-badge ${s.market==='US'?'us':'kr'}`}>{s.market}</span>
                </div>
              ))}
            </div>
          : <p className="empty-msg" style={{marginTop:'2rem',textAlign:'center'}}>"{query}" 검색 결과가 없습니다</p>
      )}

      {detailLoading && <Spinner />}

      {detail && !detailLoading && (
        <div className="stock-detail">
          <button className="back-btn" onClick={()=>setDetail(null)}>← 검색 결과로</button>
          <div className="sd-head dash-card">
            <div className="sd-head-left">
              <h2 className="sd-name">{detail.name}</h2>
              <div className="sd-badges">
                <span className={`sr-badge sd-market-badge ${detail.market==='US'?'us':'kr'}`}>{detail.market==='US'?'US':'KR'}</span>
                <span className="sd-ticker-tag">{detail.ticker}</span>
              </div>
            </div>
            <div className="sd-head-right">
              <span className="sd-price">{fmtPrice(price,detail.market)}</span>
              <span className={`sd-pct ${upDown(pct)}`}>{fmtPct(pct)} {Number(pct)>=0?'▲':'▼'}</span>
            </div>
          </div>
          <div className="sd-metrics">
            {detail.market==='US'&&<><MetricCard label="당일 고가" value={q.h?`$${q.h.toFixed(2)}`:'N/A'}/><MetricCard label="당일 저가" value={q.l?`$${q.l.toFixed(2)}`:'N/A'}/></>}
            <MetricCard label="52주 고가" value={detail.high52?fmtPrice(detail.high52,detail.market):'N/A'}/>
            <MetricCard label="52주 저가" value={detail.low52?fmtPrice(detail.low52,detail.market):'N/A'}/>
            <MetricCard label="거래량" value={q.volume?Number(q.volume).toLocaleString():'N/A'}/>
            <MetricCard label="PER" value={q.per!=null&&!isNaN(q.per)?Number(q.per).toFixed(2):'N/A'}/>
            <MetricCard label="PBR" value={q.pbr!=null&&!isNaN(q.pbr)?Number(q.pbr).toFixed(2):'N/A'}/>
          </div>
          <div className="dash-card sd-chart">
            <h3 className="card-title">{detail.ticker} 차트 (3개월)</h3>
            <ChartWidget ticker={detail.ticker} market={detail.market} height={240} type="candlestick" startDate={c3m} endDate={c3me} />
          </div>
          {detail.news.length>0&&(
            <div className="dash-card">
              <h3 className="card-title">관련 뉴스 (Finnhub)</h3>
              <div className="news-feed">
                {detail.news.map((n,i)=>(
                  <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className="news-item">
                    <div className="news-meta">
                      <span className="news-source">{n.source}</span>
                      <span className="news-dt">{new Date(n.datetime*1000).toLocaleDateString('ko-KR')}</span>
                    </div>
                    <p className="news-headline">{n.headline_ko || n.headline}</p>
                  </a>
                ))}
              </div>
            </div>
          )}
          <div className="dash-card">
            <h3 className="card-title">AI 종목 분석</h3>
            <div className="ai-blocks">
              <div className="ai-block"><span className="ai-badge qwen">Qwen3 · 수치 분석</span><p>{detail.ai?.analysis||'분석 데이터 없음'}</p></div>
              <div className="ai-block"><span className="ai-badge compound">Tavily · 최신 뉴스 요약</span><p>{detail.ai?.newsSummary||'뉴스 요약 없음'}</p></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StockDetailPanel({ detail, onBack, onClose, isModal }) {
  const q     = detail?.quote||{}
  const price = detail?.market==='US'?q.c:q.price
  const pct   = detail?.market==='US'?q.dp:q.changePercent
  const { startDate:c3m, endDate:c3me } = calcDateRange('3M')

  return (
    <div className="stock-detail">
      {isModal ? (
        <button className="stock-modal-close" onClick={onClose}>× 닫기</button>
      ) : (
        <button className="back-btn" onClick={onBack}>← 검색 결과로</button>
      )}
      <div className="sd-head dash-card">
        <div className="sd-head-left">
          <h2 className="sd-name">{detail.name}</h2>
          <div className="sd-badges">
            <span className={`sr-badge sd-market-badge ${detail.market==='US'?'us':'kr'}`}>{detail.market==='US'?'US':'KR'}</span>
            <span className="sd-ticker-tag">{detail.ticker}</span>
          </div>
        </div>
        <div className="sd-head-right">
          <span className="sd-price">{fmtPrice(price,detail.market)}</span>
          <span className={`sd-pct ${upDown(pct)}`}>{fmtPct(pct)} {Number(pct)>=0?'▲':'▼'}</span>
        </div>
      </div>
      <div className="sd-metrics">
        {detail.market==='US'&&<><MetricCard label="당일 고가" value={q.h?`$${q.h.toFixed(2)}`:'N/A'}/><MetricCard label="당일 저가" value={q.l?`$${q.l.toFixed(2)}`:'N/A'}/></>}
        <MetricCard label="52주 고가" value={detail.high52?fmtPrice(detail.high52,detail.market):'N/A'}/>
        <MetricCard label="52주 저가" value={detail.low52?fmtPrice(detail.low52,detail.market):'N/A'}/>
        <MetricCard label="거래량" value={q.volume?Number(q.volume).toLocaleString():'N/A'}/>
        <MetricCard label="PER" value={q.per!=null&&!isNaN(q.per)?Number(q.per).toFixed(2):'N/A'}/>
        <MetricCard label="PBR" value={q.pbr!=null&&!isNaN(q.pbr)?Number(q.pbr).toFixed(2):'N/A'}/>
      </div>
      <div className="dash-card sd-chart">
        <h3 className="card-title">{detail.ticker} 차트 (3개월)</h3>
        <ChartWidget ticker={detail.ticker} market={detail.market} height={240} type="candlestick" startDate={c3m} endDate={c3me} />
      </div>
      {detail.news.length>0&&(
        <div className="dash-card">
          <h3 className="card-title">관련 뉴스 (Finnhub)</h3>
          <div className="news-feed">
            {detail.news.map((n,i)=>(
              <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className="news-item">
                <div className="news-meta">
                  <span className="news-source">{n.source}</span>
                  <span className="news-dt">{new Date(n.datetime*1000).toLocaleDateString('ko-KR')}</span>
                </div>
                <p className="news-headline">{n.headline}</p>
              </a>
            ))}
          </div>
        </div>
      )}
      <div className="dash-card">
        <h3 className="card-title">AI 종목 분석</h3>
        <div className="ai-blocks">
          <div className="ai-block"><span className="ai-badge qwen">Qwen3 · 수치 분석</span><p>{detail.ai?.analysis||'분석 데이터 없음'}</p></div>
          <div className="ai-block"><span className="ai-badge compound">Tavily · 최신 뉴스 요약</span><p>{detail.ai?.newsSummary||'뉴스 요약 없음'}</p></div>
        </div>
      </div>
    </div>
  )
}

async function fetchStockDetail(stock) {
  const ticker = stock.symbol || stock.ticker
  const market = stock.market
  const fn = market === 'US' ? 'stock-us-quote' : 'stock-kr-quote'
  const [quoteRes, newsRes, aiRes] = await Promise.allSettled([
    supabase.functions.invoke(fn, { body:{ ticker } }),
    market === 'US' ? supabase.functions.invoke('stock-us-news', { body:{ ticker } }) : Promise.resolve({ data:{ news:[] } }),
    supabase.functions.invoke('stock-ai-analyze', { body:{ ticker, market } }),
  ])
  const quote = quoteRes.status === 'fulfilled' ? (quoteRes.value.data || {}) : {}
  const news = newsRes.status === 'fulfilled' ? (newsRes.value.data?.news?.slice(0,5) || []) : []
  const ai = aiRes.status === 'fulfilled' ? (aiRes.value.data || {}) : {}
  let high52 = quote.high52 ?? null
  let low52  = quote.low52 ?? null
  if (market === 'US' && !high52) {
    try {
      const { startDate:s, endDate:e } = calcDateRange('1Y')
      const { data:cd } = await supabase.functions.invoke('stock-us-chart', { body:{ ticker, period:'W', startDate:s, endDate:e } })
      if (Array.isArray(cd) && cd.length > 0) {
        high52 = Math.max(...cd.map(d=>d.high))
        low52  = Math.min(...cd.map(d=>d.low))
      }
    } catch {}
  }
  return {
    ticker,
    market,
    quote,
    news,
    ai,
    high52,
    low52,
    name: stock.description || stock.name || US_NAME_MAP[ticker] || ticker,
  }
}

function StockDetailModal({ stock, onClose }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!stock) return
    let active = true
    setLoading(true)
    setDetail(null)
    fetchStockDetail(stock)
      .then(result => { if (active) setDetail(result) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [stock])

  if (!stock) return null

  return (
    <div className="stock-modal-overlay" onClick={onClose}>
      <div className="stock-modal" onClick={e => e.stopPropagation()}>
        {loading ? <Spinner /> : detail ? <StockDetailPanel detail={detail} onClose={onClose} isModal /> : <div className="modal-error">종목 상세정보를 불러올 수 없습니다.</div>}
      </div>
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