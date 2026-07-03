<template>
  <div>
    <h1 class="mb-6 text-2xl font-bold">Dashboard</h1>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <NuxtLink v-for="s in cards" :key="s.key" :to="s.to" class="card p-5 transition hover:shadow-md">
        <p class="text-sm text-slate-500">{{ s.label }}</p>
        <p class="mt-1 text-3xl font-bold text-emerald-800">{{ stats?.[s.key] ?? '—' }}</p>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Admin — SA Inmobiliaria' })

const { data: stats } = await useFetch<Record<string, number>>('/api/admin/stats')

const cards = [
  { key: 'projects', label: 'Off-plan projects', to: '/admin/developer-properties' },
  { key: 'properties', label: 'Properties', to: '/admin/properties' },
  { key: 'developers', label: 'Developers', to: '/admin/developers' },
  { key: 'agents', label: 'Agents', to: '/admin/agents' },
  { key: 'communities', label: 'Communities', to: '/admin/communities' },
  { key: 'blogs', label: 'Blog posts', to: '/admin/blogs' },
  { key: 'visitors', label: 'Visitor submissions', to: '/admin/visitor-submissions' },
  { key: 'vendors', label: 'Vendor registrations', to: '/admin/vendor-registrations' },
  { key: 'messages', label: 'Contact & complaints', to: '/admin/contact-messages' },
]
</script>
