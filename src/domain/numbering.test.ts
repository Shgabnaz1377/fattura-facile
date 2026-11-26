import { describe, expect, it } from 'vitest'
import {
  checkNumbering,
  findNumberingGaps,
  formatInvoiceNumber,
  isValidNumberFormat,
  nextInvoiceNumber,
  yearOf,
  type NumberedInvoice,
} from './numbering'

const inv = (id: string, number: number | null, date: string, status: NumberedInvoice['status'] = 'issued'): NumberedInvoice => ({
  id,
  number,
  year: Number(date.slice(0, 4)),
  date,
  status,
})

const existing = [
  inv('a', 1, '2026-01-10'),
  inv('b', 2, '2026-02-03', 'paid'),
  inv('c', 3, '2026-03-15', 'cancelled'),
  inv('d', null, '2026-03-20', 'draft'),
  inv('e', 7, '2025-12-30'),
]

describe('invoice numbering', () => {
  it('continues the sequence of the year, counting cancelled but not draft invoices', () => {
    expect(nextInvoiceNumber(existing, 2026)).toBe(4)
  })

  it('restarts from 1 every year', () => {
    expect(nextInvoiceNumber(existing, 2027)).toBe(1)
    expect(nextInvoiceNumber(existing, 2025)).toBe(8)
    expect(nextInvoiceNumber([], 2026)).toBe(1)
  })

  it('formats numbers with placeholders', () => {
    expect(formatInvoiceNumber(4, 2026)).toBe('4/2026')
    expect(formatInvoiceNumber(4, 2026, 'FF-{nnn}-{yyyy}')).toBe('FF-004-2026')
    expect(formatInvoiceNumber(1234, 2026, '{nnn}')).toBe('1234')
  })

  it('rejects formats that do not fit the FatturaPA Numero field', () => {
    expect(isValidNumberFormat('{n}/{yyyy}')).toBe(true)
    expect(isValidNumberFormat('{yyyy}')).toBe(false)
    expect(isValidNumberFormat('FATTURA-PROFESSIONALE-{n}')).toBe(false)
    expect(() => formatInvoiceNumber(1, 2026, 'INVOICE-NUMBER-LONG-{n}')).toThrow()
  })

  it('accepts the next number with a date not earlier than the previous invoice', () => {
    expect(checkNumbering(inv('new', 4, '2026-03-15'), existing)).toEqual([])
  })

  it('flags duplicates within the same year only', () => {
    expect(checkNumbering(inv('new', 2, '2026-02-03'), existing)).toContainEqual({ code: 'duplicate', number: 2 })
    expect(checkNumbering(inv('new', 7, '2026-12-31'), existing)).toEqual([])
  })

  it('flags dates that go backwards', () => {
    expect(checkNumbering(inv('new', 4, '2026-03-01'), existing)).toEqual([
      { code: 'dateBeforePrevious', previousNumber: 3, previousDate: '2026-03-15' },
    ])
    // Re-dating invoice 2 after invoice 3 breaks the order the other way.
    expect(checkNumbering(inv('b', 2, '2026-04-01'), existing)).toEqual([
      { code: 'dateAfterNext', nextNumber: 3, nextDate: '2026-03-15' },
    ])
  })

  it('flags a number whose year does not match its date', () => {
    expect(checkNumbering({ ...inv('new', 1, '2027-01-02'), year: 2026 }, existing)).toContainEqual({ code: 'yearMismatch' })
  })

  it('ignores drafts without a number', () => {
    expect(checkNumbering(inv('new', null, '2020-01-01', 'draft'), existing)).toEqual([])
  })

  it('reports gaps in the sequence', () => {
    expect(findNumberingGaps(existing, 2026)).toEqual([])
    expect(findNumberingGaps([...existing, inv('f', 6, '2026-05-01')], 2026)).toEqual([4, 5])
    expect(findNumberingGaps(existing, 2025)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('parses the year of an ISO date', () => {
    expect(yearOf('2026-11-26')).toBe(2026)
    expect(() => yearOf('26/11/2026')).toThrow()
  })
})
