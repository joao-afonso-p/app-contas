import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Base path para GitHub Pages: define VITE_BASE=/nome-do-repo/ no build (ver deploy.yml)
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Contas',
        short_name: 'Contas',
        description: 'Gestão de finanças pessoais',
        lang: 'pt-PT',
        display: 'standalone',
        theme_color: '#10b981',
        background_color: '#0c0f0e',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // pdf.js e SheetJS (importar extrato por ficheiro) são pesados e só
        // fazem sentido online (a extração usa a API do OpenAI). Carregam-se
        // sob demanda em vez de irem para o precache do service worker.
        globIgnores: ['**/pdf-*.js', '**/xlsx-*.js', '**/pdf.worker.min-*.{js,mjs}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          recharts: ['recharts'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0])
