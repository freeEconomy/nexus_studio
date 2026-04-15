import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import WeeklyReport from './pages/WeeklyReport'
import MultiAgent from './pages/MultiAgent'
import TravelPlanner from './pages/TravelPlanner'
import Stock from './pages/Stock'

// ⚠️ basename을 vite.config.js의 base와 동일하게 맞추세요
const BASENAME = '/nexus_studio'

export default function App() {
  return (
    <BrowserRouter basename={BASENAME}>
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/weekly-report" element={<WeeklyReport />} />
          <Route path="/multi-agent" element={<MultiAgent />} />
          <Route path="/travel-planner" element={<TravelPlanner />} />
          <Route path="/stock" element={<Stock />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
