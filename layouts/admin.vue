<template>
  <div class="flex min-h-screen bg-slate-100 text-slate-900">
    <aside class="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
      <div class="border-b border-slate-200 px-5 py-4">
        <NuxtLink to="/admin" class="text-lg font-bold text-emerald-800">SA Admin</NuxtLink>
      </div>
      <nav class="flex-1 overflow-y-auto px-3 py-4 text-sm">
        <p class="px-2 pb-1 pt-2 text-xs font-semibold uppercase text-slate-400">Catalog</p>
        <NuxtLink v-for="item in catalog" :key="item.key" :to="`/admin/${item.key}`" class="nav-item">
          {{ item.label }}
        </NuxtLink>
        <p class="px-2 pb-1 pt-4 text-xs font-semibold uppercase text-slate-400">Content</p>
        <NuxtLink v-for="item in content" :key="item.key" :to="`/admin/${item.key}`" class="nav-item">
          {{ item.label }}
        </NuxtLink>
        <p class="px-2 pb-1 pt-4 text-xs font-semibold uppercase text-slate-400">Inbox</p>
        <NuxtLink v-for="item in inbox" :key="item.key" :to="`/admin/${item.key}`" class="nav-item">
          {{ item.label }}
        </NuxtLink>
        <p class="px-2 pb-1 pt-4 text-xs font-semibold uppercase text-slate-400">IA</p>
        <NuxtLink to="/admin/ai" class="nav-item">AI Studio</NuxtLink>
        <p class="px-2 pb-1 pt-4 text-xs font-semibold uppercase text-slate-400">System</p>
        <NuxtLink to="/admin/users" class="nav-item">Users</NuxtLink>
      </nav>
      <div class="border-t border-slate-200 p-4 text-sm">
        <p class="mb-2 truncate font-medium">{{ user?.name }}</p>
        <div class="flex gap-2">
          <NuxtLink to="/" class="btn-secondary flex-1 !py-1.5 text-center">Site</NuxtLink>
          <button class="btn-secondary flex-1 !py-1.5" @click="doLogout">Logout</button>
        </div>
      </div>
    </aside>
    <div class="flex-1 overflow-x-hidden p-6">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
const { user, logout } = useAuth()
const router = useRouter()

const catalog = [
  { key: 'developer-properties', label: 'Off-plan projects' },
  { key: 'properties', label: 'Properties' },
  { key: 'developers', label: 'Developers' },
  { key: 'agents', label: 'Agents' },
  { key: 'communities', label: 'Communities' },
  { key: 'amenities', label: 'Amenities' },
  { key: 'locations', label: 'Locations' },
  { key: 'master-plans', label: 'Master plans' },
  { key: 'floor-plans', label: 'Floor plans' },
  { key: 'property-types', label: 'Unit types' },
  { key: 'project-images', label: 'Project gallery' },
]
const content = [
  { key: 'blogs', label: 'Blog posts' },
  { key: 'team', label: 'Team members' },
]
const inbox = [
  { key: 'visitor-submissions', label: 'Visitor submissions' },
  { key: 'vendor-registrations', label: 'Vendor registrations' },
  { key: 'contact-messages', label: 'Contact & complaints' },
]

async function doLogout() {
  await logout()
  router.push('/login')
}
</script>

<style scoped>
.nav-item {
  display: block;
  border-radius: 0.5rem;
  padding: 0.4rem 0.5rem;
  color: #475569;
}
.nav-item:hover {
  background: #f1f5f9;
  color: #065f46;
}
.router-link-active.nav-item {
  background: #ecfdf5;
  color: #065f46;
  font-weight: 600;
}
</style>
