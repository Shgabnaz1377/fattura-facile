<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import MoneyInput from './MoneyInput.vue'
import { useFormat } from '@/composables/useFormat'
import { lineAmount } from '@/domain/money'
import { NATURE, VAT_RATES, type InvoiceLine, type TaxRegime } from '@/domain/types'

const props = defineProps<{ regime: TaxRegime; showRitenuta: boolean; invalidLines: ReadonlySet<number> }>()
const lines = defineModel<InvoiceLine[]>({ required: true })
const emit = defineEmits<{ add: [] }>()
const { t } = useI18n()
const fmt = useFormat()

function amount(line: InvoiceLine): string {
  try {
    return fmt.euro(lineAmount(line.unitPriceCents, line.quantity))
  } catch {
    return '—'
  }
}

function onRateChange(line: InvoiceLine): void {
  if (line.vatRate !== 0) line.natura = null
}

function remove(index: number): void {
  lines.value.splice(index, 1)
}

function move(index: number, delta: number): void {
  const target = index + delta
  if (target < 0 || target >= lines.value.length) return
  const [item] = lines.value.splice(index, 1)
  if (item) lines.value.splice(target, 0, item)
}

const ordinario = () => props.regime === 'ordinario'
</script>

<template>
  <div class="lines">
    <div v-for="(line, i) in lines" :key="line.id" class="line card" :class="{ invalid: invalidLines.has(i + 1) }">
      <div class="line-head">
        <strong>{{ t('lines.line', { n: i + 1 }) }}</strong>
        <div class="line-actions">
          <button type="button" class="btn small" :disabled="i === 0" :aria-label="t('lines.moveUp', { n: i + 1 })" @click="move(i, -1)">↑</button>
          <button type="button" class="btn small" :disabled="i === lines.length - 1" :aria-label="t('lines.moveDown', { n: i + 1 })" @click="move(i, 1)">↓</button>
          <button type="button" class="btn small danger" :disabled="lines.length === 1" @click="remove(i)">{{ t('lines.remove') }}</button>
        </div>
      </div>
      <div class="line-grid">
        <label class="field desc">
          <span>{{ t('lines.description') }}</span>
          <textarea v-model="line.description" rows="2" :aria-invalid="invalidLines.has(i + 1) && !line.description.trim() ? 'true' : undefined"></textarea>
        </label>
        <label class="field">
          <span>{{ t('lines.quantity') }}</span>
          <input v-model.number="line.quantity" type="number" min="0" step="0.01" inputmode="decimal" />
        </label>
        <label class="field">
          <span>{{ t('lines.unit') }}</span>
          <input v-model="line.unit" type="text" maxlength="10" :placeholder="t('lines.unitPlaceholder')" />
        </label>
        <label class="field">
          <span>{{ t('lines.unitPrice') }}</span>
          <MoneyInput v-model="line.unitPriceCents" :label="t('lines.unitPrice')" />
        </label>
        <template v-if="ordinario()">
          <label class="field">
            <span>{{ t('lines.vatRate') }}</span>
            <select v-model.number="line.vatRate" @change="onRateChange(line)">
              <option v-for="r in VAT_RATES" :key="r" :value="r">{{ r }}%</option>
            </select>
          </label>
          <label v-if="line.vatRate === 0" class="field">
            <span>{{ t('lines.natura') }}</span>
            <select v-model="line.natura" :aria-invalid="!line.natura ? 'true' : undefined">
              <option :value="null" disabled>{{ t('lines.chooseNatura') }}</option>
              <option v-for="n in NATURE" :key="n" :value="n">{{ n }} — {{ t(`natura.${n.replace('.', '_')}`) }}</option>
            </select>
          </label>
        </template>
        <label v-if="showRitenuta" class="check">
          <input v-model="line.ritenuta" type="checkbox" /> {{ t('lines.subjectToRitenuta') }}
        </label>
        <p class="field amount">
          <span class="field-label">{{ t('lines.amount') }}</span>
          <strong>{{ amount(line) }}</strong>
        </p>
      </div>
    </div>
    <button type="button" class="btn" @click="emit('add')">+ {{ t('lines.add') }}</button>
  </div>
</template>

<style scoped>
.lines {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.line {
  padding: 14px 16px;
}

.card + .card {
  margin-top: 0;
}

.line.invalid {
  border-color: var(--danger);
}

.line-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.line-actions {
  display: flex;
  gap: 6px;
}

.line-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px 14px;
  align-items: end;
}

.desc {
  grid-column: 1 / -1;
}

.amount {
  margin: 0;
  text-align: right;
}

.amount strong {
  font-variant-numeric: tabular-nums;
  padding: 8px 0;
}
</style>
