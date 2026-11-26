import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { buildInvoiceDocument } from '@/domain/document'
import { defaultProfile, emptyClient } from '@/domain/factories'
import { issueInvoice, newInvoice } from '@/domain/invoices'
import type { BusinessProfile, Client, Invoice } from '@/domain/types'
import { makeSanitizer, renderInvoicePdf, wrapText } from './invoicePdf'

const profile: BusinessProfile = {
  ...defaultProfile(2026),
  nome: 'Giulia',
  cognome: 'Prova',
  partitaIva: '01234567897',
  codiceFiscale: 'PRVGLI85M41H501K',
  iban: 'IT47X0999999999000000123456',
  address: { street: 'Via Immaginaria', civic: '7', cap: '00100', comune: 'Roma', provincia: 'RM', nazione: 'IT' },
  defaults: { ...defaultProfile(2026).defaults, applyRivalsaInps: true },
}
const client: Client = {
  ...emptyClient(),
  id: 'c1',
  denominazione: 'Acme Fittizia S.r.l.',
  partitaIva: '12345678903',
  codiceDestinatario: 'ABC1234',
  address: { street: 'Via degli Esempi', civic: '1', cap: '20100', comune: 'Milano', provincia: 'MI', nazione: 'IT' },
}

function issued(p: BusinessProfile, lines: Partial<Invoice['lines'][number]>[]): Invoice {
  const draft = newInvoice(p, client.id, '2026-03-10')
  draft.lines = lines.map((l, i) => ({ ...draft.lines[0]!, id: `l${i}`, description: 'Consulenza', ...l }))
  return issueInvoice(draft, [], p, client)
}

describe('invoice document model', () => {
  it('describes a forfettario invoice with the legal notes and the stamp duty', () => {
    const doc = buildInvoiceDocument(issued(profile, [{ quantity: 10, unitPriceCents: 50_00 }]), profile, client)
    expect(doc.number).toBe('1/2026')
    expect(doc.meta).toEqual([
      ['Numero', '1/2026'],
      ['Data', '10/03/2026'],
      ['Scadenza', '09/04/2026'],
    ])
    expect(doc.issuer.name).toBe('Giulia Prova')
    expect(doc.issuer.lines).toContain('P.IVA 01234567897 - C.F. PRVGLI85M41H501K')
    expect(doc.recipient.lines).toContain('Codice destinatario ABC1234')
    expect(doc.rows.map((r) => r.vat)).toEqual(['N2.2', 'N1'])
    expect(doc.rows[1]?.description).toBe('Rimborso imposta di bollo')
    expect(doc.summary.map((s) => s.label)).toEqual(['Imponibile', 'Rivalsa INPS 4%', 'Imposta di bollo', 'Totale documento'])
    expect(doc.notes.join('\n')).toMatch(/commi da 54 a 89.*190\/2014/)
    expect(doc.notes.join('\n')).toMatch(/comma 67/)
    expect(doc.notes.join('\n')).toMatch(/bollo assolta in modo virtuale/)
    expect(doc.payment[0]).toMatch(/522,00.€ entro il 09\/04\/2026/)
    expect(doc.payment[1]).toContain('IT47X0999999999000000123456')
    expect(doc.fileName).toBe('Fattura_1-2026_Acme-Fittizia-S-r-l.pdf')
  })

  it('shows IVA, ritenuta and the net amount in regime ordinario', () => {
    const ord: BusinessProfile = { ...profile, regime: 'ordinario', defaults: { ...profile.defaults, applyRitenuta: true } }
    const doc = buildInvoiceDocument(issued(ord, [{ unitPriceCents: 1000_00 }]), ord, client)
    const spaces = (v: string) => v.replace(/\s/g, ' ')
    const summary = Object.fromEntries(doc.summary.map((s) => [spaces(s.label), spaces(s.value)]))
    expect(summary).toEqual({
      Imponibile: '1.000,00 €',
      'Rivalsa INPS 4%': '40,00 €',
      'IVA 22% su 1.040,00 €': '228,80 €',
      'Totale documento': '1.268,80 €',
      "Ritenuta d'acconto 20%": '- 208,00 €',
      'Netto a pagare': '1.060,80 €',
    })
    expect(doc.notes.join('\n')).not.toMatch(/190\/2014/)
  })

  it('labels drafts', () => {
    const draft = newInvoice(profile, client.id, '2026-03-10')
    draft.lines[0]!.unitPriceCents = 10_00
    expect(buildInvoiceDocument(draft, profile, client).number).toBe('BOZZA')
  })
})

describe('PDF rendering', () => {
  it('produces a valid A4 PDF with metadata', async () => {
    const doc = buildInvoiceDocument(issued(profile, [{ quantity: 2, unitPriceCents: 300_00 }]), profile, client)
    const bytes = await renderInvoicePdf(doc)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    const parsed = await PDFDocument.load(bytes)
    expect(parsed.getPageCount()).toBe(1)
    expect(parsed.getTitle()).toBe('Fattura 1/2026')
    expect(parsed.getAuthor()).toBe('Giulia Prova')
    const { width, height } = parsed.getPage(0).getSize()
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842])
  })

  it('paginates long invoices', async () => {
    const lines = Array.from({ length: 60 }, (_, i) => ({ description: `Attività ${i + 1}: analisi, sviluppo e test`, unitPriceCents: 10_00 }))
    const bytes = await renderInvoicePdf(buildInvoiceDocument(issued(profile, lines), profile, client))
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1)
  })

  it('does not fail on characters outside the standard font encoding', async () => {
    const foreign = { ...client, denominazione: 'Łódź 東京 Studio' }
    const inv = issued(profile, [{ description: 'Emoji 🚀 e accenti àèìòù €', unitPriceCents: 100_00 }])
    await expect(renderInvoicePdf(buildInvoiceDocument(inv, profile, foreign))).resolves.toBeInstanceOf(Uint8Array)
  })
})

describe('text helpers', () => {
  it('keeps Italian accents and the euro sign, replaces unsupported characters', async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica)
    const clean = makeSanitizer(font)
    expect(clean('Attività già fatta: 10 €')).toBe('Attività già fatta: 10 €')
    expect(clean('Łódź 🚀')).toBe('?ód? ?')
    expect(clean('1 000')).toBe('1 000')
  })

  it('wraps text to the available width and splits very long words', async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica)
    const lines = wrapText('uno due tre quattro cinque sei sette otto nove dieci', font, 10, 80)
    expect(lines.length).toBeGreaterThan(1)
    for (const l of lines) expect(font.widthOfTextAtSize(l, 10)).toBeLessThanOrEqual(80)
    const long = wrapText('x'.repeat(200), font, 10, 50)
    expect(long.join('')).toBe('x'.repeat(200))
    expect(wrapText('riga uno\nriga due', font, 10, 500)).toEqual(['riga uno', 'riga due'])
  })
})
