<template>
  <div v-if="tenant?.isCustomDomain" class="flex min-h-screen flex-col bg-paper text-ink">
    <SiteHeader />
    <main class="flex-1">
      <slot />
    </main>
    <CompareBar />
    <ScrollTop />
    <SiteFooter />
    <CookieConsent />
  </div>
  <div v-else>
    <slot />
  </div>
</template>

<script setup lang="ts">
// Used only by pages/index.vue: definePageMeta's layout must be a static
// string, so the "/" host-aware branch (SaaS landing on the primary host vs.
// the tenant's own portal home on a resolved custom domain — see
// server/api/public/tenant.get.ts) lives here as runtime v-if instead.
const { tenant, load: loadTenant } = useTenant()
await loadTenant()
const { load: loadCompare } = useCompare()
onMounted(() => {
  if (tenant.value?.isCustomDomain) loadCompare()
})
</script>
