<template>
  <div class="space-y-10" data-testid="property-media-suite">
    <!-- Portada: una sola, la fotografía principal de la propiedad. -->
    <section data-testid="media-cover" aria-labelledby="media-cover-title">
      <h3 id="media-cover-title" class="text-[15px] font-medium text-ink">Portada</h3>
      <p class="mb-3 mt-1 text-[12px] text-stone-450">
        La fotografía principal: sale en los listados, las tarjetas, la vista previa, la ficha pública y al compartir. Sólo hay una portada activa; sustituirla o «Usar como portada» desde la galería cambia la que había.
      </p>
      <div class="grid gap-4 sm:grid-cols-2">
        <PropertyBuilderField :spec="coverSpec" :model-value="form[section.coverField]" :upload-folder="uploadFolder" @update:model-value="(v) => emit('update:field', section.coverField, v)" />
      </div>
      <div v-if="section.projectImages.length" class="mt-6">
        <p class="mb-3 text-[13px] font-medium text-ink">Identidad del proyecto</p>
        <div class="grid gap-4 sm:grid-cols-2">
          <PropertyBuilderField v-for="f in section.projectImages" :key="f.key" :spec="f" :model-value="form[f.key]" :upload-folder="uploadFolder" @update:model-value="(v) => emit('update:field', f.key, v)" />
        </div>
      </div>
    </section>

    <!-- Galería: por estancias (catálogo de utils/mediaRooms.ts), con su orden y metadatos. -->
    <section data-testid="media-gallery" aria-labelledby="media-gallery-title">
      <h3 id="media-gallery-title" class="text-[15px] font-medium text-ink">Galería</h3>
      <p class="mb-3 mt-1 text-[12px] text-stone-450">
        Fotografías clasificadas por estancia (salón, cocina, dormitorios, baños, exterior…): la ficha pública enseña esas categorías. Se pueden subir varias a la vez, asignar varias a una estancia, reordenar y cambiar de estancia.
      </p>
      <GalleryManager
        :child-resource="section.gallery.childResource"
        :parent-field="section.gallery.parentField"
        :parent-id="parentId"
        :cover-value="form[section.coverField]"
        :can-edit="canEdit"
        :trashed="trashed"
        @use-as-cover="(key) => emit('update:field', section.coverField, key)"
      />
    </section>

    <!-- Vídeos -->
    <section data-testid="media-videos" aria-labelledby="media-videos-title">
      <h3 id="media-videos-title" class="text-[15px] font-medium text-ink">Vídeos</h3>
      <p class="mb-3 mt-1 text-[12px] text-stone-450">Un vídeo principal (archivo o enlace compatible). Los demás vídeos, con su miniatura, título, orden y visibilidad, se gestionan en la galería de arriba.</p>
      <div class="grid gap-4 sm:grid-cols-2">
        <PropertyBuilderField :spec="section.videoField" :model-value="form[section.videoField.key]" :upload-folder="uploadFolder" @update:model-value="(v) => emit('update:field', section.videoField.key, v)" />
      </div>
    </section>

    <!-- Planos -->
    <section data-testid="media-plans" aria-labelledby="media-plans-title">
      <h3 id="media-plans-title" class="text-[15px] font-medium text-ink">Planos</h3>
      <p class="mb-3 mt-1 text-[12px] text-stone-450">Los planos de la vivienda: se ven en la ficha pública («Plano de la vivienda» y la pestaña «Plano» de la galería), en este orden y con su título. Desmarca «Visible en la web» para guardar uno sólo en el panel.</p>
      <ChildCardManager
        :child-resource="section.floorPlans.childResource"
        :parent-field="section.floorPlans.parentField"
        :parent-id="parentId"
        :columns="section.floorPlans.columns"
        :order-field="section.floorPlans.orderField"
        :visible-field="section.floorPlans.visibleField"
      />
      <div v-if="section.planTexts.length" class="mt-6 grid gap-4 sm:grid-cols-2">
        <PropertyBuilderField v-for="f in section.planTexts" :key="f.key" :spec="f" :model-value="form[f.key]" :upload-folder="uploadFolder" @update:model-value="(v) => emit('update:field', f.key, v)" />
      </div>
    </section>

    <!-- Vistas 360° y tours virtuales -->
    <section v-if="section.tourFields.length" data-testid="media-tours" aria-labelledby="media-tours-title">
      <h3 id="media-tours-title" class="text-[15px] font-medium text-ink">Vistas 360° y tours virtuales</h3>
      <p class="mb-3 mt-1 text-[12px] text-stone-450">Un tour sólo se publica si su enlace es un visor que se pueda abrir (https). Las vistas 360° y otros formatos se añaden en la galería.</p>
      <div class="grid gap-4 sm:grid-cols-2">
        <PropertyBuilderField v-for="f in section.tourFields" :key="f.key" :spec="f" :model-value="form[f.key]" :upload-folder="uploadFolder" @update:model-value="(v) => emit('update:field', f.key, v)" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { FieldSpec, MediaSection } from '~/composables/usePropertyBuilderConfig'
import PropertyBuilderField from './PropertyBuilderField.vue'
import GalleryManager from './GalleryManager.vue'
import ChildCardManager from './ChildCardManager.vue'

/**
 * «Multimedia y planos»: Portada, Galería, Vídeos, Planos y Vistas 360° /
 * tours en un solo apartado, con los gestores de siempre (no hay un segundo
 * modelo de multimedia). La galería y los planos necesitan que la propiedad
 * exista; la portada, el vídeo y los tours se guardan con ella.
 */
const props = defineProps<{
  section: MediaSection
  form: Record<string, any>
  parentId: number | null
  canEdit: boolean
  trashed: boolean
  uploadFolder: string
}>()
const emit = defineEmits<{ 'update:field': [key: string, value: unknown] }>()

const coverSpec = computed<FieldSpec>(() => ({ key: props.section.coverField, label: 'Imagen de portada', type: 'image', recommended: true }))
</script>
