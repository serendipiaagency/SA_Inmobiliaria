/**
 * Web pública de la cuenta demo: fija la bandera `demo-org` con la que
 * plugins/demo-links.client.ts neutraliza tel:/mailto:/WhatsApp. La usan los
 * dos layouts públicos (default y root); el panel la fija por su cuenta con la
 * empresa activa (layouts/admin.vue).
 *
 * Antes vivía en la franja negra de la vista previa (SitePreviewBar), que se
 * quitó: la vista previa enseña la web tal cual se publicará, sin franjas.
 */
export function useDemoOrgFlag() {
  const { tenant } = useTenant()
  const demoOrg = useState<boolean>('demo-org', () => false)
  watch(() => tenant.value?.isDemo, (v) => (demoOrg.value = Boolean(v)), { immediate: true })
}
