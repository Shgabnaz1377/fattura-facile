// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import { companyClient, foreignClient, forfettarioProfile, issuedInvoice, ordinarioProfile, privateClient } from '@/test/fixtures'
import { buildFatturaPA } from './fatturapa'

/**
 * Validates generated XML against the official FPR12 schema published by the Agenzia delle
 * Entrate. The schema is not committed: `npm run xsd:fetch` downloads it into .cache/.
 * CI fetches it and sets REQUIRE_FATTURAPA_XSD=1, so there the test cannot silently skip.
 */
const dir = join(process.cwd(), '.cache', 'fatturapa-xsd')
const available = existsSync(join(dir, 'Schema_VFPR12.xsd')) && existsSync(join(dir, 'xmldsig-core-schema.xsd'))

if (!available && process.env.REQUIRE_FATTURAPA_XSD) {
  throw new Error('FatturaPA XSD required but not found: run `npm run xsd:fetch` first')
}

const cases = [
  ['forfettario, rivalsa, stamp duty charged', issuedInvoice(forfettarioProfile, companyClient, [{ quantity: 10, unitPriceCents: 50_00, unit: 'ore' }], { notes: 'Acconto marzo' }), forfettarioProfile, companyClient],
  ['forfettario, private client below the stamp duty threshold', issuedInvoice(forfettarioProfile, privateClient, [{ unitPriceCents: 60_00 }]), forfettarioProfile, privateClient],
  ['forfettario, foreign client, stamp duty not charged', issuedInvoice(forfettarioProfile, foreignClient, [{ unitPriceCents: 900_00 }], { bolloChargedToClient: false }), forfettarioProfile, foreignClient],
  ['ordinario, rivalsa and ritenuta', issuedInvoice(ordinarioProfile, companyClient, [{ unitPriceCents: 1000_00 }]), ordinarioProfile, companyClient],
  [
    'ordinario, mixed rates and natura',
    issuedInvoice(ordinarioProfile, companyClient, [
      { unitPriceCents: 333_33, quantity: 3 },
      { unitPriceCents: 45_50, vatRate: 10, ritenuta: false },
      { unitPriceCents: 120_00, vatRate: 0, natura: 'N4' },
      { unitPriceCents: 80_00, vatRate: 0, natura: 'N2.1' },
    ]),
    ordinarioProfile,
    companyClient,
  ],
] as const

describe.skipIf(!available)('FatturaPA XML against the official FPR12 XSD', () => {
  const schema = { fileName: 'Schema_VFPR12.xsd', contents: available ? readFileSync(join(dir, 'Schema_VFPR12.xsd'), 'utf8') : '' }
  const preload = { fileName: 'xmldsig-core-schema.xsd', contents: available ? readFileSync(join(dir, 'xmldsig-core-schema.xsd'), 'utf8') : '' }

  it.each(cases)('%s is schema-valid', async (_name, invoice, profile, client) => {
    const { xml } = buildFatturaPA(invoice, profile, client)
    const result = await validateXML({ xml: { fileName: 'fattura.xml', contents: xml }, schema, preload })
    expect(result.errors.map((e) => e.message)).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('rejects a document that breaks the schema (sanity check of the validator)', async () => {
    const { xml } = buildFatturaPA(cases[0][1], forfettarioProfile, companyClient)
    const broken = xml.replace('<TipoDocumento>TD01</TipoDocumento>', '<TipoDocumento>TD99</TipoDocumento>')
    const result = await validateXML({ xml: { fileName: 'broken.xml', contents: broken }, schema, preload })
    expect(result.valid).toBe(false)
  })
})
