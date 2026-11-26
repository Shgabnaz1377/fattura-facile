// Captures the README screenshots from a running build of the app (default: `npm run preview`).
// Usage: node scripts/capture-screenshots.mjs [baseUrl]
// Set PW_CHANNEL=chrome to use an installed Chrome instead of Playwright's bundled Chromium.
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const base = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '')
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots')
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined })
const errors = []

async function session({ locale = 'it', scheme = 'light', width = 1280, height = 860 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor: 1 })
  await context.addInitScript((l) => localStorage.setItem('ff-locale', l), locale)
  const page = await context.newPage()
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/#/`)
  await page.getByRole('button', { name: /Carica dati demo|Load demo data/ }).click()
  await page.locator('.tiles').waitFor()
  return { context, page }
}

async function shot(page, route, file, { fullPage = false, prepare } = {}) {
  await page.goto(`${base}/#${route}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)
  if (prepare) await prepare(page)
  await page.screenshot({ path: join(outDir, file), fullPage })
  console.log(`saved ${file}`)
}

{
  const { context, page } = await session()
  await shot(page, '/', 'dashboard.png', { prepare: (p) => p.locator('rect.hit').nth(3).hover() })
  await shot(page, '/invoices/demo-invoice-draft', 'invoice-editor.png', { fullPage: true })
  await shot(page, '/invoices/demo-invoice-10-6', 'invoice-issued.png')
  await context.close()
}
{
  const { context, page } = await session({ locale: 'en', scheme: 'dark' })
  await shot(page, '/', 'dashboard-dark-en.png')
  await context.close()
}
{
  const { context, page } = await session({ width: 390, height: 844 })
  await shot(page, '/', 'dashboard-mobile.png', { fullPage: true })
  await context.close()
}

await browser.close()
if (errors.length) {
  console.error('Console errors while capturing:\n' + errors.join('\n'))
  process.exit(1)
}
