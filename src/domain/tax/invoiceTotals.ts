import { applyRate, lineAmount, sumCents, type Cents } from '../money'
import type { InvoiceLine, InvoiceTaxOptions, Natura, VatRate } from '../types'
import {
  BOLLO_AMOUNT_CENTS,
  BOLLO_AUTO_NATURE,
  BOLLO_LINE_NATURA,
  BOLLO_LINE_RIFERIMENTO,
  BOLLO_THRESHOLD_CENTS,
  FORFETTARIO_NATURA,
  FORFETTARIO_RIFERIMENTO,
} from './rules'

export interface ComputedLine extends InvoiceLine {
  amountCents: Cents
}

/** One row of the IVA summary: lines grouped by rate and natura (FatturaPA DatiRiepilogo). */
export interface VatSummaryRow {
  vatRate: VatRate
  natura: Natura | null
  /** Sum of the line amounts in the group, before rivalsa. */
  linesCents: Cents
  /** Rivalsa INPS charged on the group's lines. */
  rivalsaCents: Cents
  /** Taxable base: lines + rivalsa (+ the stamp duty line for the N1 row when charged). */
  taxableCents: Cents
  vatCents: Cents
  riferimentoNormativo: string | null
}

export interface InvoiceTotals {
  lines: ComputedLine[]
  /** Sum of line amounts (fees), excluding rivalsa and stamp duty. */
  subtotalCents: Cents
  rivalsaCents: Cents
  vatSummary: VatSummaryRow[]
  vatCents: Cents
  bollo: {
    applies: boolean
    /** Amount subject to the €77.47 check. */
    baseCents: Cents
    amountCents: Cents
    chargedToClient: boolean
  }
  /** ImportoTotaleDocumento: taxable amounts + IVA (+ stamp duty when charged to the client). */
  totalCents: Cents
  ritenuta: {
    applies: boolean
    baseCents: Cents
    rate: number
    amountCents: Cents
  }
  /** What the client actually pays: total minus ritenuta. */
  netToPayCents: Cents
}

export type TotalsInput = Pick<InvoiceLine, 'quantity' | 'unitPriceCents' | 'vatRate' | 'natura' | 'ritenuta'> &
  Partial<InvoiceLine>

const groupKey = (rate: VatRate, natura: Natura | null) => `${rate}|${natura ?? ''}`

/**
 * Normalises the lines for the chosen regime: forfettario invoices carry no IVA, so every
 * line becomes 0% with natura N2.2 and nothing is subject to ritenuta (L. 190/2014 c. 67).
 */
function normaliseLine(line: TotalsInput, options: InvoiceTaxOptions): InvoiceLine {
  const base: InvoiceLine = {
    id: line.id ?? '',
    description: line.description ?? '',
    unit: line.unit ?? '',
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    vatRate: line.vatRate,
    natura: line.vatRate === 0 ? line.natura : null,
    ritenuta: line.ritenuta,
  }
  if (options.regime === 'forfettario') {
    return { ...base, vatRate: 0, natura: FORFETTARIO_NATURA, ritenuta: false }
  }
  return base
}

export function computeInvoiceTotals(rawLines: readonly TotalsInput[], options: InvoiceTaxOptions): InvoiceTotals {
  const lines: ComputedLine[] = rawLines.map((raw) => {
    const line = normaliseLine(raw, options)
    return { ...line, amountCents: lineAmount(line.unitPriceCents, line.quantity) }
  })

  const subtotalCents = sumCents(lines.map((l) => l.amountCents))
  const rivalsaOn = options.applyRivalsaInps

  // Group lines by rate/natura, keeping the order in which groups first appear.
  const groups = new Map<string, VatSummaryRow>()
  for (const line of lines) {
    const key = groupKey(line.vatRate, line.natura)
    let row = groups.get(key)
    if (!row) {
      row = {
        vatRate: line.vatRate,
        natura: line.natura,
        linesCents: 0,
        rivalsaCents: 0,
        taxableCents: 0,
        vatCents: 0,
        riferimentoNormativo: line.natura === FORFETTARIO_NATURA ? FORFETTARIO_RIFERIMENTO : null,
      }
      groups.set(key, row)
    }
    row.linesCents += line.amountCents
  }
  for (const row of groups.values()) {
    // Rivalsa INPS follows the IVA treatment of the fees it applies to.
    row.rivalsaCents = rivalsaOn ? applyRate(row.linesCents, options.rivalsaRate) : 0
    row.taxableCents = row.linesCents + row.rivalsaCents
  }
  const rivalsaCents = sumCents([...groups.values()].map((r) => r.rivalsaCents))

  // Stamp duty: due when the amount without IVA exceeds €77.47.
  const bolloBaseCents = sumCents(
    [...groups.values()].filter((r) => r.natura !== null && BOLLO_AUTO_NATURE.includes(r.natura)).map((r) => r.taxableCents),
  )
  const bolloApplies =
    options.bolloMode === 'yes' || (options.bolloMode === 'auto' && bolloBaseCents > BOLLO_THRESHOLD_CENTS)
  const bolloCharged = bolloApplies && options.bolloChargedToClient
  if (bolloCharged) {
    const key = groupKey(0, BOLLO_LINE_NATURA)
    const existing = groups.get(key)
    if (existing) {
      existing.taxableCents += BOLLO_AMOUNT_CENTS
    } else {
      groups.set(key, {
        vatRate: 0,
        natura: BOLLO_LINE_NATURA,
        linesCents: 0,
        rivalsaCents: 0,
        taxableCents: BOLLO_AMOUNT_CENTS,
        vatCents: 0,
        riferimentoNormativo: BOLLO_LINE_RIFERIMENTO,
      })
    }
  }

  // IVA is computed once per summary row, as FatturaPA's DatiRiepilogo expects.
  for (const row of groups.values()) row.vatCents = applyRate(row.taxableCents, row.vatRate)
  const vatSummary = [...groups.values()]
  const vatCents = sumCents(vatSummary.map((r) => r.vatCents))
  const totalCents = sumCents(vatSummary.map((r) => r.taxableCents)) + vatCents

  // Ritenuta d'acconto: on the fees subject to it plus the rivalsa INPS charged on them
  // (rivalsa for gestione separata is part of the professional's income).
  const ritenutaApplies = options.regime === 'ordinario' && options.applyRitenuta
  let ritenutaBase = 0
  if (ritenutaApplies) {
    const subjectLines = sumCents(lines.filter((l) => l.ritenuta).map((l) => l.amountCents))
    const subjectRivalsa = !rivalsaOn
      ? 0
      : subjectLines === subtotalCents
        ? rivalsaCents
        : applyRate(subjectLines, options.rivalsaRate)
    ritenutaBase = subjectLines + subjectRivalsa
  }
  const ritenutaAmount = ritenutaApplies ? applyRate(ritenutaBase, options.ritenutaRate) : 0

  return {
    lines,
    subtotalCents,
    rivalsaCents,
    vatSummary,
    vatCents,
    bollo: {
      applies: bolloApplies,
      baseCents: bolloBaseCents,
      amountCents: bolloApplies ? BOLLO_AMOUNT_CENTS : 0,
      chargedToClient: bolloCharged,
    },
    totalCents,
    ritenuta: {
      applies: ritenutaApplies && ritenutaAmount > 0,
      baseCents: ritenutaBase,
      rate: options.ritenutaRate,
      amountCents: ritenutaAmount,
    },
    netToPayCents: totalCents - ritenutaAmount,
  }
}

export type InvoiceIssue =
  | { code: 'noLines' }
  | { code: 'emptyDescription'; line: number }
  | { code: 'nonPositiveQuantity'; line: number }
  | { code: 'quantityPrecision'; line: number }
  | { code: 'negativePrice'; line: number }
  | { code: 'missingNatura'; line: number }
  | { code: 'naturaWithVat'; line: number }
  | { code: 'nonPositiveTotal' }

/** Checks the conditions that would make an invoice invalid or rejected by SDI. */
export function validateInvoiceLines(rawLines: readonly TotalsInput[], options: InvoiceTaxOptions): InvoiceIssue[] {
  const issues: InvoiceIssue[] = []
  if (rawLines.length === 0) return [{ code: 'noLines' }]
  rawLines.forEach((line, i) => {
    const n = i + 1
    if (!line.description || line.description.trim() === '') issues.push({ code: 'emptyDescription', line: n })
    if (!(line.quantity > 0)) issues.push({ code: 'nonPositiveQuantity', line: n })
    else if (Math.abs(Math.round(line.quantity * 100) - line.quantity * 100) > 1e-6)
      issues.push({ code: 'quantityPrecision', line: n })
    if (line.unitPriceCents < 0) issues.push({ code: 'negativePrice', line: n })
    if (options.regime === 'ordinario') {
      if (line.vatRate === 0 && !line.natura) issues.push({ code: 'missingNatura', line: n })
      if (line.vatRate !== 0 && line.natura) issues.push({ code: 'naturaWithVat', line: n })
    }
  })
  if (issues.length === 0 && computeInvoiceTotals(rawLines, options).totalCents <= 0) {
    issues.push({ code: 'nonPositiveTotal' })
  }
  return issues
}
