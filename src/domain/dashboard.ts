import { displayStatus, invoiceTotals } from './invoices'
import { sumCents, type Cents } from './money'
import type { Invoice } from './types'

export interface YearStats {
  year: number
  /** Issued (not cancelled) invoices dated in the year. */
  invoiceCount: number
  /** Fees + rivalsa of invoices dated in the year: excludes IVA and the stamp duty passed on. */
  invoicedCents: Cents
  /**
   * Fees + rivalsa actually collected in the year (cash basis, by payment date). This is the
   * figure the forfettario ceiling and taxes are computed on.
   */
  collectedCents: Cents
  /** IVA on invoices dated in the year (regime ordinario). */
  vatCents: Cents
  /** Amount still to be paid by clients (net of ritenuta), all years. */
  outstandingCents: Cents
  overdueCents: Cents
  overdueCount: number
  /** Collected per month, January = index 0. */
  monthlyCollectedCents: Cents[]
}

/** Compensi of an invoice: everything except IVA and the stamp duty passed on to the client. */
export function feesCents(invoice: Invoice): Cents {
  const t = invoiceTotals(invoice)
  return t.subtotalCents + t.rivalsaCents
}

export function yearStats(invoices: readonly Invoice[], year: number, today: string): YearStats {
  const live = invoices.filter((i) => i.status === 'issued' || i.status === 'paid')
  const dated = live.filter((i) => i.year === year)
  const paidInYear = live.filter((i) => i.status === 'paid' && i.paidDate?.startsWith(`${year}-`))
  const open = live.filter((i) => i.status === 'issued')
  const overdue = open.filter((i) => displayStatus(i, today) === 'overdue')

  const monthly: Cents[] = Array.from({ length: 12 }, () => 0)
  for (const inv of paidInYear) {
    const month = Number((inv.paidDate as string).slice(5, 7)) - 1
    monthly[month] = (monthly[month] ?? 0) + feesCents(inv)
  }

  return {
    year,
    invoiceCount: dated.length,
    invoicedCents: sumCents(dated.map(feesCents)),
    collectedCents: sumCents(monthly),
    vatCents: sumCents(dated.map((i) => invoiceTotals(i).vatCents)),
    outstandingCents: sumCents(open.map((i) => invoiceTotals(i).netToPayCents)),
    overdueCents: sumCents(overdue.map((i) => invoiceTotals(i).netToPayCents)),
    overdueCount: overdue.length,
    monthlyCollectedCents: monthly,
  }
}

/** Years that have invoices or payments, plus the current one, newest first. */
export function availableYears(invoices: readonly Invoice[], currentYear: number): number[] {
  const years = new Set<number>([currentYear])
  for (const inv of invoices) {
    years.add(inv.year)
    if (inv.paidDate) years.add(Number(inv.paidDate.slice(0, 4)))
  }
  return [...years].sort((a, b) => b - a)
}
