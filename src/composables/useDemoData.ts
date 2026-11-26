import { ref } from 'vue'
import { loadDemo as writeDemo } from '@/db/backup'
import { buildDemoData } from '@/domain/demo'
import { useClientsStore } from '@/stores/clients'
import { useInvoicesStore } from '@/stores/invoices'
import { useProfileStore } from '@/stores/profile'

/** Reloads every store from IndexedDB, after a restore, a demo load or a wipe. */
export async function reloadStores(): Promise<void> {
  await Promise.all([useProfileStore().load(), useClientsStore().load(), useInvoicesStore().load()])
}

export function useDemoData() {
  const loading = ref(false)
  async function loadDemo(): Promise<void> {
    loading.value = true
    try {
      await writeDemo(buildDemoData())
      await reloadStores()
    } finally {
      loading.value = false
    }
  }
  return { loadDemo, loading }
}
