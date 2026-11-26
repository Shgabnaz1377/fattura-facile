<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useTheme, type ThemePreference } from '@/composables/useTheme'

const { t } = useI18n()
const { preference, setTheme } = useTheme()
const options: ThemePreference[] = ['system', 'light', 'dark']

function onChange(event: Event): void {
  setTheme((event.target as HTMLSelectElement).value as ThemePreference)
}
</script>

<template>
  <label class="compact-select">
    <span class="visually-hidden">{{ t('theme.label') }}</span>
    <select :value="preference" @change="onChange">
      <option v-for="opt in options" :key="opt" :value="opt">{{ t(`theme.${opt}`) }}</option>
    </select>
  </label>
</template>
