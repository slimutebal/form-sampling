import { useTranslation } from 'react-i18next'
import { type SupportedLanguage, supportedLanguages } from '@/i18n'

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const current = i18n.language as SupportedLanguage

  return (
    <div className="flex items-center gap-2" role="group" aria-label={t('settings.language')}>
      {supportedLanguages.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => void i18n.changeLanguage(lang)}
          aria-pressed={current === lang}
          className={
            'h-11 min-w-11 rounded-md border border-border px-3 text-sm font-medium transition-colors ' +
            (current === lang
              ? 'bg-primary text-primary-foreground'
              : 'bg-background text-foreground hover:bg-muted')
          }
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
