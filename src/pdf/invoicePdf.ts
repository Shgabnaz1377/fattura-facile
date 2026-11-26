import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { InvoiceDocument } from '@/domain/document'

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 48
const ACCENT = rgb(0.12, 0.435, 0.36)
const TEXT = rgb(0.1, 0.13, 0.12)
const MUTED = rgb(0.38, 0.42, 0.4)
const RULE = rgb(0.84, 0.87, 0.85)
const FILL = rgb(0.95, 0.96, 0.95)

/**
 * The standard PDF fonts only cover WinAnsi (Latin-1 plus €, curly quotes, dashes).
 * Characters outside it are replaced so a client name in another script cannot break the export.
 */
export function makeSanitizer(font: PDFFont): (text: string) => string {
  const supported = new Set(font.getCharacterSet())
  const replacements: Record<string, string> = { ' ': ' ', ' ': ' ', '−': '-' }
  return (text: string) =>
    Array.from(text.normalize('NFC'))
      .map((ch) => {
        const mapped = replacements[ch] ?? ch
        if (mapped === '\n') return mapped
        return supported.has(mapped.codePointAt(0) as number) ? mapped : '?'
      })
      .join('')
}

/** Greedy word wrap that also splits words longer than the available width. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate
        continue
      }
      if (line) out.push(line)
      // Break a single word that does not fit on its own line.
      let rest = word
      while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
        let cut = rest.length - 1
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--
        out.push(rest.slice(0, cut))
        rest = rest.slice(cut)
      }
      line = rest
    }
    out.push(line)
  }
  return out
}

interface Ctx {
  pdf: PDFDocument
  page: PDFPage
  y: number
  regular: PDFFont
  bold: PDFFont
  clean: (t: string) => string
}

function text(ctx: Ctx, value: string, x: number, y: number, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}): void {
  ctx.page.drawText(ctx.clean(value), {
    x,
    y,
    size: opts.size ?? 9.5,
    font: opts.bold ? ctx.bold : ctx.regular,
    color: opts.color ?? TEXT,
  })
}

function rightText(ctx: Ctx, value: string, right: number, y: number, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}): void {
  const size = opts.size ?? 9.5
  const font = opts.bold ? ctx.bold : ctx.regular
  const clean = ctx.clean(value)
  text(ctx, clean, right - font.widthOfTextAtSize(clean, size), y, opts)
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.pdf.addPage(A4)
  ctx.y = A4[1] - MARGIN
}

function ensureSpace(ctx: Ctx, needed: number, onNewPage?: () => void): void {
  if (ctx.y - needed < MARGIN + 24) {
    newPage(ctx)
    onNewPage?.()
  }
}

export async function renderInvoicePdf(doc: InvoiceDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Fattura ${doc.number}`)
  pdf.setAuthor(doc.issuer.name)
  pdf.setSubject(`Fattura ${doc.number} - ${doc.recipient.name}`)
  pdf.setCreator('fattura-facile')
  pdf.setProducer('fattura-facile (pdf-lib)')
  pdf.setLanguage('it-IT')

  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ctx: Ctx = { pdf, page: pdf.addPage(A4), y: A4[1] - MARGIN, regular, bold, clean: makeSanitizer(regular) }
  const width = A4[0] - MARGIN * 2
  const right = A4[0] - MARGIN

  // Header: issuer on the left, document title and meta on the right.
  ctx.page.drawRectangle({ x: 0, y: A4[1] - 6, width: A4[0], height: 6, color: ACCENT })
  text(ctx, doc.issuer.name, MARGIN, ctx.y - 4, { size: 15, bold: true })
  let issuerY = ctx.y - 22
  for (const line of doc.issuer.lines) {
    text(ctx, line, MARGIN, issuerY, { size: 9, color: MUTED })
    issuerY -= 12.5
  }
  rightText(ctx, doc.title, right, ctx.y - 4, { size: 20, bold: true, color: ACCENT })
  let metaY = ctx.y - 26
  for (const [label, value] of doc.meta) {
    rightText(ctx, value, right, metaY, { bold: true })
    rightText(ctx, label, right - 95, metaY, { color: MUTED })
    metaY -= 14
  }
  ctx.y = Math.min(issuerY, metaY) - 14

  // Recipient box.
  const recipientLines = [doc.recipient.name, ...doc.recipient.lines]
  const boxHeight = 22 + recipientLines.length * 12.5
  const boxX = A4[0] / 2
  ctx.page.drawRectangle({ x: boxX, y: ctx.y - boxHeight, width: right - boxX, height: boxHeight, color: FILL, borderColor: RULE, borderWidth: 0.8 })
  text(ctx, 'DESTINATARIO', boxX + 12, ctx.y - 14, { size: 7.5, bold: true, color: MUTED })
  let ry = ctx.y - 28
  recipientLines.forEach((line, i) => {
    text(ctx, line, boxX + 12, ry, { size: i === 0 ? 10.5 : 9, bold: i === 0, color: i === 0 ? TEXT : MUTED })
    ry -= 12.5
  })
  ctx.y -= boxHeight + 24

  // Line items table.
  const cols = [
    { x: MARGIN + 6, w: width * 0.5, align: 'left' as const },
    { x: MARGIN + width * 0.5, w: width * 0.12, align: 'right' as const },
    { x: MARGIN + width * 0.62, w: width * 0.14, align: 'right' as const },
    { x: MARGIN + width * 0.76, w: width * 0.09, align: 'right' as const },
    { x: MARGIN + width * 0.85, w: width * 0.15 - 6, align: 'right' as const },
  ]
  const drawHeader = () => {
    ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 18, width, height: 20, color: ACCENT })
    doc.columns.forEach((label, i) => {
      const c = cols[i]!
      if (c.align === 'left') text(ctx, label.toUpperCase(), c.x, ctx.y - 12, { size: 8, bold: true, color: rgb(1, 1, 1) })
      else rightText(ctx, label.toUpperCase(), c.x + c.w, ctx.y - 12, { size: 8, bold: true, color: rgb(1, 1, 1) })
    })
    ctx.y -= 34
  }
  drawHeader()
  for (const row of doc.rows) {
    const descLines = wrapText(ctx.clean(row.description), regular, 9.5, cols[0]!.w - 10)
    const rowHeight = descLines.length * 12 + 12
    ensureSpace(ctx, rowHeight, drawHeader)
    descLines.forEach((l, i) => text(ctx, l, cols[0]!.x, ctx.y - i * 12))
    const values = [row.quantity, row.unitPrice, row.vat, row.amount]
    values.forEach((v, i) => {
      const c = cols[i + 1]!
      rightText(ctx, v, c.x + c.w, ctx.y)
    })
    ctx.y -= rowHeight
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y + 15 }, end: { x: right, y: ctx.y + 15 }, thickness: 0.5, color: RULE })
  }
  ctx.y -= 8

  // Summary aligned to the right.
  ensureSpace(ctx, doc.summary.length * 16 + 10)
  const labelRight = right - 110
  for (const item of doc.summary) {
    if (item.strong) {
      ctx.page.drawRectangle({ x: labelRight - 150, y: ctx.y - 5, width: right - labelRight + 150, height: 18, color: FILL })
    }
    rightText(ctx, item.label, labelRight, ctx.y, { bold: item.strong, color: item.strong ? TEXT : MUTED })
    rightText(ctx, item.value, right - 4, ctx.y, { bold: item.strong, size: item.strong ? 10.5 : 9.5 })
    ctx.y -= 18
  }
  ctx.y -= 10

  const block = (title: string, lines: string[]) => {
    if (lines.length === 0) return
    const wrapped = lines.flatMap((l) => wrapText(ctx.clean(l), regular, 8.5, width))
    ensureSpace(ctx, 18 + wrapped.length * 11)
    text(ctx, title.toUpperCase(), MARGIN, ctx.y, { size: 7.5, bold: true, color: MUTED })
    ctx.y -= 13
    for (const l of wrapped) {
      ensureSpace(ctx, 12)
      text(ctx, l, MARGIN, ctx.y, { size: 8.5 })
      ctx.y -= 11
    }
    ctx.y -= 10
  }
  block('Pagamento', doc.payment)
  block('Note', doc.notes)

  // Page numbers in the footer.
  const pages = pdf.getPages()
  pages.forEach((page, i) => {
    const label = ctx.clean(`${doc.title} ${doc.number} - pagina ${i + 1} di ${pages.length}`)
    page.drawText(label, { x: MARGIN, y: 24, size: 7.5, font: regular, color: MUTED })
  })

  return pdf.save()
}

export function downloadBytes(bytes: Uint8Array, fileName: string, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
