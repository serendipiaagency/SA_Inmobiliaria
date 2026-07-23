<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Blog & CMS</h1>
        <p class="mt-1 text-sm text-stone-500">Contenido editorial de tu organización</p>
      </div>
      <NuxtLink to="/admin/cms/articles/new" class="dash-btn-primary">+ Nuevo artículo</NuxtLink>
    </div>

    <div v-if="pending" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div v-for="i in 4" :key="i" class="skeleton h-32 rounded-xl border border-line" />
    </div>

    <template v-else-if="data">
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard label="Artículos totales" :value="String(data.totalArticles)" />
        <AdminStatCard label="Publicados" :value="String(data.counts.published || 0)" />
        <AdminStatCard label="Borradores" :value="String(data.counts.draft || 0)" />
        <AdminStatCard label="SEO Score medio" :value="`${data.avgSeoScore}/100`" />
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <AdminPanel title="Artículos más vistos">
          <ul v-if="data.topArticles.length" class="divide-y divide-line">
            <li v-for="a in data.topArticles" :key="a.id" class="flex items-center justify-between gap-3 py-2.5 text-sm">
              <NuxtLink :to="`/admin/cms/articles/${a.id}`" class="truncate font-medium text-ink hover:underline">{{ a.title }}</NuxtLink>
              <span class="shrink-0 text-stone-450">{{ a.viewCount }} vistas</span>
            </li>
          </ul>
          <p v-else class="py-6 text-center text-sm text-stone-450">Aún no hay artículos publicados con vistas.</p>
        </AdminPanel>

        <AdminPanel title="Comentarios recientes">
          <ul v-if="data.recentComments.length" class="divide-y divide-line">
            <li v-for="c in data.recentComments" :key="c.id" class="py-2.5 text-sm">
              <div class="flex items-center justify-between gap-2">
                <p class="font-medium">{{ c.authorName }}</p>
                <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="c.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'">{{ c.status }}</span>
              </div>
              <p class="mt-0.5 truncate text-stone-500">{{ c.content }}</p>
              <p class="mt-0.5 text-[11px] text-stone-400">{{ c.articleTitle || '—' }}</p>
            </li>
          </ul>
          <p v-else class="py-6 text-center text-sm text-stone-450">Todavía no hay comentarios.</p>
        </AdminPanel>
      </div>

      <div class="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <NuxtLink to="/admin/cms/articles" class="cms-quicklink">Artículos</NuxtLink>
        <NuxtLink to="/admin/cms-categories" class="cms-quicklink">Categorías</NuxtLink>
        <NuxtLink to="/admin/cms-tags" class="cms-quicklink">Etiquetas</NuxtLink>
        <NuxtLink to="/admin/cms-authors" class="cms-quicklink">Autores</NuxtLink>
        <NuxtLink to="/admin/cms/media" class="cms-quicklink">Media Library</NuxtLink>
        <NuxtLink to="/admin/cms-comments" class="cms-quicklink">Comentarios</NuxtLink>
        <NuxtLink to="/admin/cms-redirects" class="cms-quicklink">Redirecciones</NuxtLink>
        <NuxtLink to="/admin/cms/papelera" class="cms-quicklink">Papelera</NuxtLink>
        <NuxtLink to="/admin/cms/configuracion" class="cms-quicklink">Configuración</NuxtLink>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Blog & CMS — Admin' })

const { data, pending } = await useFetch<any>('/api/admin/cms/dashboard')
</script>

<style scoped>
.cms-quicklink {
  display: block;
  border: 1px solid #e7e4de;
  border-radius: 0.75rem;
  background: #fff;
  padding: 0.85rem 1rem;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  transition: all 0.15s ease;
}
.cms-quicklink:hover {
  border-color: #16150f;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
}
</style>
