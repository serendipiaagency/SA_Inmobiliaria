<template>
  <!-- Vista previa de una empresa sin dominio propio (server/utils/sitePreview.ts) -->
  <div v-if="tenant?.preview" class="bg-ink px-4 py-2 text-center text-xs text-paper" data-testid="site-preview-bar">
    Vista previa de la web de {{ tenant.companyName || tenant.name }}: sólo la ve tu equipo.
    <a href="/?vista_previa=salir" class="ml-2 underline underline-offset-2">Salir de la vista previa</a>
  </div>
</template>

<script setup lang="ts">
/**
 * Lo común de las páginas públicas para una empresa vista en vista previa o
 * que es la cuenta demo: la franja para salir de la vista previa y la bandera
 * con la que plugins/demo-links.client.ts neutraliza tel:/mailto:/WhatsApp.
 */
const { tenant } = useTenant()
const demoOrg = useState<boolean>('demo-org', () => false)
watch(() => tenant.value?.isDemo, (v) => (demoOrg.value = Boolean(v)), { immediate: true })
</script>
