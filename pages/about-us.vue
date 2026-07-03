<template>
  <div>
    <section class="bg-emerald-900 py-16 text-center text-white">
      <h1 class="text-4xl font-bold">About us</h1>
      <p class="mx-auto mt-3 max-w-xl text-emerald-100">
        A marketplace connecting buyers with the region's leading developers and agents.
      </p>
    </section>
    <div class="mx-auto max-w-3xl space-y-6 px-4 py-14 leading-relaxed text-slate-700">
      <p>
        SA Inmobiliaria showcases off-plan projects, secondary-sale properties and residential communities across the
        UAE. We work directly with developers and licensed agents so buyers can explore verified listings with
        transparent payment plans, floor plans and location maps.
      </p>
      <p>
        Whether you are searching for your first home, an investment property or a place for your business, our team is
        ready to guide you at every step — from the first visit to handover.
      </p>
      <div class="flex gap-3">
        <NuxtLink to="/properties" class="btn-primary">Browse projects</NuxtLink>
        <NuxtLink to="/contact-us" class="btn-secondary">Talk to us</NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
useHead({ title: 'About us — SA Inmobiliaria' })
</script>
