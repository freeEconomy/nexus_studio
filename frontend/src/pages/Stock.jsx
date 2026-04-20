import React, { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { createChart } from 'lightweight-charts'
import './Stock.css'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const TABS = [
  { id: 'dashboard', name: '대시보드' },
  { id: 'us-stocks', name: '미국주식' },
  { id: 'kr-stocks', name: '국내주식' },
  { id: 'portfolio', name: '내 포트폴리오' },
  { id: 'search', name: '종목검색' },
]

export default function Stock() {
  const [activeTab, setActiveTab] = useState('portfolio')

  const renderTabContent = () => {
    switch (activeTab) {
      case 'portfolio':
        return <PortfolioTab />
      case 'search':
        return <SearchTab />
      case 'dashboard':
        return <DashboardTab />
      case 'us-stocks':
        return <USStocksTab />
      case 'kr-stocks':
        return <KRStocksTab />
      default:
        return <div>준비 중입니다.</div>
    }
  }

  return (
    <div className="stock-page">
      <div className="stock-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`stock-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.name}
          </button>
        ))}
      </div>
      <div className="stock-content">
        {renderTabContent()}
      </div>
    </div>
  )
}

// Portfolio Tab Component
function PortfolioTab() {
  const [portfolio, setPortfolio] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedStock, setSelectedStock] = useState(null)

  useEffect(() => {
    fetchPortfolio()
  }, [])

  const fetchPortfolio = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('portfolio').select('*')
    if (error) {
      console.error('Error fetching portfolio:', error)
    } else {
      const portfolioWithPrices = await Promise.all(
        (data || []).map(async (stock) => {
          const currentPrice = await fetchCurrentPrice(stock.ticker, stock.market)
          const changePercent = currentPrice ? ((currentPrice - stock.avg_price) / stock.avg_price * 100) : 0
          return { ...stock, currentPrice, changePercent }
        })
      )
      setPortfolio(portfolioWithPrices)
    }
    setLoading(false)
  }

  const fetchCurrentPrice = async (ticker, market) => {
    try {
      const fn = market === 'US' ? 'stock-us-quote' : 'stock-kr-quote'
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { ticker }
      })
      if (error) throw error
      return market === 'US' ? data.c : data.price
    } catch (error) {
      console.error('fetchCurrentPrice error:', error)
      return null
    }
  }

  const totalValue = portfolio.reduce((sum, stock) => sum + (stock.quantity * (stock.currentPrice || stock.avg_price)), 0)
  const totalProfit = portfolio.reduce((sum, stock) => sum + (stock.quantity * ((stock.currentPrice || stock.avg_price) - stock.avg_price)), 0)
  const totalProfitPercent = totalValue > 0 ? (totalProfit / (totalValue - totalProfit)) * 100 : 0

  return (
    <div className="portfolio-tab">
      <h2>내 포트폴리오</h2>
      <div className="portfolio-summary">
        <p>총 평가금액: ${totalValue.toFixed(2)}</p>
        <p>전체 수익: ${totalProfit.toFixed(2)} ({totalProfitPercent.toFixed(2)}%)</p>
      </div>
      {loading ? (
        <div>로딩 중...</div>
      ) : (
        <div className="portfolio-list">
          {portfolio.map(stock => (
            <div key={stock.id} className="portfolio-card" onClick={() => setSelectedStock(stock)}>
              <h3>{stock.name} ({stock.ticker})</h3>
              <p>현재가: ${stock.currentPrice?.toFixed(2) || 'N/A'}</p>
              <p>등락률: {stock.changePercent?.toFixed(2)}%</p>
              <p>보유수량: {stock.quantity}</p>
              <p>평균매입가: ${stock.avg_price}</p>
              <p>수익률: {stock.changePercent?.toFixed(2)}%</p>
            </div>
          ))}
        </div>
      )}
      {selectedStock && (
        <StockChart stock={selectedStock} onClose={() => setSelectedStock(null)} />
      )}
    </div>
  )
}

// Stock Chart Component using lightweight-charts
function StockChart({ stock, onClose }) {
  const chartContainerRef = useRef(null)
  const seriesRef = useRef(null)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const fetchChartData = async (start = '', end = '') => {
    try {
      const fn = stock.market === 'US' ? 'stock-us-chart' : 'stock-kr-chart'
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { ticker: stock.ticker, period: 'D', startDate: start, endDate: end },
      })
      if (error) throw error
      return (data || []).map(item => ({
        time: item.time,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
      }))
    } catch (error) {
      console.error('Error fetching chart data:', error)
      return null
    }
  }

  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: { background: { color: '#ffffff' }, textColor: '#333' },
      grid: { vertLines: { color: '#e1e1e1' }, horzLines: { color: '#e1e1e1' } },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    })

    const candlestickSeries = chart.addCandlestickSeries()
    seriesRef.current = candlestickSeries

    fetchChartData().then(data => {
      if (data) candlestickSeries.setData(data)
    })

    const handleMouseDown = (event) => {
      const rect = chartContainerRef.current.getBoundingClientRect()
      const time = chart.timeScale().coordinateToTime(event.clientX - rect.left)
      if (time) {
        isDraggingRef.current = true
        dragStartRef.current = time
        setIsDragging(true)
      }
    }

    const handleMouseUp = (event) => {
      if (isDraggingRef.current && dragStartRef.current) {
        const rect = chartContainerRef.current.getBoundingClientRect()
        const endTime = chart.timeScale().coordinateToTime(event.clientX - rect.left)
        if (endTime) {
          const s = Math.min(dragStartRef.current, endTime)
          const e = Math.max(dragStartRef.current, endTime)
          const startDateStr = new Date(s * 1000).toISOString().split('T')[0]
          const endDateStr = new Date(e * 1000).toISOString().split('T')[0]
          setStartDate(startDateStr)
          setEndDate(endDateStr)
          fetchChartData(startDateStr, endDateStr).then(data => {
            if (data && seriesRef.current) seriesRef.current.setData(data)
          })
        }
      }
      isDraggingRef.current = false
      dragStartRef.current = null
      setIsDragging(false)
    }

    const el = chartContainerRef.current
    el.addEventListener('mousedown', handleMouseDown)
    el.addEventListener('mouseup', handleMouseUp)

    return () => {
      el.removeEventListener('mousedown', handleMouseDown)
      el.removeEventListener('mouseup', handleMouseUp)
      chart.remove()
      seriesRef.current = null
    }
  }, [stock])

  const handleDateRangeSubmit = () => {
    if (!startDate || !endDate || !seriesRef.current) return
    fetchChartData(startDate, endDate).then(data => {
      if (data) seriesRef.current.setData(data)
    })
  }

  const clearDateRange = () => {
    setStartDate('')
    setEndDate('')
    fetchChartData().then(data => {
      if (data && seriesRef.current) seriesRef.current.setData(data)
    })
  }

  return (
    <div className="stock-chart-modal">
      <button onClick={onClose}>닫기</button>
      <h3>{stock.name} ({stock.ticker}) 차트</h3>
      <div className="date-range-selector">
        <label>
          시작일:
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          종료일:
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <button onClick={handleDateRangeSubmit}>적용</button>
        <button onClick={clearDateRange}>초기화</button>
      </div>
      <p className="drag-instruction">💡 차트에서 드래그하여 날짜 범위를 선택할 수도 있습니다!</p>
      <div
        ref={chartContainerRef}
        style={{ width: '100%', height: '400px', cursor: isDragging ? 'grabbing' : 'grab' }}
      />
    </div>
  )
}

// Search Tab Component
function SearchTab() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedStock, setSelectedStock] = useState(null)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const [usResults, krResults] = await Promise.all([
        searchStocks(query, 'US'),
        searchStocks(query, 'KR'),
      ])
      setResults([...(usResults || []), ...(krResults || [])])
    } catch (error) {
      console.error('Search error:', error)
    }
    setLoading(false)
  }

  const searchStocks = async (q, market) => {
    try {
      const fn = market === 'US' ? 'stock-us-search' : 'stock-kr-search'
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { query: q },
      })
      if (error) throw error
      return (data || []).map(item => ({
        ticker: item.symbol || item.ticker,
        name: item.description || item.name,
        market,
      }))
    } catch (error) {
      console.error(`Error searching ${market}:`, error)
      return []
    }
  }

  const fetchStockDetails = async (ticker, market) => {
    try {
      const fn = market === 'US' ? 'stock-us-quote' : 'stock-kr-quote'
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { ticker },
      })
      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching details:', error)
      return null
    }
  }

  const handleStockClick = async (stock) => {
    const details = await fetchStockDetails(stock.ticker, stock.market)
    setSelectedStock({ ...stock, ...details })
  }

  return (
    <div className="search-tab">
      <h2>종목검색</h2>
      <div className="search-input">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="종목명 또는 티커 검색"
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button onClick={handleSearch}>검색</button>
      </div>
      {loading && <div>검색 중...</div>}
      <div className="search-results">
        {results.map((stock, index) => (
          <div key={index} className="search-result" onClick={() => handleStockClick(stock)}>
            <h3>{stock.name} ({stock.ticker}) - {stock.market}</h3>
          </div>
        ))}
      </div>
      {selectedStock && (
        <StockDetails stock={selectedStock} onClose={() => setSelectedStock(null)} />
      )}
    </div>
  )
}

// Stock Details Modal
function StockDetails({ stock, onClose }) {
  const [news, setNews] = useState([])
  const [analysis, setAnalysis] = useState('')

  useEffect(() => {
    fetchNewsAndAnalysis()
  }, [stock])

  const fetchNewsAndAnalysis = async () => {
    const newsData = await fetchNews(stock.ticker, stock.market)
    setNews(newsData || [])

    const analysisData = await fetchAIAnalysis(stock.ticker, stock.market)
    setAnalysis(analysisData || '')
  }

  const fetchNews = async (ticker, market) => {
    if (market === 'US') {
      try {
        const { data, error } = await supabase.functions.invoke('stock-us-news', {
          body: { ticker },
        })
        if (error) throw error
        return data.news || []
      } catch (error) {
        console.error('fetchNews error:', error)
        return []
      }
    }
    return []
  }

  const fetchAIAnalysis = async (ticker, market) => {
    try {
      const { data, error } = await supabase.functions.invoke('stock-ai-analyze', {
        body: { ticker, market },
      })
      if (error) throw error
      return data.analysis
    } catch (error) {
      console.error('fetchAIAnalysis error:', error)
      return ''
    }
  }

  return (
    <div className="stock-details-modal">
      <button onClick={onClose}>닫기</button>
      <h3>{stock.name} ({stock.ticker})</h3>
      <p>현재가: ${stock.c || stock.price}</p>
      <h4>관련 뉴스</h4>
      {news.map((item, index) => (
        <div key={index}>
          <a href={item.url} target="_blank" rel="noopener noreferrer">{item.headline}</a>
        </div>
      ))}
      <h4>AI 분석</h4>
      <p>{analysis}</p>
    </div>
  )
}

// Dashboard Tab Component
function DashboardTab() {
  const [indices, setIndices] = useState([])
  const [portfolioSummary, setPortfolioSummary] = useState([])
  const [newsSummary, setNewsSummary] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      const indexData = await fetchIndices()
      setIndices(indexData)

      const { data: portfolioData, error: portfolioError } = await supabase.from('portfolio').select('*').limit(4)
      if (!portfolioError) {
        const portfolioWithPrices = await Promise.all(
          (portfolioData || []).map(async (stock) => {
            const currentPrice = await fetchCurrentPrice(stock.ticker, stock.market)
            const changePercent = currentPrice ? ((currentPrice - stock.avg_price) / stock.avg_price * 100) : 0
            return { ...stock, changePercent }
          })
        )
        setPortfolioSummary(portfolioWithPrices)
      }

      const summary = await fetchNewsSummary()
      setNewsSummary(summary)
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    }
    setLoading(false)
  }

  const fetchIndices = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('stock-us-index', {
        body: {},
      })
      if (error) throw error
      const krIndices = [
        { name: 'KOSPI', value: '2650.00', change: '+1.2' },
        { name: 'KOSDAQ', value: '850.00', change: '-0.5' },
      ]
      return [...(data || []), ...krIndices]
    } catch (error) {
      console.error('fetchIndices error:', error)
      return [
        { name: 'S&P 500', value: '4200.00', change: '+1.2' },
        { name: 'NASDAQ', value: '13000.00', change: '+0.8' },
        { name: 'KOSPI', value: '2650.00', change: '+1.2' },
        { name: 'KOSDAQ', value: '850.00', change: '-0.5' },
      ]
    }
  }

  const fetchCurrentPrice = async (ticker, market) => {
    try {
      const fn = market === 'US' ? 'stock-us-quote' : 'stock-kr-quote'
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { ticker },
      })
      if (error) throw error
      return market === 'US' ? data.c : data.price
    } catch (error) {
      console.error('Error fetching price:', error)
      return null
    }
  }

  const fetchNewsSummary = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('query-groq', {
        body: {
          model: 'compound-beta-mini',
          messages: [{ role: 'user', content: '오늘의 주요 주식 뉴스 요약을 3줄로 해주세요.' }],
        },
      })
      if (error) throw error
      return data.result || '뉴스를 불러올 수 없습니다.'
    } catch (error) {
      console.error('fetchNewsSummary error:', error)
      return '뉴스를 불러올 수 없습니다.'
    }
  }

  return (
    <div className="dashboard-tab">
      <h2>대시보드</h2>
      {loading ? (
        <div>로딩 중...</div>
      ) : (
        <div className="dashboard-container">
          <div className="dashboard-section">
            <h3>주요 지수</h3>
            <div className="indices-grid">
              {indices.map((index, idx) => (
                <div key={idx} className={`index-item ${parseFloat(index.change) > 0 ? 'positive' : 'negative'}`}>
                  {index.name} {parseFloat(index.change) > 0 ? '+' : ''}{index.change}%
                </div>
              ))}
            </div>
          </div>

          <div className="dashboard-section">
            <h3>내 보유종목 요약</h3>
            <div className="portfolio-summary-grid">
              {portfolioSummary.map((stock, idx) => (
                <div key={idx} className={`portfolio-item ${stock.changePercent > 0 ? 'positive' : 'negative'}`}>
                  {stock.name} {stock.changePercent > 0 ? '▲' : '▼'}{Math.abs(stock.changePercent).toFixed(1)}%
                </div>
              ))}
            </div>
          </div>

          <div className="dashboard-section">
            <h3>오늘의 주요 뉴스 (AI 요약)</h3>
            <div className="news-summary">
              {newsSummary.split('\n').map((line, idx) => (
                <p key={idx}>• {line}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function USStocksTab() {
  return <div>미국주식 탭 - 준비 중</div>
}

function KRStocksTab() {
  return <div>국내주식 탭 - 준비 중</div>
}
