import { db, SETTING_KEYS, type SettingRecord } from './database'
import type { DemoData } from '@/domain/demo'
import type { Client, Invoice } from '@/domain/types'

export const BACKUP_APP = 'fattura-facile'
export const BACKUP_VERSION = 1

export interface Backup {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  settings: SettingRecord[]
  clients: Client[]
  invoices: Invoice[]
}

export class BackupError extends Error {
  constructor(public readonly code: 'notJson' | 'wrongApp' | 'newerVersion' | 'invalidShape') {
    super(`Invalid backup: ${code}`)
  }
}

export async function exportBackup(now = new Date()): Promise<Backup> {
  const [settings, clients, invoices] = await Promise.all([db.settings.toArray(), db.clients.toArray(), db.invoices.toArray()])
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), settings, clients, invoices }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string'

function looksLikeClient(v: unknown): v is Client {
  return isObject(v) && isString(v.id) && isString(v.denominazione) && isObject(v.address)
}

function looksLikeInvoice(v: unknown): v is Invoice {
  return (
    isObject(v) &&
    isString(v.id) &&
    isString(v.date) &&
    isString(v.clientId) &&
    Array.isArray(v.lines) &&
    (v.number === null || typeof v.number === 'number') &&
    ['draft', 'issued', 'paid', 'cancelled'].includes(v.status as string) &&
    v.lines.every((l) => isObject(l) && typeof l.quantity === 'number' && Number.isInteger(l.unitPriceCents))
  )
}

/** Parses and checks a backup file. Throws BackupError with a code the UI can translate. */
export function parseBackup(text: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupError('notJson')
  }
  if (!isObject(data) || data.app !== BACKUP_APP) throw new BackupError('wrongApp')
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) throw new BackupError('newerVersion')
  const { settings, clients, invoices } = data
  if (
    !Array.isArray(settings) ||
    !settings.every((s) => isObject(s) && isString(s.key)) ||
    !Array.isArray(clients) ||
    !clients.every(looksLikeClient) ||
    !Array.isArray(invoices) ||
    !invoices.every(looksLikeInvoice)
  ) {
    throw new BackupError('invalidShape')
  }
  const clientIds = new Set(clients.map((c) => c.id))
  if (!invoices.every((i) => clientIds.has(i.clientId) || i.status === 'draft')) throw new BackupError('invalidShape')
  return data as unknown as Backup
}

/** Replaces every local record with the backup content, atomically. */
export async function restoreBackup(backup: Backup): Promise<void> {
  await db.transaction('rw', db.settings, db.clients, db.invoices, async () => {
    await Promise.all([db.settings.clear(), db.clients.clear(), db.invoices.clear()])
    await db.settings.bulkPut(backup.settings)
    await db.clients.bulkPut(backup.clients)
    await db.invoices.bulkPut(backup.invoices)
  })
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.settings, db.clients, db.invoices, async () => {
    await Promise.all([db.settings.clear(), db.clients.clear(), db.invoices.clear()])
  })
}

export async function loadDemo(demo: DemoData): Promise<void> {
  const year = Number(demo.invoices[0]?.date.slice(0, 4) ?? new Date().getFullYear())
  await restoreBackup({
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: [
      { key: SETTING_KEYS.profile, value: demo.profile },
      { key: SETTING_KEYS.contributionsPaid(year), value: demo.contributionsPaidCents },
    ],
    clients: demo.clients,
    invoices: demo.invoices,
  })
}

export function backupFileName(now = new Date()): string {
  return `fattura-facile-backup-${now.toISOString().slice(0, 10)}.json`
}
