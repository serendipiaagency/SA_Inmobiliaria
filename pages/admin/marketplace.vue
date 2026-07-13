<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Marketplace</h1>
      <p class="mt-1 text-sm text-stone-500">Portales, canales y herramientas externas — próximamente conectables desde aquí</p>
    </div>

    <div class="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      Ninguna integración está conectada todavía. Esta es la lista de proveedores que planeamos soportar; de momento sirve como catálogo, no como panel de conexión activo.
    </div>

    <div v-for="cat in categories" :key="cat.label" class="mb-6">
      <p class="mb-2 text-[11px] font-semibold uppercase tracking-widest text-stone-400">{{ cat.label }}</p>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="app in cat.apps" :key="app.name" class="flex items-start gap-3 rounded-xl border border-line bg-white p-4 transition hover:shadow-sm">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-white" :style="{ background: app.color }">{{ app.icon }}</span>
          <div class="min-w-0 flex-1">
            <p class="font-semibold">{{ app.name }}</p>
            <p class="mt-0.5 text-xs leading-relaxed text-stone-500">{{ app.desc }}</p>
            <button class="mt-2.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-stone-400" disabled>
              Próximamente
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
      { name: 'Idealista', icon: 'i', color: '#5db075', desc: 'Publica y sincroniza tu cartera en Idealista automáticamente.' },
      { name: 'Fotocasa', icon: 'F', color: '#e2231a', desc: 'Sincronización bidireccional de anuncios y leads.' },
      { name: 'Bayut', icon: 'B', color: '#28b16d', desc: 'Publica en el portal líder de Emiratos.' },
    ],
  },
  {
    label: 'CRM & Marketing',
    apps: [
      { name: 'HubSpot', icon: 'H', color: '#ff7a59', desc: 'Sincroniza contactos y pipelines con HubSpot.' },
      { name: 'Mailchimp', icon: 'M', color: '#ffe01b', desc: 'Campañas de email a tu base de clientes.' },
      { name: 'Zapier', icon: 'Z', color: '#ff4a00', desc: 'Conecta con 6.000+ apps sin código.' },
    ],
  },
  {
    label: 'Comunicación & Pagos',
    apps: [
      { name: 'WhatsApp', icon: 'W', color: '#25d366', desc: 'Responde a leads directamente desde el CRM.' },
      { name: 'Slack', icon: 'S', color: '#4a154b', desc: 'Notificaciones de reservas y leads en tu canal.' },
      { name: 'Stripe', icon: '$', color: '#635bff', desc: 'Cobra depósitos y honorarios online.' },
    ],
  },
]
</script>
