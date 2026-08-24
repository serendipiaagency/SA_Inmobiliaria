<template>
  <div class="flex min-h-screen flex-col bg-paper text-ink">
    <SiteHeader />

    <main class="flex-1">
      <slot />
    </main>

    <CompareBar />
    <ScrollTop />
    <SiteFooter />

    <CookieConsent />
  </div>
</template>

<script setup lang="ts">
const { load: loadCompare } = useCompare()
onMounted(() => {
  loadCompare()
})
</script>
