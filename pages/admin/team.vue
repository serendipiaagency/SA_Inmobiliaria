<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Equipo</h1>
      <p class="mt-1 text-sm text-stone-500">Configura el horario de disponibilidad de cada agente para la agenda de citas pública</p>
    </div>

    <AdminPanel :pad="false">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="px-4 py-2.5 font-semibold">Agente</th>
              <th class="px-4 py-2.5 font-semibold">Puesto</th>
              <th class="px-4 py-2.5 font-semibold">Duración de cita</th>
              <th class="px-4 py-2.5 font-semibold"/>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in rows" :key="a.id" class="border-b border-line/60 last:border-0 hover:bg-stone-50">
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <img :src="mediaUrl(a.image)" :alt="a.name" class="h-9 w-9 rounded-full object-cover ring-1 ring-line" >
                  <span class="font-medium">{{ a.name }}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-stone-600">{{ a.position }}</td>
              <td class="px-4 py-3 text-stone-600">{{ a.slotDurationMinutes }} min</td>
              <td class="px-4 py-3 text-right">
                <NuxtLink :to="`/admin/team/${a.id}`" class="btn-quiet !px-3 !py-1.5">Configurar horario</NuxtLink>
              </td>
            </tr>
            <tr v-if="!rows.length"><td colspan="4" class="px-4 py-10 text-center text-stone-400">Sin agentes</td></tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Equipo — M&M Real Estate' })
const { data } = await useFetch<any>('/api/admin/saas/agents')
const rows = computed<any[]>(() => data.value?.rows || [])
</script>
