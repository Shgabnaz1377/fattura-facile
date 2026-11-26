import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildDemoData } from '@/domain/demo'
import { db, getSetting, SETTING_KEYS } from './database'
import { BackupError, clearAll, exportBackup, loadDemo, parseBackup, restoreBackup } from './backup'

beforeEach(clearAll)

describe('backup', () => {
  it('round-trips everything through JSON', async () => {
    await loadDemo(buildDemoData('2026-11-26'))
    const backup = await exportBackup(new Date('2026-11-26T10:00:00Z'))
    const json = JSON.stringify(backup)
    await clearAll()
    expect(await db.invoices.count()).toBe(0)

    await restoreBackup(parseBackup(json))
    expect(await db.clients.count()).toBe(4)
    expect(await db.invoices.count()).toBe(backup.invoices.length)
    expect(await getSetting<number>(SETTING_KEYS.contributionsPaid(2026))).toBe(3_200_00)
    expect((await getSetting<{ partitaIva: string }>(SETTING_KEYS.profile))?.partitaIva).toBe('01234567897')
  })

  it('replaces existing data instead of merging', async () => {
    await loadDemo(buildDemoData('2026-11-26'))
    const empty = { app: 'fattura-facile', version: 1, exportedAt: '', settings: [], clients: [], invoices: [] }
    await restoreBackup(parseBackup(JSON.stringify(empty)))
    expect(await db.clients.count()).toBe(0)
  })

  it.each([
    ['not json', 'notJson'],
    [JSON.stringify({ app: 'other' }), 'wrongApp'],
    [JSON.stringify({ app: 'fattura-facile', version: 99 }), 'newerVersion'],
    [JSON.stringify({ app: 'fattura-facile', version: 1, settings: [], clients: [{ id: 1 }], invoices: [] }), 'invalidShape'],
    [
      JSON.stringify({
        app: 'fattura-facile',
        version: 1,
        settings: [],
        clients: [],
        invoices: [{ id: 'x', date: '2026-01-01', clientId: 'missing', lines: [], number: 1, status: 'issued' }],
      }),
      'invalidShape',
    ],
  ])('rejects %s', (text, code) => {
    expect(() => parseBackup(text)).toThrow(BackupError)
    try {
      parseBackup(text)
    } catch (err) {
      expect((err as BackupError).code).toBe(code)
    }
  })
})
