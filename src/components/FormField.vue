<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    label: string
    error?: string | null
    type?: string
    hint?: string
    required?: boolean
    wide?: boolean
    autocomplete?: string
    inputmode?: 'text' | 'numeric' | 'decimal' | 'email' | 'tel'
    maxlength?: number
    uppercase?: boolean
  }>(),
  { error: null, type: 'text', hint: '', required: false, wide: false, autocomplete: 'off', inputmode: undefined, maxlength: undefined, uppercase: false },
)

const model = defineModel<string | number>({ required: true })
const { t } = useI18n()
const id = useId()
const messageId = computed(() => `${id}-msg`)
const describedBy = computed(() => (props.error || props.hint ? messageId.value : undefined))

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement
  if (props.type === 'number') {
    model.value = target.value === '' ? 0 : Number(target.value)
  } else {
    model.value = props.uppercase ? target.value.toUpperCase() : target.value
  }
}
</script>

<template>
  <label class="field" :class="{ wide }" :for="id">
    <span>{{ label }}<span v-if="required" aria-hidden="true"> *</span></span>
    <input
      :id="id"
      :type="type"
      :value="model"
      :required="required"
      :autocomplete="autocomplete"
      :inputmode="inputmode"
      :maxlength="maxlength"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      :step="type === 'number' ? 'any' : undefined"
      @input="onInput"
    />
    <small v-if="error" :id="messageId" class="error-text">{{ t(`errors.${error}`) }}</small>
    <small v-else-if="hint" :id="messageId" class="muted">{{ hint }}</small>
  </label>
</template>
