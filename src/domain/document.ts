import { formatEuro, lineAmount } from './money'
import { NATURA_DESCRIPTIONS } from './natura'
import { clientDisplayName, isItalian, profileDisplayName } from './entityValidation'
import { invoiceLabel, invoiceTotals } from './invoices'
import type { InvoiceTotals } from './tax/invoiceTotals'
import { BOLLO_NOTE, FORFETTARIO_LEGAL_NOTE, FORFETTARIO_NO_RITENUTA_NOTE } from './tax/rules'
import type { Address, BusinessProfile, Client, Invoice } from './types'

/**
 * Renderer-independent description of a printed invoice. The PDF renderer only lays out
 * what this model contains, so the content rules are testable without parsing PDFs.
 * Printed documents are in Italian, the language of the tax rules they reference.
 */
export interface InvoiceDocument {
  title: string
  number: string
  issuer: { name: string; lines: string[] }
  recipient: { name: string; lines: string[] }
  meta: Array<[string, string]>
  columns: string[]
  rows: Array<{ description: string; quantity: string; unitPrice: string; vat: string; amount: string }>
  summary: Array<{ label: string; value: string; strong?: boolean }>
  notes: string[]
  payment: string[]
  fileName: string
}

const euro = (cents: number) => formatEuro(cents, 'it-IT')

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatQuantity(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(2).replace('.', ',')
}

function addressLines(a: Address): string[] {
  const street = [a.street, a.civic].filter(Boolean).join(', ')
  const city = [a.cap, a.comune, a.provincia ? `(${a.provincia})` : ''].filter(Boolean).join(' ')
  return [street, a.nazione && a.nazione !== 'IT' ? `${city} - ${a.nazione}` : city].filter((l) => l.trim() !== '')
}

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

export function buildInvoiceDocument(
  invoice: Invoice,
  profile: BusinessProfile,
  client: Client,
  totals: InvoiceTotals = invoiceTotals(invoice),
): InvoiceDocument {
  const forfettario = invoice.regime === 'forfettario'
  const number = invoiceLabel(invoice, profile) ?? 'BOZZA'
  const issuerName = profileDisplayName(profile)

  const issuerLines = [
    ...(profile.denominazione.trim() && profile.cognome.trim() ? [`${profile.nome} ${profile.cognome}`.trim()] : []),
    ...addressLines(profile.address),
    `P.IVA ${profile.partitaIva} - C.F. ${profile.codiceFiscale}`,
    ...[profile.email && `Email ${profile.email}`, profile.pec && `PEC ${profile.pec}`, profile.phone && `Tel. ${profile.phone}`].filter(
      (v): v is string => Boolean(v),
    ),
  ]

  const recipientLines = [
    ...addressLines(client.address),
    ...(client.partitaIva ? [`${isItalian(client) ? 'P.IVA' : 'VAT'} ${client.partitaIva}`] : []),
    ...(client.codiceFiscale ? [`C.F. ${client.codiceFiscale}`] : []),
    ...(isItalian(client) && client.codiceDestinatario && client.codiceDestinatario !== '0000000'
      ? [`Codice destinatario ${client.codiceDestinatario}`]
      : []),
    ...(client.pec ? [`PEC ${client.pec}`] : []),
  ]

  const rows = totals.lines.map((line) => ({
    description: line.description,
    quantity: `${formatQuantity(line.quantity)}${line.unit ? ` ${line.unit}` : ''}`,
    unitPrice: euro(line.unitPriceCents),
    vat: line.vatRate === 0 ? (line.natura ?? '0%') : `${line.vatRate}%`,
    amount: euro(lineAmount(line.unitPriceCents, line.quantity)),
  }))
  if (totals.bollo.chargedToClient) {
    rows.push({
      description: 'Rimborso imposta di bollo',
      quantity: '1',
      unitPrice: euro(totals.bollo.amountCents),
      vat: 'N1',
      amount: euro(totals.bollo.amountCents),
    })
  }

  const summary: InvoiceDocument['summary'] = [{ label: 'Imponibile', value: euro(totals.subtotalCents) }]
  if (totals.rivalsaCents) summary.push({ label: `Rivalsa INPS ${invoice.rivalsaRate}%`, value: euro(totals.rivalsaCents) })
  for (const row of totals.vatSummary) {
    if (row.vatRate > 0) summary.push({ label: `IVA ${row.vatRate}% su ${euro(row.taxableCents)}`, value: euro(row.vatCents) })
  }
  if (totals.bollo.chargedToClient) summary.push({ label: 'Imposta di bollo', value: euro(totals.bollo.amountCents) })
  summary.push({ label: 'Totale documento', value: euro(totals.totalCents), strong: true })
  if (totals.ritenuta.applies) {
    summary.push({ label: `Ritenuta d'acconto ${totals.ritenuta.rate}%`, value: `- ${euro(totals.ritenuta.amountCents)}` })
    summary.push({ label: 'Netto a pagare', value: euro(totals.netToPayCents), strong: true })
  }

  const notes: string[] = []
  if (invoice.notes.trim()) notes.push(invoice.notes.trim())
  if (forfettario) {
    notes.push(FORFETTARIO_LEGAL_NOTE)
    notes.push(FORFETTARIO_NO_RITENUTA_NOTE)
  }
  for (const row of totals.vatSummary) {
    if (row.natura && row.natura !== 'N2.2' && row.natura !== 'N1') {
      notes.push(`Operazione ${row.natura}: ${NATURA_DESCRIPTIONS[row.natura]}`)
    }
  }
  if (totals.bollo.applies) notes.push(BOLLO_NOTE)

  const payment = [
    `Importo da pagare: ${euro(totals.netToPayCents)} entro il ${formatDate(invoice.dueDate)}`,
    ...(profile.iban ? [`Bonifico su IBAN ${profile.iban}${profile.bankName ? ` (${profile.bankName})` : ''}`] : []),
    `Intestato a ${issuerName}`,
  ]

  return {
    title: 'FATTURA',
    number,
    issuer: { name: issuerName, lines: issuerLines },
    recipient: { name: clientDisplayName(client), lines: recipientLines },
    meta: [
      ['Numero', number],
      ['Data', formatDate(invoice.date)],
      ['Scadenza', formatDate(invoice.dueDate)],
    ],
    columns: ['Descrizione', 'Q.tà', 'Prezzo', 'IVA', 'Importo'],
    rows,
    summary,
    notes,
    payment,
    fileName: `Fattura_${slug(number)}_${slug(clientDisplayName(client)) || 'cliente'}.pdf`,
  }
}
