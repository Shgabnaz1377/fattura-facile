<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <section class="page">
    <h1>{{ t('home.title') }}</h1>
    <p class="lead">{{ t('home.intro') }}</p>
    <p class="notice" role="note">{{ t('home.disclaimer') }}</p>
  </section>
</template>
