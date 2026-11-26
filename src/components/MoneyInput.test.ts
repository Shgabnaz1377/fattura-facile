import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { i18n } from '@/i18n'
import MoneyInput from './MoneyInput.vue'

function setup(initial: number) {
  const updates: number[] = []
  const wrapper = mount(MoneyInput, {
    props: { label: 'Prezzo', modelValue: initial, 'onUpdate:modelValue': (v: number) => updates.push(v) },
    global: { plugins: [i18n] },
  })
  return { wrapper, updates }
}

describe('MoneyInput', () => {
  it('shows cents with an Italian decimal comma', () => {
    const { wrapper } = setup(123450)
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('1234,50')
  })

  it.each([
    ['1.234,50', 123450],
    ['1234.5', 123450],
    ['0,1', 10],
    ['€ 99', 9900],
    ['', 0],
  ])('parses %j as %i cents', async (typed, cents) => {
    const { wrapper, updates } = setup(1)
    await wrapper.find('input').setValue(typed)
    expect(updates.at(-1)).toBe(cents)
  })

  it('ignores text that is not a number', async () => {
    const { wrapper, updates } = setup(500)
    await wrapper.find('input').setValue('abc')
    expect(updates).toEqual([])
  })
})
