import type { PropsWithChildren } from 'react'
import { I18nextProvider } from 'react-i18next'
import { HashRouter } from 'react-router'
import i18n from '@/i18n'

/**
 * `HashRouter`, not `BrowserRouter` (GitHub Pages production prep):
 * GitHub Pages serves static files with no SPA server-side rewrite, so a
 * deep-linked or refreshed `BrowserRouter` path (e.g. `/piles`) 404s.
 * Hash-based routes (`#/piles`) always resolve to `index.html` first,
 * avoiding a 404.html rewrite hack.
 */
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <I18nextProvider i18n={i18n}>
      <HashRouter>{children}</HashRouter>
    </I18nextProvider>
  )
}
