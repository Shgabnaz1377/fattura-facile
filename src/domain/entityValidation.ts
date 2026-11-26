import type { Address, BusinessProfile, Client } from './types'
import {
  validateCap,
  validateCodiceDestinatario,
  validateCodiceFiscale,
  validateEmail,
  validateIban,
  validatePartitaIva,
  validatePersonCodiceFiscale,
  validateProvincia,
  type ValidationError,
  type ValidationResult,
} from './validators'
import { isValidNumberFormat } from './numbering'

/** Field path → error code. An empty object means the entity is valid. */
export type FieldErrors = Record<string, ValidationError | 'required'>

/** Recipient code used for clients without SDI channel (they receive the invoice via PEC or their tax drawer). */
export const NO_SDI_CODE = '0000000'
/** Recipient code for clients without an Italian tax identity. */
export const FOREIGN_SDI_CODE = 'XXXXXXX'

function check(errors: FieldErrors, field: string, result: ValidationResult, required: boolean): void {
  if (!result.valid) {
    if (result.error === 'empty') {
      if (required) errors[field] = 'required'
    } else {
      errors[field] = result.error
    }
  }
}

function requireText(errors: FieldErrors, field: string, value: string): void {
  if (value.trim() === '') errors[field] = 'required'
}

function checkAddress(errors: FieldErrors, address: Address, prefix = 'address'): void {
  requireText(errors, `${prefix}.street`, address.street)
  requireText(errors, `${prefix}.comune`, address.comune)
  if (!/^[A-Z]{2}$/.test(address.nazione.trim().toUpperCase())) errors[`${prefix}.nazione`] = 'format'
  if (address.nazione.toUpperCase() === 'IT') {
    check(errors, `${prefix}.cap`, validateCap(address.cap), true)
    check(errors, `${prefix}.provincia`, validateProvincia(address.provincia), true)
  } else {
    requireText(errors, `${prefix}.cap`, address.cap)
  }
}

export function isItalian(entity: { address: Address }): boolean {
  return entity.address.nazione.trim().toUpperCase() === 'IT'
}

export function clientDisplayName(client: Pick<Client, 'isCompany' | 'denominazione' | 'nome' | 'cognome'>): string {
  if (client.isCompany) return client.denominazione.trim()
  return `${client.nome.trim()} ${client.cognome.trim()}`.trim() || client.denominazione.trim()
}

export function validateClient(client: Client): FieldErrors {
  const errors: FieldErrors = {}
  if (client.isCompany) {
    requireText(errors, 'denominazione', client.denominazione)
  } else {
    requireText(errors, 'nome', client.nome)
    requireText(errors, 'cognome', client.cognome)
  }
  checkAddress(errors, client.address)

  if (isItalian(client)) {
    // Companies are identified by partita IVA; private individuals by their codice fiscale.
    check(errors, 'partitaIva', validatePartitaIva(client.partitaIva), client.isCompany)
    const cfResult = client.isCompany
      ? validateCodiceFiscale(client.codiceFiscale)
      : validatePersonCodiceFiscale(client.codiceFiscale)
    check(errors, 'codiceFiscale', cfResult, !client.isCompany)
    check(errors, 'codiceDestinatario', validateCodiceDestinatario(client.codiceDestinatario), false)
    if (client.codiceDestinatario.trim().toUpperCase() === FOREIGN_SDI_CODE) errors.codiceDestinatario = 'format'
  } else if (client.isCompany && client.partitaIva.trim() === '') {
    // Foreign businesses: their VAT number goes in IdFiscaleIVA, format is country specific.
    errors.partitaIva = 'required'
  }
  check(errors, 'email', validateEmail(client.email), false)
  check(errors, 'pec', validateEmail(client.pec), false)
  return errors
}

export function validateProfile(profile: BusinessProfile): FieldErrors {
  const errors: FieldErrors = {}
  const hasPersonName = profile.nome.trim() !== '' || profile.cognome.trim() !== ''
  if (hasPersonName) {
    requireText(errors, 'nome', profile.nome)
    requireText(errors, 'cognome', profile.cognome)
  } else {
    requireText(errors, 'denominazione', profile.denominazione)
  }
  check(errors, 'partitaIva', validatePartitaIva(profile.partitaIva), true)
  check(errors, 'codiceFiscale', validateCodiceFiscale(profile.codiceFiscale), true)
  checkAddress(errors, profile.address)
  if (profile.address.nazione.toUpperCase() !== 'IT') errors['address.nazione'] = 'format'
  check(errors, 'email', validateEmail(profile.email), false)
  check(errors, 'pec', validateEmail(profile.pec), false)
  check(errors, 'iban', validateIban(profile.iban), false)
  if (profile.regime === 'forfettario') {
    if (profile.coefficientGroup === 'custom' && !(profile.customCoefficient > 0 && profile.customCoefficient <= 100)) {
      errors.customCoefficient = 'format'
    }
    if (!(profile.activityStartYear >= 1970 && profile.activityStartYear <= 2100)) errors.activityStartYear = 'format'
  }
  const d = profile.defaults
  if (!(d.ritenutaRate > 0 && d.ritenutaRate <= 100)) errors['defaults.ritenutaRate'] = 'format'
  if (!(Number.isInteger(d.paymentTermsDays) && d.paymentTermsDays >= 0 && d.paymentTermsDays <= 365)) {
    errors['defaults.paymentTermsDays'] = 'format'
  }
  if (!isValidNumberFormat(d.numberFormat)) errors['defaults.numberFormat'] = 'format'
  return errors
}

/** Name shown as cedente on documents: "Nome Cognome" for sole traders, otherwise the trading name. */
export function profileDisplayName(profile: Pick<BusinessProfile, 'denominazione' | 'nome' | 'cognome'>): string {
  const person = `${profile.nome.trim()} ${profile.cognome.trim()}`.trim()
  return profile.denominazione.trim() || person
}
