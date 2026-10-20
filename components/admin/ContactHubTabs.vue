<template>
  <!--
    Barra de la sección «Gestión de contactos» (Cola 15): unifica Leads,
    Contactos y Clientes en una sola sección del menú. Cada pestaña lleva a su
    página de siempre (las fichas y los enlaces internos no cambian); aquí sólo
    se cambia de una a otra. La pestaña activa sale de la ruta actual.
  -->
  <div class="mb-6" data-testid="contact-hub-tabs">
    <p class="eyebrow mb-2 text-stone-400">Gestión de contactos</p>
    <nav class="flex flex-wrap gap-1 border-b border-stone-200">
      <NuxtLink
        v-for="tab in TABS"
        :key="tab.to"
        :to="tab.to"
        :data-testid="`contact-hub-tab-${tab.key}`"
        class="-mb-px border-b-2 px-4 py-2 text-sm font-medium transition"
        :class="isActive(tab.to) ? 'border-ink text-ink' : 'border-transparent text-stone-500 hover:text-ink'"
        :aria-current="isActive(tab.to) ? 'page' : undefined"
      >
        {{ tab.label }}
      </NuxtLink>
    </nav>
  </div>
</template>

<script setup lang="ts">
const TABS = [
  { key: 'leads', label: 'Leads', to: '/admin/leads' },
  { key: 'contactos', label: 'Contactos', to: '/admin/contactos' },
  { key: 'clientes', label: 'Clientes', to: '/admin/clientes' },
] as const

const route = useRoute()
// Activa la pestaña cuyo prefijo contiene la ruta actual, así una ficha
// (/admin/leads/123) mantiene «Leads» marcada.
function isActive(to: string): boolean {
  const clean = (route.path || '').replace(/\/+$/, '') || '/'
  return clean === to || clean.startsWith(`${to}/`)
}
</script>
