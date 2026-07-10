<template>
  <div>
    <section class="border-b border-line bg-white">
      <div class="mx-auto max-w-screen-2xl px-6 py-20 text-center lg:px-10">
        <p class="eyebrow">{{ t('aboutUs.hero.eyebrow', 'Nuestra historia') }}</p>
        <h1 class="heading-serif mx-auto mt-4 max-w-2xl text-5xl leading-tight">
          {{ t('aboutUs.hero.title', 'Te guiamos hacia lo extraordinario.') }}
        </h1>
      </div>
    </section>
    <div class="mx-auto max-w-3xl space-y-8 px-6 py-20 text-[15px] leading-[1.9] text-stone-600 lg:px-0">
      <p>
        {{ t('aboutUs.body.paragraph1', 'M&M Real Estate presenta proyectos off-plan, propiedades de segunda venta y comunidades residenciales en todos los Emiratos Árabes Unidos. Trabajamos directamente con promotores y agentes autorizados para que los compradores puedan explorar anuncios verificados con planes de pago transparentes, planos y mapas de ubicación.') }}
      </p>
      <p>
        {{ t('aboutUs.body.paragraph2', 'Ya sea que busques tu primera vivienda, una propiedad de inversión o un espacio para tu negocio, nuestro equipo está listo para guiarte en cada paso, desde la primera visita hasta la entrega.') }}
      </p>
      <div class="flex flex-wrap gap-4 pt-4">
        <NuxtLink to="/properties" class="btn-primary">{{ t('aboutUs.cta.browse', 'Ver proyectos') }}</NuxtLink>
        <NuxtLink to="/contact-us" class="btn-secondary">{{ t('aboutUs.cta.talk', 'Habla con nosotros') }}</NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
useHead({ title: 'About us — M&M Real Estate' })
</script>
