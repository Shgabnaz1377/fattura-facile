<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import ConfirmButton from '@/components/ConfirmButton.vue'
import InvoiceLinesEditor from '@/components/InvoiceLinesEditor.vue'
import InvoiceTotalsPanel from '@/components/InvoiceTotalsPanel.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { useFormat } from '@/composables/useFormat'
import { plain } from '@/db/database'
import { clientDisplayName } from '@/domain/entityValidation'
import { addDaysIso, todayIso } from '@/domain/factories'
import {
  displayStatus,
  duplicateInvoice,
  invoiceLabel,
  invoiceTotals,
  issueBlockers,
  newInvoice,
  newLine,
  type IssueBlocker,
} from '@/domain/invoices'
import { nextInvoiceNumber, yearOf } from '@/domain/numbering'
import { lineAmount } from '@/domain/money'
import type { Invoice } from '@/domain/types'
import { useClientsStore } from '@/stores/clients'
import { useInvoicesStore } from '@/stores/invoices'
import { useProfileStore } from '@/stores/profile'

const props = defineProps<{ id?: string }>()
const { t } = useI18n()
const fmt = useFormat()
const router = useRouter()
const store = useInvoicesStore()
const clients = useClientsStore()
const profileStore = useProfileStore()

const existing = props.id ? store.byId(props.id) : undefined
const notFound = props.id !== undefined && existing === undefined
const invoice = ref<Invoice>(existing ? plain(existing) : newInvoice(profileStore.profile, clients.sorted[0]?.id ?? ''))
const editable = computed(() => invoice.value.status === 'draft')
const profile = computed(() => invoice.value.snapshot?.profile ?? profileStore.profile)
const client = computed(() => invoice.value.snapshot?.client ?? clients.byId(invoice.value.clientId))
const totals = computed(() => {
  try {
    return invoiceTotals(invoice.value)
  } catch {
    return null
  }
})
const label = computed(() => invoiceLabel(invoice.value, profile.value))
const status = computed(() => displayStatus(invoice.value))
const forfettario = computed(() => invoice.value.regime === 'forfettario')
const canRivalsa = computed(() => profile.value.inpsScheme === 'gestione_separata')

const attempted = ref(false)
// A message can survive the redirect from /invoices/new to /invoices/:id through history state.
const flash = typeof window.history.state?.flash === 'string' ? (window.history.state.flash as string) : ''
const message = ref(flash)
const blockers = computed<IssueBlocker[]>(() => {
  const others = store.invoices.filter((i) => i.id !== invoice.value.id)
  let year: number
  try {
    year = yearOf(invoice.value.date)
  } catch {
    return [{ code: 'noLines' }]
  }
  return issueBlockers(invoice.value, nextInvoiceNumber(others, year), others, profileStore.isConfigured, client.value)
})
const invalidLines = computed(
  () => new Set(attempted.value ? blockers.value.flatMap((b) => ('line' in b ? [b.line] : [])) : []),
)

// Keep the due date aligned with the payment terms while the user changes the invoice date.
watch(
  () => invoice.value.date,
  (date, previous) => {
    if (!editable.value || !previous || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    if (invoice.value.dueDate === addDaysIso(previous, profile.value.defaults.paymentTermsDays)) {
      invoice.value.dueDate = addDaysIso(date, profile.value.defaults.paymentTermsDays)
    }
  },
)

function addLine(): void {
  invoice.value.lines.push(newLine(profile.value, invoice.value.applyRitenuta))
}

function blockerText(b: IssueBlocker): string {
  return t(`blockers.${b.code}`, b as Record<string, unknown>)
}

async function saveDraft(): Promise<void> {
  const saved = await store.save(invoice.value)
  message.value = t('invoices.draftSaved')
  if (!props.id) await router.replace({ path: `/invoices/${saved.id}`, state: { flash: message.value } })
}

async function issue(): Promise<void> {
  attempted.value = true
  message.value = ''
  if (blockers.value.length > 0 || !client.value) return
  const issued = await store.issue(invoice.value, profileStore.profile, client.value)
  invoice.value = plain(issued)
  message.value = t('invoices.issuedMessage', { label: label.value })
  if (!props.id) await router.replace({ path: `/invoices/${issued.id}`, state: { flash: message.value } })
}

const paidDate = ref(invoice.value.paidDate ?? todayIso())
async function markPaid(): Promise<void> {
  await store.markPaid(invoice.value.id, paidDate.value)
  invoice.value = plain(store.byId(invoice.value.id) as Invoice)
}
async function markUnpaid(): Promise<void> {
  await store.markUnpaid(invoice.value.id)
  invoice.value = plain(store.byId(invoice.value.id) as Invoice)
}
async function cancel(): Promise<void> {
  await store.cancel(invoice.value.id)
  invoice.value = plain(store.byId(invoice.value.id) as Invoice)
}
async function removeDraft(): Promise<void> {
  if (props.id) await store.removeDraft(invoice.value.id)
  await router.push('/invoices')
}
async function duplicate(): Promise<void> {
  const copy = await store.save(duplicateInvoice(invoice.value, profileStore.profile))
  await router.push(`/invoices/${copy.id}`)
}

function safeLineAmount(cents: number, qty: number): string {
  try {
    return fmt.euro(lineAmount(cents, qty))
  } catch {
    return '—'
  }
}
</script>

<template>
  <section class="page">
    <p v-if="notFound" class="notice" role="alert">{{ t('common.notFound') }}</p>
    <template v-else>
      <div class="page-header">
        <h1>
          {{ label ? t('invoices.invoiceN', { label }) : t('invoices.newDraft') }}
          <StatusBadge :status="status" />
        </h1>
        <RouterLink class="btn" to="/invoices">{{ t('invoices.backToList') }}</RouterLink>
      </div>
      <p v-if="message" class="notice ok" role="status">{{ message }}</p>

      <div class="layout">
        <div class="main-col">
          <!-- Draft: full editor -->
          <form v-if="editable" novalidate @submit.prevent="issue">
            <fieldset class="card">
              <legend>{{ t('invoices.header') }}</legend>
              <div class="form-grid">
                <label class="field">
                  <span>{{ t('invoices.client') }} *</span>
                  <select v-model="invoice.clientId" :aria-invalid="attempted && !client ? 'true' : undefined">
                    <option value="" disabled>{{ t('invoices.chooseClient') }}</option>
                    <option v-for="c in clients.sorted" :key="c.id" :value="c.id">{{ clientDisplayName(c) }}</option>
                  </select>
                </label>
                <label class="field">
                  <span>{{ t('invoices.date') }} *</span>
                  <input v-model="invoice.date" type="date" required />
                </label>
                <label class="field">
                  <span>{{ t('invoices.dueDate') }}</span>
                  <input v-model="invoice.dueDate" type="date" :min="invoice.date" />
                </label>
              </div>
            </fieldset>

            <fieldset class="card">
              <legend>{{ t('invoices.lines') }}</legend>
              <InvoiceLinesEditor
                v-model="invoice.lines"
                :regime="invoice.regime"
                :show-ritenuta="invoice.applyRitenuta"
                :invalid-lines="invalidLines"
                @add="addLine"
              />
            </fieldset>

            <fieldset class="card">
              <legend>{{ t('invoices.taxOptions') }}</legend>
              <p class="muted">{{ t(`regime.${invoice.regime}`) }}</p>
              <div class="options">
                <label v-if="canRivalsa" class="check">
                  <input v-model="invoice.applyRivalsaInps" type="checkbox" />
                  {{ t('invoices.applyRivalsa', { rate: invoice.rivalsaRate }) }}
                </label>
                <template v-if="!forfettario">
                  <label class="check">
                    <input v-model="invoice.applyRitenuta" type="checkbox" />
                    {{ t('invoices.applyRitenuta') }}
                  </label>
                  <label v-if="invoice.applyRitenuta" class="field narrow">
                    <span>{{ t('fields.ritenutaRate') }}</span>
                    <input v-model.number="invoice.ritenutaRate" type="number" min="0" max="100" step="0.01" />
                  </label>
                </template>
                <label class="field narrow">
                  <span>{{ t('invoices.bollo') }}</span>
                  <select v-model="invoice.bolloMode">
                    <option value="auto">{{ t('invoices.bolloAuto') }}</option>
                    <option value="yes">{{ t('invoices.bolloYes') }}</option>
                    <option value="no">{{ t('invoices.bolloNo') }}</option>
                  </select>
                </label>
                <label class="check">
                  <input v-model="invoice.bolloChargedToClient" type="checkbox" />
                  {{ t('invoices.bolloCharged') }}
                </label>
              </div>
              <label class="field notes">
                <span>{{ t('invoices.notes') }}</span>
                <textarea v-model="invoice.notes" rows="3" maxlength="600"></textarea>
              </label>
            </fieldset>

            <div v-if="attempted && blockers.length" class="notice error" role="alert">
              <strong>{{ t('invoices.cannotIssue') }}</strong>
              <ul>
                <li v-for="(b, i) in blockers" :key="i">{{ blockerText(b) }}</li>
              </ul>
            </div>

            <div class="toolbar">
              <button type="button" class="btn" @click="saveDraft">{{ t('invoices.saveDraft') }}</button>
              <button type="submit" class="btn primary">{{ t('invoices.issue') }}</button>
              <span class="spacer"></span>
              <ConfirmButton :label="t('invoices.deleteDraft')" @confirm="removeDraft" />
            </div>
            <p class="muted small">{{ t('invoices.issueHint') }}</p>
          </form>

          <!-- Issued: read-only document view -->
          <template v-else>
            <section class="card">
              <dl class="meta">
                <div><dt>{{ t('invoices.client') }}</dt><dd>{{ client ? clientDisplayName(client) : '—' }}</dd></div>
                <div><dt>{{ t('invoices.date') }}</dt><dd>{{ fmt.date(invoice.date) }}</dd></div>
                <div><dt>{{ t('invoices.dueDate') }}</dt><dd>{{ fmt.date(invoice.dueDate) }}</dd></div>
                <div><dt>{{ t('invoices.regimeLabel') }}</dt><dd>{{ t(`regime.${invoice.regime}`) }}</dd></div>
              </dl>
            </section>
            <div class="table-wrap">
              <table>
                <caption class="visually-hidden">{{ t('invoices.lines') }}</caption>
                <thead>
                  <tr>
                    <th scope="col">{{ t('lines.description') }}</th>
                    <th scope="col" class="num">{{ t('lines.quantity') }}</th>
                    <th scope="col" class="num">{{ t('lines.unitPrice') }}</th>
                    <th scope="col" class="num">{{ t('lines.vatRate') }}</th>
                    <th scope="col" class="num">{{ t('lines.amount') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="line in invoice.lines" :key="line.id">
                    <td class="pre">{{ line.description }}</td>
                    <td class="num">{{ line.quantity }} {{ line.unit }}</td>
                    <td class="num">{{ fmt.euro(line.unitPriceCents) }}</td>
                    <td class="num">{{ forfettario ? 'N2.2' : line.vatRate === 0 ? line.natura : `${line.vatRate}%` }}</td>
                    <td class="num">{{ safeLineAmount(line.unitPriceCents, line.quantity) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="invoice.notes" class="card pre">{{ invoice.notes }}</p>

            <section class="card actions-card">
              <h2>{{ t('invoices.payment') }}</h2>
              <div v-if="invoice.status === 'issued'" class="toolbar">
                <label class="field narrow">
                  <span>{{ t('invoices.paidOn') }}</span>
                  <input v-model="paidDate" type="date" :min="invoice.date" />
                </label>
                <button type="button" class="btn primary" @click="markPaid">{{ t('invoices.markPaid') }}</button>
              </div>
              <div v-else-if="invoice.status === 'paid'" class="toolbar">
                <span>{{ t('invoices.paidOnDate', { date: fmt.date(invoice.paidDate) }) }}</span>
                <button type="button" class="btn" @click="markUnpaid">{{ t('invoices.markUnpaid') }}</button>
              </div>
              <p v-else class="muted">{{ t('invoices.cancelledHint') }}</p>
              <div class="toolbar">
                <button type="button" class="btn" @click="duplicate">{{ t('invoices.duplicate') }}</button>
                <span class="spacer"></span>
                <ConfirmButton v-if="invoice.status !== 'cancelled'" :label="t('invoices.cancel')" :confirm-label="t('invoices.confirmCancel')" @confirm="cancel" />
              </div>
            </section>
          </template>
        </div>

        <aside class="side-col">
          <InvoiceTotalsPanel v-if="totals" :totals="totals" />
          <p v-if="forfettario" class="muted small">{{ t('invoices.forfettarioNote') }}</p>
        </aside>
      </div>
    </template>
  </section>
</template>

<style scoped>
h1 {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 20px;
  align-items: start;
}

.side-col {
  position: sticky;
  top: 16px;
}

@media (max-width: 980px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .side-col {
    position: static;
  }
}

fieldset {
  margin: 0 0 16px;
  min-width: 0;
}

legend {
  font-weight: 700;
  padding: 0 6px;
}

.options {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  align-items: end;
}

.narrow {
  max-width: 220px;
}

.notes {
  margin-top: 14px;
}

.notice.ok {
  background: var(--success-soft);
  border-left-color: var(--success);
}

.notice.error {
  background: var(--danger-soft);
  border-left-color: var(--danger);
  margin-bottom: 12px;
}

.notice ul {
  margin: 6px 0 0;
  padding-left: 20px;
}

.small {
  font-size: 0.875rem;
}

.meta {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
  margin: 0;
}

.meta dt {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.meta dd {
  margin: 0;
  font-weight: 600;
}

.table-wrap {
  margin: 16px 0;
}

.pre {
  white-space: pre-wrap;
}

.actions-card {
  margin-top: 16px;
}
</style>
