<template>
  <div>
    <header class="border-b border-line bg-white">
      <div class="mx-auto max-w-screen-2xl px-6 pb-10 pt-12 lg:px-10">
        <p class="eyebrow">{{ t('leadership.hero.eyebrow', 'El equipo') }}</p>
        <h1 class="heading-serif mt-3 text-4xl md:text-5xl">{{ t('leadership.hero.title', 'Quiénes te acompañan') }}</h1>
        <p class="mt-4 max-w-xl text-[15px] text-stone-500">{{ t('leadership.hero.subtitle', 'Consultores especializados en el mercado inmobiliario de Dubái, listos para guiarte en cada paso.') }}</p>
      </div>
    </header>
    <div class="mx-auto max-w-screen-2xl px-6 py-14 lg:px-10">
      <div v-if="data?.rows?.length" class="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
        <NuxtLink v-for="m in data.rows" :key="m.id" :to="`/leadership/${m.slug}`" class="group block">
          <div class="aspect-[3/4] overflow-hidden rounded-2xl bg-stone-100">
            <img
              :src="mediaUrl(m.image)"
              :alt="m.name"
              class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              loading="lazy"
            />
          </div>
          <h3 class="mt-4 font-serif text-xl font-medium group-hover:underline group-hover:underline-offset-4">
            {{ m.name }}
          </h3>
          <p class="eyebrow mt-1.5">{{ m.position }}</p>
        </NuxtLink>
      </div>
      <div v-else class="py-24 text-center">
        <p class="font-serif text-2xl text-stone-500">{{ t('leadership.empty.title', 'El equipo se está incorporando.') }}</p>
        <NuxtLink to="/contact-us" class="btn-primary mt-6">{{ t('footer.contactus', 'Contáctanos') }}</NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
const { data } = await useFetch('/api/public/team')
useHead({ title: 'Nuestro equipo — M&M Real Estate' })
</script>
