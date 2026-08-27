<template>
  <div class="card p-4">
    <div class="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink">
      <svg class="h-4 w-4 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
      Vista previa de la ficha
    </div>

    <div v-if="!hasAnyData" class="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 text-center text-[13px] text-stone-400">
      Completa los campos para ver la vista previa en tiempo real
    </div>

    <div v-else class="overflow-hidden rounded-xl border border-line">
      <div class="h-20 bg-gradient-to-br from-stone-700 via-stone-800 to-ink" />
      <div class="-mt-8 px-4">
        <img v-if="form.image" :src="mediaUrl(form.image)" class="h-16 w-16 rounded-full border-4 border-white object-cover shadow" />
        <span v-else class="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-stone-100 text-lg font-semibold text-stone-400 shadow">{{ initials }}</span>
      </div>
      <div class="px-4 pb-4 pt-2">
        <p class="truncate text-[15px] font-semibold text-ink">{{ form.name || 'Sin nombre todavía' }}</p>
        <p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-stone-500">
          <span v-if="form.position">{{ form.position }}</span>
          <span v-if="form.department" class="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-600">{{ form.department }}</span>
        </p>
        <p v-if="form.description" class="mt-2 text-[12px] leading-snug text-stone-500">{{ form.description }}</p>

        <div v-if="form.email || form.phone || form.officeName || form.hireDate" class="mt-3 space-y-1.5 border-t border-line pt-3 text-[12px] text-stone-600">
          <p v-if="form.email" class="flex items-center gap-1.5"><span class="text-stone-400">✉</span>{{ form.email }}</p>
          <p v-if="form.phone" class="flex items-center gap-1.5"><span class="text-stone-400">☎</span>{{ form.phone }}</p>
          <p v-if="form.officeName" class="flex items-center gap-1.5"><span class="text-stone-400">📍</span>{{ form.officeName }}</p>
          <p v-if="form.hireDate" class="flex items-center gap-1.5"><span class="text-stone-400">📅</span>Incorporación: {{ formatDate(form.hireDate) }}</p>
        </div>

        <div v-if="socialLinks.length" class="mt-3 flex items-center gap-2 border-t border-line pt-3">
          <a v-for="s in socialLinks" :key="s.key" :href="s.url" target="_blank" rel="noopener" class="flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200" :title="s.key">
            <span class="text-[11px] font-bold">{{ s.short }}</span>
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ form: Record<string, any> }>()

const initials = computed(() =>
  String(props.form.name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase())
    .join(''),
)

const hasAnyData = computed(() => !!(props.form.name || props.form.position || props.form.image || props.form.description))

const socialLinks = computed(() => {
  const map: { key: string; short: string; url?: string }[] = [
    { key: 'LinkedIn', short: 'in', url: props.form.linkedin },
    { key: 'Instagram', short: 'ig', url: props.form.instagram },
    { key: 'Facebook', short: 'fb', url: props.form.facebook },
    { key: 'X / Twitter', short: 'x', url: props.form.twitter },
    { key: 'WhatsApp', short: 'wa', url: props.form.whatsapp ? `https://wa.me/${String(props.form.whatsapp).replace(/[^\d]/g, '')}` : undefined },
  ]
  return map.filter((m) => m.url) as { key: string; short: string; url: string }[]
})

function formatDate(v: string) {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('es-ES')
}
</script>
