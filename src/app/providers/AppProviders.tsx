import type { PropsWithChildren } from 'react'
import { I18nextProvider } from 'react-i18next'
import { BrowserRouter } from 'react-router'
import i18n from '@/i18n'

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>{children}</BrowserRouter>
    </I18nextProvider>
  )
}
