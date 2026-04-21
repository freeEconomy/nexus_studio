import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ⚠️ base에 본인의 GitHub 레포 이름을 입력하세요
// 예: GitHub 레포가 https://github.com/username/ai-multi-agent 이면
// base: '/ai-multi-agent/'
export default defineConfig({
  plugins: [react()],
  base: '/nexus_studio/', // 🔧 본인 레포 이름으로 변경
})
