import type { Invoice } from './types'

/**
 * Invoice numbering: a progressive number restarting every calendar year, assigned when an
 * invoice is issued (drafts have none). Dates must follow the numbering order within a year.
 */

export type NumberedInvoice = Pick<Invoice, 'id' | 'number' | 'year' | 'date' | 'status'>

const counts = (inv: NumberedInvoice) => inv.number !== null && inv.status !== 'draft'

export function yearOf(isoDate: string): number {
  const year = Number(isoDate.slice(0, 4))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || !Number.isInteger(year)) throw new Error(`Invalid date: ${isoDate}`)
  return year
}

/** Next progressive number for the year: one more than the highest used, starting at 1. */
export function nextInvoiceNumber(invoices: readonly NumberedInvoice[], year: number): number {
  let max = 0
  for (const inv of invoices) {
    if (counts(inv) && inv.year === year && (inv.number as number) > max) max = inv.number as number
  }
  return max + 1
}

/**
 * Renders the invoice number shown on documents and in the FatturaPA Numero field.
 * Placeholders: {n} number, {nnn} zero-padded to 3 digits, {yyyy} year.
 */
export function formatInvoiceNumber(number: number, year: number, pattern = '{n}/{yyyy}'): string {
  const out = pattern
    .replace(/\{nnn\}/g, String(number).padStart(3, '0'))
    .replace(/\{n\}/g, String(number))
    .replace(/\{yyyy\}/g, String(year))
  // FatturaPA Numero: 1-20 characters and at least one digit.
  if (out.length === 0 || out.length > 20 || !/\d/.test(out)) {
    throw new Error(`Invoice number "${out}" is not a valid FatturaPA Numero`)
  }
  return out
}

export function isValidNumberFormat(pattern: string): boolean {
  if (!/\{n(nn)?\}/.test(pattern)) return false
  try {
    formatInvoiceNumber(9999, 2099, pattern)
    return true
  } catch {
    return false
  }
}

export type NumberingIssue =
  | { code: 'duplicate'; number: number }
  | { code: 'dateBeforePrevious'; previousNumber: number; previousDate: string }
  | { code: 'dateAfterNext'; nextNumber: number; nextDate: string }
  | { code: 'yearMismatch' }

/**
 * Checks that issuing `candidate` with its number and date keeps the year's sequence
 * consistent: no duplicates, and dates that do not go backwards as numbers increase.
 */
export function checkNumbering(candidate: NumberedInvoice, invoices: readonly NumberedInvoice[]): NumberingIssue[] {
  const issues: NumberingIssue[] = []
  if (candidate.number === null) return issues
  if (yearOf(candidate.date) !== candidate.year) issues.push({ code: 'yearMismatch' })
  const sameYear = invoices.filter((inv) => counts(inv) && inv.year === candidate.year && inv.id !== candidate.id)
  if (sameYear.some((inv) => inv.number === candidate.number)) {
    issues.push({ code: 'duplicate', number: candidate.number })
  }
  const n = candidate.number
  const previous = sameYear
    .filter((inv) => (inv.number as number) < n)
    .sort((a, b) => (b.number as number) - (a.number as number))[0]
  const next = sameYear
    .filter((inv) => (inv.number as number) > n)
    .sort((a, b) => (a.number as number) - (b.number as number))[0]
  if (previous && previous.date > candidate.date) {
    issues.push({ code: 'dateBeforePrevious', previousNumber: previous.number as number, previousDate: previous.date })
  }
  if (next && next.date < candidate.date) {
    issues.push({ code: 'dateAfterNext', nextNumber: next.number as number, nextDate: next.date })
  }
  return issues
}

/** Numbers missing from a year's sequence (1..max), e.g. after a deleted invoice. */
export function findNumberingGaps(invoices: readonly NumberedInvoice[], year: number): number[] {
  const used = new Set(invoices.filter((inv) => counts(inv) && inv.year === year).map((inv) => inv.number as number))
  const max = Math.max(0, ...used)
  const gaps: number[] = []
  for (let i = 1; i <= max; i++) if (!used.has(i)) gaps.push(i)
  return gaps
}
