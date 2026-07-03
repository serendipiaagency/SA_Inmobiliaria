<template>
  <div v-if="data" class="mx-auto max-w-5xl px-4 py-12">
    <div class="grid gap-8 md:grid-cols-3">
      <div>
        <img :src="mediaUrl(data.member.image)" :alt="data.member.name" class="w-full rounded-xl object-cover" />
        <div class="mt-4 flex gap-3 text-sm text-ink">
          <a v-if="data.member.linkedin" :href="data.member.linkedin" target="_blank" rel="noopener">LinkedIn</a>
          <a v-if="data.member.twitter" :href="data.member.twitter" target="_blank" rel="noopener">Twitter</a>
          <a v-if="data.member.instagram" :href="data.member.instagram" target="_blank" rel="noopener">Instagram</a>
          <a v-if="data.member.facebook" :href="data.member.facebook" target="_blank" rel="noopener">Facebook</a>
        </div>
      </div>
      <div class="md:col-span-2">
        <h1 class="heading-serif text-4xl">{{ data.member.name }}</h1>
        <p class="mt-1 text-lg text-ink">{{ data.member.position }}</p>
        <p v-if="data.member.description" class="mt-4 whitespace-pre-line leading-relaxed text-stone-600">
          {{ data.member.description }}
        </p>
        <dl class="mt-6 space-y-3 text-sm">
          <div v-if="data.member.experience">
            <dt class="font-semibold text-ink">Experience</dt>
            <dd class="text-stone-500">{{ data.member.experience }}</dd>
          </div>
          <div v-if="data.member.specialties">
            <dt class="font-semibold text-ink">Specialties</dt>
            <dd class="text-stone-500">{{ data.member.specialties }}</dd>
          </div>
          <div v-if="data.member.languages">
            <dt class="font-semibold text-ink">Languages</dt>
            <dd class="text-stone-500">{{ data.member.languages }}</dd>
          </div>
        </dl>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { data } = await useFetch(`/api/public/team/${route.params.slug}`)
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Team member not found', fatal: true })
useHead({ title: `${data.value.member.name} — SA Inmobiliaria` })
</script>
