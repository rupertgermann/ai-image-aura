import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import sqlocal from 'sqlocal/vite'

// https://vite.dev/config/
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
  plugins: [
    react(),
    sqlocal()
  ],
})
