import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, GitCompareArrows, MapPin, TrendingUp, Cpu, Newspaper, ExternalLink, RefreshCw } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import './Home.css'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

const FEATURES = [
  {
    Icon: Bot,
    title: 'Nexus Agent',
    tag: 'NEW',
    desc: 'MC·MS 업무를 자연어로 관리하는 지능형 에이전트. 업무 등록·현황 조회·주간보고를 처리합니다.',
    path: '/weekly-report',
    gradient: ['#667eea', '#764ba2'],
    glow: 'rgba(102,126,234,0.35)',
  },
  {
    Icon: GitCompareArrows,
    title: 'AI Lab',
    desc: '하나의 질문을 여러 AI 모델에 동시 요청해 답변을 비교합니다. GPT, Llama, Qwen 등 최신 모델을 한 화면에서.',
    path: '/multi-agent',
    gradient: ['#f093fb', '#f5576c'],
    glow: 'rgba(240,147,251,0.3)',
  },
  {
    Icon: MapPin,
    title: 'Journey',
    desc: 'AI가 맞춤형 여행 일정, 맛집, 교통편을 자동으로 계획합니다. 장소·날씨·지도를 통합 제공.',
    path: '/travel-planner',
    gradient: ['#4facfe', '#00f2fe'],
    glow: 'rgba(79,172,254,0.3)',
  },
  {
    Icon: TrendingUp,
    title: 'Markets',
    desc: '미국·한국 주식 실시간 조회, AI 투자 분석, 포트폴리오 관리를 한 곳에서. 섹터 히트맵 & 차트 제공.',
    path: '/stock',
    gradient: ['#43e97b', '#38f9d7'],
    glow: 'rgba(67,233,123,0.3)',
  },
]

// 파티클 캔버스
function ParticleCanvas() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf
    let w, h

    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.5 + 0.4,
      vx: (Math.random() - 0.5) * 0.0003,
      vy: (Math.random() - 0.5) * 0.0003,
      alpha: Math.random() * 0.5 + 0.15,
    }))

    const resize = () => {
      w = canvas.width  = canvas.offsetWidth
      h = canvas.height = canvas.offsetHeight
    }

    const draw = () => {
      ctx.clearRect(0, 0, w, h)

      // 연결선
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = (particles[i].x - particles[j].x) * w
          const dy = (particles[i].y - particles[j].y) * h
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 140) {
            ctx.beginPath()
            ctx.strokeStyle = `rgba(96,165,250,${0.12 * (1 - dist / 140)})`
            ctx.lineWidth = 0.6
            ctx.moveTo(particles[i].x * w, particles[i].y * h)
            ctx.lineTo(particles[j].x * w, particles[j].y * h)
            ctx.stroke()
          }
        }
      }

      // 점
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = 1; if (p.x > 1) p.x = 0
        if (p.y < 0) p.y = 1; if (p.y > 1) p.y = 0
        ctx.beginPath()
        ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(148,163,184,${p.alpha})`
        ctx.fill()
      })

      raf = requestAnimationFrame(draw)
    }

    resize()
    draw()
    window.addEventListener('resize', resize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={ref} className="particle-canvas" />
}

// 뉴스 섹션
function NewsSection() {
  const [aiNews, setAiNews] = useState([])
  const [generalNews, setGeneralNews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchNews = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('news-kr', {
        body: { type: 'both', max_results: 5 },
      })

      if (fnErr) throw new Error(fnErr.message)
      if (data?.ai) setAiNews(data.ai)
      if (data?.general) setGeneralNews(data.general)
      setLastUpdated(new Date())
    } catch (e) {
      setError('뉴스를 불러오는 데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchNews() }, [])

  const formatTime = (date) => {
    if (!date) return ''
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    const now = new Date()
    const diffMin = Math.floor((now - d) / 60000)
    if (diffMin < 60) return `${diffMin}분 전`
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}시간 전`
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  }

  const NewsCard = ({ item, index }) => (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="news-item"
    >
      <span className="news-index">{String(index + 1).padStart(2, '0')}</span>
      <span className="news-body">
        <span className="news-title">{item.title}</span>
        <span className="news-meta">
          {item.source && <span className="news-source">{item.source}</span>}
          {item.published_date && <span className="news-time">{formatDate(item.published_date)}</span>}
        </span>
      </span>
      <ExternalLink size={13} className="news-link-icon" />
    </a>
  )

  return (
    <section className="news-section">
      <div className="news-header">
        <h2 className="news-section-title">Today's News</h2>
        <button className="news-refresh-btn" onClick={fetchNews} disabled={loading} title="새로고침">
          <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          {lastUpdated && <span className="news-updated">{formatTime(lastUpdated)} 업데이트</span>}
        </button>
      </div>

      <div className="news-grid">
        {/* AI 뉴스 */}
        <div className="news-col">
          <div className="news-col-header ai-col-header">
            <Cpu size={15} />
            <span>AI 탑뉴스</span>
          </div>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="news-skeleton" />
            ))
          ) : error ? (
            <p className="news-error">{error}</p>
          ) : aiNews.length === 0 ? (
            <p className="news-error">뉴스를 찾을 수 없습니다.</p>
          ) : (
            aiNews.map((item, i) => <NewsCard key={i} item={item} index={i} />)
          )}
        </div>

        {/* 일반 뉴스 */}
        <div className="news-col">
          <div className="news-col-header general-col-header">
            <Newspaper size={15} />
            <span>주요 뉴스</span>
          </div>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="news-skeleton" />
            ))
          ) : error ? (
            <p className="news-error">{error}</p>
          ) : generalNews.length === 0 ? (
            <p className="news-error">뉴스를 찾을 수 없습니다.</p>
          ) : (
            generalNews.map((item, i) => <NewsCard key={i} item={item} index={i} />)
          )}
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  return (
    <div className="home">
      {/* 히어로 */}
      <section className="hero">
        <ParticleCanvas />
        <div className="hero-orb orb1" />
        <div className="hero-orb orb2" />
        <div className="hero-orb orb3" />
        <div className="hero-content">
          <div className="hero-eyebrow">
            <span className="pulse-dot" />
            AI Creation Platform
          </div>
          <h1 className="hero-title">
            <span className="gradient-text">Nexus Studio</span>
          </h1>
          <p className="hero-sub">
            AI로 상상을 현실로 만드는 플랫폼
          </p>
        </div>
      </section>

      {/* 피처 카드 */}
      <section className="features">
        <div className="features-grid">
          {FEATURES.map(({ Icon, title, tag, desc, path, gradient, glow }) => (
            <Link
              to={path}
              key={path}
              className="feature-card"
              style={{ '--glow': glow, '--g1': gradient[0], '--g2': gradient[1] }}
            >
              <div className="card-glow" />
              <div className="card-icon-wrap">
                <span className="card-icon"><Icon size={26} strokeWidth={1.8} /></span>
              </div>
              <h2 className="card-title">{title}</h2>
              <p className="card-desc">{desc}</p>
              <div className="card-arrow">→</div>
            </Link>
          ))}
        </div>
      </section>

      {/* 뉴스 섹션 */}
      <NewsSection />
    </div>
  )
}
