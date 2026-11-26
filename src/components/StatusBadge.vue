<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DisplayStatus } from '@/domain/invoices'

const props = defineProps<{ status: DisplayStatus }>()
const { t } = useI18n()
const tone = computed(
  () => ({ draft: '', issued: 'info', overdue: 'danger', paid: 'success', cancelled: 'warning' })[props.status],
)
</script>

<template>
  <span class="badge" :class="tone">{{ t(`status.${status}`) }}</span>
</template>
