<template>
  <section class="pe-card mt-6 px-6 py-5 sm:px-8" data-testid="property-extra-panels">
    <div class="mb-4">
      <h2 class="text-[15px] font-medium text-ink">Etiquetas</h2>
      <p class="mb-2 text-[12px] text-stone-500">Para agrupar y filtrar en el listado (la acción masiva «Añadir etiqueta» pone las mismas).</p>
      <TagsEditor :entity-type="kind" :entity-id="propertyId" :can-edit="canWrite('web')" />
    </div>
    <div class="border-t border-line pt-4">
      <h2 class="mb-2 text-[15px] font-medium text-ink">Campos personalizados</h2>
      <CustomFieldsPanel entity-type="property" :property-kind="kind" :entity-id="propertyId" :can-edit="canWrite('web')" />
    </div>
  </section>
</template>

<script setup lang="ts">
import TagsEditor from '~/components/admin/tags/TagsEditor.vue'
import CustomFieldsPanel from '~/components/admin/custom-fields/CustomFieldsPanel.vue'

/**
 * Etiquetas y campos personalizados de una propiedad (FASE 0, bloque N7b),
 * iguales en los dos catálogos. Se monta con una sola línea en
 * PropertyBuilder.vue (debajo del editor, una vez creada la ficha) para no
 * tocar el editor. Área Portal Web: es lo que exigen sus recursos
 * (`property-tags`, `property-custom-field-values`).
 */
defineProps<{ propertyId: number; kind: 'agent' | 'developer' }>()
const { canWrite } = useAdminPermissions()
</script>
