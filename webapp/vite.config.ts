/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Vite pins the dev server to 5173 and does not read PORT on its own, so two
  // checkouts of this repo cannot be served at once. Honouring PORT when it is
  // set keeps the default unchanged and lets a second instance be told where to
  // listen.
  server: { port: Number(process.env.PORT) || 5173 },
  // Unit tests only: the Playwright smoke tests in e2e/ have their own runner.
  test: { include: ['src/**/*.test.{ts,tsx}'] },
})
