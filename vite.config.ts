/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { gatewayProxy } from './vite.proxy.ts'

export default defineConfig(({ mode }) => {
  // VITE_GATEWAY_URL: where the dev/preview server forwards API calls (default http://localhost:3000).
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = gatewayProxy(env.VITE_GATEWAY_URL)

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { port: 3020, strictPort: true, proxy },
    preview: { port: 3020, strictPort: true, proxy },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'vite.proxy.test.ts'],
    },
  }
})
