<template>
  <p v-if="!events.length" class="py-8 text-center text-sm text-stone-400">
    Sin actividad registrada todavía.
  </p>

  <ol v-else class="relative space-y-5 border-l border-line pl-6">
    <li v-for="e in events" :key="e.id" class="relative">
      <span class="absolute -left-[1.6rem] top-1 flex h-3 w-3 items-center justify-center rounded-full ring-4 ring-white" :class="DOT[e.kind]" />
      <p class="text-[13px] font-medium text-ink">
        <NuxtLink v-if="e.to" :to="e.to" class="hover:underline">{{ e.title }}</NuxtLink>
        <template v-else>{{ e.title }}</template>
      </p>
      <p v-if="e.detail" class="text-[12px] text-stone-500">{{ e.detail }}</p>
      <p class="mt-0.5 text-[11px] text-stone-400">{{ formatDateTime(e.at) }}</p>
    </li>
  </ol>
</template>

<script setup lang="ts">
import type { TimelineEvent } from '~/composables/useClientTimeline'
import { formatDateTime } from '~/composables/useClientConfig'

defineProps<{ events: TimelineEvent[] }>()

// Un color por tipo de hecho, para poder escanear la columna sin leerla
// entera. Cerrado: si aparece un tipo nuevo hay que decidir su color aquí.
const DOT: Record<TimelineEvent['kind'], string> = {
  visit: 'bg-blue-400',
  deal: 'bg-emerald-500',
  reservation: 'bg-amber-400',
  contract: 'bg-violet-400',
  lead: 'bg-stone-400',
  admin: 'bg-stone-300',
  message: 'bg-green-500',
  call: 'bg-teal-500',
}
</script>
