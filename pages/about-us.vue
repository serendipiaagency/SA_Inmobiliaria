<template>
  <div>
    <section class="border-b border-line bg-white">
      <div class="mx-auto max-w-screen-2xl px-6 py-20 text-center lg:px-10">
        <p class="eyebrow">Our story</p>
        <h1 class="heading-serif mx-auto mt-4 max-w-2xl text-5xl leading-tight">
          Guiding you to the extraordinary.
        </h1>
      </div>
    </section>
    <div class="mx-auto max-w-3xl space-y-8 px-6 py-20 text-[15px] leading-[1.9] text-stone-600 lg:px-0">
      <p>
        SA Inmobiliaria showcases off-plan projects, secondary-sale properties and residential communities across the
        UAE. We work directly with developers and licensed agents so buyers can explore verified listings with
        transparent payment plans, floor plans and location maps.
      </p>
      <p>
        Whether you are searching for your first home, an investment property or a place for your business, our team is
        ready to guide you at every step — from the first visit to handover.
      </p>
      <div class="flex flex-wrap gap-4 pt-4">
        <NuxtLink to="/properties" class="btn-primary">Browse projects</NuxtLink>
        <NuxtLink to="/contact-us" class="btn-secondary">Talk to us</NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
useHead({ title: 'About us — SA Inmobiliaria' })
</script>
