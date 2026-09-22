<template>
  <!-- Nota interna / evento de llamada / interactivo: centrado -->
  <div v-if="m.direction === 'note'" class="my-2 flex justify-center" :data-testid="`message-${m.id}`">
    <div class="max-w-[85%] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
      <span class="mr-1 text-[10px] font-semibold uppercase tracking-widest text-amber-600">Nota</span>{{ m.body }}
      <span class="ml-2 text-[10px] text-amber-600">{{ dt.dateTime(m.createdAt) }}</span>
    </div>
  </div>
  <div v-else-if="m.type === 'call' || m.type === 'interactive'" class="my-2 flex justify-center" :data-testid="`message-${m.id}`">
    <div class="max-w-[85%] rounded-full bg-stone-100 px-3 py-1 text-[11px] text-stone-600">
      {{ m.body }} · <span class="text-stone-400">{{ dt.dateTime(m.createdAt) }}</span>
    </div>
  </div>

  <div v-else class="my-1 flex" :class="mine ? 'justify-end' : 'justify-start'" :data-testid="`message-${m.id}`">
    <div class="max-w-[78%] rounded-2xl px-3 py-2 text-[13px] shadow-sm" :class="mine ? 'rounded-br-sm bg-[#dcf8c6] text-ink' : 'rounded-bl-sm bg-white text-ink ring-1 ring-line'">
      <p v-if="m.type === 'template'" class="mb-1 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Plantilla {{ m.template?.name }}</p>
      <p v-if="m.type === 'property_share'" class="mb-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-700">Propiedad compartida</p>

      <template v-if="m.media">
        <img v-if="isImage" :src="m.media.url" :alt="m.media.caption || 'Imagen'" class="mb-1 max-h-72 w-auto max-w-full cursor-zoom-in rounded-lg bg-stone-100" loading="lazy" @click="openMedia">
        <audio v-else-if="isAudio" controls preload="none" :src="m.media.url" class="mb-1 h-10 w-full min-w-[220px]" />
        <a v-else :href="m.media.url" target="_blank" rel="noopener" class="mb-1 flex items-center gap-2 rounded-lg bg-black/5 px-2.5 py-2 text-[12px] font-medium hover:bg-black/10">
          <svg class="h-4 w-4 shrink-0 text-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
          <span class="truncate">{{ m.media.filename || (m.type === 'video' ? 'Vídeo' : 'Archivo') }}</span>
        </a>
      </template>
      <a v-if="m.location" :href="`https://www.openstreetmap.org/?mlat=${m.location.latitude}&mlon=${m.location.longitude}#map=17/${m.location.latitude}/${m.location.longitude}`" target="_blank" rel="noopener" class="mb-1 block text-[12px] font-medium text-blue-700 underline">
        📍 {{ m.location.name || m.location.address || `${m.location.latitude}, ${m.location.longitude}` }}
      </a>

      <p v-if="m.body" class="whitespace-pre-line break-words">{{ m.body }}</p>
      <p v-else-if="!m.media && !m.location" class="italic text-stone-400">{{ m.preview || 'Mensaje no soportado' }}</p>

      <p class="mt-1 flex items-center justify-end gap-1 text-[10px] text-stone-400">
        <span>{{ dt.dateTime(m.createdAt) }}</span>
        <span v-if="mine" :title="statusTitle" :class="m.status === 'read' ? 'text-blue-500' : m.status === 'failed' ? 'text-red-600' : ''" :data-testid="`message-status-${m.id}`">{{ statusIcon }}</span>
      </p>
      <p v-if="m.status === 'failed' && m.errorMessage" class="mt-1 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700">{{ m.errorMessage }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ m: any }>()
const dt = useDash()
const mine = computed(() => props.m.direction === 'out')
const isImage = computed(() => props.m.type === 'image' || String(props.m.media?.mime || '').startsWith('image/'))
const isAudio = computed(() => props.m.type === 'audio' || String(props.m.media?.mime || '').startsWith('audio/'))
const statusIcon = computed(() => ({ queued: '🕓', sent: '✓', delivered: '✓✓', read: '✓✓', failed: '⚠' })[props.m.status as string] || '')
const statusTitle = computed(() => ({ queued: 'En cola', sent: 'Aceptado por el proveedor', delivered: 'Entregado', read: 'Leído', failed: 'No entregado' })[props.m.status as string] || '')
function openMedia() {
  window.open(props.m.media.url, '_blank', 'noopener')
}
</script>
