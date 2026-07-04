<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Marketplace</h1>
      <p class="mt-1 text-sm text-stone-500">Conecta portales, canales y herramientas externas</p>
    </div>

    <div v-for="cat in categories" :key="cat.label" class="mb-6">
      <p class="mb-2 text-[11px] font-semibold uppercase tracking-widest text-stone-400">{{ cat.label }}</p>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="app in cat.apps" :key="app.name" class="flex items-start gap-3 rounded-xl border border-line bg-white p-4 transition hover:shadow-sm">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-white" :style="{ background: app.color }">{{ app.icon }}</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <p class="font-semibold">{{ app.name }}</p>
              <span v-if="app.connected" class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                <span class="h-1.5 w-1.5 rounded-full bg-emerald-500" />Conectado
              </span>
            </div>
            <p class="mt-0.5 text-xs leading-relaxed text-stone-500">{{ app.desc }}</p>
            <button class="mt-2.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition" :class="app.connected ? 'border-line text-stone-500 hover:border-stone-300' : 'border-ink text-ink hover:bg-ink hover:text-white'">
              {{ app.connected ? 'Gestionar' : 'Conectar' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Marketplace — M&M Real Estate' })

const categories = [
  {
    label: 'Portales inmobiliarios',
    apps: [
      { name: 'Idealista', icon: 'i', color: '#5db075', desc: 'Publica y sincroniza tu cartera en Idealista automáticamente.', connected: true },
      { name: 'Fotocasa', icon: 'F', color: '#e2231a', desc: 'Sincronización bidireccional de anuncios y leads.', connected: false },
      { name: 'Bayut', icon: 'B', color: '#28b16d', desc: 'Publica en el portal líder de Emiratos.', connected: true },
    ],
  },
  {
    label: 'CRM & Marketing',
    apps: [
      { name: 'HubSpot', icon: 'H', color: '#ff7a59', desc: 'Sincroniza contactos y pipelines con HubSpot.', connected: false },
      { name: 'Mailchimp', icon: 'M', color: '#ffe01b', desc: 'Campañas de email a tu base de clientes.', connected: false },
      { name: 'Zapier', icon: 'Z', color: '#ff4a00', desc: 'Conecta con 6.000+ apps sin código.', connected: true },
    ],
  },
  {
    label: 'Comunicación & Pagos',
    apps: [
      { name: 'WhatsApp', icon: 'W', color: '#25d366', desc: 'Responde a leads directamente desde el CRM.', connected: true },
      { name: 'Slack', icon: 'S', color: '#4a154b', desc: 'Notificaciones de reservas y leads en tu canal.', connected: true },
      { name: 'Stripe', icon: '$', color: '#635bff', desc: 'Cobra depósitos y honorarios online.', connected: false },
    ],
  },
]
</script>
