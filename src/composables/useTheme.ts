import { ref } from 'vue'

export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'ff-theme'

function readStored(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {
    // storage blocked (private mode): fall back to system preference
  }
  return 'system'
}

const preference = ref<ThemePreference>(readStored())

function apply(pref: ThemePreference): void {
  const root = document.documentElement
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
}

export function applyStoredTheme(): void {
  apply(preference.value)
}

export function useTheme() {
  function setTheme(pref: ThemePreference): void {
    preference.value = pref
    apply(pref)
    try {
      localStorage.setItem(STORAGE_KEY, pref)
    } catch {
      // ignore: the choice still applies for this session
    }
  }
  return { preference, setTheme }
}
