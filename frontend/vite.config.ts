import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  // Mirror tsconfig.json paths ("@/*" → "./src/*") so the dev server resolves
  // the same alias the type-checker and `vite build` already accept.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: true,
    allowedHosts: true,
    hmr: {
      // Explicit WebSocket config for Docker environment
      host: 'localhost',
      port: 5173,
      protocol: 'ws',
    },
    proxy: {
      '/api': {
        // In Docker Compose, set VITE_API_TARGET=http://backend:8080
        // Locally (no Docker), defaults to http://localhost:8080
        target: process.env.VITE_API_TARGET || 'http://localhost:8080',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            if (req.url && req.url.includes('/stream')) {
              proxyReq.setHeader('Connection', 'keep-alive')
              proxyReq.setHeader('Cache-Control', 'no-cache')
            } else {
              proxyReq.setHeader('Connection', 'close')
            }
          })
        },
      }
    }
  }
})
