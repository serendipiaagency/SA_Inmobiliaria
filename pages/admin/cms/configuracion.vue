<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Configuración del Blog & CMS</h1>
      <p class="mt-1 text-sm text-stone-500">Ajustes por organización</p>
    </div>

    <div class="card max-w-xl space-y-5 p-6">
      <div>
        <label class="label">Idioma por defecto</label>
        <select v-model="form.defaultLanguage" class="input">
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      </div>

      <label class="flex items-center gap-2.5 text-sm">
        <input v-model="commentsEnabled" type="checkbox" class="h-4 w-4 rounded border-line" />
        Permitir comentarios en los artículos
      </label>

      <label class="flex items-center gap-2.5 text-sm">
        <input v-model="commentsRequireApproval" type="checkbox" class="h-4 w-4 rounded border-line" :disabled="!commentsEnabled" />
        Requerir aprobación antes de mostrar un comentario
      </label>

      <div>
        <label class="label">Autor por defecto (ID)</label>
        <input v-model="form.defaultAuthorId" type="number" class="input" placeholder="ID de autor" />
        <p class="mt-1 text-[11px] text-stone-450">Se asigna a nuevos artículos si no eliges autor manualmente.</p>
      </div>

      <button class="btn-primary" :disabled="saving" @click="save">{{ saving ? 'Guardando…' : 'Guardar cambios' }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Configuración — Blog & CMS' })

const toast = useToast()
const { data } = await useFetch<any>('/api/admin/cms/settings')

const form = reactive({
  defaultLanguage: data.value?.defaultLanguage || 'es',
  defaultAuthorId: data.value?.defaultAuthorId || '',
})
const commentsEnabled = ref(!!data.value?.commentsEnabled)
const commentsRequireApproval = ref(!!data.value?.commentsRequireApproval)
const saving = ref(false)

async function save() {
  saving.value = true
  try {
    await $fetch('/api/admin/cms/settings', {
      method: 'POST',
      body: { ...form, commentsEnabled: commentsEnabled.value, commentsRequireApproval: commentsRequireApproval.value },
    })
    toast.success('Configuración guardada')
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo guardar')
  } finally {
    saving.value = false
  }
}
</script>
