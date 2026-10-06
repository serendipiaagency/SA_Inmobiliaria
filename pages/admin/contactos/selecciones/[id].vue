<template>
  <div class="max-w-4xl">
    <NuxtLink :to="backTo" class="mb-4 inline-block text-sm text-stone-500 hover:text-ink" data-testid="selection-back">← {{ sel?.contact?.name || 'Contactos' }}</NuxtLink>

    <div v-if="!sel" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500" data-testid="selection-not-found">
      Selección no encontrada.
    </div>

    <template v-else>
      <!-- Cabecera: para quién es, de qué necesidad sale y «Enviar». -->
      <div class="mb-5 rounded-2xl border border-line bg-white p-4 sm:p-5" data-testid="selection-header">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Selección de propiedades</p>
            <h1 class="mt-0.5 text-2xl font-semibold tracking-tight" data-testid="selection-title">{{ sel.title }}</h1>
            <p class="mt-1 text-[13px] text-stone-500">
              Para
              <NuxtLink v-if="sel.contact" :to="`/admin/contactos/${sel.contact.id}?tab=necesidades`" class="font-medium text-ink hover:underline">{{ sel.contact.name }}</NuxtLink>
              <span v-else>un contacto que ya no existe</span>
              <template v-if="sel.requirement"> · necesidad «{{ sel.requirement.title || 'Necesidad' }}»</template>
              · {{ items.length }} {{ items.length === 1 ? 'propiedad' : 'propiedades' }}
              · creada {{ dt.date(sel.createdAt) }}
            </p>
            <p v-if="sel.notes" class="mt-1 whitespace-pre-wrap text-[13px] text-stone-600">{{ sel.notes }}</p>
          </div>
          <button
            v-if="canEdit" type="button" class="shrink-0 rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
            :disabled="!items.length" data-testid="selection-send" @click="sending = true"
          >
            Enviar selección por WhatsApp
          </button>
        </div>
      </div>

      <!-- Propiedades, en el orden en que se enseñan y se envían. -->
      <AdminPanel :pad="false" data-testid="selection-items">
        <ol class="divide-y divide-line">
          <li v-for="(it, i) in items" :key="it.id" class="flex flex-wrap items-start gap-3 px-4 py-3 sm:flex-nowrap" data-testid="selection-item" :data-item-id="it.id">
            <img :src="mediaUrl(it.image)" alt="" class="h-16 w-24 shrink-0 rounded-md bg-stone-100 object-cover sm:h-20 sm:w-28" :data-testid="`selection-item-${it.id}-photo`">
            <div class="min-w-0 flex-1">
              <NuxtLink v-if="!it.missing" :to="`/admin/${it.propertyKind === 'developer' ? 'developer-properties' : 'properties'}/${it.propertyId}`" class="block truncate text-sm font-medium hover:underline" :data-testid="`selection-item-${it.id}-name`">
                {{ i + 1 }}. {{ it.name }}
              </NuxtLink>
              <p v-else class="truncate text-sm font-medium text-stone-400">{{ i + 1 }}. {{ it.name }}</p>
              <p class="mt-0.5 truncate text-[11px] text-stone-500">
                <span class="uppercase text-stone-400">{{ it.propertyKind === 'developer' ? 'Web · obra nueva' : '2ª mano' }}</span>
                {{ [it.location, it.bedrooms ? `${it.bedrooms} dorm.` : null, it.area ? `${Math.round(it.area)} m²` : null].filter(Boolean).map((s) => ` · ${s}`).join('') }}
              </p>
              <p class="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
                <span class="font-semibold tabular-nums" :data-testid="`selection-item-${it.id}-price`">{{ it.price != null ? money(it.price) : 'Precio sin indicar' }}</span>
                <span v-if="it.statusLabel" class="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600" :data-testid="`selection-item-${it.id}-status`">{{ it.statusLabel }}</span>
                <span v-if="it.trashed" class="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800" :data-testid="`selection-item-${it.id}-trashed`">En la papelera · no se envía</span>
                <span v-if="it.missing" class="rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-600">Ya no existe · no se envía</span>
              </p>
              <p v-if="it.note" class="mt-1 text-[12px] text-stone-500">«{{ it.note }}»</p>
            </div>
            <div v-if="canEdit" class="flex w-full shrink-0 justify-end gap-1 sm:w-auto">
              <button type="button" class="btn-quiet !px-2 !py-1 text-xs" :disabled="busy || i === 0" title="Subir" :data-testid="`selection-item-${it.id}-up`" @click="move(i, -1)">↑</button>
              <button type="button" class="btn-quiet !px-2 !py-1 text-xs" :disabled="busy || i === items.length - 1" title="Bajar" :data-testid="`selection-item-${it.id}-down`" @click="move(i, 1)">↓</button>
              <button
                type="button" class="btn-quiet !px-2 !py-1 text-xs text-red-600" :disabled="busy || items.length <= 1"
                :title="items.length <= 1 ? 'Una selección necesita al menos una propiedad: añade otra antes de quitar ésta' : 'Quitar de la selección (la propiedad no se toca)'"
                :data-testid="`selection-item-${it.id}-remove`" @click="remove(it)"
              >Quitar</button>
            </div>
          </li>
        </ol>
      </AdminPanel>

      <!-- Añadir: el mismo buscador de inmuebles que el alta de citas y tours (los dos catálogos). -->
      <AdminPanel v-if="canEdit" title="Añadir una propiedad" class="mt-4" data-testid="selection-add-panel">
        <div class="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <EntityPicker v-model="toAdd" kind="property" placeholder="Buscar inmueble (obra nueva o 2ª mano)…" test-id="selection-add-property" />
          <input v-model="addNote" class="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink" maxlength="500" placeholder="Nota para el cliente (opcional)" data-testid="selection-add-note">
          <button type="button" class="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" :disabled="busy || !toAdd" data-testid="selection-add" @click="add">Añadir</button>
        </div>
        <p class="mt-2 text-[11px] text-stone-400">Se añade al final (máximo 30 por selección). No se puede añadir una propiedad en la papelera ni repetir una que ya está.</p>
      </AdminPanel>
    </template>

    <SendSelectionModal v-if="sending && sel" :selection="sel" @close="sending = false" @sent="(n) => toast.success(`${n} ${n === 1 ? 'propiedad enviada' : 'propiedades enviadas'} por WhatsApp`)" />
  </div>
</template>

<script setup lang="ts">
import AdminPanel from '~/components/admin/Panel.vue'
import EntityPicker from '~/components/admin/appointments/EntityPicker.vue'
import SendSelectionModal from '~/components/admin/selections/SendSelectionModal.vue'
import { mediaUrl } from '~/composables/useMedia'
import type { PickedEntity } from '~/utils/appointmentCatalog'

/**
 * Vista propia de una selección de propiedades (FASE 11, cierre C2): sus
 * propiedades de los dos catálogos con foto, precio y estado; reordenarlas,
 * quitar y añadir (PUT /api/admin/property-selections/:id con `action`, el
 * motor genérico — sin ruta nueva); y enviarla como conjunto al contacto por
 * el Centro de Comunicaciones (SendSelectionModal: el mismo envío real que
 * «Enviar propiedad»). Se llega desde la ficha del contacto → Necesidades →
 * Selecciones → «Abrir». Una selección de otra agencia responde 404.
 */
definePageMeta({ layout: 'admin', middleware: 'admin' })
const route = useRoute()
const dt = useDash()
const toast = useToast()
const { canWrite } = useAdminPermissions()
const canEdit = computed(() => canWrite('crm'))

const { data, refresh } = await useFetch<any>(`/api/admin/property-selections/${route.params.id}`)
const sel = computed<any>(() => data.value?.row || null)
const items = computed<any[]>(() => sel.value?.items || [])
useHead({ title: () => `${sel.value?.title || 'Selección'} — M&M Real Estate` })
const backTo = computed(() => (sel.value?.contact ? `/admin/contactos/${sel.value.contact.id}?tab=necesidades` : '/admin/contactos'))

const sending = ref(false)
const busy = ref(false)
async function act(body: Record<string, any>, ok: string | ((res: any) => string), failMessage: string): Promise<any | null> {
  busy.value = true
  try {
    const res = await $fetch<any>(`/api/admin/property-selections/${route.params.id}`, { method: 'PUT', body })
    await refresh()
    toast.success(typeof ok === 'function' ? ok(res) : ok)
    return res
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || failMessage)
    await refresh()
    return null
  } finally {
    busy.value = false
  }
}

function move(i: number, delta: number) {
  const ids = items.value.map((it) => it.id)
  const [id] = ids.splice(i, 1)
  ids.splice(i + delta, 0, id)
  return act({ action: 'reorder', itemIds: ids }, 'Orden guardado', 'No se pudo reordenar')
}

function remove(it: any) {
  return act({ action: 'remove', itemId: it.id }, `«${it.name}» quitada de la selección`, 'No se pudo quitar')
}

const toAdd = ref<PickedEntity | null>(null)
const addNote = ref('')
async function add() {
  if (!toAdd.value?.kind) return
  const label = toAdd.value.label
  const res = await act(
    { action: 'add', items: [{ propertyId: toAdd.value.id, propertyKind: toAdd.value.kind, note: addNote.value.trim() || undefined }] },
    (r) => (r?.added?.length ? `«${label}» añadida` : `«${label}» ya estaba en la selección`),
    'No se pudo añadir',
  )
  if (res) {
    toAdd.value = null
    addNote.value = ''
  }
}

const { format: formatAgencyMoney } = useAgencyCurrency()
/** Importe en la moneda de la agencia (utils/currency.ts) — antes «€» fijo. */
function money(n: number) {
  return formatAgencyMoney(n)
}
</script>
