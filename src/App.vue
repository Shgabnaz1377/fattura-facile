<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ThemeSwitcher from './components/ThemeSwitcher.vue'
import { useClientsStore } from './stores/clients'
import { useInvoicesStore } from './stores/invoices'
import { useProfileStore } from './stores/profile'

const { t } = useI18n()
const profile = useProfileStore()
const clients = useClientsStore()
const invoices = useInvoicesStore()
const ready = ref(false)
const loadError = ref('')

const links = [
  { to: '/', label: 'nav.dashboard' },
  { to: '/invoices', label: 'nav.invoices' },
  { to: '/clients', label: 'nav.clients' },
  { to: '/profile', label: 'nav.profile' },
  { to: '/data', label: 'nav.data' },
]

onMounted(async () => {
  try {
    await Promise.all([profile.load(), clients.load(), invoices.load()])
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    ready.value = true
  }
})
</script>

<template>
  <a class="skip-link" href="#main">{{ t('app.skipToContent') }}</a>
  <div class="shell">
    <header class="topbar">
      <RouterLink to="/" class="brand">
        <svg class="brand-mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="currentColor" />
          <path d="M9 7h11l4 4v14H9z" fill="#fff" />
          <path d="M12 14h9M12 18h9M12 22h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        <span>{{ t('app.name') }}</span>
      </RouterLink>
      <div class="topbar-tools">
        <ThemeSwitcher />
      </div>
    </header>
    <nav class="sidenav" :aria-label="t('nav.main')">
      <ul>
        <li v-for="link in links" :key="link.to">
          <RouterLink :to="link.to" :class="{ active: link.to === '/' ? $route.path === '/' : $route.path.startsWith(link.to) }">{{ t(link.label) }}</RouterLink>
        </li>
      </ul>
    </nav>
    <main id="main" class="content" tabindex="-1">
      <p v-if="loadError" class="notice" role="alert">{{ t('app.storageError') }} ({{ loadError }})</p>
      <RouterView v-if="ready" :key="$route.fullPath" />
      <p v-else class="muted" aria-live="polite">{{ t('common.loading') }}</p>
    </main>
  </div>
</template>
