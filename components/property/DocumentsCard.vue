<template>
  <section v-if="files.length" id="documentacion" class="pcard min-w-0" data-testid="public-property-documents">
    <h2 class="pcard-title">{{ t('propertyDetails.documents.available', 'Documentación disponible') }}</h2>
    <ul class="mt-2">
      <li v-for="f in files" :key="f.key" class="flex items-center gap-3 border-b border-[#f1eee8] py-2.5 last:border-0" :data-doc="f.key">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold" :class="f.isImage ? 'bg-sky-50 text-sky-700' : 'bg-[#fbe9dd] text-[#a14f22]'" aria-hidden="true">{{ f.badge }}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[13.5px] font-semibold text-ink">{{ f.title }}</span>
          <span v-if="f.sub" class="block truncate text-[12px] text-stone-500">{{ f.sub }}</span>
        </span>
        <a v-if="f.viewUrl" :href="f.viewUrl" target="_blank" rel="noopener" class="doc-action" :aria-label="`${t('propertyDetails.documents.view', 'Ver')}: ${f.title}`" data-testid="document-view">{{ t('propertyDetails.documents.view', 'Ver') }}</a>
        <a :href="f.url" :download="f.fileName || ''" rel="noopener" class="doc-action doc-action-icon" :aria-label="`${t('propertyDetails.documents.download', 'Descargar')}: ${f.title}`" :title="t('propertyDetails.documents.download', 'Descargar')" data-testid="document-download">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
        </a>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import type { PublicDocument } from '~/utils/propertyFacts'

/**
 * «Documentación disponible» (#110): sólo lo que la agencia ha autorizado
 * para la web — los PDF publicables de la multimedia y los documentos con
 * visibilidad «Público» (el servidor los da sólo con la propiedad publicada y
 * vuelve a decidir el permiso en cada descarga; los caducados no salen).
 * «Ver» abre un PDF o una imagen en el navegador; el resto sólo se descarga.
 * Sin documentos, la sección no existe.
 */
const props = defineProps<{ documents: PublicDocument[] }>()
const { t } = useI18n()

const INLINE = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
function size(bytes?: number | null): string {
  if (!bytes) return ''
  return bytes >= 1048576 ? `${(bytes / 1048576).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
const files = computed(() =>
  props.documents.map((d) => {
    const mime = String(d.mimeType || (d.isDocument ? '' : 'application/pdf'))
    const isImage = mime.startsWith('image/')
    const badge = isImage ? 'IMG' : mime === 'application/pdf' ? 'PDF' : 'DOC'
    const canView = INLINE.has(mime)
    return {
      key: d.key,
      title: d.title,
      sub: [d.typeLabel, badge, size(d.sizeBytes)].filter(Boolean).join(' · '),
      url: d.url,
      viewUrl: canView ? (d.isDocument ? `${d.url}?ver=1` : d.url) : '',
      isImage,
      badge,
      fileName: '',
    }
  }),
)
</script>

<style scoped>
.doc-action {
  display: inline-flex;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid #ece8e1;
  border-radius: 9px;
  padding: 0 10px;
  font-size: 12.5px;
  font-weight: 600;
  color: #1c1b19;
  background: #fff;
}
.doc-action:hover {
  border-color: #1c1b19;
}
.doc-action-icon {
  width: 32px;
  padding: 0;
}
</style>
