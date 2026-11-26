import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { db } from '@/db/database'
import { emptyClient } from '@/domain/factories'
import type { Invoice } from '@/domain/types'
import { ClientInUseError, useClientsStore } from './clients'
import { mergeProfile, useProfileStore } from './profile'

beforeEach(async () => {
  setActivePinia(createPinia())
  await Promise.all([db.clients.clear(), db.invoices.clear(), db.settings.clear()])
})

describe('profile store', () => {
  it('starts from defaults and persists the saved profile', async () => {
    const store = useProfileStore()
    await store.load()
    expect(store.profile.regime).toBe('forfettario')
    expect(store.isConfigured).toBe(false)

    await store.save({ ...store.profile, partitaIva: '01234567897' })
    setActivePinia(createPinia())
    const reloaded = useProfileStore()
    await reloaded.load()
    expect(reloaded.profile.partitaIva).toBe('01234567897')
    expect(reloaded.isConfigured).toBe(true)
  })

  it('fills fields missing from older records', () => {
    const merged = mergeProfile({ partitaIva: '01234567897', defaults: { numberFormat: '{nnn}' } as never })
    expect(merged.defaults.numberFormat).toBe('{nnn}')
    expect(merged.defaults.paymentTermsDays).toBe(30)
    expect(merged.address.nazione).toBe('IT')
  })
})

describe('clients store', () => {
  it('saves, updates and sorts clients', async () => {
    const store = useClientsStore()
    await store.load()
    const b = await store.save({ ...emptyClient(), denominazione: 'Beta Esempio' })
    await store.save({ ...emptyClient(), denominazione: 'Alfa Esempio' })
    await store.save({ ...b, denominazione: 'Zeta Esempio' })
    expect(store.sorted.map((c) => c.denominazione)).toEqual(['Alfa Esempio', 'Zeta Esempio'])
    expect(await db.clients.count()).toBe(2)
  })

  it('refuses to delete a client that appears on an invoice', async () => {
    const store = useClientsStore()
    const client = await store.save({ ...emptyClient(), denominazione: 'In uso' })
    await db.invoices.put({ id: 'inv-1', clientId: client.id, year: 2026, number: 1 } as Invoice)
    await expect(store.remove(client.id)).rejects.toBeInstanceOf(ClientInUseError)
    await db.invoices.clear()
    await store.remove(client.id)
    expect(store.clients).toHaveLength(0)
  })
})
