import { describe, expect, it, beforeEach } from 'vitest'
import { useTheme } from './useTheme'

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('sets an explicit theme on the root element and persists it', () => {
    const { setTheme, preference } = useTheme()
    setTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('ff-theme')).toBe('dark')
    expect(preference.value).toBe('dark')
  })

  it('removes the attribute when following the system preference', () => {
    const { setTheme } = useTheme()
    setTheme('light')
    setTheme('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})
