import { createI18n } from 'vue-i18n'
import it from './it'
import en from './en'

export type MessageSchema = typeof it
export const LOCALES = ['it', 'en'] as const
export type AppLocale = (typeof LOCALES)[number]

const STORAGE_KEY = 'ff-locale'

/** Italian is the default; a saved choice wins over it. */
export function initialLocale(): AppLocale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'it' || saved === 'en') return saved
  } catch {
    // storage blocked: use the default
  }
  return 'it'
}

export const i18n = createI18n<[MessageSchema], AppLocale, false>({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'it',
  messages: { it, en },
})

export function setLocale(locale: AppLocale): void {
  i18n.global.locale.value = locale
  document.documentElement.setAttribute('lang', locale)
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // the choice still applies for this session
  }
}
