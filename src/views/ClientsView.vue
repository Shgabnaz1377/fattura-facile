<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import ConfirmButton from '@/components/ConfirmButton.vue'
import { clientDisplayName } from '@/domain/entityValidation'
import { ClientInUseError, useClientsStore } from '@/stores/clients'

const { t } = useI18n()
const store = useClientsStore()
const query = ref('')
const message = ref('')

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return store.sorted
  return store.sorted.filter((c) =>
    [clientDisplayName(c), c.partitaIva, c.codiceFiscale, c.address.comune, c.email].some((v) =>
      v.toLowerCase().includes(q),
    ),
  )
})

async function remove(id: string): Promise<void> {
  message.value = ''
  try {
    await store.remove(id)
    message.value = t('clients.deleted')
  } catch (err) {
    if (err instanceof ClientInUseError) message.value = t('clients.inUse', { n: err.invoiceCount })
    else throw err
  }
}
</script>

<template>
  <section class="page">
    <div class="page-header">
      <h1>{{ t('clients.title') }}</h1>
      <RouterLink class="btn primary" to="/clients/new">{{ t('clients.new') }}</RouterLink>
    </div>
    <div class="toolbar">
      <label class="field search">
        <span class="visually-hidden">{{ t('common.search') }}</span>
        <input v-model="query" type="search" :placeholder="t('clients.searchPlaceholder')" />
      </label>
    </div>
    <p v-if="message" class="notice" role="status">{{ message }}</p>
    <div v-if="store.clients.length === 0" class="card empty">
      <p>{{ t('clients.empty') }}</p>
      <RouterLink class="btn primary" to="/clients/new">{{ t('clients.new') }}</RouterLink>
    </div>
    <div v-else class="table-wrap">
      <table>
        <caption class="visually-hidden">{{ t('clients.title') }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ t('clients.name') }}</th>
            <th scope="col">{{ t('fields.partitaIva') }} / {{ t('fields.codiceFiscale') }}</th>
            <th scope="col">{{ t('fields.comune') }}</th>
            <th scope="col"><span class="visually-hidden">{{ t('common.actions') }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="client in filtered" :key="client.id">
            <td>
              <RouterLink :to="`/clients/${client.id}`">{{ clientDisplayName(client) }}</RouterLink>
              <span v-if="!client.isCompany" class="badge">{{ t('clients.private') }}</span>
            </td>
            <td class="mono">{{ client.partitaIva || client.codiceFiscale || '—' }}</td>
            <td>{{ client.address.comune }}<template v-if="client.address.provincia"> ({{ client.address.provincia }})</template></td>
            <td class="num">
              <ConfirmButton :label="t('common.delete')" @confirm="remove(client.id)" />
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="4" class="empty">{{ t('common.noResults') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.search {
  max-width: 360px;
  width: 100%;
}
</style>
