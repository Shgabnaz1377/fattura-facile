<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AddressFields from '@/components/AddressFields.vue'
import FormField from '@/components/FormField.vue'
import { FOREIGN_SDI_CODE, isItalian, NO_SDI_CODE, validateClient, type FieldErrors } from '@/domain/entityValidation'
import { emptyClient } from '@/domain/factories'
import type { Client } from '@/domain/types'
import { normalizeId } from '@/domain/validators'
import { plain } from '@/db/database'
import { useClientsStore } from '@/stores/clients'

const props = defineProps<{ id?: string }>()
const { t } = useI18n()
const router = useRouter()
const store = useClientsStore()

const existing = props.id ? store.byId(props.id) : undefined
const notFound = props.id !== undefined && existing === undefined
const client = ref<Client>(existing ? plain(existing) : emptyClient())
const submitted = ref(false)
const errors = computed<FieldErrors>(() => (submitted.value ? validateClient(client.value) : {}))
const italian = computed(() => isItalian(client.value))

// Foreign clients have no SDI channel: FatturaPA uses the conventional XXXXXXX code.
watch(italian, (isIt) => {
  if (!isIt) client.value.codiceDestinatario = FOREIGN_SDI_CODE
  else if (client.value.codiceDestinatario === FOREIGN_SDI_CODE) client.value.codiceDestinatario = NO_SDI_CODE
})

async function submit(): Promise<void> {
  submitted.value = true
  if (Object.keys(validateClient(client.value)).length > 0) {
    document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }
  const c = client.value
  if (italian.value) {
    c.partitaIva = normalizeId(c.partitaIva).replace(/^IT/, '')
    c.codiceFiscale = normalizeId(c.codiceFiscale)
    c.codiceDestinatario = normalizeId(c.codiceDestinatario) || NO_SDI_CODE
  }
  if (!c.isCompany) c.denominazione = `${c.nome.trim()} ${c.cognome.trim()}`
  await store.save(c)
  await router.push('/clients')
}
</script>

<template>
  <section class="page">
    <div class="page-header">
      <h1>{{ id ? t('clients.edit') : t('clients.new') }}</h1>
    </div>
    <p v-if="notFound" class="notice" role="alert">{{ t('common.notFound') }}</p>
    <form v-else novalidate @submit.prevent="submit">
      <fieldset class="card">
        <legend>{{ t('clients.identity') }}</legend>
        <div class="segmented" role="radiogroup" :aria-label="t('clients.type')">
          <label class="check"><input v-model="client.isCompany" type="radio" :value="true" /> {{ t('clients.company') }}</label>
          <label class="check"><input v-model="client.isCompany" type="radio" :value="false" /> {{ t('clients.private') }}</label>
        </div>
        <div class="form-grid">
          <FormField v-if="client.isCompany" v-model="client.denominazione" :label="t('fields.denominazione')" :error="errors.denominazione" required wide />
          <template v-else>
            <FormField v-model="client.nome" :label="t('fields.nome')" :error="errors.nome" required />
            <FormField v-model="client.cognome" :label="t('fields.cognome')" :error="errors.cognome" required />
          </template>
          <FormField v-model="client.partitaIva" :label="italian ? t('fields.partitaIva') : t('fields.vatNumber')" :error="errors.partitaIva" :required="client.isCompany" uppercase :maxlength="20" />
          <FormField v-if="italian" v-model="client.codiceFiscale" :label="t('fields.codiceFiscale')" :error="errors.codiceFiscale" :required="!client.isCompany" uppercase :maxlength="16" />
        </div>
      </fieldset>

      <fieldset class="card">
        <legend>{{ t('fields.address') }}</legend>
        <AddressFields v-model="client.address" :errors="errors" />
      </fieldset>

      <fieldset class="card">
        <legend>{{ t('clients.delivery') }}</legend>
        <div class="form-grid">
          <FormField v-model="client.codiceDestinatario" :label="t('fields.codiceDestinatario')" :error="errors.codiceDestinatario" :hint="t('clients.sdiHint')" uppercase :maxlength="7" />
          <FormField v-model="client.pec" type="email" :label="t('fields.pec')" :error="errors.pec" />
          <FormField v-model="client.email" type="email" :label="t('fields.email')" :error="errors.email" autocomplete="email" />
        </div>
        <label class="field wide notes">
          <span>{{ t('fields.notes') }}</span>
          <textarea v-model="client.notes" rows="3"></textarea>
        </label>
      </fieldset>

      <div class="toolbar actions">
        <button class="btn primary" type="submit">{{ t('common.save') }}</button>
        <RouterLink class="btn" to="/clients">{{ t('common.cancel') }}</RouterLink>
        <span v-if="submitted && Object.keys(errors).length" class="error-text" role="alert">{{ t('common.fixErrors') }}</span>
      </div>
    </form>
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
  gap: 18px;
  margin-bottom: 14px;
}

.notes {
  margin-top: 14px;
}

.actions {
  margin-top: 8px;
}
</style>
