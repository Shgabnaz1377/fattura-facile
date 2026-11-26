import type { Cents } from './money'

export type TaxRegime = 'forfettario' | 'ordinario'

/** Pension scheme the freelancer pays INPS contributions to. */
export type InpsScheme = 'gestione_separata' | 'artigiani' | 'commercianti' | 'cassa_professionale'

export const VAT_RATES = [22, 10, 5, 4, 0] as const
export type VatRate = (typeof VAT_RATES)[number]

/**
 * Natura codes for operations without IVA, as defined by the FatturaPA technical
 * specifications (version 1.6+, mandatory since 2021: the generic N2, N3 and N6 were split).
 */
export const NATURE = [
  'N1',
  'N2.1',
  'N2.2',
  'N3.1',
  'N3.2',
  'N3.3',
  'N3.4',
  'N3.5',
  'N3.6',
  'N4',
  'N5',
  'N6.1',
  'N6.2',
  'N6.3',
  'N6.4',
  'N6.5',
  'N6.6',
  'N6.7',
  'N6.8',
  'N6.9',
  'N7',
] as const
export type Natura = (typeof NATURE)[number]

export interface Address {
  street: string
  civic: string
  cap: string
  comune: string
  provincia: string
  /** ISO 3166-1 alpha-2 country code. */
  nazione: string
}

export interface BusinessProfile {
  /** Trading name or full name as it should appear on invoices. */
  denominazione: string
  /** For sole traders FatturaPA prefers first and last name; used when both are filled. */
  nome: string
  cognome: string
  partitaIva: string
  codiceFiscale: string
  address: Address
  email: string
  pec: string
  phone: string
  iban: string
  bankName: string
  regime: TaxRegime
  atecoCode: string
  /** Id of the coefficient group (see coefficients.ts), or 'custom'. */
  coefficientGroup: string
  /** Used when coefficientGroup is 'custom'. Percentage, e.g. 78. */
  customCoefficient: number
  /** Eligible for the 5% start-up rate (first five years, if the legal conditions are met). */
  startupRate: boolean
  /** Year the activity started; the 5% rate applies to that year and the next four. */
  activityStartYear: number
  inpsScheme: InpsScheme
  /** Applies the 35% contribution reduction available to forfettari in artigiani/commercianti. */
  inpsReduction35: boolean
  defaults: InvoiceDefaults
}

export interface InvoiceDefaults {
  applyRivalsaInps: boolean
  applyRitenuta: boolean
  ritenutaRate: number
  paymentTermsDays: number
  numberFormat: string
}

export interface Client {
  id: string
  /** Company name, or the person's full name for private individuals. */
  denominazione: string
  nome: string
  cognome: string
  isCompany: boolean
  partitaIva: string
  codiceFiscale: string
  address: Address
  email: string
  pec: string
  codiceDestinatario: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface InvoiceLine {
  id: string
  description: string
  quantity: number
  unit: string
  unitPriceCents: Cents
  vatRate: VatRate
  /** Required when vatRate is 0, forbidden otherwise. */
  natura: Natura | null
  /** Whether the line is subject to ritenuta d'acconto (professional fees usually are). */
  ritenuta: boolean
}

export type BolloMode = 'auto' | 'yes' | 'no'
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'cancelled'

export interface InvoiceTaxOptions {
  regime: TaxRegime
  applyRivalsaInps: boolean
  rivalsaRate: number
  applyRitenuta: boolean
  ritenutaRate: number
  bolloMode: BolloMode
  /** Adds the €2 stamp duty to the amount the client pays. */
  bolloChargedToClient: boolean
}

export interface Invoice extends InvoiceTaxOptions {
  id: string
  /** Null while the invoice is a draft: numbers are assigned when it is issued. */
  number: number | null
  year: number
  /** ISO date (yyyy-mm-dd). */
  date: string
  dueDate: string
  clientId: string
  lines: InvoiceLine[]
  notes: string
  status: InvoiceStatus
  paidDate: string | null
  createdAt: string
  updatedAt: string
}
