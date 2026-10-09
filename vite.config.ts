/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// The app lives in frontend/; shared types and services live in backend/.
export default defineConfig({
  root: here('./frontend'),
  envDir: here('.'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@backend': here('./backend') } },
  build: { outDir: here('./dist'), emptyOutDir: true },
  test: {
    dir: here('.'),
    include: ['frontend/src/**/*.test.{ts,tsx}', 'backend/**/*.test.ts'],
    environment: 'jsdom',
    globals: true,
    setupFiles: [here('./frontend/src/test/setup.ts')],
  },
})
