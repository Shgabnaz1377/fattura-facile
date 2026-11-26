import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { db } from '@/db/database'
import { defaultProfile, emptyClient } from '@/domain/factories'
import { newInvoice } from '@/domain/invoices'
import type { BusinessProfile, Invoice } from '@/domain/types'
import { useInvoicesStore } from './invoices'

const profile: BusinessProfile = { ...defaultProfile(2026), partitaIva: '01234567897', codiceFiscale: 'PRVGLI85M41H501K' }
const client = { ...emptyClient(), id: 'c1', denominazione: 'Acme Fittizia S.r.l.' }

function draft(date: string): Invoice {
  const inv = newInvoice(profile, client.id, date)
  inv.lines[0] = { ...inv.lines[0]!, description: 'Consulenza', unitPriceCents: 100_00 }
  return inv
}

beforeEach(async () => {
  setActivePinia(createPinia())
  await db.invoices.clear()
})

describe('invoices store', () => {
  it('numbers invoices per year as they are issued', async () => {
    const store = useInvoicesStore()
    await store.load()
    const a = await store.issue(await store.save(draft('2026-01-10')), profile, client)
    const b = await store.issue(await store.save(draft('2026-02-10')), profile, client)
    const c = await store.issue(await store.save(draft('2027-01-02')), profile, client)
    expect([a.number, b.number, c.number]).toEqual([1, 2, 1])
    expect(store.years).toEqual([2027, 2026])
  })

  it('persists reactive objects (snapshots are plain copies)', async () => {
    const store = useInvoicesStore()
    const issued = await store.issue(draft('2026-01-10'), reactive(profile), reactive(client))
    const stored = await db.invoices.get(issued.id)
    expect(stored?.snapshot?.profile.partitaIva).toBe('01234567897')
  })

  it('tracks payment and cancellation without freeing the number', async () => {
    const store = useInvoicesStore()
    const inv = await store.issue(draft('2026-01-10'), profile, client)
    await store.markPaid(inv.id, '2026-02-01')
    expect(store.byId(inv.id)).toMatchObject({ status: 'paid', paidDate: '2026-02-01' })
    await store.markUnpaid(inv.id)
    expect(store.byId(inv.id)).toMatchObject({ status: 'issued', paidDate: null })
    await store.cancel(inv.id)
    expect(store.byId(inv.id)?.status).toBe('cancelled')
    const next = await store.issue(draft('2026-01-11'), profile, client)
    expect(next.number).toBe(2)
  })

  it('deletes drafts but never issued invoices', async () => {
    const store = useInvoicesStore()
    const d = await store.save(draft('2026-01-10'))
    const issued = await store.issue(draft('2026-01-10'), profile, client)
    await expect(store.removeDraft(issued.id)).rejects.toThrow()
    await store.removeDraft(d.id)
    expect(store.invoices.map((i) => i.id)).toEqual([issued.id])
  })
})
