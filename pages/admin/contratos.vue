<template>
  <div class="max-w-5xl">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Contratos</h1>
        <p class="mt-1 text-sm text-stone-500">Arras, reserva, alquiler y compraventa — con aceptación electrónica simple (nombre + IP + fecha) y PDF final.</p>
      </div>
      <div class="flex gap-2">
        <button type="button" class="dash-btn-secondary" @click="showTemplates = !showTemplates">{{ showTemplates ? 'Cerrar plantillas' : 'Plantillas' }}</button>
        <button type="button" class="dash-btn-primary" @click="showCreate = !showCreate">{{ showCreate ? 'Cancelar' : 'Nuevo contrato' }}</button>
      </div>
    </div>

    <AdminPanel v-if="showTemplates" title="Plantillas de contrato" class="mb-6">
      <p class="mb-3 text-xs text-stone-500">
        Usa tokens como <code>&#123;&#123;client.name&#125;&#125;</code>, <code>&#123;&#123;client.email&#125;&#125;</code>, <code>&#123;&#123;org.name&#125;&#125;</code>,
        <code>&#123;&#123;contract.date&#125;&#125;</code>, <code>&#123;&#123;property.name&#125;&#125;</code>, <code>&#123;&#123;property.price&#125;&#125;</code>, o
        cualquier variable propia (p.ej. <code>&#123;&#123;amount&#125;&#125;</code>).
      </p>
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Nombre de la plantilla</span>
          <input v-model="templateForm.name" class="cfg-input" />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Tipo</span>
          <select v-model="templateForm.type" class="cfg-input">
            <option value="reserva">Reserva</option>
            <option value="arras">Arras</option>
            <option value="alquiler">Alquiler</option>
            <option value="compraventa">Compraventa</option>
          </select>
        </label>
      </div>
      <label class="mt-4 block">
        <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Cuerpo del contrato (párrafos separados por línea en blanco)</span>
        <textarea v-model="templateForm.bodyTemplate" rows="8" class="cfg-input font-mono text-xs"></textarea>
      </label>
      <div class="mt-3 flex items-center gap-3">
        <button type="button" class="dash-btn-primary" :disabled="savingTemplate" @click="createTemplate">{{ savingTemplate ? 'Guardando…' : 'Guardar plantilla' }}</button>
        <span v-if="templateError" class="text-sm font-medium text-red-600">{{ templateError }}</span>
      </div>

      <ul v-if="templates.length" class="mt-5 divide-y divide-line text-sm">
        <li v-for="t in templates" :key="t.id" class="flex items-center justify-between py-2.5">
          <span>{{ t.name }} <span class="text-xs text-stone-400">({{ t.type }})</span></span>
          <button type="button" class="text-xs font-medium text-red-600 hover:underline" @click="deleteTemplate(t.id)">Eliminar</button>
        </li>
      </ul>
    </AdminPanel>

    <AdminPanel v-if="showCreate" title="Nuevo contrato" class="mb-6">
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Plantilla</span>
          <select v-model.number="form.templateId" class="cfg-input">
            <option :value="null" disabled>Selecciona una plantilla</option>
            <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Título del contrato</span>
          <input v-model="form.title" class="cfg-input" placeholder="Ej: Contrato de arras — Villa Azul" />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Cliente</span>
          <input v-model="form.clientName" class="cfg-input" />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Email del cliente</span>
          <input v-model="form.clientEmail" type="email" class="cfg-input" />
        </label>
      </div>
      <p class="mt-4 mb-2 text-[12px] font-medium text-stone-600">Variables adicionales (opcional)</p>
      <div class="space-y-2">
        <div v-for="(row, i) in varRows" :key="`row-${i}`" class="grid gap-2 sm:grid-cols-2">
          <input v-model="row.key" class="cfg-input" placeholder="clave (ej: amount)" />
          <input v-model="row.value" class="cfg-input" placeholder="valor (ej: 15.000 €)" />
        </div>
        <button type="button" class="text-xs font-medium text-ink hover:underline" @click="varRows.push({ key: '', value: '' })">+ Añadir variable</button>
      </div>
      <div class="mt-4 flex items-center gap-3">
        <button type="button" class="dash-btn-primary" :disabled="creating" @click="create">{{ creating ? 'Creando…' : 'Crear contrato (borrador)' }}</button>
        <span v-if="error" class="text-sm font-medium text-red-600">{{ error }}</span>
      </div>
    </AdminPanel>

    <div v-if="!contracts.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">Sin contratos todavía.</div>

    <AdminPanel v-else :pad="false">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="px-4 py-2.5 font-semibold">Título</th>
              <th class="px-4 py-2.5 font-semibold">Cliente</th>
              <th class="px-4 py-2.5 font-semibold">Estado</th>
              <th class="px-4 py-2.5 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in contracts" :key="c.id" class="border-b border-line/60 last:border-0 hover:bg-stone-50">
              <td class="px-4 py-3 font-medium">{{ c.title }}</td>
              <td class="px-4 py-3 text-stone-600">{{ c.clientName }} <span class="text-xs text-stone-400">{{ c.clientEmail }}</span></td>
              <td class="px-4 py-3"><span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="statusClass(c.status)">{{ statusLabel(c.status) }}</span></td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <button v-if="c.status === 'draft'" type="button" class="text-xs font-medium text-ink hover:underline" @click="send(c)">Enviar</button>
                  <button v-if="c.status === 'sent'" type="button" class="text-xs font-medium text-ink hover:underline" @click="copyLink(c)">{{ copiedId === c.id ? 'Copiado' : 'Copiar enlace' }}</button>
                  <a v-if="c.status === 'accepted'" :href="`/api/admin/saas/contracts/${c.id}/download`" class="text-xs font-medium text-ink hover:underline" target="_blank">Descargar PDF</a>
                  <button v-if="c.status !== 'accepted' && c.status !== 'void'" type="button" class="text-xs font-medium text-red-600 hover:underline" @click="voidContract(c)">Anular</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Contratos — M&M Real Estate' })
const toast = useToast()

const { data: templatesData, refresh: refreshTemplates } = await useFetch<any[]>('/api/admin/saas/contract-templates')
const templates = computed(() => templatesData.value || [])
const { data: contractsData, refresh: refreshContracts } = await useFetch<any[]>('/api/admin/saas/contracts')
const contracts = computed(() => contractsData.value || [])

const showTemplates = ref(false)
const showCreate = ref(false)
const templateForm = reactive({ name: '', type: 'reserva', bodyTemplate: '' })
const savingTemplate = ref(false)
const templateError = ref('')

async function createTemplate() {
  templateError.value = ''
  savingTemplate.value = true
  try {
    await $fetch('/api/admin/saas/contract-templates', { method: 'POST', body: templateForm })
    templateForm.name = ''
    templateForm.bodyTemplate = ''
    await refreshTemplates()
    toast.success('Plantilla guardada')
  } catch (err: any) {
    templateError.value = err?.data?.statusMessage || 'Error al guardar la plantilla'
  } finally {
    savingTemplate.value = false
  }
}
async function deleteTemplate(id: number) {
  await $fetch(`/api/admin/saas/contract-templates/${id}`, { method: 'DELETE' })
  await refreshTemplates()
}

const form = reactive({ templateId: null as number | null, title: '', clientName: '', clientEmail: '' })
const varRows = reactive<{ key: string; value: string }[]>([{ key: '', value: '' }])
const creating = ref(false)
const error = ref('')

async function create() {
  error.value = ''
  if (!form.templateId) {
    error.value = 'Selecciona una plantilla'
    return
  }
  creating.value = true
  try {
    const variables: Record<string, string> = {}
    for (const row of varRows) if (row.key.trim()) variables[row.key.trim()] = row.value
    await $fetch('/api/admin/saas/contracts', { method: 'POST', body: { ...form, variables } })
    showCreate.value = false
    form.title = ''
    form.clientName = ''
    form.clientEmail = ''
    varRows.splice(0, varRows.length, { key: '', value: '' })
    await refreshContracts()
    toast.success('Contrato creado en borrador')
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Error al crear el contrato'
  } finally {
    creating.value = false
  }
}

async function send(c: any) {
  await $fetch(`/api/admin/saas/contracts/${c.id}/send`, { method: 'POST' })
  await refreshContracts()
  toast.success('Contrato enviado — copia el enlace para el cliente')
}
async function voidContract(c: any) {
  await $fetch(`/api/admin/saas/contracts/${c.id}/void`, { method: 'POST' })
  await refreshContracts()
}

const copiedId = ref<number | null>(null)
function copyLink(c: any) {
  navigator.clipboard.writeText(`${useRequestURL().origin}/contratos/${c.managementToken}`)
  copiedId.value = c.id
  setTimeout(() => (copiedId.value = null), 2000)
}

function statusLabel(s: string) {
  return { draft: 'Borrador', sent: 'Enviado', accepted: 'Aceptado', void: 'Anulado' }[s] || s
}
function statusClass(s: string) {
  return (
    { draft: 'bg-stone-100 text-stone-600', sent: 'bg-sky-100 text-sky-700', accepted: 'bg-emerald-100 text-emerald-700', void: 'bg-stone-200 text-stone-500' }[s] ||
    'bg-stone-100 text-stone-600'
  )
}
</script>

<style scoped>
.cfg-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white transition hover:bg-black disabled:opacity-50;
}
.dash-btn-secondary {
  @apply inline-flex items-center rounded-lg border border-line bg-white px-4 py-2 text-[13px] font-medium text-ink transition hover:bg-stone-50;
}
</style>
