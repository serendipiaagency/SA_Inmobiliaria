<template>
  <div class="min-h-screen bg-[#fafaf9] text-ink">
    <!-- Sidebar -->
    <aside
      class="fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-line bg-white transition-transform duration-300 lg:translate-x-0"
      :class="open ? 'translate-x-0' : '-translate-x-full'"
    >
      <!-- Brand / workspace -->
      <div class="flex items-center gap-2.5 border-b border-line px-4 py-3.5">
        <Logo variant="mark" size="sm" />
        <div class="min-w-0 leading-tight">
          <p class="truncate text-sm font-semibold">M&M Real Estate</p>
          <p class="truncate text-[11px] text-stone-450">Workspace · Dubai</p>
        </div>
      </div>

      <nav class="flex-1 overflow-y-auto px-2.5 py-3">
        <template v-for="group in nav" :key="group.label">
          <p class="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-stone-400">{{ group.label }}</p>
          <NuxtLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            class="nav-item group"
            :class="isActive(item.to) ? 'nav-active' : ''"
            @click="open = false"
          >
            <svg class="h-[17px] w-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path :d="icons[item.icon]" />
            </svg>
            <span class="flex-1 truncate">{{ item.label }}</span>
            <span v-if="item.badge" class="rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-white">{{ item.badge }}</span>
            <span v-else-if="item.tag" class="rounded bg-stone-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-stone-400">{{ item.tag }}</span>
          </NuxtLink>
        </template>
      </nav>

      <div class="border-t border-line p-3">
        <div class="flex items-center gap-2.5 rounded-lg px-1 py-1">
          <span class="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">{{ initials(user?.name) }}</span>
          <div class="min-w-0 flex-1 leading-tight">
            <p class="truncate text-[13px] font-medium">{{ user?.name || 'Admin' }}</p>
            <p class="truncate text-[11px] text-stone-450">{{ user?.email }}</p>
          </div>
          <button class="rounded-md p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-ink" title="Cerrar sesión" @click="doLogout">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
        <NuxtLink to="/" class="mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-stone-500 transition hover:bg-stone-100 hover:text-ink">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg>
          Ver sitio público
        </NuxtLink>
      </div>
    </aside>

    <!-- Mobile overlay -->
    <div v-if="open" class="fixed inset-0 z-40 bg-black/30 lg:hidden" @click="open = false" />

    <!-- Content -->
    <div class="lg:pl-[248px]">
      <!-- Mobile top bar -->
      <div class="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <button class="rounded-md p-1.5 hover:bg-stone-100" @click="open = true">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <span class="text-sm font-semibold">M&M Admin</span>
      </div>

      <main class="mx-auto max-w-[1180px] px-5 py-6 lg:px-8 lg:py-8">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
const { user, logout } = useAuth()
const router = useRouter()
const route = useRoute()
const { initials } = useDash()
const open = ref(false)

const icons: Record<string, string> = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  chart: 'M3 3v18h18M7 15l4-5 3 3 5-7',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11',
  contact: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  bookmark: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  building: 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01',
  layers: 'M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  badge: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2l2.4 2.4L18 4l.6 3.4L22 9l-1.8 3 1.8 3-3.4 1.6L18 20l-3.6-.4L12 22l-2.4-2.4L6 20l-.6-3.4L2 15l1.8-3L2 9l3.4-1.6L6 4l3.6.4z',
  invoice: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h4',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9z',
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  store: 'M3 9l1-5h16l1 5M4 9v11h16V9M4 9h16M9 20v-6h6v6',
  widget: 'M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z',
  sparkles: 'M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8',
  team: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H4.5a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 6 9.4a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 11 4.6h-.1a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 2.82 1.17l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 11v.1a2 2 0 0 1 0 4z',
  key: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3',
}

const nav = [
  {
    label: 'General',
    items: [
      { label: 'Dashboard', to: '/admin', icon: 'grid' },
      { label: 'Analytics', to: '/admin/analytics', icon: 'chart' },
    ],
  },
  {
    label: 'CRM',
    items: [
      { label: 'Leads', to: '/admin/leads', icon: 'contact' },
      { label: 'Clientes', to: '/admin/clientes', icon: 'users' },
      { label: 'Visitas', to: '/admin/visitas', icon: 'calendar' },
      { label: 'Reservas', to: '/admin/reservas', icon: 'bookmark' },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { label: 'Propiedades', to: '/admin/properties', icon: 'building' },
      { label: 'Off-plan', to: '/admin/developer-properties', icon: 'layers' },
      { label: 'Agentes', to: '/admin/agents', icon: 'badge' },
      { label: 'Comunidades', to: '/admin/communities', icon: 'store' },
    ],
  },
  {
    label: 'Finanzas & Growth',
    items: [
      { label: 'Facturación', to: '/admin/facturacion', icon: 'invoice' },
      { label: 'Automatizaciones', to: '/admin/automatizaciones', icon: 'bolt' },
      { label: 'AI Studio', to: '/admin/ai', icon: 'sparkles' },
      { label: 'Widgets', to: '/admin/widgets', icon: 'widget' },
      { label: 'Marketplace', to: '/admin/marketplace', icon: 'store' },
      { label: 'API', to: '/admin/api', icon: 'code' },
    ],
  },
  {
    label: 'Contenido',
    items: [
      { label: 'Blog', to: '/admin/blogs', icon: 'doc' },
      { label: 'Equipo', to: '/admin/team', icon: 'team' },
    ],
  },
  {
    label: 'Bandeja',
    items: [
      { label: 'Solicitudes', to: '/admin/visitor-submissions', icon: 'inbox' },
      { label: 'Proveedores', to: '/admin/vendor-registrations', icon: 'inbox' },
      { label: 'Mensajes', to: '/admin/contact-messages', icon: 'contact' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { label: 'Configuración', to: '/admin/configuracion', icon: 'settings' },
      { label: 'Usuarios', to: '/admin/users', icon: 'key' },
    ],
  },
]

function isActive(to: string) {
  if (to === '/admin') return route.path === '/admin'
  return route.path === to || route.path.startsWith(to + '/')
}

async function doLogout() {
  await logout()
  router.push('/login')
}
</script>

<style scoped>
.nav-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  border-radius: 0.5rem;
  padding: 0.42rem 0.6rem;
  font-size: 13px;
  font-weight: 500;
  color: #57534e;
  transition: all 0.14s ease;
}
.nav-item:hover {
  background: #f5f5f4;
  color: #16150f;
}
.nav-active {
  background: #16150f;
  color: #fff;
}
.nav-active:hover {
  background: #16150f;
  color: #fff;
}
</style>
