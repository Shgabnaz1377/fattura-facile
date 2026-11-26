import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import DashboardView from './views/DashboardView.vue'

// Hash history keeps the static build working on any host without rewrite rules.
export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'dashboard', component: DashboardView },
  { path: '/invoices', name: 'invoices', component: () => import('./views/InvoicesView.vue') },
  { path: '/invoices/new', name: 'invoice-new', component: () => import('./views/InvoiceEditView.vue') },
  { path: '/invoices/:id', name: 'invoice-edit', component: () => import('./views/InvoiceEditView.vue'), props: true },
  { path: '/clients', name: 'clients', component: () => import('./views/ClientsView.vue') },
  { path: '/clients/new', name: 'client-new', component: () => import('./views/ClientEditView.vue') },
  { path: '/clients/:id', name: 'client-edit', component: () => import('./views/ClientEditView.vue'), props: true },
  { path: '/profile', name: 'profile', component: () => import('./views/ProfileView.vue') },
  { path: '/data', name: 'data', component: () => import('./views/DataView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})
