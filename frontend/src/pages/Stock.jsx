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
  const [activeTab, setActiveTab] = useState('portfolio') // 우선순위에 따라 portfolio부터

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
      // 각 종목의 현재가 가져오기
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
      if (error) {
        console.error(`fetchCurrentPrice error for ${ticker}:`, error)
        throw error
      }
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

// Stock Chart Component using TradingView
function StockChart({ stock, onClose }) {
  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState(null)
  const [dragEnd, setDragEnd] = useState(null)

  useEffect(() => {
    if (!chartContainerRef.current) return

    // 차트 생성
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#e1e1e1' },
        horzLines: { color: '#e1e1e1' },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    })

    const candlestickSeries = chart.addCandlestickSeries()

    // 차트 데이터 가져오기
    fetchChartData(stock.ticker, stock.market, startDate, endDate).then(data => {
      if (data) {
        candlestickSeries.setData(data)
      }
    })

    // 드래그 선택을 위한 이벤트 리스너
    const handleMouseDown = (event) => {
      const rect = chartContainerRef.current.getBoundingClientRect()
      const x = event.clientX - rect.left
      const time = chart.timeScale().coordinateToTime(x)
      if (time) {
        setIsDragging(true)
        setDragStart(time)
        setDragEnd(time)
      }
    }

    const handleMouseMove = (event) => {
      if (!isDragging || !dragStart) return

      const rect = chartContainerRef.current.getBoundingClientRect()
      const x = event.clientX - rect.left
      const time = chart.timeScale().coordinateToTime(x)
      if (time) {
        setDragEnd(time)
      }
    }

    const handleMouseUp = () => {
      if (isDragging && dragStart && dragEnd) {
        // 드래그가 완료되면 날짜 범위 설정
        const start = Math.min(dragStart, dragEnd)
        const end = Math.max(dragStart, dragEnd)

        const startDateStr = new Date(start * 1000).toISOString().split('T')[0]
        const endDateStr = new Date(end * 1000).toISOString().split('T')[0]

        setStartDate(startDateStr)
        setEndDate(endDateStr)

        // 선택 영역 표시를 위해 차트 업데이트
        fetchChartData(stock.ticker, stock.market, startDateStr, endDateStr).then(data => {
          if (data) {
            candlestickSeries.setData(data)
          }
        })
      }
      setIsDragging(false)
      setDragStart(null)
      setDragEnd(null)
    }

    chartContainerRef.current.addEventListener('mousedown', handleMouseDown)
    chartContainerRef.current.addEventListener('mousemove', handleMouseMove)
    chartContainerRef.current.addEventListener('mouseup', handleMouseUp)

    chartRef.current = chart

    return () => {
      chartContainerRef.current?.removeEventListener('mousedown', handleMouseDown)
      chartContainerRef.current?.removeEventListener('mousemove', handleMouseMove)
      chartContainerRef.current?.removeEventListener('mouseup', handleMouseUp)
      chart.remove()
    }
  }, [stock, startDate, endDate])

  const fetchChartData = async (ticker, market, start = '', end = '') => {
    try {
      const fn = market === 'US' ? 'stock-us-chart' : 'stock-kr-chart'
      const { data, error } = await supabase.functions.invoke(fn, {
        body: {
          ticker,
          period: 'D',
          startDate: start,
          endDate: end
        }
      })
      if (error) throw error
      // 데이터 포맷팅: { time: timestamp, open, high, low, close }
      return data.map(item => ({
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

  const handleDateRangeSubmit = () => {
    if (startDate && endDate) {
      // 날짜 범위가 변경되면 차트 데이터 다시 가져오기
      const chart = chartRef.current
      if (chart) {
        const candlestickSeries = chart.timeScale().series()[0]
        fetchChartData(stock.ticker, stock.market, startDate, endDate).then(data => {
          if (data && candlestickSeries) {
            candlestickSeries.setData(data)
          }
        })
      }
    }
  }

  const clearDateRange = () => {
    setStartDate('')
    setEndDate('')
    // 전체 데이터 다시 가져오기
    const chart = chartRef.current
    if (chart) {
      const candlestickSeries = chart.timeScale().series()[0]
      fetchChartData(stock.ticker, stock.market).then(data => {
        if (data && candlestickSeries) {
          candlestickSeries.setData(data)
        }
      })
    }
  }

  return (
    <div className="stock-chart-modal">
      <button onClick={onClose}>닫기</button>
      <h3>{stock.name} ({stock.ticker}) 차트</h3>

      {/* 날짜 범위 선택 UI */}
      <div className="date-range-selector">
        <label>
          시작일:
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label>
          종료일:
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
        <button onClick={handleDateRangeSubmit}>적용</button>
        <button onClick={clearDateRange}>초기화</button>
      </div>

      <p className="drag-instruction">
        💡 차트에서 드래그하여 날짜 범위를 선택할 수도 있습니다!
      </p>

      <div
        ref={chartContainerRef}
        style={{
          width: '100%',
          height: '400px',
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
      ></div>
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
      // 통합 검색: 미국과 국내 모두 검색
      const [usResults, krResults] = await Promise.all([
        searchStocks(query, 'US'),
        searchStocks(query, 'KR')
      ])
      setResults([...(usResults || []), ...(krResults || [])])
    } catch (error) {
      console.error('Search error:', error)
    }
    setLoading(false)
  }

  const searchStocks = async (q, market) => {
    try {
      const fn = market === 'US' ? 'stock-us-search' : 'stock-kr-search' // 함수 가정
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { query: q }
      })
      if (error) throw error
      return data.map(item => ({ ...item, market }))
    } catch (error) {
      console.error(`Error searching ${market}:`, error)
      return []
    }
  }

  const fetchStockDetails = async (ticker, market) => {
    try {
      const fn = market === 'US' ? 'stock-us-quote' : 'stock-kr-quote'
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { ticker }
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
            {/* 세부 정보 표시 */}
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
    // 뉴스 가져오기
    const newsData = await fetchNews(stock.ticker, stock.market)
    setNews(newsData || [])

    // AI 분석
    const analysisData = await fetchAIAnalysis(stock.ticker, stock.market)
    setAnalysis(analysisData || '')
  }

  const fetchNews = async (ticker, market) => {
    if (market === 'US') {
      const { data, error } = await supabase.functions.invoke('stock-us-news', {
        body: { ticker }
      })
      if (error) throw error
      return data
    }
    return []
  }

  const fetchAIAnalysis = async (ticker, market) => {
    const { data, error } = await supabase.functions.invoke('stock-ai-analyze', {
      body: { ticker, market }
    })
    if (error) throw error
    return data.analysis
  }

  return (
    <div className="stock-details-modal">
      <button onClick={onClose}>닫기</button>
      <h3>{stock.name} ({stock.ticker})</h3>
      <p>현재가: ${stock.c || stock.price}</p>
      {/* 다른 세부 정보 */}
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
      console.log('Fetching dashboard data...')
      
      // 주요 지수 가져오기
      const indexData = await fetchIndices()
      console.log('Indices data:', indexData)
      setIndices(indexData)

      // 포트폴리오 요약 (간단히 상위 4개)
      const { data: portfolioData, error: portfolioError } = await supabase.from('portfolio').select('*').limit(4)
      if (portfolioError) {
        console.error('Portfolio fetch error:', portfolioError)
      } else {
        console.log('Portfolio data:', portfolioData)
        const portfolioWithPrices = await Promise.all(
          (portfolioData || []).map(async (stock) => {
            const currentPrice = await fetchCurrentPrice(stock.ticker, stock.market)
            const changePercent = currentPrice ? ((currentPrice - stock.avg_price) / stock.avg_price * 100) : 0
            return { ...stock, changePercent }
          })
        )
        console.log('Portfolio with prices:', portfolioWithPrices)
        setPortfolioSummary(portfolioWithPrices)
      }

      // 뉴스 요약
      const summary = await fetchNewsSummary()
      console.log('News summary:', summary)
      setNewsSummary(summary)
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    }
    setLoading(false)
  }

  const fetchIndices = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('stock-us-index', {
        body: {}
      })
      if (error) {
        console.error('stock-us-index error:', error)
        // 임시 데이터 반환
        return [
          { name: 'S&P 500', value: '4200.00', change: '+1.2' },
          { name: 'NASDAQ', value: '13000.00', change: '+0.8' },
          { name: 'KOSPI', value: '2650.00', change: '+1.2' },
          { name: 'KOSDAQ', value: '850.00', change: '-0.5' },
        ]
      }
      
      // 임시로 한국 지수 추가 (실제로는 stock-kr-index 사용)
      const krIndices = [
        { name: 'KOSPI', value: '2650.00', change: '+1.2' },
        { name: 'KOSDAQ', value: '850.00', change: '-0.5' },
      ]
      
      return [...(data || []), ...krIndices]
    } catch (error) {
      console.error('fetchIndices error:', error)
      // 임시 데이터
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
        body: { ticker }
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
        body: { model: 'groq/compound', query: '오늘의 주요 주식 뉴스 요약을 3줄로 해주세요.' }
      })
      if (error) {
        console.error('query-groq error:', error)
        throw error
      }
      return data.response
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
          {/* 주요 지수 섹션 */}
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

          {/* 내 보유종목 요약 섹션 */}
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

          {/* 오늘의 주요 뉴스 섹션 */}
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
