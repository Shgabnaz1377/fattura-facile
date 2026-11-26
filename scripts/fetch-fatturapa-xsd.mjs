// Downloads the official FatturaPA FPR12 schema (Agenzia delle Entrate / SDI) and the W3C
// XML Signature schema it imports into .cache/fatturapa-xsd, for the XSD validation tests.
// The schemas are fetched from their publishers instead of being copied into this repository.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, '.cache', 'fatturapa-xsd')

const SOURCES = {
  fatturapa: 'https://www.fatturapa.gov.it/export/documenti/fatturapa/v1.5/Schema_VFPR12_v1.2.4.xsd',
  xmldsig: 'https://www.w3.org/TR/2002/REC-xmldsig-core-20020212/xmldsig-core-schema.xsd',
}

async function download(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'fattura-facile-xsd-fetch' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // Strip the UTF-8 BOM some published files start with.
      return (await res.text()).replace(/^﻿/, '')
    } catch (err) {
      if (attempt === 3) throw new Error(`Download failed for ${url}: ${err.message}`)
      await new Promise((r) => setTimeout(r, attempt * 2000))
    }
  }
}

await mkdir(outDir, { recursive: true })
const fatturapa = await download(SOURCES.fatturapa)
const xmldsig = await download(SOURCES.xmldsig)
if (!fatturapa.includes('FatturaElettronicaType')) throw new Error('Unexpected FatturaPA schema content')
// Point the import at the local copy so validation works offline.
const localised = fatturapa.replace(/schemaLocation="http:\/\/www\.w3\.org\/TR\/2002\/REC-xmldsig-core-20020212\/xmldsig-core-schema\.xsd"/, 'schemaLocation="xmldsig-core-schema.xsd"')
await writeFile(join(outDir, 'Schema_VFPR12.xsd'), localised, 'utf8')
await writeFile(join(outDir, 'xmldsig-core-schema.xsd'), xmldsig, 'utf8')
await writeFile(join(outDir, 'SOURCES.json'), JSON.stringify({ ...SOURCES, fetchedAt: new Date().toISOString() }, null, 2))
console.log(`FatturaPA schema saved to ${outDir}`)
