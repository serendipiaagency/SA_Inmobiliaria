<template>
  <div v-if="loadError" class="card p-8 text-center">
    <p class="text-sm font-medium text-stone-600">{{ loadError }}</p>
    <NuxtLink to="/admin/clientes" class="btn-quiet mt-4 inline-flex">Volver a Clientes</NuxtLink>
  </div>

  <div v-else-if="client">
    <!-- Cabecera -->
    <div class="mb-6">
      <NuxtLink to="/admin/clientes" class="text-xs font-medium text-stone-400 hover:text-ink">← Clientes</NuxtLink>
      <div class="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div class="flex min-w-0 items-center gap-4">
          <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-paper text-lg font-semibold text-stone-500 ring-1 ring-line">
            {{ initials(client.name) }}
          </span>
          <div class="min-w-0">
            <h1 class="truncate text-2xl font-semibold tracking-tight">{{ client.name }}</h1>
            <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
              <ClientBadge :value="client.stage" kind="stage" />
              <ClientBadge :value="client.type" kind="type" />
            </div>
            <p class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-stone-500">
              <a v-if="client.email" :href="`mailto:${client.email}`" class="hover:text-ink hover:underline">{{ client.email }}</a>
              <a v-if="client.phone" :href="`tel:${client.phone}`" class="hover:text-ink hover:underline">{{ client.phone }}</a>
              <span v-if="client.agentName">Comercial: <span class="font-medium text-stone-700">{{ client.agentName }}</span></span>
              <span>Alta: {{ formatDate(client.createdAt) }}</span>
            </p>
          </div>
        </div>

        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <AdminCommsContactActions :client-id="Number(id)" :phone="client.phone" :name="client.name" />
          <NuxtLink :to="`/admin/clientes/${id}/editar`" class="btn-primary">Editar cliente</NuxtLink>
          <ClientRowMenu :client="{ id: Number(id), name: client.name }" @deleted="navigateTo('/admin/clientes')" />
        </div>
      </div>
    </div>

    <!-- Navegación -->
    <div class="mb-6 flex flex-wrap gap-1 border-b border-line">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        class="-mb-px border-b-2 px-4 py-2.5 text-[13px] font-medium transition"
        :class="tab === t.key ? 'border-ink text-ink' : 'border-transparent text-stone-500 hover:text-ink'"
        @click="tab = t.key"
      >
        {{ t.label }}
        <span v-if="t.count" class="ml-1.5 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500">{{ t.count }}</span>
      </button>
    </div>

    <!-- RESUMEN -->
    <div v-show="tab === 'resumen'" class="grid gap-6 lg:grid-cols-3">
      <div class="space-y-6 lg:col-span-2">
        <div class="grid gap-4 sm:grid-cols-3">
          <AdminStatCard label="Visitas" :value="dt.num(totals.visits)" :sub="`${totals.visitsCompleted} completadas`" />
          <AdminStatCard label="Operaciones cerradas" :value="dt.num(totals.deals)" />
          <AdminStatCard label="Volumen cerrado" :value="dt.money(totals.dealsVolume, { compact: true })" />
        </div>

        <AdminPanel title="Propiedades relacionadas" :sub="related?.properties?.length ? 'Se leen en vivo del catálogo: si cambia el precio o la foto, cambia aquí.' : undefined">
          <div v-if="!related?.properties?.length" class="py-8 text-center text-sm text-stone-400">
            Todavía no hay propiedades vinculadas a este cliente.
          </div>
          <div v-else class="grid gap-4 sm:grid-cols-2">
            <ClientPropertyCard v-for="p in related.properties.slice(0, 4)" :key="`${p.resource}-${p.id}`" :property="p" />
          </div>
          <button v-if="(related?.properties?.length || 0) > 4" type="button" class="btn-quiet mt-4 w-full !py-2 !text-[12px]" @click="tab = 'propiedades'">
            Ver las {{ related.properties.length }} propiedades
          </button>
        </AdminPanel>

        <AdminPanel title="Actividad reciente">
          <ClientTimeline :events="timeline.slice(0, 6)" />
          <button v-if="timeline.length > 6" type="button" class="btn-quiet mt-4 w-full !py-2 !text-[12px]" @click="tab = 'actividad'">
            Ver toda la actividad
          </button>
        </AdminPanel>
      </div>

      <div class="space-y-6">
        <AdminPanel title="Datos principales">
          <dl class="space-y-3 text-sm">
            <ClientField label="Email" :value="client.email" />
            <ClientField label="Teléfono" :value="client.phone" />
            <ClientField label="Ubicación" :value="client.location" />
            <ClientField label="Comercial responsable" :value="client.agentName" />
            <ClientField label="Alta" :value="formatDate(client.createdAt)" />
            <ClientField label="Última actividad" :value="totals.lastActivityAt ? formatRelative(totals.lastActivityAt) : null" />
          </dl>
        </AdminPanel>

        <AdminPanel v-if="client.notes" title="Notas">
          <p class="whitespace-pre-line text-[13px] leading-relaxed text-stone-600">{{ client.notes }}</p>
        </AdminPanel>

        <AdminPanel title="Cómo se relaciona" sub="Para que sepas de dónde sale lo de arriba.">
          <p class="text-[12px] leading-relaxed text-stone-500">
            El histórico se cruza por
            <span v-if="related?.matchedBy?.email" class="font-medium text-stone-700">email ({{ related.matchedBy.email }})</span>
            <span v-else class="font-medium text-stone-700">nombre exacto</span>
            porque el modelo no guarda todavía un vínculo directo entre un cliente y sus visitas u operaciones.
            <span v-if="!related?.matchedBy?.email">Añadirle un email hace el cruce mucho más fiable.</span>
          </p>
        </AdminPanel>
      </div>
    </div>

    <!-- INFORMACIÓN -->
    <div v-show="tab === 'informacion'" data-testid="client-tab-informacion" class="grid gap-6 lg:grid-cols-2">
      <AdminPanel title="Datos personales">
        <dl class="space-y-3 text-sm">
          <ClientField label="Nombre completo" :value="client.name" />
          <ClientField label="Email" :value="client.email" />
          <ClientField label="Teléfono" :value="client.phone" />
        </dl>
      </AdminPanel>

      <AdminPanel title="Información comercial">
        <dl class="space-y-3 text-sm">
          <ClientField label="Tipo de cliente" :value="clientOption('type', client.type).label" />
          <ClientField label="Estado" :value="clientOption('stage', client.stage).label" />
          <ClientField label="Comercial responsable" :value="client.agentName" />
          <ClientField label="Ubicación" :value="client.location" />
          <ClientField label="Alta" :value="formatDate(client.createdAt)" />
          <ClientField label="Última modificación" :value="formatDateTime(client.updatedAt)" />
        </dl>
      </AdminPanel>

      <AdminPanel title="Notas" class="lg:col-span-2">
        <p v-if="client.notes" class="whitespace-pre-line text-[13px] leading-relaxed text-stone-600">{{ client.notes }}</p>
        <p v-else class="text-sm text-stone-400">Sin notas.</p>
      </AdminPanel>

      <AdminPanel title="Campos que este modelo todavía no guarda" class="lg:col-span-2">
        <p class="text-[13px] leading-relaxed text-stone-500">
          La tabla de clientes no tiene fotografía, apellidos separados, documento de identidad, fecha de nacimiento,
          idioma, WhatsApp, dirección estructurada, oficina, origen ni etiquetas. No se muestran campos vacíos que
          aparenten existir: añadirlos es una migración de base de datos.
        </p>
      </AdminPanel>
    </div>

    <!-- PROPIEDADES -->
    <div v-show="tab === 'propiedades'">
      <div v-if="!related?.properties?.length" class="card px-4 py-16 text-center">
        <p class="text-sm font-medium text-stone-500">Sin propiedades relacionadas</p>
        <p class="mt-1 text-xs text-stone-400">Aparecerán aquí en cuanto este cliente tenga una visita, una reserva, un lead o una operación sobre una propiedad.</p>
      </div>
      <template v-else>
        <p class="mb-4 text-[13px] text-stone-500">
          {{ related.properties.length }} propiedad{{ related.properties.length === 1 ? '' : 'es' }}, agrupadas por el motivo de la relación.
          Los datos se leen del catálogo en vivo — esta ficha no guarda copia de ninguno.
        </p>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <ClientPropertyCard v-for="p in related.properties" :key="`${p.resource}-${p.id}`" :property="p" />
        </div>
      </template>
    </div>

    <!-- ACTIVIDAD -->
    <div v-show="tab === 'actividad'">
      <AdminPanel title="Histórico" sub="Sólo hechos registrados: visitas, operaciones, reservas, contratos, leads, mensajes de WhatsApp, llamadas y cambios hechos desde el panel.">
        <ClientTimeline :events="timeline" />
      </AdminPanel>
    </div>

    <!-- COMUNICACIONES -->
    <div v-show="tab === 'comunicaciones'" data-testid="client-tab-comunicaciones" class="grid gap-6 lg:grid-cols-2">
      <AdminPanel title="Conversaciones de WhatsApp" sub="Vinculadas a esta ficha por el teléfono del contacto.">
        <p v-if="!related?.conversations?.length" class="py-6 text-center text-sm text-stone-400">
          Ninguna todavía. Usa el botón «WhatsApp» de arriba para abrir una.
        </p>
        <ul v-else class="divide-y divide-line">
          <li v-for="c in related.conversations" :key="c.id" class="py-2.5">
            <NuxtLink :to="`/admin/comunicaciones?conversation=${c.id}`" class="block hover:underline">
              <span class="text-[13px] font-medium text-ink">{{ c.lastMessagePreview || 'Conversación' }}</span>
              <span class="ml-2 text-[11px] text-stone-400">{{ formatRelative(c.lastMessageAt) }} · {{ c.status === 'open' ? 'abierta' : c.status === 'pending' ? 'pendiente' : 'cerrada' }}<span v-if="c.unreadCount"> · {{ c.unreadCount }} sin leer</span></span>
            </NuxtLink>
          </li>
        </ul>
      </AdminPanel>
      <AdminPanel title="Llamadas" sub="Por WhatsApp desde el panel o registradas a mano.">
        <p v-if="!related?.calls?.length" class="py-6 text-center text-sm text-stone-400">Ninguna registrada. El botón «Llamar» de arriba anota el resultado al terminar.</p>
        <ul v-else class="divide-y divide-line">
          <li v-for="c in related.calls" :key="c.id" class="py-2.5 text-[13px]">
            <span class="font-medium text-ink">{{ c.direction === 'inbound' ? 'Recibida' : 'Realizada' }}</span>
            <span class="text-stone-500"> · {{ c.status }}<template v-if="c.outcome"> · {{ c.outcome }}</template><template v-if="c.durationSeconds"> · {{ Math.round(c.durationSeconds / 60) }} min</template></span>
            <span class="ml-2 text-[11px] text-stone-400">{{ formatDateTime(c.startedAt || c.createdAt) }}</span>
            <p v-if="c.notes" class="text-[12px] text-stone-500">{{ c.notes }}</p>
          </li>
        </ul>
      </AdminPanel>
    </div>
  </div>

  <div v-else class="card px-4 py-20 text-center text-sm text-stone-400">Cargando…</div>
</template>

<script setup lang="ts">
import ClientBadge from '~/components/client-builder/ClientBadge.vue'
import ClientField from '~/components/client-builder/ClientField.vue'
import ClientPropertyCard from '~/components/client-builder/ClientPropertyCard.vue'
import ClientRowMenu from '~/components/client-builder/ClientRowMenu.vue'
import ClientTimeline from '~/components/client-builder/ClientTimeline.vue'
import { buildClientTimeline } from '~/composables/useClientTimeline'
import { clientOption, formatDate, formatDateTime, formatRelative, initials } from '~/composables/useClientConfig'

/**
 * La ficha 360º de un cliente.
 *
 * Todo lo que enseña viene de tablas reales. No hay pestaña de Documentos
 * porque **no existe una tabla de documentos de cliente** (sí la hay para
 * comerciales, `team_member_documents`): inventarla aquí sería una migración,
 * no una pantalla. Tampoco hay métricas de relleno.
 */
definePageMeta({ layout: 'admin', middleware: 'admin' })

const route = useRoute()
const id = route.params.id as string
const dt = useDash()

const tab = ref<'resumen' | 'informacion' | 'propiedades' | 'actividad' | 'comunicaciones'>('resumen')
const loadError = ref('')

const { data: clientRes } = await useFetch<any>(`/api/admin/clients/${id}`, {
  onResponseError({ response }) {
    loadError.value = response.status === 404 ? 'Este cliente no existe, o no pertenece a tu inmobiliaria.' : 'No se pudo cargar el cliente.'
  },
})
const client = computed(() => clientRes.value?.row || null)

const { data: related } = await useFetch<any>(`/api/admin/clients/${id}/related`, { default: () => null })

useHead({ title: () => (client.value?.name ? `${client.value.name} — Clientes` : 'Cliente') })

const totals = computed(
  () => related.value?.totals || { visits: 0, visitsCompleted: 0, deals: 0, dealsVolume: 0, lastActivityAt: null },
)
const timeline = computed(() => (related.value ? buildClientTimeline(related.value) : []))

const tabs = computed(() => [
  { key: 'resumen' as const, label: 'Resumen', count: 0 },
  { key: 'informacion' as const, label: 'Información', count: 0 },
  { key: 'propiedades' as const, label: 'Propiedades', count: related.value?.properties?.length || 0 },
  { key: 'actividad' as const, label: 'Actividad', count: timeline.value.length },
  { key: 'comunicaciones' as const, label: 'Comunicaciones', count: (related.value?.conversations?.length || 0) + (related.value?.calls?.length || 0) },
])
</script>
