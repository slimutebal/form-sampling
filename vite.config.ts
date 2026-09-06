/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  readonly version: string
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    // Injected build-time constant — the Phase 13 export's
    // `App_Data.ApplicationVersion` (ROADMAP.md §15) reads this rather
    // than each caller re-parsing package.json.
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      manifest: {
        id: '/',
        name: 'Form Sampling',
        short_name: 'Sampling',
        description: 'Field ore sampling and shift reporting.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#ffffff',
        theme_color: '#0f172a',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Application shell + versioned static assets only (ROADMAP Phase
        // 18 §4/§38) — no runtimeCaching entries are configured here, so
        // Google Sheets responses/generated XLSX/uploaded handover files
        // are never written to Cache Storage; IndexedDB remains the sole
        // operational store.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Lets client-side (React Router) navigation resolve offline —
        // any non-precached navigation request falls back to the shell.
        navigateFallback: '/index.html',
      },
      devOptions: {
        // Service worker is generated for production builds only.
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
