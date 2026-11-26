import { defaultProfile, emptyClient } from '@/domain/factories'
import { issueInvoice, newInvoice } from '@/domain/invoices'
import type { BusinessProfile, Client, Invoice, InvoiceLine } from '@/domain/types'

/** Fictitious, check-digit-valid identities shared by the export tests. */
export const forfettarioProfile: BusinessProfile = {
  ...defaultProfile(2026),
  nome: 'Giulia',
  cognome: 'Prova',
  partitaIva: '01234567897',
  codiceFiscale: 'PRVGLI85M41H501K',
  email: 'giulia@esempio.example',
  iban: 'IT47X0999999999000000123456',
  bankName: 'Banca Immaginaria',
  address: { street: 'Via Immaginaria', civic: '7', cap: '00100', comune: 'Roma', provincia: 'RM', nazione: 'IT' },
  defaults: { ...defaultProfile(2026).defaults, applyRivalsaInps: true },
}

export const ordinarioProfile: BusinessProfile = {
  ...forfettarioProfile,
  regime: 'ordinario',
  defaults: { ...forfettarioProfile.defaults, applyRitenuta: true },
}

export const companyClient: Client = {
  ...emptyClient(),
  id: 'client-acme',
  denominazione: 'Acme Fittizia S.r.l.',
  partitaIva: '12345678903',
  codiceDestinatario: 'ABC1234',
  address: { street: 'Via degli Esempi', civic: '1', cap: '20100', comune: 'Milano', provincia: 'MI', nazione: 'IT' },
}

export const privateClient: Client = {
  ...emptyClient(),
  id: 'client-luca',
  isCompany: false,
  nome: 'Luca',
  cognome: 'Test',
  denominazione: 'Luca Test',
  codiceFiscale: 'TSTLCU78C62L219F',
  pec: 'luca.test@pec.esempio.example',
  address: { street: 'Corso Fittizio', civic: '12/B', cap: '10100', comune: 'Torino', provincia: 'TO', nazione: 'IT' },
}

export const foreignClient: Client = {
  ...emptyClient(),
  id: 'client-de',
  denominazione: 'Beispiel GmbH',
  partitaIva: 'DE999999999',
  codiceDestinatario: 'XXXXXXX',
  address: { street: 'Musterstraße', civic: '5', cap: '10115', comune: 'Berlin', provincia: '', nazione: 'DE' },
}

export function issuedInvoice(
  profile: BusinessProfile,
  client: Client,
  lines: Partial<InvoiceLine>[],
  options: Partial<Invoice> = {},
  date = '2026-03-10',
): Invoice {
  const draft = newInvoice(profile, client.id, date)
  draft.lines = lines.map((l, i) => ({ ...draft.lines[0]!, id: `line-${i}`, description: 'Consulenza', ...l }))
  Object.assign(draft, options)
  return issueInvoice(draft, [], profile, client)
}
