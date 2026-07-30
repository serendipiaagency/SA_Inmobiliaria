<template>
  <div class="relative">
    <button class="relative rounded-full border border-line bg-white p-2 transition hover:bg-stone-50" title="Notificaciones" @click="toggle">
      <svg class="h-[18px] w-[18px] text-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      <span v-if="unreadCount > 0" class="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
    </button>

    <div v-if="open" class="absolute right-0 z-40 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-line bg-white p-2 shadow-lg">
      <div class="mb-1 flex items-center justify-between px-2 py-1">
        <p class="text-xs font-semibold uppercase tracking-widest text-stone-400">Notificaciones</p>
        <button v-if="unreadCount > 0" class="text-xs font-medium text-emerald-700 hover:underline" @click="markAllRead">Marcar todas leídas</button>
      </div>
      <p v-if="!rows.length" class="px-2 py-4 text-center text-sm text-stone-400">Sin notificaciones todavía.</p>
      <button
        v-for="n in rows"
        :key="n.id"
        class="block w-full rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-stone-50"
        :class="n.readAt ? 'text-stone-500' : 'font-medium text-ink'"
        @click="markRead(n)"
      >
        <span :class="typeDot(n.type)" class="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" />
        {{ n.message }}
        <span class="mt-0.5 block text-[11px] text-stone-400">{{ dt.relative(n.createdAt) }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const dt = useDash()
const open = ref(false)
const rows = ref<any[]>([])
const unreadCount = ref(0)

async function load() {
  const r = await $fetch<any>('/api/admin/scheduler/notifications').catch(() => null)
  if (r) {
    rows.value = r.rows
    unreadCount.value = r.unreadCount
  }
}
function toggle() {
  open.value = !open.value
  if (open.value) load()
}
async function markRead(n: any) {
  if (!n.readAt) {
    await $fetch('/api/admin/scheduler/notifications/read', { method: 'POST', body: { id: n.id } })
    n.readAt = new Date().toISOString()
    unreadCount.value = Math.max(0, unreadCount.value - 1)
  }
}
async function markAllRead() {
  await $fetch('/api/admin/scheduler/notifications/read', { method: 'POST', body: {} })
  rows.value.forEach((n) => (n.readAt = n.readAt || new Date().toISOString()))
  unreadCount.value = 0
}
function typeDot(type: string) {
  return { job_success: 'bg-emerald-500', job_retrying: 'bg-amber-500', job_failed: 'bg-red-500' }[type] || 'bg-stone-400'
}

onMounted(load)
</script>
