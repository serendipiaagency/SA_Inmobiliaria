/**
 * Cuenta demo: en el navegador, los enlaces que llamarían, escribirían o
 * abrirían WhatsApp de verdad (`tel:`, `sms:`, `mailto:`, wa.me…) no hacen
 * nada y lo dicen. Los clientes de la demo son ficticios, pero sus teléfonos
 * tienen formato real y un clic en `tel:` marcaría desde el móvil de quien
 * enseña la demo. Es la última barrera; el servidor ya no envía nada por
 * ninguna vía en una cuenta demo (server/utils/demo/tenant.ts).
 *
 * La bandera `demo-org` la ponen el panel (layouts/admin.vue, con la empresa
 * activa) y la web pública (composables/useDemoOrgFlag.ts, con el inquilino).
 */
const EXTERNAL = /^(tel:|sms:|mailto:|whatsapp:)|^https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//i

export default defineNuxtPlugin(() => {
  const demo = useState<boolean>('demo-org', () => false)
  const toast = useToast()
  document.addEventListener(
    'click',
    (e) => {
      if (!demo.value) return
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || !EXTERNAL.test(a.getAttribute('href') || '')) return
      e.preventDefault()
      e.stopPropagation()
      toast.info('Cuenta de demostración: no se llama ni se escribe a nadie. Los contactos son ficticios.', 4500)
    },
    true,
  )
})
