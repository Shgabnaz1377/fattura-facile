<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import StatusBadge from '@/components/StatusBadge.vue'
import { useFormat } from '@/composables/useFormat'
import { clientDisplayName } from '@/domain/entityValidation'
import { displayStatus, invoiceLabel, invoiceTotals, type DisplayStatus } from '@/domain/invoices'
import { sumCents } from '@/domain/money'
import { useClientsStore } from '@/stores/clients'
import { useInvoicesStore } from '@/stores/invoices'
import { useProfileStore } from '@/stores/profile'

const { t } = useI18n()
const fmt = useFormat()
const invoices = useInvoicesStore()
const clients = useClientsStore()
const profileStore = useProfileStore()

const year = ref<number | 'all'>(invoices.years[0] ?? 'all')
const status = ref<DisplayStatus | 'all'>('all')
const statuses: DisplayStatus[] = ['draft', 'issued', 'overdue', 'paid', 'cancelled']

const rows = computed(() =>
  invoices.sorted
    .filter((inv) => year.value === 'all' || inv.year === year.value)
    .map((inv) => ({
      inv,
      status: displayStatus(inv),
      totals: invoiceTotals(inv),
      label: invoiceLabel(inv, inv.snapshot?.profile ?? profileStore.profile),
      client: inv.snapshot?.client ?? clients.byId(inv.clientId),
    }))
    .filter((r) => status.value === 'all' || r.status === status.value),
)

const totalShown = computed(() =>
  sumCents(rows.value.filter((r) => r.status !== 'cancelled' && r.status !== 'draft').map((r) => r.totals.totalCents)),
)
const canCreate = computed(() => profileStore.isConfigured && clients.clients.length > 0)
</script>

<template>
  <section class="page">
    <div class="page-header">
      <h1>{{ t('invoices.title') }}</h1>
      <RouterLink v-if="canCreate" class="btn primary" to="/invoices/new">{{ t('invoices.new') }}</RouterLink>
    </div>
    <p v-if="!profileStore.isConfigured" class="notice">
      {{ t('invoices.needProfile') }} <RouterLink to="/profile">{{ t('nav.profile') }}</RouterLink>
    </p>
    <p v-else-if="clients.clients.length === 0" class="notice">
      {{ t('invoices.needClient') }} <RouterLink to="/clients/new">{{ t('clients.new') }}</RouterLink>
    </p>

    <div class="toolbar">
      <label class="field inline">
        <span>{{ t('invoices.year') }}</span>
        <select v-model="year">
          <option value="all">{{ t('invoices.allYears') }}</option>
          <option v-for="y in invoices.years" :key="y" :value="y">{{ y }}</option>
        </select>
      </label>
      <label class="field inline">
        <span>{{ t('invoices.status') }}</span>
        <select v-model="status">
          <option value="all">{{ t('invoices.allStatuses') }}</option>
          <option v-for="s in statuses" :key="s" :value="s">{{ t(`status.${s}`) }}</option>
        </select>
      </label>
    </div>

    <div v-if="invoices.invoices.length === 0" class="card empty">{{ t('invoices.empty') }}</div>
    <div v-else class="table-wrap">
      <table>
        <caption class="visually-hidden">{{ t('invoices.title') }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ t('invoices.number') }}</th>
            <th scope="col">{{ t('invoices.date') }}</th>
            <th scope="col">{{ t('invoices.client') }}</th>
            <th scope="col" class="num">{{ t('invoices.total') }}</th>
            <th scope="col">{{ t('invoices.status') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.inv.id">
            <td>
              <RouterLink :to="`/invoices/${row.inv.id}`">{{ row.label ?? t('invoices.draft') }}</RouterLink>
            </td>
            <td>{{ fmt.date(row.inv.date) }}</td>
            <td>{{ row.client ? clientDisplayName(row.client) : '—' }}</td>
            <td class="num">{{ fmt.euro(row.totals.totalCents) }}</td>
            <td>
              <StatusBadge :status="row.status" />
              <small v-if="row.status === 'paid'" class="muted"> {{ fmt.date(row.inv.paidDate) }}</small>
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="5" class="empty">{{ t('common.noResults') }}</td>
          </tr>
        </tbody>
        <tfoot v-if="rows.length">
          <tr>
            <th scope="row" colspan="3">{{ t('invoices.totalIssued') }}</th>
            <td class="num"><strong>{{ fmt.euro(totalShown) }}</strong></td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
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

tfoot th {
  text-align: right;
}
</style>
