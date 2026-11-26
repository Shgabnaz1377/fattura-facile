import { useI18n } from 'vue-i18n'
import { formatEuro } from '@/domain/money'

const LOCALE_TAGS: Record<string, string> = { it: 'it-IT', en: 'en-GB' }

/** Currency and date formatting that follows the selected UI language. */
export function useFormat() {
  const { locale } = useI18n()
  const tag = () => LOCALE_TAGS[locale.value] ?? 'it-IT'
  return {
    euro: (cents: number) => formatEuro(cents, tag()),
    date: (iso: string | null) => {
      if (!iso) return '—'
      const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
      return new Intl.DateTimeFormat(tag(), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(y, m - 1, d))
    },
  }
}
