/**
 * Money is handled as integer euro cents everywhere in the domain layer. Floating point
 * euros only appear at the edges (form inputs, formatting, XML/PDF output).
 */
export type Cents = number

/** Divides an integer by a positive integer divisor, rounding half away from zero. */
function divRoundHalfAwayFromZero(numerator: number, divisor: number): number {
  const sign = numerator < 0 ? -1 : 1
  const abs = Math.abs(numerator)
  const q = Math.floor(abs / divisor)
  const r = abs - q * divisor
  return sign * (r * 2 >= divisor ? q + 1 : q)
}

/** Converts a euro amount (possibly with floating point noise, e.g. 0.1 + 0.2) to cents. */
export function toCents(euros: number): Cents {
  if (!Number.isFinite(euros)) throw new Error('Amount must be a finite number')
  // Scale through a string to avoid 1.005 * 100 = 100.49999 style errors.
  const [intPart, fracPart = ''] = Math.abs(euros).toFixed(6).split('.')
  const micro = Number(intPart) * 1_000_000 + Number(fracPart.padEnd(6, '0'))
  const cents = divRoundHalfAwayFromZero(micro, 10_000)
  return euros < 0 ? -cents : cents
}

export function fromCents(cents: Cents): number {
  return cents / 100
}

/** Rate as a percentage with at most two decimals (22, 4, 26.07) converted to basis points. */
export function percentToBasisPoints(percent: number): number {
  const bp = Math.round(percent * 100)
  if (Math.abs(bp - percent * 100) > 1e-6) throw new Error(`Rate ${percent}% has more than two decimals`)
  return bp
}

/** Applies a percentage to an amount in cents, rounding the result to the nearest cent (half up). */
export function applyRate(cents: Cents, percent: number): Cents {
  return divRoundHalfAwayFromZero(cents * percentToBasisPoints(percent), 10_000)
}

/**
 * Line amount: unit price × quantity, rounded to cents. Quantities may have up to
 * two decimals (e.g. 1.5 days, 7.25 hours).
 */
export function lineAmount(unitPriceCents: Cents, quantity: number): Cents {
  const hundredths = Math.round(quantity * 100)
  if (Math.abs(hundredths - quantity * 100) > 1e-6) throw new Error('Quantity supports at most two decimals')
  return divRoundHalfAwayFromZero(unitPriceCents * hundredths, 100)
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((acc, v) => acc + v, 0)
}

/** Formats cents as a fixed two-decimal string with a dot separator, as FatturaPA requires. */
export function centsToDecimalString(cents: Cents): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** Locale-aware currency formatting for display. */
export function formatEuro(cents: Cents, locale = 'it-IT'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', useGrouping: 'always' }).format(cents / 100)
}
