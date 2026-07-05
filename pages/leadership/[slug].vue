<template>
  <div v-if="data" class="bg-paper">
    <div class="mx-auto max-w-screen-2xl px-6 py-14 lg:px-10">
      <div class="grid gap-14 lg:grid-cols-3">
        <div class="lg:col-span-2">
          <p class="eyebrow">{{ data.member.position }}</p>
          <h1 class="heading-serif mt-3 text-4xl md:text-5xl">{{ data.member.name }}</h1>

          <p v-if="data.member.description" class="mt-6 max-w-2xl whitespace-pre-line text-[15px] leading-[1.9] text-stone-600">
            {{ data.member.description }}
          </p>

          <div class="mt-10 grid gap-4 sm:grid-cols-2">
            <div v-if="data.member.experience" class="rounded-2xl border border-line bg-white p-6">
              <p class="eyebrow mb-2">Experiencia</p>
              <p class="text-[15px] text-stone-700">{{ data.member.experience }}</p>
            </div>
            <div v-if="data.member.specialties" class="rounded-2xl border border-line bg-white p-6">
              <p class="eyebrow mb-2">Especialidades</p>
              <p class="text-[15px] text-stone-700">{{ data.member.specialties }}</p>
            </div>
            <div v-if="data.member.languages" class="rounded-2xl border border-line bg-white p-6 sm:col-span-2">
              <p class="eyebrow mb-3">Idiomas</p>
              <div class="flex flex-wrap gap-1.5">
                <span v-for="lang in languageList" :key="lang" class="rounded-full bg-paper px-3 py-1 text-[12px] font-medium text-stone-600 ring-1 ring-line">{{ lang }}</span>
              </div>
            </div>
          </div>

          <div v-if="socials.length" class="mt-8 flex gap-4">
            <a v-for="s in socials" :key="s.label" :href="s.href" target="_blank" rel="noopener" class="text-[12px] font-semibold uppercase tracking-widest text-stone-500 hover:text-ink">{{ s.label }}</a>
          </div>
        </div>

        <aside>
          <div class="space-y-6 lg:sticky lg:top-32">
            <div class="overflow-hidden rounded-2xl border border-line bg-white">
              <div class="aspect-[3/4] overflow-hidden bg-stone-100">
                <img :src="mediaUrl(data.member.image)" :alt="data.member.name" class="h-full w-full object-cover" />
              </div>
            </div>
            <AgentContactCard
              :name="data.member.name"
              :title="data.member.position"
              :photo="data.member.image"
              :phone="data.member.phone || undefined"
              :email="data.member.email"
              :bio="data.member.description || undefined"
              :languages="languageList"
              profile-slug=""
            />
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { data } = await useFetch(`/api/public/team/${route.params.slug}`)
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Team member not found', fatal: true })
useHead({ title: `${data.value.member.name} — M&M Real Estate` })

const languageList = computed(() => (data.value?.member.languages || '').split(',').map((l) => l.trim()).filter(Boolean))
const socials = computed(() => {
  const m = data.value?.member
  if (!m) return []
  const out: { label: string; href: string }[] = []
  if (m.linkedin) out.push({ label: 'LinkedIn', href: m.linkedin })
  if (m.instagram) out.push({ label: 'Instagram', href: m.instagram })
  if (m.twitter) out.push({ label: 'Twitter', href: m.twitter })
  if (m.facebook) out.push({ label: 'Facebook', href: m.facebook })
  return out
})
</script>
