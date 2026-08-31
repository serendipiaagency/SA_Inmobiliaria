<template>
  <section v-if="items.length" v-reveal class="mx-auto max-w-screen-2xl px-6 py-16 lg:px-10">
    <div class="mb-8 flex items-end justify-between">
      <div>
        <p class="eyebrow">{{ content.eyebrow }}</p>
        <h2 class="heading-serif mt-3 text-3xl md:text-4xl">{{ content.title }}</h2>
      </div>
      <NuxtLink v-if="content.cta" :to="content.ctaTo || '/blog'" class="btn-quiet hidden md:inline-flex">{{ content.cta }}</NuxtLink>
    </div>
    <div class="grid gap-x-6 gap-y-10 md:grid-cols-3">
      <NuxtLink v-for="b in items" :key="b.id" :to="`/blog/${b.slug}`" class="group block">
        <div class="aspect-[3/2] overflow-hidden rounded-2xl bg-stone-100"><img :src="mediaUrl(b.image)" :alt="b.title" class="h-full w-full object-cover transition duration-700 group-hover:scale-105" loading="lazy" ></div>
        <p class="eyebrow mt-5">{{ b.targetAudience }}</p>
        <h3 class="mt-2 font-serif text-xl font-medium leading-snug group-hover:underline group-hover:underline-offset-4">{{ b.title || b.slug }}</h3>
      </NuxtLink>
    </div>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{ content: Record<string, any>; blogs: any[] }>()
const items = computed(() => (props.blogs || []).slice(0, Number(props.content.limit) || 3))
</script>
