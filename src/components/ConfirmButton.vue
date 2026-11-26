<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

/** A destructive action that asks for a second click instead of opening a modal. */
defineProps<{ label: string; confirmLabel?: string }>()
const emit = defineEmits<{ confirm: [] }>()
const { t } = useI18n()
const armed = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

function onClick(): void {
  if (armed.value) {
    clearTimeout(timer)
    armed.value = false
    emit('confirm')
    return
  }
  armed.value = true
  timer = setTimeout(() => (armed.value = false), 4000)
}
</script>

<template>
  <button type="button" class="btn small danger" :aria-live="armed ? 'polite' : undefined" @click="onClick">
    {{ armed ? (confirmLabel ?? t('common.confirmDelete')) : label }}
  </button>
</template>
