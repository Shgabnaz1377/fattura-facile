<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ConfirmButton from '@/components/ConfirmButton.vue'
import { reloadStores, useDemoData } from '@/composables/useDemoData'
import { backupFileName, BackupError, clearAll, exportBackup, parseBackup, restoreBackup } from '@/db/backup'

const { t } = useI18n()
const { loadDemo } = useDemoData()
const message = ref('')
const error = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

function notify(text: string): void {
  error.value = ''
  message.value = text
}

async function download(): Promise<void> {
  const backup = await exportBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = backupFileName()
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  notify(t('data.exported', { clients: backup.clients.length, invoices: backup.invoices.length }))
}

async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const backup = parseBackup(await file.text())
    await restoreBackup(backup)
    await reloadStores()
    notify(t('data.imported', { clients: backup.clients.length, invoices: backup.invoices.length }))
  } catch (err) {
    message.value = ''
    error.value = err instanceof BackupError ? t(`data.errors.${err.code}`) : String(err)
  }
}

async function demo(): Promise<void> {
  await loadDemo()
  notify(t('data.demoLoaded'))
}

async function wipe(): Promise<void> {
  await clearAll()
  await reloadStores()
  notify(t('data.cleared'))
}
</script>

<template>
  <section class="page">
    <div class="page-header">
      <h1>{{ t('data.title') }}</h1>
    </div>
    <p class="lead">{{ t('data.intro') }}</p>
    <p v-if="message" class="notice ok" role="status">{{ message }}</p>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>

    <section class="card">
      <h2>{{ t('data.backupTitle') }}</h2>
      <p class="muted">{{ t('data.backupText') }}</p>
      <div class="toolbar">
        <button type="button" class="btn primary" @click="download">{{ t('data.export') }}</button>
        <button type="button" class="btn" @click="fileInput?.click()">{{ t('data.import') }}</button>
        <input ref="fileInput" class="visually-hidden" type="file" accept="application/json,.json" tabindex="-1" aria-hidden="true" @change="onFile" />
      </div>
      <p class="muted small">{{ t('data.importWarning') }}</p>
    </section>

    <section class="card">
      <h2>{{ t('data.demoTitle') }}</h2>
      <p class="muted">{{ t('data.demoHint') }}</p>
      <ConfirmButton :label="t('data.loadDemo')" :confirm-label="t('data.confirmReplace')" @confirm="demo" />
    </section>

    <section class="card">
      <h2>{{ t('data.clearTitle') }}</h2>
      <p class="muted">{{ t('data.clearText') }}</p>
      <ConfirmButton :label="t('data.clear')" :confirm-label="t('data.confirmClear')" @confirm="wipe" />
    </section>
  </section>
</template>

<style scoped>
h2 {
  font-size: 1.05rem;
}

.small {
  font-size: 0.875rem;
}

.notice.ok {
  background: var(--success-soft);
  border-left-color: var(--success);
}

.notice.error {
  background: var(--danger-soft);
  border-left-color: var(--danger);
}
</style>
