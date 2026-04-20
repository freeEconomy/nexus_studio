import React from 'react'
import { Link } from 'react-router-dom'
import './Home.css'

const features = [
  {
    icon: '📋',
    title: '주간보고',
    desc: '주간 업무 보고를 작성하고 관리합니다.',
    path: '/weekly-report',
  },
  {
    icon: '🤖',
    title: '멀티 AI',
    desc: '하나의 질문을 여러 AI 모델에 동시에 요청하고 결과를 비교합니다.',
    path: '/multi-agent',
  },
  {
    icon: '✈️',
    title: '여행플래너',
    desc: 'AI가 맞춤형 여행 일정을 만들어드립니다.',
    path: '/travel-planner',
  },
  {
    icon: '📈',
    title: '주식',
    desc: '주식 정보를 조회하고 분석합니다.',
    path: '/stock',
  },
]

export default function Home() {
  return (
    <div className="home">
      <div className="home-hero">
        <h1>AI Hub</h1>
        <p>여러 AI 모델을 한 곳에서 활용하는 통합 플랫폼</p>
      </div>
      <div className="home-grid">
        {features.map(({ icon, title, desc, path }) => (
          <Link to={path} key={path} className="home-card">
            <span className="card-icon">{icon}</span>
            <h2>{title}</h2>
            <p>{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
