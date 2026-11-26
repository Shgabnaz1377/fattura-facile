/**
 * Coefficienti di redditività for the regime forfettario (Allegato n. 4, L. 190/2014,
 * as replaced by L. 145/2018). The ATECO ranges are the ones listed in the law, which
 * refer to the ATECO 2007 classification; with ATECO 2025 some codes moved, so the user
 * chooses the group by description and can always enter a custom coefficient.
 */
export interface CoefficientGroup {
  id: string
  /** i18n key suffix under tax.groups. */
  labelKey: string
  atecoRanges: string
  coefficient: number
}

export const COEFFICIENT_GROUPS: readonly CoefficientGroup[] = [
  { id: 'food', labelKey: 'food', atecoRanges: '10, 11', coefficient: 40 },
  { id: 'retail', labelKey: 'retail', atecoRanges: '45, 46.2–46.9, 47.1–47.7, 47.9', coefficient: 40 },
  { id: 'street_food', labelKey: 'streetFood', atecoRanges: '47.81', coefficient: 40 },
  { id: 'street_other', labelKey: 'streetOther', atecoRanges: '47.82–47.89', coefficient: 54 },
  { id: 'construction', labelKey: 'construction', atecoRanges: '41, 42, 43, 68', coefficient: 86 },
  { id: 'agents', labelKey: 'agents', atecoRanges: '46.1', coefficient: 62 },
  { id: 'hospitality', labelKey: 'hospitality', atecoRanges: '55, 56', coefficient: 40 },
  {
    id: 'professional',
    labelKey: 'professional',
    atecoRanges: '64, 65, 66, 69, 70, 71, 72, 73, 74, 75, 85, 86, 87, 88',
    coefficient: 78,
  },
  { id: 'other', labelKey: 'other', atecoRanges: '—', coefficient: 67 },
]

export const CUSTOM_COEFFICIENT_GROUP = 'custom'

export function coefficientFor(groupId: string, customCoefficient: number): number {
  if (groupId === CUSTOM_COEFFICIENT_GROUP) {
    if (!(customCoefficient > 0 && customCoefficient <= 100)) throw new Error('Custom coefficient must be in (0, 100]')
    return customCoefficient
  }
  const group = COEFFICIENT_GROUPS.find((g) => g.id === groupId)
  if (!group) throw new Error(`Unknown coefficient group: ${groupId}`)
  return group.coefficient
}

/**
 * Suggests a group from an ATECO 2007 code by matching the ranges above. Returns 'other'
 * when nothing matches, which is the residual category in the law.
 */
export function suggestGroupForAteco(atecoCode: string): string {
  const code = atecoCode.trim()
  if (!/^\d{2}(\.\d{1,2}){0,2}$/.test(code)) return 'other'
  const division = Number(code.slice(0, 2))
  const group3 = code.length >= 4 ? code.slice(0, 4) : ''
  const group4 = code.length >= 5 ? code.slice(0, 5) : ''

  if (division === 10 || division === 11) return 'food'
  if ([41, 42, 43, 68].includes(division)) return 'construction'
  if (division === 55 || division === 56) return 'hospitality'
  if ([64, 65, 66, 69, 70, 71, 72, 73, 74, 75, 85, 86, 87, 88].includes(division)) return 'professional'
  if (division === 45) return 'retail'
  if (division === 46) {
    if (group3 === '46.1') return 'agents'
    if (group3 !== '') return 'retail'
    return 'other'
  }
  if (division === 47) {
    if (group4 === '47.81') return 'street_food'
    if (/^47\.8[2-9]$/.test(group4)) return 'street_other'
    if (/^47\.[1-79]$/.test(group3)) return 'retail'
  }
  return 'other'
}
