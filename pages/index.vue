<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center text-ink">
    <Logo size="md" class="mb-10" />
    <p class="eyebrow">Próximamente</p>
    <h1 class="heading-serif mt-4 max-w-xl text-4xl leading-tight sm:text-5xl">Estamos construyendo esta página</h1>
    <p class="mt-5 max-w-md text-[15px] leading-relaxed text-stone-500">
      Mientras tanto, puedes ver una demo real de la plataforma con datos y funcionalidades completas.
    </p>
    <NuxtLink to="/demo" class="btn-primary mt-9">Ver la demo</NuxtLink>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })
useHead(
  seoHead({
    title: 'M&M Real Estate',
    description: 'Próximamente.',
    robots: 'noindex, nofollow',
  }),
)
</script>
