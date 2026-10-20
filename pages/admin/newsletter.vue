<template>
  <div class="max-w-6xl" data-testid="newsletter-module">
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Newsletter</h1>
      <p class="mt-1 max-w-3xl text-sm text-stone-500">
        Redacta boletines con el editor de bloques y guárdalos como campañas o plantillas reutilizables. Se ven con la marca de tu agencia.
        <strong>De momento no se envían desde aquí:</strong> se exportan (el HTML del email y la lista de suscriptores) para enviarlos con tu herramienta de correo.
      </p>
    </div>

    <!-- Pestañas -->
    <div class="mb-5 flex gap-1 border-b border-line">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        class="-mb-px border-b-2 px-4 py-2 text-sm font-medium transition"
        :class="tab === t.key ? 'border-ink text-ink' : 'border-transparent text-stone-500 hover:text-ink'"
        :data-testid="`newsletter-tab-${t.key}`"
        @click="setTab(t.key)"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- Editor abierto -->
    <AdminPanel v-if="editing">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold">{{ editing.id ? 'Editar' : (tab === 'campaigns' ? 'Nueva campaña' : 'Nueva plantilla') }}</h2>
        <span v-if="tab === 'campaigns' && editing.id" class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="STATUS_CLASS[editing.status || 'draft']">{{ STATUS_LABEL[editing.status || 'draft'] }}</span>
      </div>
      <AdminNewsletterEditor :model-value="editing" :saving="saving" @save="onSave" @cancel="closeEditor">
        <template v-if="tab === 'campaigns' && editing.id" #actions>
          <a :href="exportUrl(editing.id, 'html')" class="dash-btn-secondary" data-testid="newsletter-export-html" download>Exportar HTML</a>
          <a :href="exportUrl(editing.id, 'recipients')" class="dash-btn-secondary" data-testid="newsletter-export-recipients" download>Exportar destinatarios</a>
        </template>
      </AdminNewsletterEditor>
    </AdminPanel>

    <template v-else>
      <div class="mb-4 flex justify-end">
        <button type="button" class="dash-btn" :data-testid="`newsletter-new-${tab}`" @click="openNew">{{ tab === 'campaigns' ? 'Nueva campaña' : 'Nueva plantilla' }}</button>
      </div>

      <!-- Campañas -->
      <AdminPanel v-if="tab === 'campaigns'">
        <div v-if="campaignsPending && !campaigns" class="py-10 text-center text-sm text-stone-400">Cargando…</div>
        <div v-else-if="!campaigns?.items.length" class="py-10 text-center text-sm text-stone-500" data-testid="newsletter-campaigns-empty">
          Aún no hay campañas. Crea la primera con «Nueva campaña».
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-line text-left text-[11px] uppercase tracking-wide text-stone-500">
                <th class="py-2 pr-3 font-semibold">Nombre</th>
                <th class="py-2 pr-3 font-semibold">Asunto</th>
                <th class="py-2 pr-3 font-semibold">Estado</th>
                <th class="py-2 pr-3 font-semibold">Última exportación</th>
                <th class="py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in campaigns.items" :key="row.id" class="border-b border-line last:border-0" :data-testid="`newsletter-campaign-${row.id}`">
                <td class="py-2.5 pr-3 font-medium">{{ row.name }}</td>
                <td class="py-2.5 pr-3 text-stone-500">{{ row.subject || '—' }}</td>
                <td class="py-2.5 pr-3">
                  <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="STATUS_CLASS[row.status]">{{ STATUS_LABEL[row.status] }}</span>
                </td>
                <td class="py-2.5 pr-3 text-stone-500">
                  <template v-if="row.lastExportedAt">{{ dt.date(row.lastExportedAt) }} · {{ row.recipientCount ?? 0 }} dest.</template>
                  <template v-else>—</template>
                </td>
                <td class="py-2.5 text-right">
                  <button type="button" class="text-xs font-semibold text-stone-600 hover:text-ink" @click="openCampaign(row)">Editar</button>
                  <button type="button" class="ml-3 text-xs font-semibold text-rose-600 hover:text-rose-700" @click="removeCampaign(row)">Eliminar</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </AdminPanel>

      <!-- Plantillas -->
      <AdminPanel v-else>
        <div v-if="templatesPending && !templates" class="py-10 text-center text-sm text-stone-400">Cargando…</div>
        <div v-else-if="!templates?.items.length" class="py-10 text-center text-sm text-stone-500" data-testid="newsletter-templates-empty">
          Aún no hay plantillas. Crea una para reutilizar su contenido en tus campañas.
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-line text-left text-[11px] uppercase tracking-wide text-stone-500">
                <th class="py-2 pr-3 font-semibold">Nombre</th>
                <th class="py-2 pr-3 font-semibold">Asunto</th>
                <th class="py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in templates.items" :key="row.id" class="border-b border-line last:border-0" :data-testid="`newsletter-template-${row.id}`">
                <td class="py-2.5 pr-3 font-medium">{{ row.name }}</td>
                <td class="py-2.5 pr-3 text-stone-500">{{ row.subject || '—' }}</td>
                <td class="py-2.5 text-right">
                  <button type="button" class="text-xs font-semibold text-stone-600 hover:text-ink" @click="useTemplate(row)">Usar en campaña</button>
                  <button type="button" class="ml-3 text-xs font-semibold text-stone-600 hover:text-ink" @click="openTemplate(row)">Editar</button>
                  <button type="button" class="ml-3 text-xs font-semibold text-rose-600 hover:text-rose-700" @click="removeTemplate(row)">Eliminar</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </AdminPanel>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * Newsletter (Cola 17) — «Comunicación y mensajes». Redactar campañas y
 * plantillas con el editor de bloques, previsualizar como email con la marca
 * de la agencia y exportar (HTML + destinatarios) para enviar fuera. No hay
 * envío masivo real todavía (decisión del propietario): el alta de
 * suscriptores sigue en el pie de la web, y las bajas/supresión en
 * «Suscriptores». Permiso: Portal Web.
 */
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Newsletter' })

type Block =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'button'; label: string; url: string }
  | { type: 'image'; src: string; alt: string }
type Status = 'draft' | 'ready' | 'exported'
interface CampaignRow { id: number; name: string; subject: string; blocks: Block[]; status: Status; recipientCount: number | null; lastExportedAt: string | null }
interface TemplateRow { id: number; name: string; subject: string; blocks: Block[] }
interface Draft { id?: number; name: string; subject: string; blocks: Block[]; status?: Status }

const TABS = [
  { key: 'campaigns' as const, label: 'Campañas' },
  { key: 'templates' as const, label: 'Plantillas' },
]
const STATUS_LABEL: Record<Status, string> = { draft: 'Borrador', ready: 'Lista', exported: 'Exportada' }
const STATUS_CLASS: Record<Status, string> = { draft: 'bg-stone-100 text-stone-500', ready: 'bg-amber-50 text-amber-700', exported: 'bg-emerald-50 text-emerald-700' }

const dt = useDash()
const toast = useToast()
const { confirm } = useConfirm()

const tab = ref<'campaigns' | 'templates'>('campaigns')
const editing = ref<Draft | null>(null)
const saving = ref(false)

const { data: campaigns, pending: campaignsPending, refresh: refreshCampaigns } = await useFetch<{ items: CampaignRow[] }>('/api/admin/newsletter/campaigns')
const { data: templates, pending: templatesPending, refresh: refreshTemplates } = await useFetch<{ items: TemplateRow[] }>('/api/admin/newsletter/templates')

function setTab(t: 'campaigns' | 'templates') {
  tab.value = t
  editing.value = null
}
function closeEditor() {
  editing.value = null
}
function openNew() {
  editing.value = { name: '', subject: '', blocks: [] }
}
function openCampaign(row: CampaignRow) {
  editing.value = { id: row.id, name: row.name, subject: row.subject, blocks: clone(row.blocks), status: row.status }
}
function openTemplate(row: TemplateRow) {
  editing.value = { id: row.id, name: row.name, subject: row.subject, blocks: clone(row.blocks) }
}
function useTemplate(row: TemplateRow) {
  tab.value = 'campaigns'
  editing.value = { name: row.name, subject: row.subject, blocks: clone(row.blocks) }
}
const clone = (b: Block[]): Block[] => JSON.parse(JSON.stringify(b ?? []))

function exportUrl(id: number, format: 'html' | 'recipients') {
  return `/api/admin/newsletter/campaigns/${id}/export?format=${format}`
}

async function onSave() {
  if (!editing.value) return
  const body = { name: editing.value.name, subject: editing.value.subject, blocks: editing.value.blocks }
  const isCampaign = tab.value === 'campaigns'
  const base = isCampaign ? '/api/admin/newsletter/campaigns' : '/api/admin/newsletter/templates'
  saving.value = true
  try {
    if (editing.value.id) {
      await $fetch(`${base}/${editing.value.id}`, { method: 'PATCH', body })
    } else {
      await $fetch(base, { method: 'POST', body })
    }
    toast.success('Guardado')
    editing.value = null
    await (isCampaign ? refreshCampaigns() : refreshTemplates())
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || err?.statusMessage || 'No se pudo guardar')
  } finally {
    saving.value = false
  }
}

async function removeCampaign(row: CampaignRow) {
  if (!(await confirm(`Se borrará la campaña «${row.name}».`, { title: '¿Eliminar campaña?', confirmLabel: 'Eliminar', danger: true }))) return
  try {
    await $fetch(`/api/admin/newsletter/campaigns/${row.id}`, { method: 'DELETE' })
    toast.success('Campaña eliminada')
    await refreshCampaigns()
  } catch {
    toast.error('No se pudo eliminar')
  }
}
async function removeTemplate(row: TemplateRow) {
  if (!(await confirm(`Se borrará la plantilla «${row.name}».`, { title: '¿Eliminar plantilla?', confirmLabel: 'Eliminar', danger: true }))) return
  try {
    await $fetch(`/api/admin/newsletter/templates/${row.id}`, { method: 'DELETE' })
    toast.success('Plantilla eliminada')
    await refreshTemplates()
  } catch {
    toast.error('No se pudo eliminar')
  }
}
</script>

<style scoped>
.dash-btn {
  @apply inline-flex items-center rounded-lg bg-ink px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50;
}
.dash-btn-secondary {
  @apply inline-flex items-center rounded-lg border border-line bg-white px-4 py-2 text-[13px] font-medium text-ink transition hover:bg-stone-50 disabled:opacity-50;
}
</style>
