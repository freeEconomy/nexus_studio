import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import AiAssistant from './pages/AiAssistant'
import MultiAgent from './pages/MultiAgent'
import TravelPlanner from './pages/TravelPlanner'
import Stock from './pages/Stock'

// ⚠️ basename을 vite.config.js의 base와 동일하게 맞추세요
const BASENAME = '/nexus_studio'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <BrowserRouter basename={BASENAME}>
      <ScrollToTop />
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/weekly-report" element={<AiAssistant />} />
          <Route path="/multi-agent" element={<MultiAgent />} />
          <Route path="/travel-planner" element={<TravelPlanner />} />
          <Route path="/stock" element={<Stock />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
