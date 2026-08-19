<template>
  <section v-reveal class="relative overflow-hidden bg-ink py-20 text-white">
    <img v-if="content.image" :src="mediaUrl(content.image)" alt="" class="absolute inset-0 h-full w-full object-cover opacity-30" loading="lazy" />
    <div class="relative mx-auto max-w-screen-md px-6 lg:px-10" :class="content.align === 'left' ? 'text-left' : 'text-center'">
      <p v-if="content.eyebrow" class="eyebrow !text-white/60">{{ content.eyebrow }}</p>
      <h2 v-if="content.title" class="heading-serif mt-3 text-3xl text-white md:text-4xl">{{ content.title }}</h2>
      <p v-if="content.description" class="mt-4 text-[15px] leading-relaxed text-white/70">{{ content.description }}</p>
      <div class="mt-8 flex flex-wrap items-center gap-4" :class="content.align === 'left' ? '' : 'justify-center'">
        <NuxtLink v-if="content.ctaPrimary && content.ctaPrimaryTo" :to="content.ctaPrimaryTo" class="inline-flex items-center bg-white px-6 py-3 text-[11px] font-semibold uppercase tracking-widest2 text-ink transition hover:bg-white/90">
          {{ content.ctaPrimary }}
        </NuxtLink>
        <NuxtLink v-if="content.ctaSecondary && content.ctaSecondaryTo" :to="content.ctaSecondaryTo" class="inline-flex items-center border border-white/40 px-6 py-3 text-[11px] font-semibold uppercase tracking-widest2 text-white transition hover:bg-white hover:text-ink">
          {{ content.ctaSecondary }}
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{ content: Record<string, any> }>()
</script>
