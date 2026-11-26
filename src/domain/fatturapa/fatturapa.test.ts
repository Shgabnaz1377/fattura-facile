import { describe, expect, it } from 'vitest'
import { companyClient, foreignClient, forfettarioProfile, issuedInvoice, ordinarioProfile, privateClient } from '@/test/fixtures'
import { newInvoice } from '../invoices'
import { buildFatturaPA, causaleChunks, FATTURAPA_NAMESPACE, FatturaPAError, progressivo, toLatin1 } from './fatturapa'

function parse(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)
  return doc
}

const all = (root: Document | Element, tag: string) => Array.from(root.getElementsByTagName(tag))
const text = (root: Document | Element, tag: string) => root.getElementsByTagName(tag)[0]?.textContent ?? null
const childNames = (e: Element) => Array.from(e.children).map((c) => c.tagName)

/** The SDI consistency checks on amounts (rules 00422, 00419, 00421 of the specifications). */
function assertAmountsConsistent(doc: Document): void {
  const toCents = (v: string | null) => Math.round(Number(v) * 100)
  const groups = new Map<string, number>()
  const key = (e: Element) => `${text(e, 'AliquotaIVA')}|${text(e, 'Natura') ?? ''}`
  for (const line of all(doc, 'DettaglioLinee')) {
    groups.set(key(line), (groups.get(key(line)) ?? 0) + toCents(text(line, 'PrezzoTotale')))
  }
  for (const cassa of all(doc, 'DatiCassaPrevidenziale')) {
    groups.set(key(cassa), (groups.get(key(cassa)) ?? 0) + toCents(text(cassa, 'ImportoContributoCassa')))
  }
  let total = 0
  const riepiloghi = all(doc, 'DatiRiepilogo')
  expect(riepiloghi.length).toBe(groups.size)
  for (const r of riepiloghi) {
    const imponibile = toCents(text(r, 'ImponibileImporto'))
    const imposta = toCents(text(r, 'Imposta'))
    expect(Math.abs((groups.get(key(r)) ?? NaN) - imponibile)).toBeLessThanOrEqual(1)
    expect(Math.abs(Math.round((imponibile * Number(text(r, 'AliquotaIVA'))) / 100) - imposta)).toBeLessThanOrEqual(1)
    total += imponibile + imposta
  }
  expect(toCents(text(doc, 'ImportoTotaleDocumento'))).toBe(total)
  const ritenuta = toCents(text(doc, 'ImportoRitenuta') ?? '0')
  expect(toCents(text(doc, 'ImportoPagamento'))).toBe(total - ritenuta)
}

describe('FatturaPA FPR12: regime forfettario', () => {
  const invoice = issuedInvoice(forfettarioProfile, companyClient, [{ quantity: 10, unitPriceCents: 50_00, unit: 'ore' }], {
    notes: 'Sviluppo sito web - acconto di marzo',
  })
  const { xml, fileName } = buildFatturaPA(invoice, forfettarioProfile, companyClient)
  const doc = parse(xml)

  it('uses the FPR12 root element in the FatturaPA namespace', () => {
    const root = doc.documentElement
    expect(root.localName).toBe('FatturaElettronica')
    expect(root.namespaceURI).toBe(FATTURAPA_NAMESPACE)
    expect(root.getAttribute('versione')).toBe('FPR12')
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
  })

  it('fills the transmission data and the parties', () => {
    expect(text(doc, 'FormatoTrasmissione')).toBe('FPR12')
    expect(text(doc, 'CodiceDestinatario')).toBe('ABC1234')
    expect(text(doc, 'ProgressivoInvio')).toBe(progressivo(2026, 1))
    const cedente = doc.getElementsByTagName('CedentePrestatore')[0]!
    expect(text(cedente, 'IdCodice')).toBe('01234567897')
    expect(text(cedente, 'CodiceFiscale')).toBe('PRVGLI85M41H501K')
    expect(text(cedente, 'Nome')).toBe('Giulia')
    expect(text(cedente, 'Cognome')).toBe('Prova')
    expect(text(cedente, 'RegimeFiscale')).toBe('RF19')
    expect(text(cedente, 'Provincia')).toBe('RM')
    const cessionario = doc.getElementsByTagName('CessionarioCommittente')[0]!
    expect(text(cessionario, 'IdCodice')).toBe('12345678903')
    expect(text(cessionario, 'Denominazione')).toBe('Acme Fittizia S.r.l.')
  })

  it('declares rivalsa INPS as cassa TC22 without IVA, the virtual stamp duty and no ritenuta', () => {
    const cassa = doc.getElementsByTagName('DatiCassaPrevidenziale')[0]!
    expect(childNames(cassa)).toEqual(['TipoCassa', 'AlCassa', 'ImportoContributoCassa', 'ImponibileCassa', 'AliquotaIVA', 'Natura'])
    expect(text(cassa, 'TipoCassa')).toBe('TC22')
    expect(text(cassa, 'AlCassa')).toBe('4.00')
    expect(text(cassa, 'ImportoContributoCassa')).toBe('20.00')
    expect(text(cassa, 'ImponibileCassa')).toBe('500.00')
    expect(text(cassa, 'Natura')).toBe('N2.2')
    expect(text(doc, 'BolloVirtuale')).toBe('SI')
    expect(text(doc, 'ImportoBollo')).toBe('2.00')
    expect(all(doc, 'DatiRitenuta')).toHaveLength(0)
    expect(text(doc, 'ImportoTotaleDocumento')).toBe('522.00')
  })

  it('writes lines and the summary with natura and legal reference', () => {
    const lines = all(doc, 'DettaglioLinee')
    expect(lines).toHaveLength(2)
    expect(childNames(lines[0]!)).toEqual([
      'NumeroLinea',
      'Descrizione',
      'Quantita',
      'UnitaMisura',
      'PrezzoUnitario',
      'PrezzoTotale',
      'AliquotaIVA',
      'Natura',
    ])
    expect(text(lines[0]!, 'Quantita')).toBe('10.00')
    expect(text(lines[0]!, 'PrezzoTotale')).toBe('500.00')
    expect(text(lines[1]!, 'Descrizione')).toBe('Rimborso imposta di bollo')
    expect(text(lines[1]!, 'Natura')).toBe('N1')
    const [n22, n1] = all(doc, 'DatiRiepilogo')
    expect(text(n22!, 'ImponibileImporto')).toBe('520.00')
    expect(text(n22!, 'RiferimentoNormativo')).toMatch(/190\/2014/)
    expect(text(n22!, 'EsigibilitaIVA')).toBeNull()
    expect(text(n1!, 'ImponibileImporto')).toBe('2.00')
    assertAmountsConsistent(doc)
  })

  it('keeps the schema order in DatiGeneraliDocumento', () => {
    const dgd = doc.getElementsByTagName('DatiGeneraliDocumento')[0]!
    expect(childNames(dgd)).toEqual([
      'TipoDocumento',
      'Divisa',
      'Data',
      'Numero',
      'DatiBollo',
      'DatiCassaPrevidenziale',
      'ImportoTotaleDocumento',
      'Causale',
    ])
  })

  it('pays by bank transfer to the profile IBAN', () => {
    expect(text(doc, 'CondizioniPagamento')).toBe('TP02')
    expect(text(doc, 'ModalitaPagamento')).toBe('MP05')
    expect(text(doc, 'IBAN')).toBe('IT47X0999999999000000123456')
    expect(text(doc, 'DataScadenzaPagamento')).toBe('2026-04-09')
  })

  it('names the file IT + sender codice fiscale + progressive', () => {
    expect(fileName).toMatch(/^ITPRVGLI85M41H501K_[0-9A-Z]{5}\.xml$/)
  })
})

describe('FatturaPA FPR12: regime ordinario', () => {
  const invoice = issuedInvoice(ordinarioProfile, companyClient, [{ unitPriceCents: 1000_00 }])
  const doc = parse(buildFatturaPA(invoice, ordinarioProfile, companyClient).xml)

  it('declares ritenuta, IVA 22% and the amount to pay', () => {
    const ritenuta = doc.getElementsByTagName('DatiRitenuta')[0]!
    expect(childNames(ritenuta)).toEqual(['TipoRitenuta', 'ImportoRitenuta', 'AliquotaRitenuta', 'CausalePagamento'])
    expect(text(ritenuta, 'TipoRitenuta')).toBe('RT01')
    expect(text(ritenuta, 'ImportoRitenuta')).toBe('208.00')
    expect(text(ritenuta, 'AliquotaRitenuta')).toBe('20.00')
    expect(text(ritenuta, 'CausalePagamento')).toBe('A')
    expect(text(doc, 'RegimeFiscale')).toBe('RF01')
    const riepilogo = doc.getElementsByTagName('DatiRiepilogo')[0]!
    expect(text(riepilogo, 'AliquotaIVA')).toBe('22.00')
    expect(text(riepilogo, 'ImponibileImporto')).toBe('1040.00')
    expect(text(riepilogo, 'Imposta')).toBe('228.80')
    expect(text(riepilogo, 'EsigibilitaIVA')).toBe('I')
    expect(text(doc, 'ImportoTotaleDocumento')).toBe('1268.80')
    expect(text(doc, 'ImportoPagamento')).toBe('1060.80')
    expect(all(doc, 'DatiBollo')).toHaveLength(0)
  })

  it('flags lines and the rivalsa as subject to ritenuta', () => {
    expect(text(doc.getElementsByTagName('DettaglioLinee')[0]!, 'Ritenuta')).toBe('SI')
    expect(text(doc.getElementsByTagName('DatiCassaPrevidenziale')[0]!, 'Ritenuta')).toBe('SI')
    assertAmountsConsistent(doc)
  })

  it('keeps amounts consistent with mixed rates, natura and expenses not subject to ritenuta', () => {
    const mixed = issuedInvoice(ordinarioProfile, companyClient, [
      { unitPriceCents: 333_33, quantity: 3 },
      { unitPriceCents: 45_50, vatRate: 10, ritenuta: false },
      { unitPriceCents: 120_00, vatRate: 0, natura: 'N4' },
      { unitPriceCents: 15, quantity: 1.5, vatRate: 4 },
    ])
    const mixedDoc = parse(buildFatturaPA(mixed, ordinarioProfile, companyClient).xml)
    expect(all(mixedDoc, 'DatiRiepilogo')).toHaveLength(5) // 22, 10, N4, 4 and the N1 stamp duty line
    assertAmountsConsistent(mixedDoc)
  })
})

describe('FatturaPA FPR12: recipients', () => {
  it('identifies private individuals by codice fiscale and uses PEC with code 0000000', () => {
    const inv = issuedInvoice(forfettarioProfile, privateClient, [{ unitPriceCents: 60_00 }])
    const doc = parse(buildFatturaPA(inv, forfettarioProfile, privateClient).xml)
    const cessionario = doc.getElementsByTagName('CessionarioCommittente')[0]!
    expect(all(cessionario, 'IdFiscaleIVA')).toHaveLength(0)
    expect(text(cessionario, 'CodiceFiscale')).toBe('TSTLCU78C62L219F')
    expect(text(cessionario, 'Nome')).toBe('Luca')
    expect(text(cessionario, 'NumeroCivico')).toBe('12/B')
    expect(text(doc, 'CodiceDestinatario')).toBe('0000000')
    expect(text(doc, 'PECDestinatario')).toBe('luca.test@pec.esempio.example')
    // €60 is below the €77.47 threshold: no stamp duty.
    expect(all(doc, 'DatiBollo')).toHaveLength(0)
  })

  it('uses XXXXXXX, the foreign VAT number and CAP 00000 for clients abroad', () => {
    const inv = issuedInvoice(forfettarioProfile, foreignClient, [{ unitPriceCents: 900_00 }])
    const doc = parse(buildFatturaPA(inv, forfettarioProfile, foreignClient).xml)
    const cessionario = doc.getElementsByTagName('CessionarioCommittente')[0]!
    expect(text(doc, 'CodiceDestinatario')).toBe('XXXXXXX')
    expect(text(cessionario, 'IdPaese')).toBe('DE')
    expect(text(cessionario, 'IdCodice')).toBe('999999999')
    expect(text(cessionario, 'CAP')).toBe('00000')
    expect(all(cessionario, 'Provincia')).toHaveLength(0)
    expect(text(cessionario, 'Indirizzo')).toBe('Musterstraße')
  })

  it('refuses foreign private individuals without a VAT number', () => {
    const client = { ...foreignClient, isCompany: false, partitaIva: '' }
    const inv = issuedInvoice(forfettarioProfile, client, [{ unitPriceCents: 100_00 }])
    expect(() => buildFatturaPA(inv, forfettarioProfile, client)).toThrow(FatturaPAError)
  })
})

describe('FatturaPA helpers', () => {
  it('refuses drafts', () => {
    expect(() => buildFatturaPA(newInvoice(forfettarioProfile, companyClient.id), forfettarioProfile, companyClient)).toThrow(
      FatturaPAError,
    )
  })

  it('escapes markup and transliterates characters outside Latin-1', () => {
    const inv = issuedInvoice(forfettarioProfile, companyClient, [{ description: 'Analisi <A&B> “premium” – 5 € 🚀', unitPriceCents: 100_00 }])
    const { xml } = buildFatturaPA(inv, forfettarioProfile, companyClient)
    expect(xml).toContain('Analisi &lt;A&amp;B&gt; &quot;premium&quot; - 5 EUR ?')
    expect(text(parse(xml), 'Descrizione')).toBe('Analisi <A&B> "premium" - 5 EUR ?')
    expect(toLatin1('àèìòù ÀÉ ç')).toBe('àèìòù ÀÉ ç')
    expect(toLatin1('x'.repeat(120), 100)).toHaveLength(100)
  })

  it('splits long notes into 200-character Causale chunks', () => {
    const chunks = causaleChunks('a'.repeat(450))
    expect(chunks.map((c) => c.length)).toEqual([200, 200, 50])
    expect(causaleChunks('   ')).toEqual([])
  })

  it('derives distinct 5-character progressives', () => {
    const values = new Set<string>()
    for (const year of [2025, 2026, 2027]) for (let n = 1; n <= 500; n++) values.add(progressivo(year, n))
    expect(values.size).toBe(1500)
    for (const v of values) expect(v).toMatch(/^[0-9A-Z]{5}$/)
  })
})
