import { addDaysIso, deepCopy, newId, nowIso, todayIso } from './factories'
import { checkNumbering, formatInvoiceNumber, nextInvoiceNumber, yearOf, type NumberingIssue } from './numbering'
import { computeInvoiceTotals, validateInvoiceLines, type InvoiceIssue, type InvoiceTotals } from './tax/invoiceTotals'
import { RIVALSA_INPS_RATE } from './tax/rules'
import type { BusinessProfile, Client, Invoice, InvoiceLine, InvoiceTaxOptions } from './types'

export function newLine(profile: BusinessProfile, applyRitenuta: boolean): InvoiceLine {
  return {
    id: newId(),
    description: '',
    quantity: 1,
    unit: '',
    unitPriceCents: 0,
    vatRate: profile.regime === 'forfettario' ? 0 : 22,
    natura: profile.regime === 'forfettario' ? 'N2.2' : null,
    ritenuta: applyRitenuta,
  }
}

/** A new draft invoice with the profile's defaults. */
export function newInvoice(profile: BusinessProfile, clientId = '', date = todayIso()): Invoice {
  const forfettario = profile.regime === 'forfettario'
  const applyRitenuta = !forfettario && profile.defaults.applyRitenuta
  const now = nowIso()
  return {
    id: newId(),
    number: null,
    year: yearOf(date),
    date,
    dueDate: addDaysIso(date, profile.defaults.paymentTermsDays),
    clientId,
    lines: [newLine(profile, applyRitenuta)],
    notes: '',
    status: 'draft',
    paidDate: null,
    snapshot: null,
    regime: profile.regime,
    applyRivalsaInps: profile.inpsScheme === 'gestione_separata' && profile.defaults.applyRivalsaInps,
    rivalsaRate: RIVALSA_INPS_RATE,
    applyRitenuta,
    ritenutaRate: profile.defaults.ritenutaRate,
    bolloMode: 'auto',
    bolloChargedToClient: true,
    createdAt: now,
    updatedAt: now,
  }
}

export function invoiceTotals(invoice: Pick<Invoice, 'lines' | keyof InvoiceTaxOptions>): InvoiceTotals {
  return computeInvoiceTotals(invoice.lines, invoice)
}

/** Display status: an issued invoice past its due date is overdue. */
export type DisplayStatus = 'draft' | 'issued' | 'overdue' | 'paid' | 'cancelled'

export function displayStatus(invoice: Pick<Invoice, 'status' | 'dueDate'>, today = todayIso()): DisplayStatus {
  if (invoice.status === 'issued' && invoice.dueDate < today) return 'overdue'
  return invoice.status
}

export function invoiceLabel(invoice: Pick<Invoice, 'number' | 'year'>, profile: BusinessProfile): string | null {
  if (invoice.number === null) return null
  return formatInvoiceNumber(invoice.number, invoice.year, profile.defaults.numberFormat)
}

export type IssueBlocker =
  | InvoiceIssue
  | NumberingIssue
  | { code: 'profileIncomplete' }
  | { code: 'missingClient' }
  | { code: 'dueBeforeDate' }

/** Everything that prevents a draft from being issued with the given number. */
export function issueBlockers(
  invoice: Invoice,
  number: number,
  others: readonly Invoice[],
  profileValid: boolean,
  client: Client | undefined,
): IssueBlocker[] {
  const blockers: IssueBlocker[] = []
  if (!profileValid) blockers.push({ code: 'profileIncomplete' })
  if (!client) blockers.push({ code: 'missingClient' })
  if (invoice.dueDate < invoice.date) blockers.push({ code: 'dueBeforeDate' })
  blockers.push(...validateInvoiceLines(invoice.lines, invoice))
  blockers.push(...checkNumbering({ ...invoice, number, year: yearOf(invoice.date), status: 'issued' }, others))
  return blockers
}

/** Returns the issued version of a draft: number assigned and issuer/client data frozen. */
export function issueInvoice(
  draft: Invoice,
  others: readonly Invoice[],
  profile: BusinessProfile,
  client: Client,
): Invoice {
  const year = yearOf(draft.date)
  return {
    ...draft,
    year,
    number: nextInvoiceNumber(others, year),
    status: 'issued',
    snapshot: { profile: deepCopy(profile), client: deepCopy(client) },
    updatedAt: nowIso(),
  }
}

/** A new draft with the same client and lines, dated today. */
export function duplicateInvoice(source: Invoice, profile: BusinessProfile, date = todayIso()): Invoice {
  const base = newInvoice(profile, source.clientId, date)
  return {
    ...base,
    lines: source.lines.map((l) => ({ ...l, id: newId() })),
    notes: source.notes,
    regime: profile.regime,
    applyRivalsaInps: source.applyRivalsaInps,
    applyRitenuta: profile.regime === 'ordinario' && source.applyRitenuta,
    ritenutaRate: source.ritenutaRate,
    bolloMode: source.bolloMode,
    bolloChargedToClient: source.bolloChargedToClient,
  }
}
