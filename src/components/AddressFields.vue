<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import FormField from './FormField.vue'
import type { Address } from '@/domain/types'
import type { FieldErrors } from '@/domain/entityValidation'

defineProps<{ errors: FieldErrors; prefix?: string }>()
const address = defineModel<Address>({ required: true })
const { t } = useI18n()
</script>

<template>
  <div class="form-grid">
    <FormField v-model="address.street" :label="t('fields.street')" :error="errors[`${prefix ?? 'address'}.street`]" required autocomplete="address-line1" />
    <FormField v-model="address.civic" :label="t('fields.civic')" :maxlength="8" />
    <FormField v-model="address.cap" :label="t('fields.cap')" :error="errors[`${prefix ?? 'address'}.cap`]" required inputmode="numeric" autocomplete="postal-code" :maxlength="10" />
    <FormField v-model="address.comune" :label="t('fields.comune')" :error="errors[`${prefix ?? 'address'}.comune`]" required autocomplete="address-level2" />
    <FormField v-model="address.provincia" :label="t('fields.provincia')" :error="errors[`${prefix ?? 'address'}.provincia`]" :required="address.nazione === 'IT'" :maxlength="2" uppercase />
    <FormField v-model="address.nazione" :label="t('fields.nazione')" :error="errors[`${prefix ?? 'address'}.nazione`]" required :maxlength="2" uppercase :hint="t('fields.nazioneHint')" />
  </div>
</template>
