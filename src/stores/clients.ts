import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { db, plain } from '@/db/database'
import { clientDisplayName } from '@/domain/entityValidation'
import { nowIso } from '@/domain/factories'
import type { Client } from '@/domain/types'

export class ClientInUseError extends Error {
  constructor(public readonly invoiceCount: number) {
    super(`Client is referenced by ${invoiceCount} invoice(s)`)
  }
}

export const useClientsStore = defineStore('clients', () => {
  const clients = ref<Client[]>([])
  const loaded = ref(false)

  const sorted = computed(() =>
    [...clients.value].sort((a, b) => clientDisplayName(a).localeCompare(clientDisplayName(b), 'it')),
  )

  async function load(): Promise<void> {
    clients.value = await db.clients.toArray()
    loaded.value = true
  }

  function byId(id: string): Client | undefined {
    return clients.value.find((c) => c.id === id)
  }

  async function save(client: Client): Promise<Client> {
    const record = plain({ ...client, updatedAt: nowIso() })
    await db.clients.put(record)
    const idx = clients.value.findIndex((c) => c.id === record.id)
    if (idx >= 0) clients.value.splice(idx, 1, record)
    else clients.value.push(record)
    return record
  }

  /** Deletes a client. Clients that appear on invoices cannot be deleted. */
  async function remove(id: string): Promise<void> {
    const used = await db.invoices.where('clientId').equals(id).count()
    if (used > 0) throw new ClientInUseError(used)
    await db.clients.delete(id)
    clients.value = clients.value.filter((c) => c.id !== id)
  }

  return { clients, sorted, loaded, load, byId, save, remove }
})
