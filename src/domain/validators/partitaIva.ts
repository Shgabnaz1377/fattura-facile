import { fail, normalizeId, ok, type ValidationResult } from './types'

/**
 * Check digit of an Italian partita IVA (and of the 11-digit numeric codice fiscale
 * assigned to companies and other non-natural persons).
 *
 * Over the first 10 digits: digits in odd positions (1st, 3rd, ...) are summed as they are;
 * digits in even positions are doubled, subtracting 9 when the result exceeds 9.
 * The check digit is (10 - sum mod 10) mod 10.
 */
export function partitaIvaCheckDigit(first10: string): number {
  if (!/^\d{10}$/.test(first10)) throw new Error('Expected exactly 10 digits')
  let sum = 0
  for (let i = 0; i < 10; i++) {
    const digit = first10.charCodeAt(i) - 48
    if (i % 2 === 0) {
      sum += digit
    } else {
      const doubled = digit * 2
      sum += doubled > 9 ? doubled - 9 : doubled
    }
  }
  return (10 - (sum % 10)) % 10
}

/** Validates an Italian partita IVA. An optional "IT" country prefix is accepted and stripped. */
export function validatePartitaIva(raw: string): ValidationResult {
  let value = normalizeId(raw)
  if (value.startsWith('IT')) value = value.slice(2)
  if (value === '') return fail('empty')
  if (!/^\d+$/.test(value)) return fail('format')
  if (value.length !== 11) return fail('length')
  if (/^0+$/.test(value)) return fail('zeros')
  if (partitaIvaCheckDigit(value.slice(0, 10)) !== Number(value[10])) return fail('checksum')
  return ok(value)
}
