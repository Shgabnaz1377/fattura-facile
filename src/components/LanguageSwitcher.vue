<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { LOCALES, setLocale, type AppLocale } from '@/i18n'

const { t, locale } = useI18n()
const names: Record<AppLocale, string> = { it: 'Italiano', en: 'English' }

function onChange(event: Event): void {
  setLocale((event.target as HTMLSelectElement).value as AppLocale)
}
</script>

<template>
  <label class="compact-select">
    <span class="visually-hidden">{{ t('language.label') }}</span>
    <select :value="locale" @change="onChange">
      <option v-for="l in LOCALES" :key="l" :value="l" :lang="l">{{ names[l] }}</option>
    </select>
  </label>
</template>
