import Dexie, { type EntityTable } from 'dexie'
import type { Client, Invoice } from '@/domain/types'

/** Key/value record for singletons: the business profile, INPS parameters, per-year inputs. */
export interface SettingRecord {
  key: string
  value: unknown
}

export const SETTING_KEYS = {
  profile: 'profile',
  inps: 'inps',
  contributionsPaid: (year: number) => `contributions-paid-${year}`,
} as const

export class FatturaDatabase extends Dexie {
  settings!: EntityTable<SettingRecord, 'key'>
  clients!: EntityTable<Client, 'id'>
  invoices!: EntityTable<Invoice, 'id'>

  constructor(name = 'fattura-facile') {
    super(name)
    this.version(1).stores({
      settings: 'key',
      clients: 'id, denominazione, cognome',
      invoices: 'id, year, [year+number], clientId, status, date',
    })
  }
}

export const db = new FatturaDatabase()

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const record = await db.settings.get(key)
  return record?.value as T | undefined
}

export async function putSetting(key: string, value: unknown): Promise<void> {
  // Store plain data: Vue reactive proxies cannot be structured-cloned into IndexedDB.
  await db.settings.put({ key, value: JSON.parse(JSON.stringify(value)) })
}

/** Deep copy into a plain object so reactive state can be persisted. */
export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
