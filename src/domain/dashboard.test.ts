import { describe, expect, it } from 'vitest'
import { availableYears, feesCents, yearStats } from './dashboard'
import { buildDemoData } from './demo'
import { validateClient, validateProfile } from './entityValidation'
import { checkNumbering } from './numbering'
import { companyClient, forfettarioProfile, issuedInvoice } from '@/test/fixtures'
import type { Invoice } from './types'

const inv = (date: string, cents: number, extra: Partial<Invoice> = {}): Invoice => ({
  ...issuedInvoice(forfettarioProfile, companyClient, [{ unitPriceCents: cents }], {}, date),
  id: `${date}-${cents}`,
  ...extra,
})

describe('year statistics', () => {
  const invoices: Invoice[] = [
    // Rivalsa 4% is on in the fixture profile: fees = price × 1.04.
    inv('2026-01-10', 1000_00, { status: 'paid', paidDate: '2026-02-05' }),
    inv('2026-03-01', 500_00, { status: 'paid', paidDate: '2026-03-20' }),
    inv('2025-12-20', 200_00, { status: 'paid', paidDate: '2026-01-15' }), // invoiced 2025, collected 2026
    inv('2026-10-01', 300_00, { dueDate: '2026-10-31' }), // overdue on 2026-11-26
    inv('2026-11-20', 100_00, { dueDate: '2026-12-20' }),
    inv('2026-04-01', 999_00, { status: 'cancelled' }),
    { ...inv('2026-05-01', 700_00), status: 'draft', number: null },
  ]
  const s = yearStats(invoices, 2026, '2026-11-26')

  it('counts compensi (fees + rivalsa) without IVA and stamp duty', () => {
    expect(feesCents(invoices[0]!)).toBe(1040_00)
  })

  it('separates invoiced (by date) from collected (by payment date)', () => {
    expect(s.invoiceCount).toBe(4)
    expect(s.invoicedCents).toBe((1000_00 + 500_00 + 300_00 + 100_00) * 1.04)
    expect(s.collectedCents).toBe((1000_00 + 500_00 + 200_00) * 1.04)
    expect(s.monthlyCollectedCents[0]).toBe(208_00)
    expect(s.monthlyCollectedCents[1]).toBe(1040_00)
    expect(s.monthlyCollectedCents[2]).toBe(520_00)
  })

  it('tracks outstanding and overdue amounts', () => {
    // 300 + 12 rivalsa + 2 stamp duty; 100 + 4 rivalsa + 2 stamp duty.
    expect(s.outstandingCents).toBe(314_00 + 106_00)
    expect(s.overdueCents).toBe(314_00)
    expect(s.overdueCount).toBe(1)
  })

  it('lists years with activity', () => {
    expect(availableYears(invoices, 2026)).toEqual([2026, 2025])
    expect(availableYears([], 2027)).toEqual([2027])
  })
})

describe('demo dataset', () => {
  const demo = buildDemoData('2026-11-26')

  it('uses valid but fictitious identities', () => {
    expect(validateProfile(demo.profile)).toEqual({})
    for (const c of demo.clients) expect(validateClient(c), c.denominazione).toEqual({})
  })

  it('has a consistent numbering sequence and one draft', () => {
    const issued = demo.invoices.filter((i) => i.status !== 'draft')
    expect(issued.map((i) => i.number)).toEqual(issued.map((_, i) => i + 1))
    for (const i of issued) expect(checkNumbering(i, issued)).toEqual([])
    expect(demo.invoices.filter((i) => i.status === 'draft')).toHaveLength(1)
  })

  it('never contains future dates or payments', () => {
    for (const i of demo.invoices) {
      expect(i.date <= '2026-11-26').toBe(true)
      if (i.paidDate) expect(i.paidDate <= '2026-11-26').toBe(true)
    }
    const early = buildDemoData('2026-02-01')
    expect(early.invoices.filter((i) => i.status !== 'draft')).toHaveLength(1)
    expect(early.invoices[0]?.status).toBe('issued')
  })
})
