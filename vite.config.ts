/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  readonly version: string
}

// GitHub Pages serves this app from a repository subpath, while local
// development and verification builds continue to use the domain root.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isGitHubPagesBuild = env.GITHUB_PAGES === 'true'
  if (isGitHubPagesBuild && !env.VITE_GOOGLE_APPS_SCRIPT_URL?.trim()) {
    throw new Error(
      'GitHub Pages build requires VITE_GOOGLE_APPS_SCRIPT_URL. Set the github-pages environment variable before deploying.',
    )
  }
  const base = isGitHubPagesBuild ? '/form-sampling/' : '/'

  return {
    base,
    // IndexedDB is scoped to the full browser origin (including port).
    // Keep Vite's established default port fixed so a busy 5173 fails
    // visibly instead of silently starting a second origin with empty data.
    server: {
      port: 5173,
      strictPort: true,
    },
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: 'auto',
        manifest: {
          id: base,
          name: 'Form Sampling',
          short_name: 'Sampling',
          description: 'Field ore sampling and shift reporting.',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait-primary',
          background_color: '#ffffff',
          theme_color: '#0f172a',
          icons: [
            { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: 'icons/icon-512-maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,webmanifest}'],
          // Resolved against the service-worker scope, including
          // `/form-sampling/` on GitHub Pages.
          navigateFallback: 'index.html',
        },
        devOptions: {
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
      // fake-indexeddb keeps named databases at worker scope. Several integration
      // suites deliberately delete the shared test database during teardown, so
      // concurrent files can otherwise close each other's active connections.
      fileParallelism: false,
    },
  }
})
