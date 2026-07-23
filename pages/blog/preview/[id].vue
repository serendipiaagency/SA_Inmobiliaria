<template>
  <div class="min-h-screen bg-stone-100">
    <div class="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-2.5">
      <span class="text-xs font-semibold uppercase tracking-widest text-stone-450">Vista previa</span>
      <div class="flex rounded-lg border border-line bg-stone-50 p-0.5">
        <button v-for="d in DEVICES" :key="d.key" class="rounded-md px-2.5 py-1 text-xs font-medium" :class="device === d.key ? 'bg-ink text-white' : 'text-stone-500'" @click="device = d.key">{{ d.label }}</button>
      </div>
      <div class="flex rounded-lg border border-line bg-stone-50 p-0.5">
        <button class="rounded-md px-2.5 py-1 text-xs font-medium" :class="theme === 'light' ? 'bg-ink text-white' : 'text-stone-500'" @click="theme = 'light'">Claro</button>
        <button class="rounded-md px-2.5 py-1 text-xs font-medium" :class="theme === 'dark' ? 'bg-ink text-white' : 'text-stone-500'" @click="theme = 'dark'">Oscuro</button>
      </div>
      <button class="ml-auto text-xs font-medium text-emerald-700 hover:underline" @click="copyLink">Copiar enlace privado</button>
      <NuxtLink :to="`/admin/cms/articles/${route.params.id}`" class="btn-secondary !py-1.5 text-xs">← Volver al editor</NuxtLink>
    </div>

    <div class="flex justify-center py-8">
      <div
        class="overflow-y-auto rounded-2xl border border-line shadow-xl transition-all"
        :class="[FRAME_CLS[device], theme === 'dark' ? 'bg-[#16150f]' : 'bg-white']"
      >
        <div v-if="article" class="mx-auto max-w-3xl px-6 py-10" :class="theme === 'dark' ? 'text-stone-200' : 'text-ink'">
          <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="article.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'">{{ article.status }}</span>
          <h1 class="mt-3 font-serif text-3xl">{{ article.title }}</h1>
          <p v-if="article.excerpt" class="mt-2 text-lg" :class="theme === 'dark' ? 'text-stone-400' : 'text-stone-500'">{{ article.excerpt }}</p>
          <img v-if="article.coverImage" :src="mediaUrl(article.coverImage)" class="mt-6 w-full rounded-xl object-cover" />
          <CmsBlockRenderer :blocks="blocks" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
const route = useRoute()
const toast = useToast()

const DEVICES = [
  { key: 'desktop', label: 'Escritorio' },
  { key: 'tablet', label: 'Tablet' },
  { key: 'mobile', label: 'Móvil' },
]
const FRAME_CLS: Record<string, string> = {
  desktop: 'w-full max-w-4xl',
  tablet: 'w-[768px] max-h-[900px]',
  mobile: 'w-[390px] max-h-[844px]',
}
const device = ref<'desktop' | 'tablet' | 'mobile'>('desktop')
const theme = ref<'light' | 'dark'>('light')

const { data } = await useFetch<any>(`/api/admin/cms/articles/${route.params.id}`)
const article = computed(() => data.value?.article)
const blocks = computed(() => {
  try {
    const parsed = JSON.parse(article.value?.contentJson || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
})

useHead({ title: `Vista previa — ${article.value?.title || ''}` })

async function copyLink() {
  await navigator.clipboard.writeText(window.location.href)
  toast.success('Enlace copiado (solo accesible con tu sesión de admin)')
}
</script>
