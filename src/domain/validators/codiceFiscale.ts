import { validatePartitaIva } from './partitaIva'
import { fail, normalizeId, ok, type ValidationResult } from './types'

// Values for characters in odd positions (1st, 3rd, ... 15th), per DM 23/12/1976.
const ODD_VALUES: Record<string, number> = {
  '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
}

/** Letters used in place of digits when two people would otherwise get the same code (omocodia). */
const OMOCODE_LETTERS = 'LMNPQRSTUV'

/** Positions (0-based) that normally hold digits and may hold omocode letters instead. */
const NUMERIC_POSITIONS = [6, 7, 9, 10, 12, 13, 14]

const MONTH_LETTERS = 'ABCDEHLMPRST'
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const PERSON_PATTERN =
  /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/

function evenValue(ch: string): number {
  const code = ch.charCodeAt(0)
  return code <= 57 ? code - 48 : code - 65
}

/** Computes the control character of a natural person's codice fiscale from its first 15 characters. */
export function codiceFiscaleCheckChar(first15: string): string {
  const value = first15.toUpperCase()
  if (!/^[A-Z0-9]{15}$/.test(value)) throw new Error('Expected 15 alphanumeric characters')
  let sum = 0
  for (let i = 0; i < 15; i++) {
    const ch = value[i] as string
    // i is 0-based, so an even i is an odd 1-based position.
    sum += i % 2 === 0 ? (ODD_VALUES[ch] as number) : evenValue(ch)
  }
  return String.fromCharCode(65 + (sum % 26))
}

/** Replaces omocode letters with the digits they stand for, leaving other characters unchanged. */
export function decodeOmocodia(code: string): string {
  const chars = code.split('')
  for (const pos of NUMERIC_POSITIONS) {
    const ch = chars[pos]
    if (ch === undefined) continue
    const idx = OMOCODE_LETTERS.indexOf(ch)
    if (idx >= 0) chars[pos] = String(idx)
  }
  return chars.join('')
}

export interface CodiceFiscaleInfo {
  /** Two-digit birth year (the century is not encoded). */
  yearOfBirth: number
  monthOfBirth: number
  dayOfBirth: number
  sex: 'M' | 'F'
  /** Cadastral (Belfiore) code of the municipality or foreign country of birth. */
  placeCode: string
  omocode: boolean
}

/** Extracts birth data from a structurally valid 16-character code. Returns null if it cannot be parsed. */
export function parseCodiceFiscale(raw: string): CodiceFiscaleInfo | null {
  const value = normalizeId(raw)
  if (!PERSON_PATTERN.test(value)) return null
  const decoded = decodeOmocodia(value)
  const monthIdx = MONTH_LETTERS.indexOf(decoded[8] as string)
  const dayCode = Number(decoded.slice(9, 11))
  const female = dayCode > 40
  return {
    yearOfBirth: Number(decoded.slice(6, 8)),
    monthOfBirth: monthIdx + 1,
    dayOfBirth: female ? dayCode - 40 : dayCode,
    sex: female ? 'F' : 'M',
    placeCode: decoded.slice(11, 15),
    omocode: decoded !== value,
  }
}

/**
 * Validates the 16-character codice fiscale of a natural person, including omocode variants:
 * structure, month letter, day of month (women add 40) and the control character.
 */
export function validatePersonCodiceFiscale(raw: string): ValidationResult {
  const value = normalizeId(raw)
  if (value === '') return fail('empty')
  if (value.length !== 16) return fail('length')
  if (!/^[A-Z0-9]{16}$/.test(value)) return fail('format')
  if (MONTH_LETTERS.indexOf(value[8] as string) < 0) return fail('month')
  const info = parseCodiceFiscale(value)
  if (info === null) return fail('format')
  // Codes 32-40 parse as a male day above 31 and codes above 71 as a female day above 31: both fail here.
  const maxDay = DAYS_IN_MONTH[info.monthOfBirth - 1] as number
  if (info.dayOfBirth < 1 || info.dayOfBirth > maxDay) return fail('day')
  if (codiceFiscaleCheckChar(value.slice(0, 15)) !== value[15]) return fail('checksum')
  return ok(value)
}

/**
 * Validates any Italian codice fiscale: the 16-character code of a natural person or the
 * 11-digit numeric code of companies and organisations (same algorithm as the partita IVA).
 */
export function validateCodiceFiscale(raw: string): ValidationResult {
  const value = normalizeId(raw)
  if (value === '') return fail('empty')
  if (/^\d{11}$/.test(value)) return validatePartitaIva(value)
  return validatePersonCodiceFiscale(value)
}
