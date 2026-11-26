<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import MoneyInput from '@/components/MoneyInput.vue'
import MonthlyChart from '@/components/MonthlyChart.vue'
import { useFormat } from '@/composables/useFormat'
import { getSetting, putSetting, SETTING_KEYS } from '@/db/database'
import { availableYears, yearStats } from '@/domain/dashboard'
import { todayIso } from '@/domain/factories'
import { coefficientFor } from '@/domain/tax/coefficients'
import { estimateForfettario, startupRateApplies } from '@/domain/tax/forfettario'
import { useDemoData } from '@/composables/useDemoData'
import { useClientsStore } from '@/stores/clients'
import { useInvoicesStore } from '@/stores/invoices'
import { useProfileStore } from '@/stores/profile'

const { t } = useI18n()
const fmt = useFormat()
const invoices = useInvoicesStore()
const clients = useClientsStore()
const profileStore = useProfileStore()
const { loadDemo, loading: demoLoading } = useDemoData()

const today = todayIso()
const years = computed(() => availableYears(invoices.invoices, Number(today.slice(0, 4))))
const year = ref(years.value[0] as number)
const stats = computed(() => yearStats(invoices.invoices, year.value, today))
const profile = computed(() => profileStore.profile)
const forfettario = computed(() => profile.value.regime === 'forfettario')
const isEmpty = computed(() => invoices.invoices.length === 0 && clients.clients.length === 0)

// Contributions paid in the selected year, saved per year.
const contributionsCents = ref(0)
// Reload when the year changes or the data is replaced (demo load, backup restore).
watch(
  () => [year.value, invoices.invoices] as const,
  async ([y]) => {
    contributionsCents.value = (await getSetting<number>(SETTING_KEYS.contributionsPaid(y))) ?? 0
  },
  { immediate: true },
)
let saveTimer: ReturnType<typeof setTimeout> | undefined
watch(contributionsCents, (cents) => {
  clearTimeout(saveTimer)
  const y = year.value
  saveTimer = setTimeout(() => void putSetting(SETTING_KEYS.contributionsPaid(y), cents), 400)
})

const coefficient = computed(() => {
  try {
    return coefficientFor(profile.value.coefficientGroup, profile.value.customCoefficient)
  } catch {
    return null
  }
})
const startup = computed(() => startupRateApplies(profile.value.startupRate, profile.value.activityStartYear, year.value))
const estimate = computed(() =>
  coefficient.value === null
    ? null
    : estimateForfettario({
        collectedCents: stats.value.collectedCents,
        coefficient: coefficient.value,
        contributionsPaidCents: contributionsCents.value,
        startupRate: startup.value,
        inpsScheme: profile.value.inpsScheme,
        inpsParams: profileStore.inps,
        inpsReduction35: profile.value.inpsReduction35,
      }),
)
const ceilingTone = computed(() => {
  const c = estimate.value?.ceiling
  if (!c) return ''
  if (c.exceeded) return 'danger'
  return c.percent >= 80 ? 'warning' : 'ok'
})
</script>

<template>
  <section class="page">
    <div class="page-header">
      <h1>{{ t('dashboard.title') }}</h1>
      <label v-if="!isEmpty" class="field inline">
        <span>{{ t('invoices.year') }}</span>
        <select v-model.number="year">
          <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
        </select>
      </label>
    </div>

    <div v-if="isEmpty" class="card welcome">
      <h2>{{ t('home.title') }}</h2>
      <p class="lead">{{ t('home.intro') }}</p>
      <div class="toolbar">
        <button type="button" class="btn primary" :disabled="demoLoading" @click="loadDemo">{{ t('data.loadDemo') }}</button>
        <RouterLink class="btn" to="/profile">{{ t('dashboard.startWithProfile') }}</RouterLink>
      </div>
      <p class="muted small">{{ t('data.demoHint') }}</p>
    </div>

    <template v-else>
      <div class="tiles">
        <div class="card tile">
          <span class="tile-label">{{ t('dashboard.invoiced', { year }) }}</span>
          <strong class="tile-value">{{ fmt.euro(stats.invoicedCents) }}</strong>
          <span class="muted">{{ t('dashboard.invoiceCount', { n: stats.invoiceCount }) }}</span>
        </div>
        <div class="card tile">
          <span class="tile-label">{{ t('dashboard.collected', { year }) }}</span>
          <strong class="tile-value">{{ fmt.euro(stats.collectedCents) }}</strong>
          <span class="muted">{{ t('dashboard.cashBasis') }}</span>
        </div>
        <div class="card tile">
          <span class="tile-label">{{ t('dashboard.outstanding') }}</span>
          <strong class="tile-value">{{ fmt.euro(stats.outstandingCents) }}</strong>
          <RouterLink v-if="stats.overdueCount" to="/invoices" class="badge danger">
            {{ t('dashboard.overdue', { n: stats.overdueCount, amount: fmt.euro(stats.overdueCents) }) }}
          </RouterLink>
          <span v-else class="muted">{{ t('dashboard.noOverdue') }}</span>
        </div>
        <div v-if="!forfettario" class="card tile">
          <span class="tile-label">{{ t('dashboard.vat', { year }) }}</span>
          <strong class="tile-value">{{ fmt.euro(stats.vatCents) }}</strong>
          <span class="muted">{{ t('dashboard.vatHint') }}</span>
        </div>
      </div>

      <section v-if="forfettario && estimate" class="card ceiling" :aria-labelledby="'ceiling-title'">
        <div class="ceiling-head">
          <h2 id="ceiling-title">{{ t('dashboard.ceilingTitle') }}</h2>
          <strong>{{ estimate.ceiling.percent.toLocaleString() }}%</strong>
        </div>
        <div
          class="meter"
          :class="ceilingTone"
          role="meter"
          :aria-valuenow="Math.min(estimate.ceiling.percent, 100)"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="t('dashboard.ceilingTitle')"
        >
          <span :style="{ width: `${Math.min(estimate.ceiling.percent, 100)}%` }"></span>
        </div>
        <p class="muted">
          {{ t('dashboard.ceilingText', { used: fmt.euro(estimate.ceiling.usedCents), limit: fmt.euro(estimate.ceiling.limitCents), remaining: fmt.euro(estimate.ceiling.remainingCents) }) }}
        </p>
        <p v-if="estimate.ceiling.immediateExit" class="notice danger" role="alert">{{ t('dashboard.ceilingImmediateExit') }}</p>
        <p v-else-if="estimate.ceiling.exceeded" class="notice" role="alert">{{ t('dashboard.ceilingExceeded') }}</p>
        <p v-else-if="ceilingTone === 'warning'" class="notice">{{ t('dashboard.ceilingWarning') }}</p>
      </section>

      <div class="grid-2">
        <section class="card">
          <MonthlyChart :title="t('dashboard.chartTitle', { year })" :values-cents="stats.monthlyCollectedCents" :year="year" />
        </section>

        <section class="card estimate" aria-labelledby="estimate-title">
          <h2 id="estimate-title">{{ t('dashboard.estimateTitle', { year }) }}</h2>
          <p class="estimate-badge"><span class="badge warning">{{ t('dashboard.estimateBadge') }}</span></p>
          <template v-if="forfettario && estimate">
            <dl>
              <div><dt>{{ t('dashboard.collectedFees') }}</dt><dd>{{ fmt.euro(stats.collectedCents) }}</dd></div>
              <div><dt>{{ t('dashboard.coefficient') }}</dt><dd>{{ coefficient }}%</dd></div>
              <div><dt>{{ t('dashboard.grossIncome') }}</dt><dd>{{ fmt.euro(estimate.grossIncomeCents) }}</dd></div>
              <div class="input-row">
                <dt><label for="contributions">{{ t('dashboard.contributionsPaid') }}</label></dt>
                <dd><MoneyInput id="contributions" v-model="contributionsCents" :label="t('dashboard.contributionsPaid')" /></dd>
              </div>
              <div><dt>{{ t('dashboard.taxableIncome') }}</dt><dd>{{ fmt.euro(estimate.taxableIncomeCents) }}</dd></div>
              <div class="strong">
                <dt>{{ t('dashboard.substituteTax', { rate: estimate.substituteTaxRate }) }}</dt>
                <dd>{{ fmt.euro(estimate.substituteTaxCents) }}</dd>
              </div>
              <div class="strong">
                <dt>
                  {{ t('dashboard.inps', { scheme: t(`inpsSchemes.${estimate.inps.scheme}`) }) }}
                  <small v-if="estimate.inps.scheme === 'gestione_separata'" class="muted">
                    {{ t('dashboard.inpsGs', { rate: estimate.inps.rate, base: fmt.euro(estimate.inps.baseCents) }) }}
                  </small>
                  <small v-else-if="estimate.inps.scheme !== 'cassa_professionale'" class="muted">
                    {{ t('dashboard.inpsIvs', { fixed: fmt.euro(estimate.inps.fixedCents), variable: fmt.euro(estimate.inps.variableCents) }) }}
                  </small>
                </dt>
                <dd>{{ estimate.inps.scheme === 'cassa_professionale' ? '—' : fmt.euro(estimate.inps.totalCents) }}</dd>
              </div>
            </dl>
            <p class="muted small">{{ t('dashboard.estimateNotes', { year: profileStore.inps.referenceYear }) }}</p>
            <p v-if="estimate.inps.scheme === 'cassa_professionale'" class="muted small">{{ t('dashboard.cassaNotEstimated') }}</p>
          </template>
          <p v-else class="muted">{{ t('dashboard.ordinarioNoEstimate') }}</p>
          <p class="notice small" role="note">{{ t('home.disclaimer') }}</p>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped>
.field.inline {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.field.inline select {
  width: auto;
}

.welcome h2 {
  margin-top: 0;
}

.small {
  font-size: 0.875rem;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.tiles .card + .card,
.grid-2 .card + .card {
  margin-top: 0;
}

.tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tile-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
}

.tile-value {
  font-size: 1.6rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.tile .badge {
  align-self: flex-start;
  text-decoration: none;
}

.ceiling {
  margin-bottom: 16px;
}

.ceiling-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.ceiling h2 {
  font-size: 1rem;
  margin: 0 0 8px;
}

.meter {
  height: 12px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.meter span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--chart-1);
}

.meter.warning span {
  background: var(--warning);
}

.meter.danger span {
  background: var(--danger);
}

.notice.danger {
  background: var(--danger-soft);
  border-left-color: var(--danger);
}

.grid-2 {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 16px;
  align-items: start;
}

@media (max-width: 1000px) {
  .grid-2 {
    grid-template-columns: minmax(0, 1fr);
  }
}

.estimate h2 {
  font-size: 1rem;
  margin: 0;
}

.estimate-badge {
  margin: 6px 0 10px;
}

dl {
  margin: 0 0 10px;
}

dl > div {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 7px 0;
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

.input-row dd {
  max-width: 140px;
}

.strong {
  font-weight: 700;
}
</style>
