<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/useFormat'
import type { InvoiceTotals } from '@/domain/tax/invoiceTotals'

const props = defineProps<{ totals: InvoiceTotals }>()
const { t } = useI18n()
// The row holding only the stamp duty passed on to the client is shown as its own line below.
const vatRows = computed(() => props.totals.vatSummary.filter((r) => r.linesCents > 0 || r.rivalsaCents > 0))
const fmt = useFormat()
</script>

<template>
  <section class="card totals" :aria-label="t('totals.title')">
    <h2>{{ t('totals.title') }}</h2>
    <dl>
      <div><dt>{{ t('totals.subtotal') }}</dt><dd>{{ fmt.euro(totals.subtotalCents) }}</dd></div>
      <div v-if="totals.rivalsaCents"><dt>{{ t('totals.rivalsa') }}</dt><dd>{{ fmt.euro(totals.rivalsaCents) }}</dd></div>
      <div v-for="row in vatRows" :key="`${row.vatRate}-${row.natura}`" class="vat-row">
        <dt>
          {{ row.natura ? t('totals.vatNatura', { natura: row.natura }) : t('totals.vatRate', { rate: row.vatRate }) }}
          <small class="muted">{{ t('totals.on', { amount: fmt.euro(row.taxableCents) }) }}</small>
        </dt>
        <dd>{{ fmt.euro(row.vatCents) }}</dd>
      </div>
      <div v-if="totals.bollo.applies">
        <dt>{{ totals.bollo.chargedToClient ? t('totals.bolloCharged') : t('totals.bolloAbsorbed') }}</dt>
        <dd>{{ fmt.euro(totals.bollo.amountCents) }}</dd>
      </div>
      <div class="grand"><dt>{{ t('totals.total') }}</dt><dd>{{ fmt.euro(totals.totalCents) }}</dd></div>
      <div v-if="totals.ritenuta.applies">
        <dt>{{ t('totals.ritenuta', { rate: totals.ritenuta.rate }) }}</dt>
        <dd>− {{ fmt.euro(totals.ritenuta.amountCents) }}</dd>
      </div>
      <div v-if="totals.ritenuta.applies" class="grand"><dt>{{ t('totals.netToPay') }}</dt><dd>{{ fmt.euro(totals.netToPayCents) }}</dd></div>
    </dl>
  </section>
</template>

<style scoped>
.totals h2 {
  font-size: 1rem;
}

dl {
  margin: 0;
}

dl > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--border);
}

dt small {
  display: block;
}

dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.grand {
  font-weight: 700;
  font-size: 1.05rem;
  border-bottom: 0;
}
</style>
