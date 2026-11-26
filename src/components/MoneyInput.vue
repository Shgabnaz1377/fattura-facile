<script setup lang="ts">
import { ref, watch } from 'vue'
import { fromCents, toCents } from '@/domain/money'

/** Euro amount input bound to integer cents. Accepts both "1234,50" and "1234.50". */
defineProps<{ label: string; id?: string; invalid?: boolean }>()
const cents = defineModel<number>({ required: true })

const format = (c: number) => (c === 0 ? '' : fromCents(c).toFixed(2))
const text = ref(format(cents.value))
watch(cents, (c) => {
  if (toCents(parse(text.value) ?? 0) !== c) text.value = format(c)
})

function parse(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s|€/g, '')
  if (cleaned === '') return 0
  // Italian style "1.234,50": dots are thousands separators when a comma is present.
  const normalised = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned
  const value = Number(normalised)
  return Number.isFinite(value) ? value : null
}

function onInput(): void {
  const value = parse(text.value)
  if (value !== null) cents.value = toCents(value)
}

function onBlur(): void {
  text.value = format(cents.value)
}
</script>

<template>
  <input
    :id="id"
    v-model="text"
    class="money"
    type="text"
    inputmode="decimal"
    :aria-label="label"
    :aria-invalid="invalid ? 'true' : undefined"
    placeholder="0,00"
    @input="onInput"
    @blur="onBlur"
  />
</template>

<style scoped>
.money {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
