/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { publicSupabaseEnv } from './config/publicEnv.ts'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// The app lives in frontend/; shared types and services live in backend/.
export default defineConfig(({ mode }) => {
  // Load every variable (no prefix filter), then expose ONLY the public URL and
  // anon/publishable key, under either our VITE_ names or the Vercel
  // integration's names. Nothing else from the environment reaches the bundle.
  const env = { ...loadEnv(mode, here('.'), ''), ...process.env }
  const supabase = publicSupabaseEnv(env)

  return {
    root: here('./frontend'),
    envDir: here('.'),
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabase.url),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabase.anonKey),
    },
    resolve: { alias: { '@backend': here('./backend') } },
    build: { outDir: here('./dist'), emptyOutDir: true },
    test: {
      dir: here('.'),
      include: ['frontend/src/**/*.test.{ts,tsx}', 'backend/**/*.test.ts', 'config/**/*.test.ts'],
      environment: 'jsdom',
      globals: true,
      setupFiles: [here('./frontend/src/test/setup.ts')],
    },
  }
})
