import { describe, expect, it } from 'vitest'
import {
  codiceFiscaleCheckChar,
  decodeOmocodia,
  parseCodiceFiscale,
  partitaIvaCheckDigit,
  validateCap,
  validateCodiceDestinatario,
  validateCodiceFiscale,
  validateEmail,
  validateIban,
  validatePartitaIva,
  validatePersonCodiceFiscale,
  validateProvincia,
} from '.'

// Every identifier below is fictitious. They were generated with an independent reference
// implementation of the official algorithms, so they are check-digit valid but belong to nobody.

describe('partita IVA', () => {
  it.each(['01234567897', '12345678903', '09876543217', '02468135799', '08888000018'])(
    'accepts the valid number %s',
    (piva) => {
      expect(validatePartitaIva(piva)).toEqual({ valid: true, normalized: piva })
    },
  )

  it('computes the check digit, including the doubled digits above 9', () => {
    expect(partitaIvaCheckDigit('1234567890')).toBe(3)
    expect(partitaIvaCheckDigit('0555555555')).toBe(5)
    expect(partitaIvaCheckDigit('0888800001')).toBe(8)
  })

  it('normalises spaces and an IT prefix', () => {
    expect(validatePartitaIva(' it 123 456 789 03 ')).toEqual({ valid: true, normalized: '12345678903' })
  })

  it.each([
    ['', 'empty'],
    ['1234567890', 'length'],
    ['123456789012', 'length'],
    ['1234567890A', 'format'],
    ['00000000000', 'zeros'],
    ['12345678904', 'checksum'],
    ['21345678903', 'checksum'],
  ])('rejects %j with %s', (piva, error) => {
    expect(validatePartitaIva(piva)).toEqual({ valid: false, error })
  })

  it('detects every single-digit substitution of a valid number', () => {
    const valid = '09876543217'
    for (let pos = 0; pos < 11; pos++) {
      for (let d = 0; d <= 9; d++) {
        const ch = String(d)
        if (ch === valid[pos]) continue
        const mutated = valid.slice(0, pos) + ch + valid.slice(pos + 1)
        expect(validatePartitaIva(mutated).valid, mutated).toBe(false)
      }
    }
  })
})

describe('codice fiscale', () => {
  it.each(['PRVGLI85M41H501K', 'SMPMRC90A15F205E', 'TSTLCU78C62L219F', 'DMOFNC92T05A662D'])(
    'accepts the valid code %s',
    (cf) => {
      expect(validateCodiceFiscale(cf)).toEqual({ valid: true, normalized: cf })
    },
  )

  it('computes the control character', () => {
    expect(codiceFiscaleCheckChar('PRVGLI85M41H501')).toBe('K')
    expect(codiceFiscaleCheckChar('smpmrc90a15f205')).toBe('E')
  })

  it('accepts lowercase input and spaces', () => {
    expect(validateCodiceFiscale('prv gli 85m41 h501k')).toEqual({ valid: true, normalized: 'PRVGLI85M41H501K' })
  })

  it('accepts omocode variants and decodes them', () => {
    expect(validateCodiceFiscale('SMPMRC90A15F20RZ').valid).toBe(true)
    expect(validateCodiceFiscale('SMPMRC90A15F2LRK').valid).toBe(true)
    expect(decodeOmocodia('SMPMRC90A15F2LRK')).toBe('SMPMRC90A15F205K')
  })

  it('extracts birth data', () => {
    expect(parseCodiceFiscale('PRVGLI85M41H501K')).toEqual({
      yearOfBirth: 85,
      monthOfBirth: 8,
      dayOfBirth: 1,
      sex: 'F',
      placeCode: 'H501',
      omocode: false,
    })
    expect(parseCodiceFiscale('SMPMRC90A15F20RZ')?.omocode).toBe(true)
  })

  it.each([
    ['', 'empty'],
    ['PRVGLI85M41H501', 'length'],
    ['PRVGLI85M41H501KK', 'length'],
    ['PRVGLI85M41H50!K', 'format'],
    ['1RVGLI85M41H501K', 'format'],
    ['PRVGLI85F41H501K', 'month'],
    ['PRVGLI85M35H501K', 'day'],
    ['PRVGLI85B70H501K', 'day'],
    ['PRVGLI85M00H501K', 'day'],
    ['PRVGLI85M41H501A', 'checksum'],
    ['SMPMRC90A15F205F', 'checksum'],
  ])('rejects %j with %s', (cf, error) => {
    expect(validateCodiceFiscale(cf)).toEqual({ valid: false, error })
  })

  it('validates the 11-digit numeric code used by companies with the partita IVA algorithm', () => {
    expect(validateCodiceFiscale('12345678903').valid).toBe(true)
    expect(validateCodiceFiscale('12345678904')).toEqual({ valid: false, error: 'checksum' })
  })

  it('does not accept a numeric company code where a personal code is required', () => {
    expect(validatePersonCodiceFiscale('12345678903').valid).toBe(false)
  })
})

describe('other identifiers', () => {
  it('validates IBANs with mod 97', () => {
    expect(validateIban('IT47 X099 9999 9990 0000 0123 456')).toEqual({
      valid: true,
      normalized: 'IT47X0999999999000000123456',
    })
    expect(validateIban('IT05Z0888888888000000654321').valid).toBe(true)
    expect(validateIban('IT48X0999999999000000123456')).toEqual({ valid: false, error: 'checksum' })
    expect(validateIban('IT47X099999999900000012345')).toEqual({ valid: false, error: 'length' })
    expect(validateIban('hello')).toEqual({ valid: false, error: 'format' })
  })

  it('validates SDI codice destinatario', () => {
    expect(validateCodiceDestinatario('0000000').valid).toBe(true)
    expect(validateCodiceDestinatario('abc1234')).toEqual({ valid: true, normalized: 'ABC1234' })
    expect(validateCodiceDestinatario('ABC12')).toEqual({ valid: false, error: 'length' })
    expect(validateCodiceDestinatario('ABC_123')).toEqual({ valid: false, error: 'format' })
  })

  it('validates CAP, provincia and email', () => {
    expect(validateCap('00100').valid).toBe(true)
    expect(validateCap('0010').valid).toBe(false)
    expect(validateProvincia('mi')).toEqual({ valid: true, normalized: 'MI' })
    expect(validateProvincia('Milano').valid).toBe(false)
    expect(validateEmail('Info@Esempio.example')).toEqual({ valid: true, normalized: 'info@esempio.example' })
    expect(validateEmail('not-an-email').valid).toBe(false)
  })
})
