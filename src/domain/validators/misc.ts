import { fail, normalizeId, ok, type ValidationResult } from './types'

/** SDI recipient code: 7 alphanumeric characters for private businesses (FPR12 invoices). */
export function validateCodiceDestinatario(raw: string): ValidationResult {
  const value = normalizeId(raw)
  if (value === '') return fail('empty')
  if (!/^[A-Z0-9]+$/.test(value)) return fail('format')
  if (value.length !== 7) return fail('length')
  return ok(value)
}

export function validateCap(raw: string): ValidationResult {
  const value = raw.trim()
  if (value === '') return fail('empty')
  if (!/^\d{5}$/.test(value)) return fail('format')
  return ok(value)
}

export function validateProvincia(raw: string): ValidationResult {
  const value = raw.trim().toUpperCase()
  if (value === '') return fail('empty')
  if (!/^[A-Z]{2}$/.test(value)) return fail('format')
  return ok(value)
}

/** IBAN validation per ISO 13616 (mod 97 must equal 1). Italian IBANs are 27 characters long. */
export function validateIban(raw: string): ValidationResult {
  const value = normalizeId(raw)
  if (value === '') return fail('empty')
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value)) return fail('format')
  if (value.startsWith('IT') && value.length !== 27) return fail('length')
  const rearranged = value.slice(4) + value.slice(0, 4)
  let remainder = 0
  for (const ch of rearranged) {
    const chunk = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)
    for (const digit of chunk) remainder = (remainder * 10 + Number(digit)) % 97
  }
  if (remainder !== 1) return fail('checksum')
  return ok(value)
}

export function validateEmail(raw: string): ValidationResult {
  const value = raw.trim()
  if (value === '') return fail('empty')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return fail('format')
  return ok(value.toLowerCase())
}
