import { createI18n } from 'vue-i18n'
import it from './it'

export type MessageSchema = typeof it

export const i18n = createI18n<[MessageSchema], 'it'>({
  legacy: false,
  locale: 'it',
  fallbackLocale: 'it',
  messages: { it },
})
