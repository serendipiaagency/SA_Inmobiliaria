<template>
  <div>
    <InspectorSection title="Contenido">
      <TextField label="Eyebrow" :model-value="content.eyebrow || ''" @update:model-value="(v) => (content.eyebrow = v)" />
      <TextField label="Título" :model-value="content.title || ''" @update:model-value="(v) => (content.title = v)" />
      <TextField label="Descripción" :model-value="content.description || ''" placeholder="Una línea que explique qué pasa al enviar" @update:model-value="(v) => (content.description = v)" />
    </InspectorSection>

    <InspectorSection title="Formulario">
      <TextField label="Texto del botón" :model-value="content.submitLabel || ''" placeholder="Enviar" @update:model-value="(v) => (content.submitLabel = v)" />
      <TextField label="Etiqueta del mensaje" :model-value="content.messageLabel || ''" placeholder="¿Qué estás buscando?" @update:model-value="(v) => (content.messageLabel = v)" />
      <TextField label="Pista dentro del mensaje" :model-value="content.messagePlaceholder || ''" placeholder="Zona, presupuesto, número de habitaciones…" @update:model-value="(v) => (content.messagePlaceholder = v)" />
      <ToggleField label="Pedir teléfono" :model-value="content.showPhone !== false" @update:model-value="(v) => (content.showPhone = v)" />
      <p class="mt-1 text-[11px] text-stone-400">
        Nombre, email y mensaje son siempre obligatorios: son los que crean el lead en tu CRM.
      </p>
    </InspectorSection>

    <InspectorSection title="Tras enviar">
      <TextField label="Mensaje de gracias" :model-value="content.successMessage || ''" placeholder="¡Gracias! Te contactamos enseguida." @update:model-value="(v) => (content.successMessage = v)" />
      <TextField
        label="Referencia interna"
        hint="Viaja con cada envío y aparece en el lead, para saber de qué formulario vino. No lo ve el visitante."
        :model-value="content.subject || ''"
        placeholder="Formulario de portada"
        @update:model-value="(v) => (content.subject = v)"
      />
      <TextField label="Aviso legal bajo el botón" :model-value="content.privacyNote || ''" placeholder="Al enviar aceptas nuestra política de privacidad." @update:model-value="(v) => (content.privacyNote = v)" />
    </InspectorSection>

    <InspectorSection title="Diseño" tab="design">
      <LayoutPickerField
        label="Diseño"
        type="lead-form"
        :model-value="content.layout || 'split'"
        :options="[{ value: 'split', label: 'Texto y formulario' }, { value: 'centered', label: 'Centrado' }]"
        @update:model-value="(v) => (content.layout = v)"
      />
    </InspectorSection>

    <InspectorSection title="Comportamiento">
      <p class="text-[12px] text-stone-500">
        Cada envío crea un <strong>lead real</strong> en CRM → Leads (origen «web») y guarda el mensaje en Bandeja → Mensajes.
        Si tienes destinatarios configurados, además avisa por email.
      </p>
      <p class="mt-2 text-[11px] text-stone-400">
        Mientras editas o usas Vista previa el formulario está desactivado, para que probar la página no llene el CRM de leads inventados.
      </p>
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import TextField from '../inspector/fields/TextField.vue'
import ToggleField from '../inspector/fields/ToggleField.vue'
import LayoutPickerField from '../inspector/fields/LayoutPickerField.vue'

defineProps<{ content: Record<string, any> }>()
</script>
