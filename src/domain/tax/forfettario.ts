import { applyRate, type Cents } from '../money'
import type { InpsScheme } from '../types'
import {
  FORFETTARIO_CEILING_CENTS,
  FORFETTARIO_IMMEDIATE_EXIT_CENTS,
  STARTUP_YEARS,
  SUBSTITUTE_TAX_RATE,
  SUBSTITUTE_TAX_STARTUP_RATE,
  type InpsParameters,
} from './rules'

/**
 * Whether the 5% start-up rate applies in a given tax year: the year the activity started
 * and the following four, provided the user declared the legal conditions are met.
 */
export function startupRateApplies(declaredEligible: boolean, activityStartYear: number, taxYear: number): boolean {
  return declaredEligible && taxYear >= activityStartYear && taxYear - activityStartYear < STARTUP_YEARS
}

export interface InpsEstimate {
  scheme: InpsScheme
  /** Income the contributions are computed on (reddito forfettario, before deducting contributions). */
  baseCents: Cents
  /** Fixed contributions on the minimale (artigiani/commercianti only). */
  fixedCents: Cents
  /** Percentage contributions above the minimale, or the whole gestione separata amount. */
  variableCents: Cents
  /** Reduction applied (35% option for artigiani/commercianti forfettari). */
  reductionCents: Cents
  totalCents: Cents
  rate: number
}

export function estimateInpsContributions(
  scheme: InpsScheme,
  incomeCents: Cents,
  params: InpsParameters,
  applyReduction: boolean,
): InpsEstimate {
  const base = Math.max(0, incomeCents)
  if (scheme === 'gestione_separata') {
    const capped = Math.min(base, params.gestioneSeparataMassimaleCents)
    const variable = applyRate(capped, params.gestioneSeparataRate)
    return {
      scheme,
      baseCents: base,
      fixedCents: 0,
      variableCents: variable,
      reductionCents: 0,
      totalCents: variable,
      rate: params.gestioneSeparataRate,
    }
  }
  if (scheme === 'artigiani' || scheme === 'commercianti') {
    const rate = scheme === 'artigiani' ? params.artigianiRate : params.commerciantiRate
    const fixed = scheme === 'artigiani' ? params.artigianiFixedCents : params.commerciantiFixedCents
    // Fixed contributions are due on the minimale even when income is lower.
    const aboveMinimale = Math.max(0, Math.min(base, params.ivsMassimaleCents) - params.minimaleCents)
    const variable = applyRate(aboveMinimale, rate)
    const gross = fixed + variable
    const reduction = applyReduction ? applyRate(gross, params.forfettarioReductionPct) : 0
    return {
      scheme,
      baseCents: base,
      fixedCents: fixed,
      variableCents: variable,
      reductionCents: reduction,
      totalCents: gross - reduction,
      rate,
    }
  }
  // Professional pension funds (casse) have their own rules: not estimated.
  return { scheme, baseCents: base, fixedCents: 0, variableCents: 0, reductionCents: 0, totalCents: 0, rate: 0 }
}

export interface ForfettarioInput {
  /** Fees actually collected in the year (cash basis, principio di cassa). */
  collectedCents: Cents
  coefficient: number
  /** Social security contributions paid in the year, deductible from the taxable income. */
  contributionsPaidCents: Cents
  startupRate: boolean
  inpsScheme: InpsScheme
  inpsParams: InpsParameters
  inpsReduction35: boolean
}

export interface ForfettarioEstimate {
  /** Reddito forfettario: collected fees × coefficiente di redditività. */
  grossIncomeCents: Cents
  deductedContributionsCents: Cents
  taxableIncomeCents: Cents
  substituteTaxRate: number
  substituteTaxCents: Cents
  inps: InpsEstimate
  ceiling: CeilingStatus
}

export interface CeilingStatus {
  limitCents: Cents
  usedCents: Cents
  remainingCents: Cents
  /** 0-100+, one decimal. */
  percent: number
  exceeded: boolean
  /** Above €100,000 the regime ends in the same year. */
  immediateExit: boolean
}

export function ceilingStatus(collectedCents: Cents): CeilingStatus {
  return {
    limitCents: FORFETTARIO_CEILING_CENTS,
    usedCents: collectedCents,
    remainingCents: Math.max(0, FORFETTARIO_CEILING_CENTS - collectedCents),
    percent: Math.round((collectedCents / FORFETTARIO_CEILING_CENTS) * 1000) / 10,
    exceeded: collectedCents > FORFETTARIO_CEILING_CENTS,
    immediateExit: collectedCents > FORFETTARIO_IMMEDIATE_EXIT_CENTS,
  }
}

/**
 * Estimate of the regime forfettario taxes for one year:
 *   reddito = compensi incassati × coefficiente
 *   imponibile = reddito − contributi previdenziali versati nell'anno (never below zero)
 *   imposta sostitutiva = imponibile × 15% (or 5% in the start-up years)
 * INPS contributions are computed on the reddito before the contribution deduction.
 */
export function estimateForfettario(input: ForfettarioInput): ForfettarioEstimate {
  const grossIncome = applyRate(Math.max(0, input.collectedCents), input.coefficient)
  const deducted = Math.min(Math.max(0, input.contributionsPaidCents), grossIncome)
  const taxable = grossIncome - deducted
  const rate = input.startupRate ? SUBSTITUTE_TAX_STARTUP_RATE : SUBSTITUTE_TAX_RATE
  return {
    grossIncomeCents: grossIncome,
    deductedContributionsCents: deducted,
    taxableIncomeCents: taxable,
    substituteTaxRate: rate,
    substituteTaxCents: applyRate(taxable, rate),
    inps: estimateInpsContributions(input.inpsScheme, grossIncome, input.inpsParams, input.inpsReduction35),
    ceiling: ceilingStatus(input.collectedCents),
  }
}
