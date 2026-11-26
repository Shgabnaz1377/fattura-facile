import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import HomeView from './views/HomeView.vue'

// Hash history keeps the static build working on any host without rewrite rules.
export const routes: RouteRecordRaw[] = [{ path: '/', name: 'home', component: HomeView }]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})
