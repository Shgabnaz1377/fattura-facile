import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { db, plain } from '@/db/database'
import { nowIso, todayIso } from '@/domain/factories'
import { issueInvoice } from '@/domain/invoices'
import type { BusinessProfile, Client, Invoice } from '@/domain/types'

export const useInvoicesStore = defineStore('invoices', () => {
  const invoices = ref<Invoice[]>([])
  const loaded = ref(false)

  /** Newest first: by year, then number (drafts on top), then date. */
  const sorted = computed(() =>
    [...invoices.value].sort(
      (a, b) =>
        b.year - a.year ||
        (b.number ?? Number.MAX_SAFE_INTEGER) - (a.number ?? Number.MAX_SAFE_INTEGER) ||
        b.date.localeCompare(a.date),
    ),
  )

  const years = computed(() => [...new Set(invoices.value.map((i) => i.year))].sort((a, b) => b - a))

  async function load(): Promise<void> {
    invoices.value = await db.invoices.toArray()
    loaded.value = true
  }

  function byId(id: string): Invoice | undefined {
    return invoices.value.find((i) => i.id === id)
  }

  async function save(invoice: Invoice): Promise<Invoice> {
    const record = plain({ ...invoice, updatedAt: nowIso() })
    await db.invoices.put(record)
    const idx = invoices.value.findIndex((i) => i.id === record.id)
    if (idx >= 0) invoices.value.splice(idx, 1, record)
    else invoices.value.push(record)
    return record
  }

  /** Assigns the next number inside a transaction so two tabs cannot issue the same number. */
  async function issue(draft: Invoice, profile: BusinessProfile, client: Client): Promise<Invoice> {
    const issued = await db.transaction('rw', db.invoices, async () => {
      const all = await db.invoices.toArray()
      const others = all.filter((i) => i.id !== draft.id)
      const next = plain(issueInvoice(draft, others, profile, client))
      await db.invoices.put(next)
      return next
    })
    await load()
    return issued
  }

  async function markPaid(id: string, paidDate = todayIso()): Promise<void> {
    const inv = byId(id)
    if (!inv || (inv.status !== 'issued' && inv.status !== 'paid')) return
    await save({ ...inv, status: 'paid', paidDate })
  }

  async function markUnpaid(id: string): Promise<void> {
    const inv = byId(id)
    if (!inv || inv.status !== 'paid') return
    await save({ ...inv, status: 'issued', paidDate: null })
  }

  /** Issued invoices are never deleted: they are marked cancelled and keep their number. */
  async function cancel(id: string): Promise<void> {
    const inv = byId(id)
    if (!inv || inv.status === 'draft') return
    await save({ ...inv, status: 'cancelled', paidDate: null })
  }

  async function removeDraft(id: string): Promise<void> {
    const inv = byId(id)
    if (!inv || inv.status !== 'draft') throw new Error('Only drafts can be deleted')
    await db.invoices.delete(id)
    invoices.value = invoices.value.filter((i) => i.id !== id)
  }

  return { invoices, sorted, years, loaded, load, byId, save, issue, markPaid, markUnpaid, cancel, removeDraft }
})
