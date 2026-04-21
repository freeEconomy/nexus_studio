import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base path: '/' for local dev, '/nexus_studio/' for GitHub Pages production build
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/nexus_studio/' : '/',
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: '/stock', // 대시보드(주식 메뉴)를 기본으로 열기
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    open: true,
  },
}))
