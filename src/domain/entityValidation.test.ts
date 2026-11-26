import { describe, expect, it } from 'vitest'
import { clientDisplayName, profileDisplayName, validateClient, validateProfile } from './entityValidation'
import { defaultProfile, emptyClient, addDaysIso, todayIso } from './factories'
import type { BusinessProfile, Client } from './types'

const italianCompany = (): Client => ({
  ...emptyClient(),
  denominazione: 'Acme Fittizia S.r.l.',
  partitaIva: '12345678903',
  address: { street: 'Via degli Esempi', civic: '1', cap: '20100', comune: 'Milano', provincia: 'MI', nazione: 'IT' },
})

const validProfile = (): BusinessProfile => ({
  ...defaultProfile(2026),
  nome: 'Giulia',
  cognome: 'Prova',
  partitaIva: '01234567897',
  codiceFiscale: 'PRVGLI85M41H501K',
  address: { street: 'Via Immaginaria', civic: '7', cap: '00100', comune: 'Roma', provincia: 'RM', nazione: 'IT' },
})

describe('client validation', () => {
  it('accepts a complete Italian company', () => {
    expect(validateClient(italianCompany())).toEqual({})
  })

  it('requires a valid partita IVA for Italian companies', () => {
    expect(validateClient({ ...italianCompany(), partitaIva: '' })).toEqual({ partitaIva: 'required' })
    expect(validateClient({ ...italianCompany(), partitaIva: '12345678904' })).toEqual({ partitaIva: 'checksum' })
  })

  it('requires the codice fiscale for private individuals and accepts no partita IVA', () => {
    const person: Client = { ...italianCompany(), isCompany: false, denominazione: '', partitaIva: '', nome: 'Luca', cognome: 'Test' }
    expect(validateClient(person)).toEqual({ codiceFiscale: 'required' })
    expect(validateClient({ ...person, codiceFiscale: 'TSTLCU78C62L219F' })).toEqual({})
    expect(validateClient({ ...person, codiceFiscale: '12345678903' })).toEqual({ codiceFiscale: 'length' })
  })

  it('validates the address for Italy', () => {
    const c = italianCompany()
    c.address = { ...c.address, cap: '201', provincia: 'Milano', street: ' ' }
    expect(validateClient(c)).toEqual({ 'address.cap': 'format', 'address.provincia': 'format', 'address.street': 'required' })
  })

  it('relaxes Italian-specific rules for foreign clients', () => {
    const foreign: Client = {
      ...italianCompany(),
      partitaIva: 'DE123456789',
      codiceDestinatario: 'XXXXXXX',
      address: { street: 'Beispielstraße', civic: '5', cap: '10115', comune: 'Berlin', provincia: '', nazione: 'DE' },
    }
    expect(validateClient(foreign)).toEqual({})
  })

  it('rejects the foreign placeholder code for Italian clients', () => {
    expect(validateClient({ ...italianCompany(), codiceDestinatario: 'XXXXXXX' })).toEqual({ codiceDestinatario: 'format' })
  })

  it('checks optional email and PEC only when filled in', () => {
    expect(validateClient({ ...italianCompany(), pec: 'not-a-pec' })).toEqual({ pec: 'format' })
  })

  it('builds display names', () => {
    expect(clientDisplayName(italianCompany())).toBe('Acme Fittizia S.r.l.')
    expect(clientDisplayName({ isCompany: false, denominazione: '', nome: 'Luca', cognome: 'Test' })).toBe('Luca Test')
  })
})

describe('profile validation', () => {
  it('accepts a complete sole trader profile', () => {
    expect(validateProfile(validProfile())).toEqual({})
  })

  it('requires the tax identifiers', () => {
    expect(validateProfile({ ...validProfile(), partitaIva: '', codiceFiscale: 'PRVGLI85M41H501A' })).toEqual({
      partitaIva: 'required',
      codiceFiscale: 'checksum',
    })
  })

  it('needs either a trading name or first and last name', () => {
    expect(validateProfile({ ...validProfile(), nome: '', cognome: '' })).toEqual({ denominazione: 'required' })
    expect(validateProfile({ ...validProfile(), cognome: '' })).toEqual({ cognome: 'required' })
  })

  it('validates the invoice defaults', () => {
    const p = validProfile()
    p.defaults = { ...p.defaults, numberFormat: 'FATTURA', paymentTermsDays: -1, ritenutaRate: 0 }
    expect(validateProfile(p)).toEqual({
      'defaults.numberFormat': 'format',
      'defaults.paymentTermsDays': 'format',
      'defaults.ritenutaRate': 'format',
    })
  })

  it('validates a custom coefficient and the IBAN', () => {
    expect(validateProfile({ ...validProfile(), coefficientGroup: 'custom', customCoefficient: 120, iban: 'IT00X' })).toEqual({
      customCoefficient: 'format',
      iban: 'format',
    })
  })

  it('prefers the trading name for display', () => {
    expect(profileDisplayName(validProfile())).toBe('Giulia Prova')
    expect(profileDisplayName({ ...validProfile(), denominazione: 'Studio Prova' })).toBe('Studio Prova')
  })
})

describe('date helpers', () => {
  it('uses the local calendar date and adds days across months', () => {
    expect(todayIso(new Date(2026, 0, 31, 23, 30))).toBe('2026-01-31')
    expect(addDaysIso('2026-01-31', 30)).toBe('2026-03-02')
    expect(addDaysIso('2026-12-15', 30)).toBe('2027-01-14')
  })
})
