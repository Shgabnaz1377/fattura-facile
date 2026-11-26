import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import it_ from './it'
import en from './en'
import { i18n, initialLocale, setLocale } from './index'
import StatusBadge from '@/components/StatusBadge.vue'

type Tree = { [key: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k
    return typeof v === 'string' ? { ...acc, [key]: v } : { ...acc, ...flatten(v, key) }
  }, {})
}

// Placeholders like {n}; literal braces written as {'{n}'} are not placeholders.
const placeholders = (msg: string) =>
  [...msg.replace(/\{'[^']*'\}/g, '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

const itFlat = flatten(it_ as Tree)
const enFlat = flatten(en as Tree)

describe('translations', () => {
  it('have the same keys in Italian and English', () => {
    expect(Object.keys(enFlat).sort()).toEqual(Object.keys(itFlat).sort())
  })

  it('use the same placeholders in both languages', () => {
    for (const key of Object.keys(itFlat)) {
      expect(placeholders(enFlat[key] ?? ''), key).toEqual(placeholders(itFlat[key] ?? ''))
    }
  })

  it('have no empty messages', () => {
    for (const [key, value] of Object.entries({ ...itFlat, ...enFlat })) expect(value.trim(), key).not.toBe('')
  })

  it('define every static key used in components and views', () => {
    const files = ['components', 'views'].flatMap((dir) =>
      readdirSync(join(__dirname, '..', dir))
        .filter((f) => f.endsWith('.vue'))
        .map((f) => readFileSync(join(__dirname, '..', dir, f), 'utf8')),
    )
    files.push(readFileSync(join(__dirname, '..', 'App.vue'), 'utf8'))
    const used = new Set(files.flatMap((src) => [...src.matchAll(/\bt\(\s*'([\w.]+)'/g)].map((m) => m[1] as string)))
    expect(used.size).toBeGreaterThan(100)
    for (const key of used) expect(itFlat[key], key).toBeDefined()
  })
})

describe('locale switching', () => {
  it('defaults to Italian', () => {
    localStorage.clear()
    expect(initialLocale()).toBe('it')
  })

  it('switches the UI language, sets <html lang> and remembers the choice', async () => {
    const wrapper = mount(StatusBadge, { props: { status: 'paid' }, global: { plugins: [i18n] } })
    expect(wrapper.text()).toBe('Incassata')
    setLocale('en')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toBe('Paid')
    expect(document.documentElement.lang).toBe('en')
    expect(initialLocale()).toBe('en')
    setLocale('it')
  })
})
