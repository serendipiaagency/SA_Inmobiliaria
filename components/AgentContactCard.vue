<template>
  <div class="rounded-2xl border border-line bg-white p-8">
    <p class="eyebrow mb-5">Tu consultora</p>
    <div class="flex items-center gap-4">
      <img :src="mediaUrl(photo)" :alt="name" class="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-line" loading="lazy" />
      <div class="min-w-0">
        <p class="truncate font-serif text-lg font-medium leading-tight">{{ name }}</p>
        <p class="text-[13px] text-stone-500">{{ title }}</p>
        <div class="mt-1 flex items-center gap-1 text-[12px] text-stone-500">
          <svg class="h-3.5 w-3.5 text-amber-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8L6 21l1.6-7L2.2 9.2l7.1-.6z" /></svg>
          <span class="font-semibold text-ink">{{ rating }}</span>
          <span>· {{ reviews }} valoraciones</span>
        </div>
      </div>
    </div>

    <p class="mt-5 text-[13px] leading-relaxed text-stone-500">{{ bio }}</p>

    <div class="mt-5 flex flex-wrap gap-1.5">
      <span v-for="lang in languages" :key="lang" class="rounded-full bg-paper px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-stone-500 ring-1 ring-line">{{ lang }}</span>
    </div>

    <p class="mt-5 flex items-center gap-1.5 text-[12px] font-medium text-emerald-700">
      <span class="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      {{ responseTime }}
    </p>

    <div class="mt-5 space-y-2.5">
      <a :href="whatsappHref" target="_blank" rel="noopener" class="agent-btn agent-btn-whatsapp">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.87.52 3.63 1.4 5.13L2 22l5.13-1.35a9.9 9.9 0 0 0 4.9 1.28h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.8 14.14c-.24.68-1.4 1.3-1.93 1.38-.5.08-1.13.11-1.82-.11-.42-.13-.96-.31-1.66-.6-2.92-1.26-4.83-4.2-4.98-4.4-.14-.19-1.19-1.58-1.19-3.01s.75-2.13 1.02-2.42c.26-.29.58-.36.77-.36h.55c.18 0 .42-.07.65.5.24.58.82 2 .89 2.15.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.29.7 1.16 1.51 1.88 1.04.93 1.91 1.22 2.2 1.36.29.14.46.12.63-.07.17-.19.72-.84.92-1.13.19-.29.38-.24.63-.14.26.09 1.65.78 1.93.92.29.14.48.21.55.33.07.12.07.68-.17 1.36z" /></svg>
        WhatsApp
      </a>
      <div class="grid grid-cols-2 gap-2.5">
        <a :href="`tel:${phone}`" class="agent-btn agent-btn-outline">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
          Llamar
        </a>
        <a :href="`mailto:${email}`" class="agent-btn agent-btn-outline">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4h16v16H4zM4 6l8 7 8-7" /></svg>
          Email
        </a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    name?: string
    title?: string
    photo?: string
    phone?: string
    email?: string
    rating?: number
    reviews?: number
    languages?: string[]
    responseTime?: string
    bio?: string
    propertyName?: string
  }>(),
  {
    name: 'Perla Maria Melgarejo',
    title: 'Consultora Inmobiliaria Senior',
    photo: '68725.png',
    phone: '+971504178823',
    email: 'perla.melgarejo@mm-realestate.com',
    rating: 4.9,
    reviews: 128,
    languages: () => ['Español', 'English', 'العربية'],
    responseTime: 'Responde en menos de 15 min',
    bio: 'Especialista en propiedades off-plan y de lujo en Dubái. Acompaño a compradores internacionales en cada paso, desde la selección hasta la entrega de llaves.',
    propertyName: '',
  },
)

const whatsappHref = computed(() => {
  const msg = props.propertyName
    ? `Hola ${props.name.split(' ')[0]}, me interesa "${props.propertyName}". ¿Podemos hablar?`
    : `Hola ${props.name.split(' ')[0]}, me gustaría más información sobre una propiedad.`
  return `https://wa.me/${props.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`
})
</script>

<style scoped>
.agent-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: 0.7rem;
  padding: 0.7rem 1rem;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  transition: transform 0.15s ease, background-color 0.2s, opacity 0.2s;
}
.agent-btn:active {
  transform: scale(0.97);
}
.agent-btn-whatsapp {
  width: 100%;
  background: #25d366;
  color: #fff;
}
.agent-btn-whatsapp:hover {
  background: #1fb855;
}
.agent-btn-outline {
  border: 1px solid #e7e4de;
  color: #16150f;
}
.agent-btn-outline:hover {
  border-color: #16150f;
  background: #f7f5f1;
}
</style>
