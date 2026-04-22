import React, { useState, useEffect } from 'react'
import { NavLink, Link } from 'react-router-dom'
import './Navbar.css'

const menus = [
  { path: '/weekly-report', label: 'Nexus Agent' },
  { path: '/multi-agent', label: 'AI Lab' },
  { path: '/travel-planner', label: 'Journey' },
  { path: '/stock', label: 'Markets' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    // cleanup
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [open])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (open && !event.target.closest('.navbar')) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('click', handleClickOutside)
    }

    return () => {
      document.removeEventListener('click', handleClickOutside)
    }
  }, [open])

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-logo">🎯 Nexus Studio</Link>

        {/* 햄버거 (모바일) */}
        <button className={`hamburger ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} aria-label="메뉴">
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
