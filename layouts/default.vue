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
    <!-- Sólo en la web de una cuenta de demostración (utils/siteConsent.ts) -->
    <DemoNotice />
    <!-- Núcleo N8a: chat de la web, sólo si la agencia lo activó -->
    <ClientOnly><WebChatWidget /></ClientOnly>
  </div>
</template>

<script setup lang="ts">
const { load: loadCompare } = useCompare()
useDemoOrgFlag()
onMounted(() => {
  loadCompare()
})
</script>
