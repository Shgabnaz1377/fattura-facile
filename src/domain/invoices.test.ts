import { describe, expect, it } from 'vitest'
import { defaultProfile, emptyClient } from './factories'
import {
  displayStatus,
  duplicateInvoice,
  invoiceLabel,
  invoiceTotals,
  issueBlockers,
  issueInvoice,
  newInvoice,
} from './invoices'
import type { BusinessProfile, Client, Invoice } from './types'

const forfettarioProfile: BusinessProfile = {
  ...defaultProfile(2026),
  nome: 'Giulia',
  cognome: 'Prova',
  partitaIva: '01234567897',
  codiceFiscale: 'PRVGLI85M41H501K',
  defaults: { ...defaultProfile(2026).defaults, applyRivalsaInps: true, paymentTermsDays: 30 },
}
const ordinarioProfile: BusinessProfile = {
  ...forfettarioProfile,
  regime: 'ordinario',
  defaults: { ...forfettarioProfile.defaults, applyRitenuta: true },
}
const client: Client = { ...emptyClient(), id: 'client-1', denominazione: 'Acme Fittizia S.r.l.' }

function draft(profile: BusinessProfile, date = '2026-03-10'): Invoice {
  const inv = newInvoice(profile, client.id, date)
  inv.lines[0] = { ...inv.lines[0]!, description: 'Sviluppo software', quantity: 10, unitPriceCents: 50_00 }
  return inv
}

describe('new invoices', () => {
  it('apply the profile defaults for a forfettario', () => {
    const inv = newInvoice(forfettarioProfile, client.id, '2026-03-10')
    expect(inv).toMatchObject({
      number: null,
      year: 2026,
      status: 'draft',
      dueDate: '2026-04-09',
      regime: 'forfettario',
      applyRivalsaInps: true,
      applyRitenuta: false,
      bolloMode: 'auto',
    })
    expect(inv.lines[0]).toMatchObject({ vatRate: 0, natura: 'N2.2', ritenuta: false })
  })

  it('apply IVA 22% and ritenuta for a professional in regime ordinario', () => {
    const inv = newInvoice(ordinarioProfile, client.id, '2026-03-10')
    expect(inv.applyRitenuta).toBe(true)
    expect(inv.lines[0]).toMatchObject({ vatRate: 22, natura: null, ritenuta: true })
  })

  it('do not apply rivalsa INPS outside gestione separata', () => {
    const inv = newInvoice({ ...forfettarioProfile, inpsScheme: 'artigiani' }, client.id)
    expect(inv.applyRivalsaInps).toBe(false)
  })
})

describe('issuing', () => {
  it('assigns the next number of the year and freezes issuer and client', () => {
    const earlier: Invoice = { ...draft(forfettarioProfile, '2026-01-05'), id: 'old', number: 1, status: 'paid' }
    const issued = issueInvoice(draft(forfettarioProfile), [earlier], forfettarioProfile, client)
    expect(issued.number).toBe(2)
    expect(issued.status).toBe('issued')
    expect(issued.snapshot?.client.denominazione).toBe('Acme Fittizia S.r.l.')
    expect(issued.snapshot?.profile.partitaIva).toBe('01234567897')
    expect(invoiceLabel(issued, forfettarioProfile)).toBe('2/2026')
  })

  it('reports everything that blocks issuing', () => {
    const inv = draft(ordinarioProfile)
    inv.dueDate = '2026-03-01'
    inv.lines[0]!.description = ''
    const previous: Invoice = { ...draft(ordinarioProfile, '2026-04-01'), id: 'p', number: 1, status: 'issued' }
    expect(issueBlockers(inv, 2, [previous], false, undefined).map((b) => b.code)).toEqual([
      'profileIncomplete',
      'missingClient',
      'dueBeforeDate',
      'emptyDescription',
      'dateBeforePrevious',
    ])
  })

  it('has no blockers for a complete draft', () => {
    expect(issueBlockers(draft(forfettarioProfile), 1, [], true, client)).toEqual([])
  })
})

describe('invoice helpers', () => {
  it('computes totals with the invoice options', () => {
    const t = invoiceTotals(draft(forfettarioProfile))
    // 10 × 50 = 500, rivalsa 4% = 20, bollo 2 charged to the client.
    expect(t.totalCents).toBe(522_00)
  })

  it('derives overdue from the due date', () => {
    const inv = { status: 'issued' as const, dueDate: '2026-03-31' }
    expect(displayStatus(inv, '2026-03-31')).toBe('issued')
    expect(displayStatus(inv, '2026-04-01')).toBe('overdue')
    expect(displayStatus({ ...inv, status: 'paid' }, '2027-01-01')).toBe('paid')
  })

  it('duplicates lines into a fresh draft', () => {
    const source: Invoice = { ...draft(forfettarioProfile), number: 3, status: 'paid', paidDate: '2026-04-01' }
    const copy = duplicateInvoice(source, forfettarioProfile, '2026-05-02')
    expect(copy).toMatchObject({ number: null, status: 'draft', paidDate: null, date: '2026-05-02', clientId: client.id })
    expect(copy.id).not.toBe(source.id)
    expect(copy.lines[0]?.id).not.toBe(source.lines[0]?.id)
    expect(copy.lines[0]?.description).toBe('Sviluppo software')
  })
})
