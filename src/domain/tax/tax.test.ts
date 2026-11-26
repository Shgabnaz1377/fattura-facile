import { describe, expect, it } from 'vitest'
import { applyRate, centsToDecimalString, formatEuro, lineAmount, toCents } from '../money'
import type { InvoiceTaxOptions } from '../types'
import { coefficientFor, suggestGroupForAteco } from './coefficients'
import { ceilingStatus, estimateForfettario, estimateInpsContributions, startupRateApplies } from './forfettario'
import { computeInvoiceTotals, validateInvoiceLines, type TotalsInput } from './invoiceTotals'
import { DEFAULT_INPS_PARAMETERS } from './rules'

const ordinario: InvoiceTaxOptions = {
  regime: 'ordinario',
  applyRivalsaInps: false,
  rivalsaRate: 4,
  applyRitenuta: false,
  ritenutaRate: 20,
  bolloMode: 'auto',
  bolloChargedToClient: true,
}
const forfettario: InvoiceTaxOptions = { ...ordinario, regime: 'forfettario' }

const line = (euros: number, extra: Partial<TotalsInput> = {}): TotalsInput => ({
  description: 'Consulenza',
  quantity: 1,
  unitPriceCents: toCents(euros),
  vatRate: 22,
  natura: null,
  ritenuta: true,
  ...extra,
})

describe('money', () => {
  it('converts euros to cents without floating point drift', () => {
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents(1.005)).toBe(101)
    expect(toCents(19.99)).toBe(1999)
    expect(toCents(-2.5)).toBe(-250)
  })

  it('rounds percentages half up to the cent', () => {
    expect(applyRate(105, 22)).toBe(23) // 23.1
    expect(applyRate(5, 10)).toBe(1) // 0.5
    expect(applyRate(4, 10)).toBe(0) // 0.4
    expect(applyRate(9999, 22)).toBe(2200) // 2199.78
    expect(applyRate(3_900_000, 26.07)).toBe(1_016_730)
    expect(applyRate(-105, 22)).toBe(-23)
  })

  it('computes line amounts with decimal quantities', () => {
    expect(lineAmount(3333, 3)).toBe(9999)
    expect(lineAmount(15, 1.5)).toBe(23) // 0.225 → 0.23
    expect(lineAmount(6000, 7.25)).toBe(43500)
    expect(() => lineAmount(100, 1.234)).toThrow()
  })

  it('formats amounts', () => {
    expect(centsToDecimalString(5)).toBe('0.05')
    expect(centsToDecimalString(126880)).toBe('1268.80')
    expect(centsToDecimalString(-1234)).toBe('-12.34')
    expect(formatEuro(126880).replace(/\s/g, ' ')).toBe('1.268,80 €')
  })
})

describe('invoice totals: regime ordinario', () => {
  it('applies rivalsa INPS 4%, IVA 22% and ritenuta 20% on fees plus rivalsa', () => {
    const t = computeInvoiceTotals([line(1000)], { ...ordinario, applyRivalsaInps: true, applyRitenuta: true })
    expect(t.subtotalCents).toBe(100000)
    expect(t.rivalsaCents).toBe(4000)
    expect(t.vatSummary).toHaveLength(1)
    expect(t.vatSummary[0]).toMatchObject({ vatRate: 22, taxableCents: 104000, vatCents: 22880 })
    expect(t.totalCents).toBe(126880)
    expect(t.ritenuta).toEqual({ applies: true, baseCents: 104000, rate: 20, amountCents: 20800 })
    expect(t.netToPayCents).toBe(106080)
    expect(t.bollo.applies).toBe(false)
  })

  it('computes IVA once per rate group, not per line', () => {
    // Per line: 0.10 × 22% = 0.022 → 0.02, three times = 0.06. Per group: 0.30 × 22% = 0.066 → 0.07.
    const t = computeInvoiceTotals([line(0.1), line(0.1), line(0.1)], ordinario)
    expect(t.vatCents).toBe(7)
  })

  it('groups mixed rates and natura codes into separate summary rows', () => {
    const t = computeInvoiceTotals(
      [line(100), line(50, { vatRate: 10 }), line(30, { vatRate: 0, natura: 'N4' }), line(20)],
      ordinario,
    )
    expect(t.vatSummary.map((r) => [r.vatRate, r.natura, r.taxableCents, r.vatCents])).toEqual([
      [22, null, 12000, 2640],
      [10, null, 5000, 500],
      [0, 'N4', 3000, 0],
    ])
    expect(t.totalCents).toBe(20000 + 3140)
    // Exempt amount below €77.47: no stamp duty.
    expect(t.bollo.applies).toBe(false)
  })

  it('applies ritenuta only to the lines subject to it', () => {
    const t = computeInvoiceTotals([line(1000), line(200, { ritenuta: false })], {
      ...ordinario,
      applyRivalsaInps: true,
      applyRitenuta: true,
    })
    expect(t.rivalsaCents).toBe(4800)
    expect(t.ritenuta.baseCents).toBe(104000)
    expect(t.ritenuta.amountCents).toBe(20800)
    expect(t.totalCents).toBe(124800 + 27456)
  })

  it('adds stamp duty on exempt operations above the threshold', () => {
    const t = computeInvoiceTotals([line(200, { vatRate: 0, natura: 'N4' })], ordinario)
    expect(t.bollo).toEqual({ applies: true, baseCents: 20000, amountCents: 200, chargedToClient: true })
    expect(t.totalCents).toBe(20200)
  })

  it('lets the user force the stamp duty on', () => {
    const t = computeInvoiceTotals([line(100, { vatRate: 0, natura: 'N3.1' })], { ...ordinario, bolloMode: 'yes' })
    expect(t.bollo.applies).toBe(true)
    expect(t.vatSummary.find((r) => r.natura === 'N1')?.taxableCents).toBe(200)
  })

  it('drops natura on lines that carry IVA', () => {
    const t = computeInvoiceTotals([line(100, { natura: 'N4' })], ordinario)
    expect(t.vatSummary[0]?.natura).toBeNull()
  })
})

describe('invoice totals: regime forfettario', () => {
  it('charges no IVA, uses natura N2.2 and never applies ritenuta', () => {
    const t = computeInvoiceTotals([line(500)], { ...forfettario, applyRitenuta: true })
    expect(t.vatCents).toBe(0)
    expect(t.vatSummary[0]).toMatchObject({ vatRate: 0, natura: 'N2.2', taxableCents: 50000 })
    expect(t.vatSummary[0]?.riferimentoNormativo).toContain('190/2014')
    expect(t.ritenuta.applies).toBe(false)
    expect(t.ritenuta.amountCents).toBe(0)
  })

  it('adds rivalsa INPS without IVA and the €2 stamp duty charged to the client', () => {
    const t = computeInvoiceTotals([line(500)], { ...forfettario, applyRivalsaInps: true })
    expect(t.rivalsaCents).toBe(2000)
    expect(t.bollo).toEqual({ applies: true, baseCents: 52000, amountCents: 200, chargedToClient: true })
    expect(t.vatSummary.map((r) => [r.natura, r.taxableCents])).toEqual([
      ['N2.2', 52000],
      ['N1', 200],
    ])
    expect(t.totalCents).toBe(52200)
    expect(t.netToPayCents).toBe(52200)
  })

  it('applies the stamp duty only strictly above €77.47', () => {
    expect(computeInvoiceTotals([line(77.47)], forfettario).bollo.applies).toBe(false)
    expect(computeInvoiceTotals([line(77.48)], forfettario).bollo.applies).toBe(true)
  })

  it('counts rivalsa towards the stamp duty threshold', () => {
    // 74.50 + 4% = 77.48
    const t = computeInvoiceTotals([line(74.5)], { ...forfettario, applyRivalsaInps: true })
    expect(t.bollo.baseCents).toBe(7748)
    expect(t.bollo.applies).toBe(true)
  })

  it('keeps the duty out of the total when the freelancer absorbs it', () => {
    const t = computeInvoiceTotals([line(300)], { ...forfettario, bolloChargedToClient: false })
    expect(t.bollo.applies).toBe(true)
    expect(t.bollo.chargedToClient).toBe(false)
    expect(t.totalCents).toBe(30000)
  })

  it('respects bollo mode "no"', () => {
    expect(computeInvoiceTotals([line(300)], { ...forfettario, bolloMode: 'no' }).bollo.applies).toBe(false)
  })
})

describe('invoice validation', () => {
  it('flags missing natura, empty descriptions and bad quantities', () => {
    const issues = validateInvoiceLines(
      [line(10, { vatRate: 0, natura: null }), line(10, { description: ' ' }), line(10, { quantity: 0 }), line(1, { quantity: 1.234 })],
      ordinario,
    )
    expect(issues).toEqual([
      { code: 'missingNatura', line: 1 },
      { code: 'emptyDescription', line: 2 },
      { code: 'nonPositiveQuantity', line: 3 },
      { code: 'quantityPrecision', line: 4 },
    ])
  })

  it('does not require natura in forfettario (it is set automatically)', () => {
    expect(validateInvoiceLines([line(10, { vatRate: 0, natura: null })], forfettario)).toEqual([])
  })

  it('requires at least one line and a positive total', () => {
    expect(validateInvoiceLines([], ordinario)).toEqual([{ code: 'noLines' }])
    expect(validateInvoiceLines([line(0)], ordinario)).toEqual([{ code: 'nonPositiveTotal' }])
  })
})

describe('forfettario estimate', () => {
  const base = {
    collectedCents: 50_000_00,
    coefficient: 78,
    contributionsPaidCents: 5_000_00,
    startupRate: false,
    inpsScheme: 'gestione_separata' as const,
    inpsParams: DEFAULT_INPS_PARAMETERS,
    inpsReduction35: false,
  }

  it('taxable income = revenue × coefficient − contributions paid, taxed at 15%', () => {
    const e = estimateForfettario(base)
    expect(e.grossIncomeCents).toBe(39_000_00)
    expect(e.deductedContributionsCents).toBe(5_000_00)
    expect(e.taxableIncomeCents).toBe(34_000_00)
    expect(e.substituteTaxRate).toBe(15)
    expect(e.substituteTaxCents).toBe(5_100_00)
  })

  it('uses 5% in the start-up years', () => {
    const e = estimateForfettario({ ...base, startupRate: true })
    expect(e.substituteTaxRate).toBe(5)
    expect(e.substituteTaxCents).toBe(1_700_00)
  })

  it('never lets contributions push the taxable income below zero', () => {
    const e = estimateForfettario({ ...base, collectedCents: 5_000_00, contributionsPaidCents: 9_000_00 })
    expect(e.grossIncomeCents).toBe(3_900_00)
    expect(e.deductedContributionsCents).toBe(3_900_00)
    expect(e.taxableIncomeCents).toBe(0)
    expect(e.substituteTaxCents).toBe(0)
  })

  it('computes gestione separata on the income before the contribution deduction', () => {
    const e = estimateForfettario(base)
    expect(e.inps.baseCents).toBe(39_000_00)
    expect(e.inps.totalCents).toBe(10_167_30)
  })

  it('caps gestione separata at the massimale', () => {
    const inps = estimateInpsContributions('gestione_separata', 200_000_00, DEFAULT_INPS_PARAMETERS, false)
    expect(inps.totalCents).toBe(applyRate(120_607_00, 26.07))
    expect(inps.totalCents).toBe(31_442_24)
  })

  it('computes artigiani contributions with the fixed minimum and the 35% reduction', () => {
    const plain = estimateInpsContributions('artigiani', 30_000_00, DEFAULT_INPS_PARAMETERS, false)
    expect(plain.fixedCents).toBe(4_460_64)
    expect(plain.variableCents).toBe(2_746_80) // 24% × (30,000 − 18,555)
    expect(plain.totalCents).toBe(7_207_44)
    const reduced = estimateInpsContributions('artigiani', 30_000_00, DEFAULT_INPS_PARAMETERS, true)
    expect(reduced.reductionCents).toBe(2_522_60)
    expect(reduced.totalCents).toBe(4_684_84)
  })

  it('charges commercianti the fixed amount even below the minimale', () => {
    const inps = estimateInpsContributions('commercianti', 10_000_00, DEFAULT_INPS_PARAMETERS, false)
    expect(inps.variableCents).toBe(0)
    expect(inps.totalCents).toBe(4_549_70)
  })

  it('does not estimate professional pension funds', () => {
    expect(estimateInpsContributions('cassa_professionale', 50_000_00, DEFAULT_INPS_PARAMETERS, false).totalCents).toBe(0)
  })

  it('tracks the €85,000 ceiling and the €100,000 immediate exit', () => {
    expect(ceilingStatus(85_000_00)).toMatchObject({ percent: 100, exceeded: false, remainingCents: 0 })
    expect(ceilingStatus(85_000_01).exceeded).toBe(true)
    expect(ceilingStatus(100_000_00).immediateExit).toBe(false)
    expect(ceilingStatus(100_000_01).immediateExit).toBe(true)
    expect(ceilingStatus(42_500_00)).toMatchObject({ percent: 50, remainingCents: 42_500_00 })
  })

  it('limits the start-up rate to the first five years', () => {
    expect(startupRateApplies(true, 2022, 2026)).toBe(true)
    expect(startupRateApplies(true, 2022, 2027)).toBe(false)
    expect(startupRateApplies(true, 2027, 2026)).toBe(false)
    expect(startupRateApplies(false, 2026, 2026)).toBe(false)
  })
})

describe('coefficienti di redditività', () => {
  it.each([
    ['62.01.00', 'other', 67],
    ['74.10.21', 'professional', 78],
    ['69.20.11', 'professional', 78],
    ['47.81.01', 'street_food', 40],
    ['47.82.01', 'street_other', 54],
    ['46.18.99', 'agents', 62],
    ['46.90.00', 'retail', 40],
    ['47.91.10', 'retail', 40],
    ['43.21.01', 'construction', 86],
    ['56.10.11', 'hospitality', 40],
    ['10.71.10', 'food', 40],
    ['not-a-code', 'other', 67],
  ])('maps ATECO %s to %s (%i%%)', (code, group, coefficient) => {
    expect(suggestGroupForAteco(code)).toBe(group)
    expect(coefficientFor(group, 0)).toBe(coefficient)
  })

  it('supports a custom coefficient', () => {
    expect(coefficientFor('custom', 55)).toBe(55)
    expect(() => coefficientFor('custom', 0)).toThrow()
    expect(() => coefficientFor('missing', 0)).toThrow()
  })
})
