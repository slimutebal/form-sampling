import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/i18n/locales/en/common.json'
import id from '@/i18n/locales/id/common.json'

export const supportedLanguages = ['id', 'en'] as const
export type SupportedLanguage = (typeof supportedLanguages)[number]

export const defaultLanguage: SupportedLanguage = 'id'

void i18n.use(initReactI18next).init({
  resources: {
    id: { common: id },
    en: { common: en },
  },
  lng: defaultLanguage,
  fallbackLng: defaultLanguage,
  defaultNS: 'common',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
})

export default i18n
