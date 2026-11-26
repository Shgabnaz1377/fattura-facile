import type { Address, BusinessProfile, Client } from './types'
import { DEFAULT_RITENUTA_RATE } from './tax/rules'
import { NO_SDI_CODE } from './entityValidation'

export function newId(): string {
  return crypto.randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** Local calendar date as yyyy-mm-dd (not UTC, so late-evening invoices keep the right day). */
export function todayIso(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
  return todayIso(new Date(y, m - 1, d + days))
}

export function emptyAddress(): Address {
  return { street: '', civic: '', cap: '', comune: '', provincia: '', nazione: 'IT' }
}

export function emptyClient(): Client {
  const now = nowIso()
  return {
    id: newId(),
    denominazione: '',
    nome: '',
    cognome: '',
    isCompany: true,
    partitaIva: '',
    codiceFiscale: '',
    address: emptyAddress(),
    email: '',
    pec: '',
    codiceDestinatario: NO_SDI_CODE,
    notes: '',
    createdAt: now,
    updatedAt: now,
  }
}

export function defaultProfile(currentYear = new Date().getFullYear()): BusinessProfile {
  return {
    denominazione: '',
    nome: '',
    cognome: '',
    partitaIva: '',
    codiceFiscale: '',
    address: emptyAddress(),
    email: '',
    pec: '',
    phone: '',
    iban: '',
    bankName: '',
    regime: 'forfettario',
    atecoCode: '',
    coefficientGroup: 'professional',
    customCoefficient: 78,
    startupRate: false,
    activityStartYear: currentYear,
    inpsScheme: 'gestione_separata',
    inpsReduction35: false,
    defaults: {
      applyRivalsaInps: false,
      applyRitenuta: false,
      ritenutaRate: DEFAULT_RITENUTA_RATE,
      paymentTermsDays: 30,
      numberFormat: '{n}/{yyyy}',
    },
  }
}
