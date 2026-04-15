import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import './Navbar.css'

const menus = [
  { path: '/', label: '홈' },
  { path: '/weekly-report', label: '주간보고' },
  { path: '/multi-agent', label: '멀티 에이전트' },
  { path: '/travel-planner', label: '여행플래너' },
  { path: '/stock', label: '주식' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <span className="navbar-logo">🤖 AI Hub</span>

        {/* 햄버거 (모바일) */}
        <button className="hamburger" onClick={() => setOpen(!open)} aria-label="메뉴">
          <span /><span /><span />
        </button>

        {/* 메뉴 */}
        <ul className={`nav-links ${open ? 'open' : ''}`}>
          {menus.map(({ path, label }) => (
            <li key={path}>
              <NavLink
                to={path}
                end={path === '/'}
                className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
                onClick={() => setOpen(false)}
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
