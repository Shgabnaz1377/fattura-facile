export type ValidationError = 'empty' | 'length' | 'format' | 'checksum' | 'zeros' | 'month' | 'day'

export type ValidationResult = { valid: true; normalized: string } | { valid: false; error: ValidationError }

export const ok = (normalized: string): ValidationResult => ({ valid: true, normalized })
export const fail = (error: ValidationError): ValidationResult => ({ valid: false, error })

/** Uppercases and removes spaces, dots and dashes that people commonly type in tax identifiers. */
export function normalizeId(raw: string): string {
  return raw.replace(/[\s.-]/g, '').toUpperCase()
}
