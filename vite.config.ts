import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  // Content script 스타일 처리를 위해 CSS injection 활성화
  build: {
    target: 'esnext',
    minify: false, // 디버깅 편의를 위해 hackathon 단계에서는 off
  },
})
