<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AddressFields from '@/components/AddressFields.vue'
import FormField from '@/components/FormField.vue'
import { plain } from '@/db/database'
import { validateProfile, type FieldErrors } from '@/domain/entityValidation'
import { fromCents, toCents } from '@/domain/money'
import { COEFFICIENT_GROUPS, CUSTOM_COEFFICIENT_GROUP, coefficientFor, suggestGroupForAteco } from '@/domain/tax/coefficients'
import { DEFAULT_INPS_PARAMETERS, type InpsParameters } from '@/domain/tax/rules'
import type { BusinessProfile, InpsScheme } from '@/domain/types'
import { normalizeId } from '@/domain/validators'
import { useProfileStore } from '@/stores/profile'

const { t } = useI18n()
const store = useProfileStore()

const profile = ref<BusinessProfile>(plain(store.profile))
const submitted = ref(false)
const saved = ref(false)
const errors = computed<FieldErrors>(() => (submitted.value ? validateProfile(profile.value) : {}))

const schemes: InpsScheme[] = ['gestione_separata', 'artigiani', 'commercianti', 'cassa_professionale']
const forfettario = computed(() => profile.value.regime === 'forfettario')
const ivsScheme = computed(() => profile.value.inpsScheme === 'artigiani' || profile.value.inpsScheme === 'commercianti')
const suggestedGroup = computed(() =>
  profile.value.atecoCode.trim() ? suggestGroupForAteco(profile.value.atecoCode) : null,
)
const effectiveCoefficient = computed(() => {
  try {
    return coefficientFor(profile.value.coefficientGroup, profile.value.customCoefficient)
  } catch {
    return null
  }
})

// INPS parameters are edited in euros and stored in cents.
type InpsForm = Record<keyof InpsParameters, number>
const centsKeys: readonly (keyof InpsParameters)[] = [
  'gestioneSeparataMassimaleCents',
  'minimaleCents',
  'artigianiFixedCents',
  'commerciantiFixedCents',
  'ivsMassimaleCents',
]
function toInpsForm(p: InpsParameters): InpsForm {
  const form: InpsForm = { ...p }
  for (const k of centsKeys) form[k] = fromCents(p[k])
  return form
}
const inpsForm = ref<InpsForm>(toInpsForm(store.inps))
const inpsSaved = ref(false)

function resetInps(): void {
  inpsForm.value = toInpsForm(DEFAULT_INPS_PARAMETERS)
}

async function saveInps(): Promise<void> {
  const next: InpsForm = { ...inpsForm.value }
  for (const k of centsKeys) next[k] = toCents(next[k])
  await store.saveInps(next)
  inpsSaved.value = true
}

async function submit(): Promise<void> {
  submitted.value = true
  saved.value = false
  if (Object.keys(validateProfile(profile.value)).length > 0) {
    document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }
  const p = profile.value
  p.partitaIva = normalizeId(p.partitaIva).replace(/^IT/, '')
  p.codiceFiscale = normalizeId(p.codiceFiscale)
  p.iban = normalizeId(p.iban)
  if (p.regime === 'forfettario') p.defaults.applyRitenuta = false
  await store.save(p)
  saved.value = true
}
</script>

<template>
  <section class="page">
    <div class="page-header">
      <h1>{{ t('profile.title') }}</h1>
    </div>
    <p class="lead">{{ t('profile.intro') }}</p>

    <form novalidate @submit.prevent="submit">
      <fieldset class="card">
        <legend>{{ t('profile.identity') }}</legend>
        <div class="form-grid">
          <FormField v-model="profile.denominazione" :label="t('fields.denominazione')" :error="errors.denominazione" :hint="t('profile.denominazioneHint')" wide />
          <FormField v-model="profile.nome" :label="t('fields.nome')" :error="errors.nome" autocomplete="given-name" />
          <FormField v-model="profile.cognome" :label="t('fields.cognome')" :error="errors.cognome" autocomplete="family-name" />
          <FormField v-model="profile.partitaIva" :label="t('fields.partitaIva')" :error="errors.partitaIva" required inputmode="numeric" :maxlength="13" uppercase />
          <FormField v-model="profile.codiceFiscale" :label="t('fields.codiceFiscale')" :error="errors.codiceFiscale" required :maxlength="16" uppercase />
        </div>
      </fieldset>

      <fieldset class="card">
        <legend>{{ t('profile.seat') }}</legend>
        <AddressFields v-model="profile.address" :errors="errors" />
      </fieldset>

      <fieldset class="card">
        <legend>{{ t('profile.contacts') }}</legend>
        <div class="form-grid">
          <FormField v-model="profile.email" type="email" :label="t('fields.email')" :error="errors.email" autocomplete="email" />
          <FormField v-model="profile.pec" type="email" :label="t('fields.pec')" :error="errors.pec" />
          <FormField v-model="profile.phone" type="tel" :label="t('fields.phone')" autocomplete="tel" />
          <FormField v-model="profile.iban" :label="t('fields.iban')" :error="errors.iban" uppercase :maxlength="34" />
          <FormField v-model="profile.bankName" :label="t('fields.bankName')" />
        </div>
      </fieldset>

      <fieldset class="card">
        <legend>{{ t('profile.taxRegime') }}</legend>
        <div class="segmented" role="radiogroup" :aria-label="t('profile.taxRegime')">
          <label class="check"><input v-model="profile.regime" type="radio" value="forfettario" /> {{ t('regime.forfettario') }}</label>
          <label class="check"><input v-model="profile.regime" type="radio" value="ordinario" /> {{ t('regime.ordinario') }}</label>
        </div>
        <div v-if="forfettario" class="form-grid">
          <FormField v-model="profile.atecoCode" :label="t('fields.atecoCode')" :hint="t('profile.atecoHint')" :maxlength="8" />
          <label class="field wide">
            <span>{{ t('fields.coefficientGroup') }}</span>
            <select v-model="profile.coefficientGroup">
              <option v-for="g in COEFFICIENT_GROUPS" :key="g.id" :value="g.id">
                {{ t(`coefficientGroups.${g.labelKey}`) }} — {{ g.coefficient }}%
              </option>
              <option :value="CUSTOM_COEFFICIENT_GROUP">{{ t('coefficientGroups.custom') }}</option>
            </select>
            <small v-if="suggestedGroup && suggestedGroup !== profile.coefficientGroup" class="muted">
              {{ t('profile.suggestedGroup', { group: t(`coefficientGroups.${COEFFICIENT_GROUPS.find((g) => g.id === suggestedGroup)?.labelKey}`) }) }}
              <button type="button" class="btn small" @click="profile.coefficientGroup = suggestedGroup">{{ t('profile.useSuggestion') }}</button>
            </small>
          </label>
          <FormField v-if="profile.coefficientGroup === CUSTOM_COEFFICIENT_GROUP" v-model="profile.customCoefficient" type="number" :label="t('fields.customCoefficient')" :error="errors.customCoefficient" />
          <p class="field muted">{{ t('profile.effectiveCoefficient') }}: <strong>{{ effectiveCoefficient ?? '—' }}%</strong></p>
          <label class="check wide"><input v-model="profile.startupRate" type="checkbox" /> {{ t('profile.startupRate') }}</label>
          <FormField v-model="profile.activityStartYear" type="number" :label="t('fields.activityStartYear')" :error="errors.activityStartYear" inputmode="numeric" />
        </div>
        <div class="form-grid inps">
          <label class="field">
            <span>{{ t('fields.inpsScheme') }}</span>
            <select v-model="profile.inpsScheme">
              <option v-for="s in schemes" :key="s" :value="s">{{ t(`inpsSchemes.${s}`) }}</option>
            </select>
          </label>
          <label v-if="forfettario && ivsScheme" class="check"><input v-model="profile.inpsReduction35" type="checkbox" /> {{ t('profile.reduction35') }}</label>
        </div>
      </fieldset>

      <fieldset class="card">
        <legend>{{ t('profile.invoiceDefaults') }}</legend>
        <div class="form-grid">
          <label v-if="profile.inpsScheme === 'gestione_separata'" class="check wide"><input v-model="profile.defaults.applyRivalsaInps" type="checkbox" /> {{ t('profile.applyRivalsa') }}</label>
          <template v-if="!forfettario">
            <label class="check"><input v-model="profile.defaults.applyRitenuta" type="checkbox" /> {{ t('profile.applyRitenuta') }}</label>
            <FormField v-model="profile.defaults.ritenutaRate" type="number" :label="t('fields.ritenutaRate')" :error="errors['defaults.ritenutaRate']" />
          </template>
          <FormField v-model="profile.defaults.paymentTermsDays" type="number" :label="t('fields.paymentTermsDays')" :error="errors['defaults.paymentTermsDays']" inputmode="numeric" />
          <FormField v-model="profile.defaults.numberFormat" :label="t('fields.numberFormat')" :error="errors['defaults.numberFormat']" :hint="t('profile.numberFormatHint')" />
        </div>
      </fieldset>

      <div class="toolbar">
        <button class="btn primary" type="submit">{{ t('common.save') }}</button>
        <span v-if="saved" class="badge success" role="status">{{ t('common.saved') }}</span>
        <span v-if="submitted && Object.keys(errors).length" class="error-text" role="alert">{{ t('common.fixErrors') }}</span>
      </div>
    </form>

    <details class="card">
      <summary>{{ t('profile.inpsParams', { year: inpsForm.referenceYear }) }}</summary>
      <p class="muted">{{ t('profile.inpsParamsHint') }}</p>
      <form class="form-grid" novalidate @submit.prevent="saveInps">
        <FormField v-model="inpsForm.referenceYear" type="number" :label="t('inps.referenceYear')" />
        <FormField v-model="inpsForm.gestioneSeparataRate" type="number" :label="t('inps.gestioneSeparataRate')" />
        <FormField v-model="inpsForm.gestioneSeparataMassimaleCents" type="number" :label="t('inps.gestioneSeparataMassimale')" />
        <FormField v-model="inpsForm.minimaleCents" type="number" :label="t('inps.minimale')" />
        <FormField v-model="inpsForm.artigianiRate" type="number" :label="t('inps.artigianiRate')" />
        <FormField v-model="inpsForm.artigianiFixedCents" type="number" :label="t('inps.artigianiFixed')" />
        <FormField v-model="inpsForm.commerciantiRate" type="number" :label="t('inps.commerciantiRate')" />
        <FormField v-model="inpsForm.commerciantiFixedCents" type="number" :label="t('inps.commerciantiFixed')" />
        <FormField v-model="inpsForm.ivsMassimaleCents" type="number" :label="t('inps.ivsMassimale')" />
        <FormField v-model="inpsForm.forfettarioReductionPct" type="number" :label="t('inps.reductionPct')" />
        <div class="toolbar wide-row">
          <button class="btn primary" type="submit">{{ t('common.save') }}</button>
          <button class="btn" type="button" @click="resetInps">{{ t('profile.resetDefaults') }}</button>
          <span v-if="inpsSaved" class="badge success" role="status">{{ t('common.saved') }}</span>
        </div>
      </form>
    </details>
  </section>
</template>

<style scoped>
fieldset {
  margin: 0 0 16px;
  min-width: 0;
}

legend {
  font-weight: 700;
  padding: 0 6px;
}

.segmented {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin-bottom: 14px;
}

.check.wide,
.wide-row {
  grid-column: 1 / -1;
}

.inps {
  margin-top: 14px;
}

details summary {
  cursor: pointer;
  font-weight: 700;
}

details[open] summary {
  margin-bottom: 8px;
}

small .btn {
  margin-left: 6px;
}
</style>
