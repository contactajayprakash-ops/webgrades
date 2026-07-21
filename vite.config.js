import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Dev-only: proxy same-origin /api -> the real backend, so the backend URL
  // never ships to the browser. In production, vercel.json does the same rewrite.
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_URL || 'http://localhost:3000'
  return {
    plugins: [
      react(),
      // Service worker: precache the built app shell so WebGrades opens
      // instantly and works offline (grades come from the localStorage cache).
      // Never touch /api — those must always hit the network. autoUpdate quietly
      // swaps in new builds. We keep our hand-written public/manifest.webmanifest,
      // so the plugin doesn't generate one (manifest: false).
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        manifest: false,
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
        },
      }),
    ],
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      },
    },
  }
})
