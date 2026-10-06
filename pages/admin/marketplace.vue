<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Marketplace</h1>
      <p class="mt-1 text-sm text-stone-500">Lo que la plataforma conecta hoy de verdad, dónde se configura cada cosa y lo que todavía no existe.</p>
    </div>

    <div class="mb-6 rounded-xl border border-line bg-stone-50 p-4 text-sm text-stone-600" data-testid="marketplace-honesty">
      Esta página no conecta nada por sí misma: cada integración disponible se configura en su pantalla (enlace «Configurar»). Lo marcado como
      <span class="font-semibold">Próximamente</span> no tiene integración real todavía y no se simula en ningún sitio del panel.
    </div>

    <section v-for="cat in AVAILABLE" :key="cat.label" class="mb-7" data-testid="marketplace-available">
      <p class="mb-2 text-[11px] font-semibold uppercase tracking-widest text-stone-400">{{ cat.label }}</p>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="app in cat.apps" :key="app.name" class="flex items-start gap-3 rounded-xl border border-line bg-white p-4" :data-testid="`marketplace-app-${app.key}`">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-white" :style="{ background: app.color }">{{ app.icon }}</span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <p class="font-semibold">{{ app.name }}</p>
              <span class="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Disponible</span>
            </div>
            <p class="mt-0.5 text-xs leading-relaxed text-stone-500">{{ app.desc }}</p>
            <p v-if="app.requires" class="mt-1 text-[11px] leading-snug text-amber-700">Requisito: {{ app.requires }}</p>
            <NuxtLink v-if="app.to" :to="app.to" class="mt-2.5 inline-block rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:border-ink" :data-testid="`marketplace-configure-${app.key}`">Configurar</NuxtLink>
          </div>
        </div>
      </div>
    </section>

    <section class="mb-6" data-testid="marketplace-upcoming">
      <p class="mb-2 text-[11px] font-semibold uppercase tracking-widest text-stone-400">Próximamente — sin integración real todavía</p>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="app in UPCOMING" :key="app.name" class="flex items-start gap-3 rounded-xl border border-dashed border-line bg-white/60 p-4" :data-testid="`marketplace-upcoming-${app.key}`">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-stone-200 text-lg font-bold text-stone-500">{{ app.icon }}</span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <p class="font-semibold text-stone-700">{{ app.name }}</p>
              <span class="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500">Próximamente</span>
            </div>
            <p class="mt-0.5 text-xs leading-relaxed text-stone-500">{{ app.desc }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * Marketplace (FASE 34, núcleo N8a): catálogo HONESTO de integraciones. Lo
 * «Disponible» existe de verdad en el código y enlaza a la pantalla donde se
 * configura; lo «Próximamente» no tiene integración y no tiene ningún botón
 * que aparente funcionar. Al añadir o retirar una integración real, se
 * actualiza esta lista (y docs/auditoria-nucleo-megaprompt.md, FASE 34).
 */
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Marketplace' })

interface AvailableApp {
  key: string
  name: string
  icon: string
  color: string
  desc: string
  requires?: string
  to?: string
}

const AVAILABLE: { label: string; apps: AvailableApp[] }[] = [
  {
    label: 'Comunicación con clientes',
    apps: [
      {
        key: 'whatsapp',
        name: 'WhatsApp Business',
        icon: 'W',
        color: '#25d366',
        desc: 'Bandeja de WhatsApp en Comunicaciones con Meta WhatsApp Cloud API o Twilio: mensajes, plantillas, envío de propiedades y estados de entrega. Llamadas por WhatsApp sólo con Meta (todavía sin validar con una llamada real).',
        requires: 'un número propio conectado con sus credenciales y el secreto COMMS_CREDENTIALS_ENCRYPTION_KEY del Worker.',
        to: '/admin/comunicaciones/configuracion',
      },
      {
        key: 'webchat',
        name: 'Chat de la web',
        icon: 'C',
        color: '#0ea5e9',
        desc: 'Botón de chat en la web pública de la agencia. Cada conversación llega a Comunicaciones como hilo «Chat web» y se responde desde allí.',
        requires: 'activarlo en Comunicaciones → Configuración.',
        to: '/admin/comunicaciones/configuracion',
      },
      {
        key: 'webforms',
        name: 'Formularios de la web',
        icon: 'F',
        color: '#6366f1',
        desc: 'Contacto, captación del Constructor Web, solicitud de visita, verificación de visitante y referidos: crean su lead y un hilo «Formulario web» en Comunicaciones.',
        to: '/admin/comunicaciones',
      },
      {
        key: 'email',
        name: 'Email transaccional (Resend)',
        icon: '@',
        color: '#111827',
        desc: 'Avisos internos, confirmaciones de citas, contratos y respuestas a hilos web con la identidad de la agencia y su estado real de entrega. Sólo salida: no hay bandeja de email entrante.',
        requires: 'el secreto RESEND_API_KEY de la plataforma; dominio propio verificable desde Emails.',
        to: '/admin/emails',
      },
    ],
  },
  {
    label: 'Cobros, datos e integraciones propias',
    apps: [
      {
        key: 'stripe',
        name: 'Stripe',
        icon: '$',
        color: '#635bff',
        desc: 'Cobro de fianzas y señales de contrato con Stripe Checkout, confirmado por webhook firmado.',
        requires: 'los secretos STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET de la plataforma.',
        to: '/admin/depositos',
      },
      {
        key: 'api',
        name: 'API pública v1',
        icon: '{}',
        color: '#0f766e',
        desc: 'Claves de API por agencia para leer el catálogo y crear leads (incluidos los de portales con source «portal»), por el mismo circuito que los formularios.',
        to: '/admin/api',
      },
      {
        key: 'webhooks',
        name: 'Webhooks salientes',
        icon: '↗',
        color: '#7c3aed',
        desc: 'Avisos firmados a tus sistemas cuando hay un lead nuevo, una visita reservada, etc. Es la forma de conectar herramientas externas (CRM, automatizadores) sin un conector propio.',
        to: '/admin/webhooks',
      },
      {
        key: 'ical',
        name: 'Calendario iCal',
        icon: '31',
        color: '#ea580c',
        desc: 'Suscripción de sólo lectura a la agenda de cada comercial desde cualquier calendario, con su zona horaria.',
        to: '/admin/visitas',
      },
      {
        key: 'widgets',
        name: 'Widgets incrustables',
        icon: '▣',
        color: '#475569',
        desc: 'Listados de propiedades para incrustar en otras webs.',
        to: '/admin/widgets',
      },
      {
        key: 'inmo',
        name: 'Asistente INMO (IA)',
        icon: 'AI',
        color: '#b45309',
        desc: 'Asistente del panel que trabaja con las herramientas reales de la plataforma (búsquedas, compatibilidades, citas…), siempre con confirmación para lo que tiene consecuencias.',
        requires: 'el secreto AI_API_KEY de la plataforma.',
        to: '/admin/inmo',
      },
    ],
  },
]

const UPCOMING = [
  { key: 'portals', name: 'Portales inmobiliarios', icon: 'P', desc: 'Publicación y sincronización con Idealista, Fotocasa, Habitaclia, pisos.com, Kyero y otros. La publicación multicanal tiene la estructura, pero ningún portal tiene adaptador real. Hoy los leads de un portal sólo llegan si una integración externa los envía a la API v1.' },
  { key: 'mls', name: 'MLS y bolsas compartidas', icon: 'M', desc: 'Compartir cartera con otras agencias. No existe ninguna integración.' },
  { key: 'esign', name: 'Firma electrónica', icon: '✍', desc: 'Firma con un proveedor de firma electrónica. Hoy los contratos se aceptan por enlace, sin firma electrónica cualificada.' },
  { key: 'calendar-sync', name: 'Google Calendar y Outlook', icon: 'G', desc: 'Sincronización en los dos sentidos de la agenda. Hoy sólo existe la suscripción iCal de lectura.' },
  { key: 'inbound-email', name: 'Bandeja de email entrante', icon: '✉', desc: 'Recibir y responder correos dentro de Comunicaciones. Sin un proveedor de entrada, el email es sólo de salida.' },
  { key: 'social', name: 'Redes sociales', icon: '#', desc: 'Publicación en Facebook, Instagram, LinkedIn y otras. Sin integración real.' },
  { key: 'marketing', name: 'Email marketing y CRM externos', icon: '⇄', desc: 'Conectores propios con herramientas de newsletter o CRM externos. Mientras tanto: webhooks y API v1.' },
  { key: 'routes', name: 'Optimización de rutas', icon: '⌖', desc: 'Ordenar automáticamente las paradas de un tour. Sin proveedor de rutas no se inventan distancias.' },
]
</script>
