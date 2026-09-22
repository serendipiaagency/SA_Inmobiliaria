<template>
  <div class="max-w-3xl" data-testid="comms-config-page">
    <div class="mb-6">
      <NuxtLink to="/admin/comunicaciones" class="text-xs font-medium text-stone-400 hover:text-ink">← Comunicaciones</NuxtLink>
      <h1 class="mt-2 text-2xl font-semibold tracking-tight">Configuración de Comunicaciones</h1>
      <p class="mt-1 text-sm text-stone-500">Números de WhatsApp conectados, llamadas, plantillas y ajustes de la bandeja.</p>
    </div>

    <div v-if="!canWrite('system')" class="card p-6 text-sm text-stone-500">Esta pantalla es de Sistema: tu cuenta no tiene permiso para cambiar la configuración.</div>

    <template v-else>
      <div v-if="data && !data.encryptionAvailable" class="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-[13px] text-amber-900" data-testid="comms-config-no-key">
        <p class="font-semibold">Falta la clave de cifrado del Worker</p>
        <p class="mt-1">
          Las credenciales de los números se guardan cifradas con <code>COMMS_CREDENTIALS_ENCRYPTION_KEY</code>. Hasta que se configure con <code>wrangler secret put</code>, no se puede conectar ningún número. Lo explica docs/communications.md.
        </p>
      </div>

      <!-- Canales -->
      <AdminPanel title="Números conectados" sub="Cada número es un canal con su proveedor y sus credenciales. El primero pasa a ser el predeterminado.">
        <template #action>
          <button type="button" class="btn-primary !px-4 !py-2" :disabled="data && !data.encryptionAvailable" data-testid="comms-add-channel" @click="formOpen = !formOpen">{{ formOpen ? 'Cancelar' : 'Conectar número' }}</button>
        </template>

        <form v-if="formOpen" class="mb-5 space-y-3 rounded-xl border border-line bg-stone-50 p-4" data-testid="comms-channel-form" @submit.prevent="createChannel">
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block sm:col-span-2">
              <span class="label">Proveedor</span>
              <select v-model="form.provider" class="input rounded-lg bg-white">
                <option v-for="p in data?.providers || []" :key="p.key" :value="p.key">{{ p.label }}</option>
              </select>
              <span class="mt-1 block text-[11px] text-stone-500">{{ providerMeta?.summary }}</span>
            </label>
            <label class="block">
              <span class="label">Etiqueta</span>
              <input v-model="form.label" class="input rounded-lg bg-white" placeholder="Oficina centro">
            </label>
            <label class="block">
              <span class="label">Número (E.164)</span>
              <input v-model="form.phone" class="input rounded-lg bg-white" placeholder="+34 600 000 000" data-testid="channel-phone">
            </label>
            <template v-if="form.provider === 'meta_cloud'">
              <label class="block">
                <span class="label">phone_number_id</span>
                <input v-model="form.externalPhoneId" class="input rounded-lg bg-white font-mono" placeholder="1234567890" data-testid="channel-phone-number-id">
              </label>
              <label class="block">
                <span class="label">Id de la WABA (para plantillas)</span>
                <input v-model="form.businessAccountId" class="input rounded-lg bg-white font-mono" placeholder="opcional">
              </label>
              <label class="block sm:col-span-2">
                <span class="label">Token de acceso (usuario del sistema)</span>
                <input v-model="form.accessToken" type="password" class="input rounded-lg bg-white font-mono" autocomplete="off" data-testid="channel-access-token">
              </label>
              <label class="block">
                <span class="label">App Secret {{ data?.platformSecrets?.appSecret ? '(opcional: hay uno en el Worker)' : '' }}</span>
                <input v-model="form.appSecret" type="password" class="input rounded-lg bg-white font-mono" autocomplete="off" data-testid="channel-app-secret">
              </label>
              <label class="block">
                <span class="label">Token de verificación del webhook {{ data?.platformSecrets?.verifyToken ? '(opcional)' : '' }}</span>
                <input v-model="form.verifyToken" class="input rounded-lg bg-white font-mono" autocomplete="off">
              </label>
            </template>
            <template v-else>
              <label class="block">
                <span class="label">Account SID</span>
                <input v-model="form.accountSid" class="input rounded-lg bg-white font-mono" placeholder="AC…" data-testid="channel-account-sid">
              </label>
              <label class="block">
                <span class="label">Auth Token</span>
                <input v-model="form.authToken" type="password" class="input rounded-lg bg-white font-mono" autocomplete="off" data-testid="channel-auth-token">
              </label>
            </template>
          </div>
          <details class="text-[12px] text-stone-600">
            <summary class="cursor-pointer font-medium">Qué hace falta con {{ providerMeta?.label }}</summary>
            <ul class="mt-2 list-disc space-y-1 pl-5">
              <li v-for="r in providerMeta?.requirements || []" :key="r">{{ r }}</li>
            </ul>
          </details>
          <p v-if="formError" class="text-[12px] text-red-600" data-testid="channel-form-error">{{ formError }}</p>
          <div class="flex justify-end">
            <button type="submit" class="btn-primary !px-5 !py-2" :disabled="saving" data-testid="channel-form-save">{{ saving ? 'Guardando…' : 'Conectar' }}</button>
          </div>
        </form>

        <p v-if="!rows.length" class="py-6 text-center text-sm text-stone-400" data-testid="comms-channels-empty">Ningún número conectado todavía.</p>
        <ul v-else class="divide-y divide-line">
          <li v-for="c in rows" :key="c.id" class="py-4" :data-testid="`comms-channel-${c.id}`">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-[14px] font-semibold text-ink">
                  {{ c.label }} <span class="font-normal text-stone-500">· {{ c.phoneE164 }}</span>
                  <span v-if="c.isDefault" class="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">predeterminado</span>
                  <span v-if="c.status !== 'active'" class="ml-1 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500">desactivado</span>
                </p>
                <p class="text-[12px] text-stone-500">{{ providerLabel(c.provider) }} · {{ c.externalPhoneId }}</p>
                <p v-if="c.lastError" class="mt-1 text-[12px] text-red-600">{{ c.lastError }}</p>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button type="button" class="chip" @click="test(c)">Probar</button>
                <button v-if="!c.isDefault" type="button" class="chip" @click="patch(c, { isDefault: true })">Predeterminar</button>
                <button type="button" class="chip" @click="patch(c, { status: c.status === 'active' ? 'disabled' : 'active' })">{{ c.status === 'active' ? 'Desactivar' : 'Activar' }}</button>
                <button type="button" class="chip !text-red-600" @click="remove(c)">Desconectar</button>
              </div>
            </div>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <div class="rounded-lg bg-stone-50 p-3 text-[12px]">
                <p class="font-medium text-ink">Llamadas por WhatsApp</p>
                <p class="mt-0.5 text-stone-600">{{ callingLabel(c) }}</p>
                <p v-if="c.callingNote" class="mt-0.5 text-[11px] text-stone-400">{{ c.callingNote }}</p>
                <div v-if="c.capabilities.calling" class="mt-2 flex gap-1.5">
                  <button type="button" class="chip" @click="calling(c, 'check')">Comprobar</button>
                  <button v-if="c.callingStatus !== 'enabled'" type="button" class="chip" @click="calling(c, 'enable')">Activar</button>
                  <button v-else type="button" class="chip" @click="calling(c, 'disable')">Desactivar</button>
                </div>
              </div>
              <div class="rounded-lg bg-stone-50 p-3 text-[12px]">
                <p class="font-medium text-ink">Webhooks</p>
                <p class="mt-0.5 break-all font-mono text-[11px] text-stone-600">
                  <template v-if="c.provider === 'meta_cloud'">{{ data?.webhooks.meta }}<br>Campos: messages, calls</template>
                  <template v-else>{{ data?.webhooks.twilioInbound }}<br>{{ data?.webhooks.twilioStatus }}</template>
                </p>
              </div>
            </div>
          </li>
        </ul>
      </AdminPanel>

      <!-- Plantillas -->
      <AdminPanel class="mt-4" title="Plantillas" sub="Aprobadas por WhatsApp: son lo único que se puede enviar fuera de la ventana de 24 h.">
        <template #action>
          <button v-if="rows.length" type="button" class="btn-quiet !py-1.5" data-testid="comms-add-template" @click="tplOpen = !tplOpen">{{ tplOpen ? 'Cancelar' : 'Añadir a mano' }}</button>
        </template>
        <form v-if="tplOpen" class="mb-4 space-y-3 rounded-xl border border-line bg-stone-50 p-4" @submit.prevent="createTemplate">
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="label">Canal</span>
              <select v-model.number="tpl.channelId" class="input rounded-lg bg-white">
                <option v-for="c in rows" :key="c.id" :value="c.id">{{ c.label }} · {{ c.phoneE164 }}</option>
              </select>
            </label>
            <label class="block">
              <span class="label">Nombre (el de Meta)</span>
              <input v-model="tpl.name" class="input rounded-lg bg-white font-mono" placeholder="seguimiento_visita" data-testid="template-name">
            </label>
            <label class="block">
              <span class="label">Idioma</span>
              <input v-model="tpl.language" class="input rounded-lg bg-white" placeholder="es">
            </label>
            <label v-if="tplChannel?.provider === 'twilio'" class="block">
              <span class="label">Content SID</span>
              <input v-model="tpl.contentSid" class="input rounded-lg bg-white font-mono" placeholder="HX…">
            </label>
            <label class="block sm:col-span-2">
              <span class="label">Texto aprobado</span>
              <textarea v-model="tpl.body" rows="3" class="input rounded-lg bg-white" placeholder="Hola {{1}}, soy {{2}} de la inmobiliaria…" data-testid="template-body" />
            </label>
          </div>
          <p v-if="tplError" class="text-[12px] text-red-600">{{ tplError }}</p>
          <div class="flex justify-end">
            <button type="submit" class="btn-primary !px-5 !py-2" :disabled="saving" data-testid="template-save">Guardar plantilla</button>
          </div>
        </form>
        <div v-for="c in rows" :key="`t-${c.id}`" class="mb-3">
          <div class="flex items-center justify-between">
            <p class="text-[12px] font-semibold text-stone-600">{{ c.label }} · {{ c.phoneE164 }}</p>
            <button v-if="c.capabilities.templateSync" type="button" class="chip" @click="syncTemplates(c)">Sincronizar desde Meta</button>
          </div>
          <p v-if="!templatesFor(c.id).length" class="py-2 text-[12px] text-stone-400">Sin plantillas registradas.</p>
          <ul v-else class="mt-1 divide-y divide-line rounded-lg border border-line">
            <li v-for="t in templatesFor(c.id)" :key="t.id" class="flex items-start justify-between gap-3 px-3 py-2" :data-testid="`comms-template-${t.id}`">
              <div class="min-w-0">
                <p class="text-[12px] font-medium text-ink">{{ t.name }} <span class="text-stone-400">({{ t.language }})</span> <span class="rounded px-1 text-[10px] font-semibold" :class="t.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'">{{ t.status }}</span></p>
                <p class="truncate text-[11px] text-stone-500">{{ t.body }}</p>
              </div>
              <button type="button" class="chip !text-red-600" @click="removeTemplate(t)">Quitar</button>
            </li>
          </ul>
        </div>
      </AdminPanel>

      <!-- Ajustes -->
      <AdminPanel class="mt-4" title="Ajustes de la bandeja">
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block">
            <span class="label">Prefijo por defecto</span>
            <input v-model="settings.defaultCountryPrefix" class="input rounded-lg" placeholder="+34" data-testid="settings-prefix">
            <span class="mt-1 block text-[11px] text-stone-500">Para los teléfonos del CRM guardados sin prefijo internacional.</span>
          </label>
          <label class="block">
            <span class="label">Contacto desconocido</span>
            <select v-model="settings.unknownContactPolicy" class="input rounded-lg">
              <option value="ask">Dejarlo como desconocido hasta vincularlo</option>
              <option value="lead">Crear un lead automáticamente</option>
            </select>
          </label>
          <label class="flex items-center gap-2 text-[13px] sm:col-span-2">
            <input v-model="settings.notifyInternal" type="checkbox" class="h-4 w-4 rounded border-line">
            Avisar por email al equipo cuando alguien escribe por primera vez
          </label>
        </div>
        <div class="mt-4 flex items-center gap-3">
          <button type="button" class="btn-primary !px-5 !py-2" :disabled="saving" data-testid="settings-save" @click="saveSettings">Guardar ajustes</button>
          <span v-if="settingsSaved" class="text-sm font-medium text-emerald-600">✓ Guardado</span>
        </div>
      </AdminPanel>

      <AdminPanel class="mt-4" title="Qué permite cada proveedor" sub="Según su documentación oficial. Lo que no está aquí no se ofrece en la interfaz.">
        <div class="overflow-x-auto">
          <table class="w-full text-[12px]">
            <thead class="text-left text-[10px] uppercase tracking-widest text-stone-400">
              <tr><th class="py-1.5 pr-3">Capacidad</th><th v-for="p in data?.providers || []" :key="p.key" class="py-1.5 pr-3">{{ p.label }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="cap in CAPS" :key="cap.key" class="border-t border-line">
                <td class="py-1.5 pr-3 text-stone-700">{{ cap.label }}</td>
                <td v-for="p in data?.providers || []" :key="p.key" class="py-1.5 pr-3">{{ p.capabilities[cap.key] ? '✓ Disponible' : '— No disponible' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </AdminPanel>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Configuración de Comunicaciones' })
const { canWrite } = useAdminPermissions()
const toast = useToast()
const { confirm } = useConfirm()
const comms = useComms()

const CAPS = [
  { key: 'messaging', label: 'Mensajes de texto (ventana 24 h)' },
  { key: 'media', label: 'Imágenes y documentos' },
  { key: 'templates', label: 'Plantillas aprobadas' },
  { key: 'templateSync', label: 'Sincronizar plantillas' },
  { key: 'readReceipts', label: 'Entregado / leído' },
  { key: 'markRead', label: 'Marcar leído al cliente' },
  { key: 'calling', label: 'Llamadas de voz por WhatsApp' },
  { key: 'callPermissions', label: 'Permiso de llamada' },
]

const { data, refresh } = await useFetch<any>('/api/admin/comms/channels', { default: () => null })
const rows = computed<any[]>(() => data.value?.rows || [])
const { data: tplData, refresh: refreshTemplates } = await useFetch<{ rows: any[] }>('/api/admin/comms/templates', { default: () => ({ rows: [] }) })
const { data: settingsData } = await useFetch<any>('/api/admin/comms/settings', { default: () => null })
const settings = reactive({ defaultCountryPrefix: '', unknownContactPolicy: 'ask', notifyInternal: true })
watch(settingsData, (s) => { if (s) Object.assign(settings, { defaultCountryPrefix: s.defaultCountryPrefix || '', unknownContactPolicy: s.unknownContactPolicy, notifyInternal: s.notifyInternal }) }, { immediate: true })

const formOpen = ref(false)
const saving = ref(false)
const formError = ref('')
const form = reactive({ provider: 'meta_cloud', label: '', phone: '', externalPhoneId: '', businessAccountId: '', accessToken: '', appSecret: '', verifyToken: '', accountSid: '', authToken: '' })
const providerMeta = computed(() => (data.value?.providers || []).find((p: any) => p.key === form.provider))
function providerLabel(key: string) {
  return (data.value?.providers || []).find((p: any) => p.key === key)?.label || key
}
function callingLabel(c: any) {
  return { enabled: 'Activas en este número.', disabled: 'Desactivadas en Meta para este número.', unavailable: 'No disponibles con este proveedor.', unknown: 'Sin comprobar todavía.' }[c.callingStatus as string] || c.callingStatus
}

async function createChannel() {
  formError.value = ''
  saving.value = true
  try {
    const credentials = form.provider === 'meta_cloud' ? { accessToken: form.accessToken, appSecret: form.appSecret || undefined, verifyToken: form.verifyToken || undefined } : { accountSid: form.accountSid, authToken: form.authToken }
    await $fetch('/api/admin/comms/channels', { method: 'POST', body: { provider: form.provider, label: form.label, phone: form.phone, externalPhoneId: form.externalPhoneId || undefined, businessAccountId: form.businessAccountId || undefined, credentials } })
    toast.success('Número conectado')
    formOpen.value = false
    Object.assign(form, { label: '', phone: '', externalPhoneId: '', businessAccountId: '', accessToken: '', appSecret: '', verifyToken: '', accountSid: '', authToken: '' })
    await refresh()
    await comms.loadOverview(true)
  } catch (e: any) {
    formError.value = e?.data?.statusMessage || e?.statusMessage || 'No se pudo conectar'
  } finally {
    saving.value = false
  }
}
async function patch(c: any, body: Record<string, any>) {
  try {
    await $fetch(`/api/admin/comms/channels/${c.id}`, { method: 'PATCH', body })
    await refresh()
    await comms.loadOverview(true)
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo guardar')
  }
}
async function remove(c: any) {
  if (!(await confirm(`Se desconecta ${c.label} (${c.phoneE164}). Las conversaciones se conservan.`, { title: 'Desconectar número', confirmLabel: 'Desconectar', danger: true }))) return
  try {
    await $fetch(`/api/admin/comms/channels/${c.id}`, { method: 'DELETE' })
    await refresh()
    await refreshTemplates()
    await comms.loadOverview(true)
    toast.success('Número desconectado')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo desconectar')
  }
}
async function test(c: any) {
  try {
    const r = await $fetch<any>(`/api/admin/comms/channels/${c.id}/test`, { method: 'POST' })
    if (r.ok) toast.success(`Credenciales correctas${r.details?.verifiedName ? ` · ${r.details.verifiedName}` : r.details?.friendlyName ? ` · ${r.details.friendlyName}` : ''}`, 6000)
    else toast.error(r.error || 'El proveedor rechazó las credenciales', 8000)
    await refresh()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo probar')
  }
}
async function calling(c: any, action: 'check' | 'enable' | 'disable') {
  try {
    const r = await $fetch<any>(`/api/admin/comms/channels/${c.id}/calling`, { method: 'POST', body: { action } })
    toast.success(r.note || `Llamadas: ${r.callingStatus}`, 6000)
    await refresh()
    await comms.loadOverview(true)
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'Meta no respondió', 8000)
    await refresh()
  }
}

const tplOpen = ref(false)
const tplError = ref('')
const tpl = reactive({ channelId: 0, name: '', language: 'es', body: '', contentSid: '' })
const tplChannel = computed(() => rows.value.find((c) => c.id === tpl.channelId))
watch(rows, (r) => { if (!tpl.channelId && r[0]) tpl.channelId = r[0].id }, { immediate: true })
function templatesFor(channelId: number) {
  return (tplData.value?.rows || []).filter((t: any) => t.channelId === channelId)
}
async function createTemplate() {
  tplError.value = ''
  saving.value = true
  try {
    await $fetch('/api/admin/comms/templates', { method: 'POST', body: { channelId: tpl.channelId, name: tpl.name, language: tpl.language, body: tpl.body, contentSid: tpl.contentSid || undefined } })
    tplOpen.value = false
    Object.assign(tpl, { name: '', body: '', contentSid: '' })
    await refreshTemplates()
    toast.success('Plantilla guardada')
  } catch (e: any) {
    tplError.value = e?.data?.statusMessage || 'No se pudo guardar'
  } finally {
    saving.value = false
  }
}
async function removeTemplate(t: any) {
  await $fetch(`/api/admin/comms/templates/${t.id}`, { method: 'DELETE' }).catch(() => toast.error('No se pudo quitar'))
  await refreshTemplates()
}
async function syncTemplates(c: any) {
  try {
    const r = await $fetch<any>(`/api/admin/comms/channels/${c.id}/templates-sync`, { method: 'POST' })
    toast.success(`Plantillas: ${r.created} nuevas, ${r.updated} actualizadas`)
    await refreshTemplates()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo sincronizar', 8000)
  }
}

const settingsSaved = ref(false)
async function saveSettings() {
  saving.value = true
  try {
    await $fetch('/api/admin/comms/settings', { method: 'PUT', body: { ...settings } })
    settingsSaved.value = true
    setTimeout(() => (settingsSaved.value = false), 2500)
    await comms.loadOverview(true)
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo guardar')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.chip {
  @apply rounded-full border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-stone-600 transition hover:border-ink hover:text-ink;
}
</style>
