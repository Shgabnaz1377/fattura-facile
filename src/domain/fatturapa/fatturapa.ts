import { FOREIGN_SDI_CODE, isItalian, NO_SDI_CODE } from '../entityValidation'
import { invoiceLabel, invoiceTotals } from '../invoices'
import { centsToDecimalString, lineAmount } from '../money'
import { NATURA_DESCRIPTIONS } from '../natura'
import { BOLLO_AMOUNT_CENTS, BOLLO_LINE_NATURA } from '../tax/rules'
import type { InvoiceTotals } from '../tax/invoiceTotals'
import type { Address, BusinessProfile, Client, Invoice } from '../types'
import { el, opt, serialize, type XmlNode } from './xml'

/**
 * FatturaPA XML, format FPR12 (invoices between private parties), following the structure of
 * the official schema (Schema_VFPR12 v1.2.x) and the SDI consistency rules on totals.
 * Document type TD01 (fattura); credit notes and PA invoices (FPA12) are out of scope.
 */

export const FATTURAPA_NAMESPACE = 'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2'
const XSI = 'http://www.w3.org/2001/XMLSchema-instance'
const DSIG = 'http://www.w3.org/2000/09/xmldsig#'

/** Codice della cassa previdenziale for INPS (used for the 4% rivalsa of gestione separata). */
export const TIPO_CASSA_INPS = 'TC22'

export class FatturaPAError extends Error {
  constructor(public readonly code: 'notIssued' | 'foreignPrivate' | 'missingIdentifier') {
    super(`Cannot build FatturaPA XML: ${code}`)
  }
}

/**
 * Text fields accept Basic Latin and Latin-1 Supplement only. Common typographic characters
 * are transliterated; anything else becomes '?'.
 */
export function toLatin1(value: string, maxLength?: number): string {
  const map: Record<string, string> = {
    '‘': "'",
    '’': "'",
    '“': '"',
    '”': '"',
    '–': '-',
    '—': '-',
    '…': '...',
    '€': 'EUR',
    ' ': ' ',
  }
  let out = Array.from(value.normalize('NFC'))
    .map((ch) => map[ch] ?? ((ch.codePointAt(0) as number) <= 0xff ? ch : '?'))
    .join('')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim()
  if (maxLength !== undefined && out.length > maxLength) out = out.slice(0, maxLength).trimEnd()
  return out
}

const amount = (cents: number) => centsToDecimalString(cents)
const rate = (percent: number) => percent.toFixed(2)
const quantity = (q: number) => q.toFixed(2)

/** Splits free text into the 200-character chunks allowed for each Causale element. */
export function causaleChunks(text: string): string[] {
  const clean = toLatin1(text.replace(/\s+/g, ' '))
  const chunks: string[] = []
  for (let i = 0; i < clean.length; i += 200) chunks.push(clean.slice(i, i + 200))
  return chunks.filter((c) => c.trim() !== '')
}

/** Unique 5-character progressive for the file name and ProgressivoInvio, derived from year and number. */
export function progressivo(year: number, number: number): string {
  return (year * 10000 + number).toString(36).toUpperCase().padStart(5, '0').slice(-5)
}

export function fatturaPAFileName(profile: BusinessProfile, invoice: Invoice): string {
  if (invoice.number === null) throw new FatturaPAError('notIssued')
  // Same identifier as IdTrasmittente: the codice fiscale of the sender.
  return `IT${profile.codiceFiscale}_${progressivo(invoice.year, invoice.number)}.xml`
}

function anagrafica(d: { denominazione: string; nome: string; cognome: string }, preferPerson: boolean): XmlNode {
  if (preferPerson && d.nome.trim() && d.cognome.trim()) {
    return el('Anagrafica', [el('Nome', toLatin1(d.nome, 60)), el('Cognome', toLatin1(d.cognome, 60))])
  }
  return el('Anagrafica', [el('Denominazione', toLatin1(d.denominazione || `${d.nome} ${d.cognome}`, 80))])
}

function sede(a: Address): XmlNode {
  const italian = a.nazione.toUpperCase() === 'IT'
  return el('Sede', [
    el('Indirizzo', toLatin1(a.street, 60)),
    ...opt('NumeroCivico', toLatin1(a.civic, 8)),
    // Foreign addresses: the CAP field only accepts five digits, so the conventional 00000 is used.
    el('CAP', italian ? a.cap : '00000'),
    el('Comune', toLatin1(a.comune, 60)),
    ...(italian ? [el('Provincia', a.provincia.toUpperCase())] : []),
    el('Nazione', a.nazione.toUpperCase()),
  ])
}

function cedente(profile: BusinessProfile, regime: Invoice['regime']): XmlNode {
  return el('CedentePrestatore', [
    el('DatiAnagrafici', [
      el('IdFiscaleIVA', [el('IdPaese', 'IT'), el('IdCodice', profile.partitaIva)]),
      el('CodiceFiscale', profile.codiceFiscale),
      anagrafica(profile, true),
      el('RegimeFiscale', regime === 'forfettario' ? 'RF19' : 'RF01'),
    ]),
    sede(profile.address),
    ...(profile.email ? [el('Contatti', [el('Email', toLatin1(profile.email, 256))])] : []),
  ])
}

function cessionario(client: Client): XmlNode {
  const italian = isItalian(client)
  const vat = client.partitaIva.trim().toUpperCase()
  const country = client.address.nazione.toUpperCase()
  const vatCode = vat.startsWith(country) ? vat.slice(country.length) : vat
  if (!italian && !vat) throw new FatturaPAError('foreignPrivate')
  if (italian && !vat && !client.codiceFiscale) throw new FatturaPAError('missingIdentifier')
  return el('CessionarioCommittente', [
    el('DatiAnagrafici', [
      ...(vat ? [el('IdFiscaleIVA', [el('IdPaese', country), el('IdCodice', toLatin1(vatCode, 28))])] : []),
      ...(italian && client.codiceFiscale ? [el('CodiceFiscale', client.codiceFiscale)] : []),
      anagrafica(client, !client.isCompany),
    ]),
    sede(client.address),
  ])
}

function datiTrasmissione(profile: BusinessProfile, client: Client, invoice: Invoice): XmlNode {
  const italian = isItalian(client)
  const code = italian ? client.codiceDestinatario.trim().toUpperCase() || NO_SDI_CODE : FOREIGN_SDI_CODE
  return el('DatiTrasmissione', [
    el('IdTrasmittente', [el('IdPaese', 'IT'), el('IdCodice', profile.codiceFiscale)]),
    el('ProgressivoInvio', progressivo(invoice.year, invoice.number as number)),
    el('FormatoTrasmissione', 'FPR12'),
    el('CodiceDestinatario', code),
    ...(italian && code === NO_SDI_CODE && client.pec ? [el('PECDestinatario', client.pec)] : []),
  ])
}

function datiGeneraliDocumento(invoice: Invoice, profile: BusinessProfile, totals: InvoiceTotals): XmlNode {
  const ritenutaWithLines = totals.ritenuta.applies
  // RT01 for natural persons (16-character codice fiscale), RT02 for other entities.
  const tipoRitenuta = profile.codiceFiscale.length === 16 ? 'RT01' : 'RT02'
  const cassa = totals.vatSummary
    .filter((row) => row.rivalsaCents > 0)
    .map((row) =>
      el('DatiCassaPrevidenziale', [
        el('TipoCassa', TIPO_CASSA_INPS),
        el('AlCassa', rate(invoice.rivalsaRate)),
        el('ImportoContributoCassa', amount(row.rivalsaCents)),
        el('ImponibileCassa', amount(row.linesCents)),
        el('AliquotaIVA', rate(row.vatRate)),
        ...(ritenutaWithLines ? [el('Ritenuta', 'SI')] : []),
        ...opt('Natura', row.natura),
      ]),
    )
  return el('DatiGeneraliDocumento', [
    el('TipoDocumento', 'TD01'),
    el('Divisa', 'EUR'),
    el('Data', invoice.date),
    el('Numero', invoiceLabel(invoice, profile) as string),
    ...(totals.ritenuta.applies
      ? [
          el('DatiRitenuta', [
            el('TipoRitenuta', tipoRitenuta),
            el('ImportoRitenuta', amount(totals.ritenuta.amountCents)),
            el('AliquotaRitenuta', rate(totals.ritenuta.rate)),
            // A = lavoro autonomo (professional services).
            el('CausalePagamento', 'A'),
          ]),
        ]
      : []),
    ...(totals.bollo.applies ? [el('DatiBollo', [el('BolloVirtuale', 'SI'), el('ImportoBollo', amount(BOLLO_AMOUNT_CENTS))])] : []),
    ...cassa,
    el('ImportoTotaleDocumento', amount(totals.totalCents)),
    ...causaleChunks(invoice.notes).map((c) => el('Causale', c)),
  ])
}

function datiBeniServizi(totals: InvoiceTotals): XmlNode {
  const lines: XmlNode[] = totals.lines.map((line, i) =>
    el('DettaglioLinee', [
      el('NumeroLinea', String(i + 1)),
      el('Descrizione', toLatin1(line.description, 1000)),
      el('Quantita', quantity(line.quantity)),
      ...opt('UnitaMisura', toLatin1(line.unit, 10)),
      el('PrezzoUnitario', amount(line.unitPriceCents)),
      el('PrezzoTotale', amount(lineAmount(line.unitPriceCents, line.quantity))),
      el('AliquotaIVA', rate(line.vatRate)),
      ...(totals.ritenuta.applies && line.ritenuta ? [el('Ritenuta', 'SI')] : []),
      ...opt('Natura', line.natura),
    ]),
  )
  if (totals.bollo.chargedToClient) {
    lines.push(
      el('DettaglioLinee', [
        el('NumeroLinea', String(lines.length + 1)),
        el('Descrizione', 'Rimborso imposta di bollo'),
        el('Quantita', quantity(1)),
        el('PrezzoUnitario', amount(totals.bollo.amountCents)),
        el('PrezzoTotale', amount(totals.bollo.amountCents)),
        el('AliquotaIVA', rate(0)),
        el('Natura', BOLLO_LINE_NATURA),
      ]),
    )
  }
  const riepilogo = totals.vatSummary.map((row) =>
    el('DatiRiepilogo', [
      el('AliquotaIVA', rate(row.vatRate)),
      ...opt('Natura', row.natura),
      el('ImponibileImporto', amount(row.taxableCents)),
      el('Imposta', amount(row.vatCents)),
      ...(row.vatRate > 0 ? [el('EsigibilitaIVA', 'I')] : []),
      ...opt(
        'RiferimentoNormativo',
        row.natura ? toLatin1(row.riferimentoNormativo ?? NATURA_DESCRIPTIONS[row.natura], 100) : null,
      ),
    ]),
  )
  return el('DatiBeniServizi', [...lines, ...riepilogo])
}

function datiPagamento(invoice: Invoice, profile: BusinessProfile, totals: InvoiceTotals): XmlNode {
  return el('DatiPagamento', [
    // TP02: pagamento completo.
    el('CondizioniPagamento', 'TP02'),
    el('DettaglioPagamento', [
      // MP05: bonifico.
      el('ModalitaPagamento', 'MP05'),
      el('DataScadenzaPagamento', invoice.dueDate),
      el('ImportoPagamento', amount(totals.netToPayCents)),
      ...opt('IstitutoFinanziario', profile.bankName ? toLatin1(profile.bankName, 80) : null),
      ...opt('IBAN', profile.iban || null),
    ]),
  ])
}

export interface FatturaPAResult {
  xml: string
  fileName: string
}

/** Builds the FatturaPA XML of an issued invoice, using the data frozen when it was issued. */
export function buildFatturaPA(invoice: Invoice, profile: BusinessProfile, client: Client): FatturaPAResult {
  if (invoice.number === null || invoice.status === 'draft') throw new FatturaPAError('notIssued')
  const totals = invoiceTotals(invoice)
  const root = el(
    'p:FatturaElettronica',
    [
      el('FatturaElettronicaHeader', [datiTrasmissione(profile, client, invoice), cedente(profile, invoice.regime), cessionario(client)]),
      el('FatturaElettronicaBody', [
        el('DatiGenerali', [datiGeneraliDocumento(invoice, profile, totals)]),
        datiBeniServizi(totals),
        datiPagamento(invoice, profile, totals),
      ]),
    ],
    {
      versione: 'FPR12',
      'xmlns:ds': DSIG,
      'xmlns:p': FATTURAPA_NAMESPACE,
      'xmlns:xsi': XSI,
      'xsi:schemaLocation': `${FATTURAPA_NAMESPACE} http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2/Schema_del_file_xml_FatturaPA_versione_1.2.xsd`,
    },
  )
  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?>\n${serialize(root)}\n`,
    fileName: fatturaPAFileName(profile, invoice),
  }
}
