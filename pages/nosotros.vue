<template>
  <SitePageLayout :page="sitePage" :home-data="sitePageData">
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
          {{ t('aboutUs.body.paragraph1', 'Somos una inmobiliaria cercana, especializada en nuestra zona. Trabajamos con obra nueva, segunda mano y alquiler, y acompañamos a cada persona —compradora, vendedora o inversora— con información clara, anuncios verificados y un trato personal de principio a fin.') }}
        </p>
        <p>
          {{ t('aboutUs.body.paragraph2', 'Ya busques tu primera vivienda, una propiedad de inversión o un espacio para tu negocio, nuestro equipo te guía en cada paso: valoración, visitas, financiación y firma. Sin prisas y con todo explicado.') }}
        </p>
        <div class="flex flex-wrap gap-4 pt-4">
          <NuxtLink to="/propiedades" class="btn-primary">{{ t('aboutUs.cta.browse', 'Ver propiedades') }}</NuxtLink>
          <NuxtLink to="/contacto" class="btn-secondary">{{ t('aboutUs.cta.talk', 'Habla con nosotros') }}</NuxtLink>
        </div>
      </div>
    </div>
  </SitePageLayout>
</template>

<script setup lang="ts">
const { t } = useI18n()
// Con versión publicada en el Constructor Web (página «Nosotros»), la página
// es la que la inmobiliaria ha montado allí; sin ella, la de siempre.
const { page: sitePage, homeData: sitePageData } = await useSitePage('nosotros')
useHead(
  seoHead({
    title: sitePage.value?.seo?.title || t('aboutUs.hero.title', 'Te guiamos hacia lo extraordinario.'),
    description: sitePage.value?.seo?.description || t('aboutUs.body.paragraph1', 'Somos una inmobiliaria cercana, especializada en nuestra zona. Trabajamos con obra nueva, segunda mano y alquiler.'),
  }),
)
</script>
