<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ThemeSwitcher from './components/ThemeSwitcher.vue'

const { t } = useI18n()

const links = [{ to: '/', label: 'nav.home' }]
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
          <RouterLink :to="link.to" active-class="" exact-active-class="active">{{ t(link.label) }}</RouterLink>
        </li>
      </ul>
    </nav>
    <main id="main" class="content" tabindex="-1">
      <RouterView />
    </main>
  </div>
</template>
