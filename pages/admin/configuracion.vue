<template>
  <div class="max-w-3xl">
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Configuración</h1>
      <p class="mt-1 text-sm text-stone-500">Ajustes generales del workspace</p>
    </div>

    <form @submit.prevent="save">
      <AdminPanel title="Perfil de la empresa">
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block">
            <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Nombre de la empresa</span>
            <input v-model="form.company_name" class="cfg-input" />
          </label>
          <label class="block">
            <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Email de notificaciones</span>
            <input v-model="form.notify_email" type="email" class="cfg-input" />
          </label>
          <label class="block">
            <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Moneda</span>
            <select v-model="form.currency" class="cfg-input">
              <option>AED</option><option>EUR</option><option>USD</option><option>GBP</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Idioma</span>
            <select v-model="form.locale" class="cfg-input">
              <option value="es">Español</option><option value="en">English</option><option value="ar">العربية</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Zona horaria</span>
            <select v-model="form.timezone" class="cfg-input">
              <option>Asia/Dubai</option><option>Europe/Madrid</option><option>Europe/London</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Color de marca</span>
            <div class="flex items-center gap-2">
              <input v-model="form.brand_color" type="color" class="h-10 w-12 cursor-pointer rounded-lg border border-line" />
              <input v-model="form.brand_color" class="cfg-input font-mono" />
            </div>
          </label>
        </div>
      </AdminPanel>

      <AdminPanel title="Notificaciones" class="mt-4">
        <label class="flex items-center justify-between">
          <span>
            <span class="block text-sm font-medium">Informe semanal por email</span>
            <span class="block text-xs text-stone-500">Recibe un resumen de métricas cada lunes</span>
          </span>
          <button type="button" class="relative h-6 w-11 shrink-0 rounded-full transition active:scale-95" :class="form.weekly_report === 'on' ? 'bg-ink' : 'bg-stone-300'" @click="form.weekly_report = form.weekly_report === 'on' ? 'off' : 'on'">
            <span class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" :class="form.weekly_report === 'on' ? 'left-[22px]' : 'left-0.5'" />
          </button>
        </label>
      </AdminPanel>

      <div class="mt-4 flex items-center gap-3">
        <button type="submit" class="dash-btn-primary" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar cambios' }}</button>
        <transition name="fade"><span v-if="saved" class="text-sm font-medium text-emerald-600">✓ Guardado</span></transition>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Configuración — M&M Real Estate' })

const { data } = await useFetch<Record<string, string>>('/api/admin/saas/settings')
const form = reactive({
  company_name: '', notify_email: '', currency: 'AED', locale: 'es', timezone: 'Asia/Dubai', brand_color: '#16150f', weekly_report: 'on',
})
watch(data, (d) => { if (d) Object.assign(form, d) }, { immediate: true })

const saving = ref(false)
const saved = ref(false)
async function save() {
  saving.value = true
  try {
    await $fetch('/api/admin/saas/settings', { method: 'POST', body: { ...form } })
    saved.value = true
    setTimeout(() => (saved.value = false), 2500)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.cfg-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink focus:outline-none;
}
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white transition hover:bg-black disabled:opacity-50;
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
