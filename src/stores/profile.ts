import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getSetting, putSetting, SETTING_KEYS } from '@/db/database'
import { defaultProfile } from '@/domain/factories'
import { DEFAULT_INPS_PARAMETERS, type InpsParameters } from '@/domain/tax/rules'
import type { BusinessProfile } from '@/domain/types'
import { validatePartitaIva } from '@/domain/validators'

/** Fills fields missing from records saved by older versions with today's defaults. */
export function mergeProfile(stored: Partial<BusinessProfile> | undefined): BusinessProfile {
  const base = defaultProfile()
  if (!stored) return base
  return {
    ...base,
    ...stored,
    address: { ...base.address, ...stored.address },
    defaults: { ...base.defaults, ...stored.defaults },
  }
}

export const useProfileStore = defineStore('profile', () => {
  const profile = ref<BusinessProfile>(defaultProfile())
  const inps = ref<InpsParameters>({ ...DEFAULT_INPS_PARAMETERS })
  const loaded = ref(false)

  /** The profile is usable for invoicing once the tax identity is filled in. */
  const isConfigured = computed(() => validatePartitaIva(profile.value.partitaIva).valid)

  async function load(): Promise<void> {
    profile.value = mergeProfile(await getSetting<Partial<BusinessProfile>>(SETTING_KEYS.profile))
    inps.value = { ...DEFAULT_INPS_PARAMETERS, ...(await getSetting<Partial<InpsParameters>>(SETTING_KEYS.inps)) }
    loaded.value = true
  }

  async function save(next: BusinessProfile): Promise<void> {
    await putSetting(SETTING_KEYS.profile, next)
    profile.value = mergeProfile(next)
  }

  async function saveInps(next: InpsParameters): Promise<void> {
    await putSetting(SETTING_KEYS.inps, next)
    inps.value = { ...next }
  }

  return { profile, inps, loaded, isConfigured, load, save, saveInps }
})
