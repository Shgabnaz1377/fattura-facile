import { addDaysIso, defaultProfile, emptyClient, todayIso } from './factories'
import { issueInvoice, newInvoice } from './invoices'
import type { BusinessProfile, Client, Invoice, InvoiceLine } from './types'

/**
 * Demo dataset: an obviously fictitious freelancer with fictitious clients. Every identifier is
 * check-digit valid (so the validators accept it) but invented: "Prova", "Esempio", "Fittizia".
 */
export interface DemoData {
  profile: BusinessProfile
  clients: Client[]
  invoices: Invoice[]
  contributionsPaidCents: number
}

const ADDRESS_ROMA = { street: 'Via Immaginaria', civic: '7', cap: '00100', comune: 'Roma', provincia: 'RM', nazione: 'IT' }

export function demoProfile(year: number): BusinessProfile {
  const base = defaultProfile(year)
  return {
    ...base,
    denominazione: '',
    nome: 'Giulia',
    cognome: 'Prova',
    partitaIva: '01234567897',
    codiceFiscale: 'PRVGLI85M41H501K',
    address: ADDRESS_ROMA,
    email: 'giulia.prova@esempio.example',
    pec: 'giulia.prova@pec.esempio.example',
    phone: '0600000000',
    iban: 'IT47X0999999999000000123456',
    bankName: 'Banca Immaginaria',
    regime: 'forfettario',
    atecoCode: '62.01.00',
    coefficientGroup: 'other',
    startupRate: true,
    activityStartYear: year - 2,
    inpsScheme: 'gestione_separata',
    defaults: { ...base.defaults, applyRivalsaInps: true, paymentTermsDays: 30 },
  }
}

function demoClients(): Client[] {
  const c = (id: string, data: Partial<Client>): Client => ({ ...emptyClient(), id, ...data })
  return [
    c('demo-acme', {
      denominazione: 'Acme Fittizia S.r.l.',
      partitaIva: '12345678903',
      codiceDestinatario: 'ABC1234',
      email: 'amministrazione@acme.esempio.example',
      address: { street: 'Via degli Esempi', civic: '1', cap: '20100', comune: 'Milano', provincia: 'MI', nazione: 'IT' },
    }),
    c('demo-studio', {
      denominazione: 'Studio Esempio Associato',
      partitaIva: '09876543217',
      codiceDestinatario: 'XYZ9876',
      address: { street: 'Piazza Modello', civic: '3', cap: '40100', comune: 'Bologna', provincia: 'BO', nazione: 'IT' },
    }),
    c('demo-luca', {
      isCompany: false,
      nome: 'Luca',
      cognome: 'Test',
      denominazione: 'Luca Test',
      codiceFiscale: 'TSTLCU78C62L219F',
      pec: 'luca.test@pec.esempio.example',
      address: { street: 'Corso Fittizio', civic: '12', cap: '10100', comune: 'Torino', provincia: 'TO', nazione: 'IT' },
    }),
    c('demo-beispiel', {
      denominazione: 'Beispiel GmbH',
      partitaIva: 'DE999999999',
      codiceDestinatario: 'XXXXXXX',
      address: { street: 'Musterstraße', civic: '5', cap: '10115', comune: 'Berlin', provincia: '', nazione: 'DE' },
    }),
  ]
}

interface Plan {
  month: number
  day: number
  client: string
  lines: Array<Pick<InvoiceLine, 'description' | 'quantity' | 'unit' | 'unitPriceCents'>>
  /** Days after the invoice date when it was paid; null = still unpaid. */
  paidAfter: number | null
}

const PLANS: Plan[] = [
  { month: 1, day: 15, client: 'demo-acme', lines: [{ description: 'Sviluppo modulo prenotazioni - gennaio', quantity: 12, unit: 'gg', unitPriceCents: 320_00 }], paidAfter: 28 },
  { month: 2, day: 10, client: 'demo-studio', lines: [{ description: 'Restyling sito web dello studio', quantity: 1, unit: '', unitPriceCents: 2_400_00 }], paidAfter: 20 },
  { month: 3, day: 5, client: 'demo-luca', lines: [{ description: 'Configurazione rete domestica e backup', quantity: 3, unit: 'ore', unitPriceCents: 45_00 }], paidAfter: 2 },
  { month: 3, day: 31, client: 'demo-acme', lines: [{ description: 'Sviluppo modulo prenotazioni - marzo', quantity: 15, unit: 'gg', unitPriceCents: 320_00 }], paidAfter: 30 },
  { month: 5, day: 12, client: 'demo-beispiel', lines: [{ description: 'Integrazione API pagamenti', quantity: 8, unit: 'gg', unitPriceCents: 380_00 }], paidAfter: 45 },
  {
    month: 6,
    day: 20,
    client: 'demo-studio',
    lines: [
      { description: 'Manutenzione sito - primo semestre', quantity: 6, unit: 'mesi', unitPriceCents: 150_00 },
      { description: 'Corso interno di formazione', quantity: 4, unit: 'ore', unitPriceCents: 90_00 },
    ],
    paidAfter: 15,
  },
  { month: 8, day: 1, client: 'demo-acme', lines: [{ description: 'Analisi requisiti nuova app mobile', quantity: 10, unit: 'gg', unitPriceCents: 340_00 }], paidAfter: 60 },
  { month: 9, day: 18, client: 'demo-luca', lines: [{ description: 'Assistenza tecnica', quantity: 2, unit: 'ore', unitPriceCents: 45_00 }], paidAfter: 10 },
  { month: 10, day: 6, client: 'demo-acme', lines: [{ description: 'Sviluppo app mobile - sprint 1 e 2', quantity: 18, unit: 'gg', unitPriceCents: 340_00 }], paidAfter: null },
  { month: 11, day: 3, client: 'demo-beispiel', lines: [{ description: 'Supporto evolutivo integrazione', quantity: 5, unit: 'gg', unitPriceCents: 380_00 }], paidAfter: null },
]

/**
 * Builds the dataset for the year of `today`, keeping only invoices dated up to today and
 * payments that already happened. A draft is added to show the editor state.
 */
export function buildDemoData(today = todayIso()): DemoData {
  const year = Number(today.slice(0, 4))
  const profile = demoProfile(year)
  const clients = demoClients()
  const invoices: Invoice[] = []
  for (const plan of PLANS) {
    const date = `${year}-${String(plan.month).padStart(2, '0')}-${String(plan.day).padStart(2, '0')}`
    if (date > today) continue
    const draft = newInvoice(profile, plan.client, date)
    draft.id = `demo-invoice-${plan.month}-${plan.day}`
    draft.lines = plan.lines.map((l, i) => ({ ...draft.lines[0]!, ...l, id: `${draft.id}-line-${i}` }))
    const client = clients.find((c) => c.id === plan.client) as Client
    let inv = issueInvoice(draft, invoices, profile, client)
    const paidDate = plan.paidAfter === null ? null : addDaysIso(date, plan.paidAfter)
    if (paidDate && paidDate <= today) inv = { ...inv, status: 'paid', paidDate }
    invoices.push(inv)
  }
  const draft = newInvoice(profile, 'demo-studio', today)
  draft.id = 'demo-invoice-draft'
  draft.lines = [{ ...draft.lines[0]!, id: 'demo-invoice-draft-line-0', description: 'Manutenzione sito - secondo semestre', quantity: 6, unit: 'mesi', unitPriceCents: 150_00 }]
  invoices.push(draft)
  return { profile, clients, invoices, contributionsPaidCents: 3_200_00 }
}
