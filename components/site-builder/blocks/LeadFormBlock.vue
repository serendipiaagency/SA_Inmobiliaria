<template>
  <section
    v-reveal
    data-testid="lead-form-block"
    :class="layout === 'split' ? 'border-y border-line bg-paper' : ''"
  >
    <div class="mx-auto max-w-screen-2xl px-6 py-20 lg:px-10 lg:py-24">
      <div :class="layout === 'split' ? 'grid items-stretch gap-10 lg:grid-cols-2 lg:gap-16' : 'mx-auto max-w-xl text-center'">
        <!-- Columna editorial -->
        <div :class="layout === 'split' ? 'flex flex-col justify-center' : ''">
          <SbText v-if="content.eyebrow" tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="eyebrow" :text="content.eyebrow" />
          <SbText tag="h2" field="title" kind="heading" label="Título" class="heading-serif mt-4 text-3xl tracking-tight md:text-4xl lg:text-[2.75rem] lg:leading-[1.1]" :text="content.title || ''" />
          <!-- Filete con el color de marca (Brand Kit); sin él, la tinta de la web. -->
          <div
            v-if="layout === 'split'"
            class="mt-6 h-[3px] w-14 rounded-full"
            :style="{ backgroundColor: ruleColor }"
          />
          <SbText
            v-if="content.description"
            tag="p"
            field="description"
            label="Descripción"
            multiline
            class="mt-6 text-[15px] leading-relaxed text-stone-500"
            :class="layout === 'split' ? 'max-w-md' : ''"
            :text="content.description"
          />
        </div>

        <!-- Tarjeta blanca del formulario -->
        <SbBox
          tag="form"
          field="form"
          kind="box"
          label="Formulario"
          class="space-y-4 rounded-3xl border border-line bg-white p-6 text-left shadow-[0_1px_2px_rgba(20,21,15,0.04),0_28px_56px_-32px_rgba(20,21,15,0.3)] sm:p-9"
          :class="layout === 'split' ? '' : 'mt-10'"
          @submit.prevent="submit"
        >
          <div>
            <label class="label"><SbText tag="span" field="nameLabel" kind="caption" label="Etiqueta del campo" :text="content.nameLabel || 'Nombre'" /> *</label>
            <input v-model="form.name" class="input" required :disabled="locked" >
          </div>
          <div>
            <label class="label"><SbText tag="span" field="emailLabel" kind="caption" label="Etiqueta del campo" :text="content.emailLabel || 'Email'" /> *</label>
            <input v-model="form.email" type="email" class="input" required :disabled="locked" >
          </div>
          <div v-if="content.showPhone !== false">
            <label class="label"><SbText tag="span" field="phoneLabel" kind="caption" label="Etiqueta del campo" :text="content.phoneLabel || 'Teléfono'" /></label>
            <input v-model="form.phone" class="input" :disabled="locked" >
          </div>
          <div>
            <label class="label"><SbText tag="span" field="messageLabel" kind="caption" label="Etiqueta del mensaje" :text="content.messageLabel || '¿Qué estás buscando?'" /> *</label>
            <textarea v-model="form.message" class="input" rows="4" required :disabled="locked" :placeholder="content.messagePlaceholder || ''" />
          </div>

          <!-- En el lienzo no se usa `disabled` (un botón deshabilitado no
               recibe clics y no se podría seleccionar): la intercepción del
               clic y el `if (locked) return` de submit() ya protegen. En
               Vista previa y en producción sí. El color del botón sale del
               Brand Kit de la empresa (contraste garantizado); sin color de
               marca, la tinta de la web (btn-primary). -->
          <SbButton
            type="submit"
            class="btn-primary mt-1 w-full"
            :class="mode === 'builder' && locked ? 'opacity-40' : ''"
            :style="buttonStyle"
            :disabled="mode === 'builder' ? undefined : sending || locked"
            :aria-disabled="locked ? 'true' : undefined"
            field="submitLabel"
            label="Botón de envío"
            :text="sending ? 'Enviando…' : content.submitLabel || 'Enviar'"
          />

          <SbText v-if="content.privacyNote" tag="p" field="privacyNote" kind="caption" label="Aviso legal" multiline class="text-center text-[11px] text-stone-400" :text="content.privacyNote" />
          <p v-if="sent" class="text-center text-sm font-medium text-ink">{{ content.successMessage || '¡Gracias! Te contactamos enseguida.' }}</p>
          <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>

          <!-- Sólo en el editor: deja claro por qué el formulario no envía,
               en vez de que parezca que está roto. -->
          <p v-if="locked" class="rounded-lg bg-stone-100 px-3 py-2 text-center text-[11px] text-stone-500">
            Desactivado mientras editas. En la web publicada, este formulario crea un lead real en tu CRM.
          </p>
        </SbBox>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import SbText from '../nodes/SbText.vue'
import SbBox from '../nodes/SbBox.vue'
import SbButton from '../nodes/SbButton.vue'
import { heroButtonColors } from '~/utils/heroSearch'
import { TENANT_BRANDING_OVERRIDE } from '~/composables/useTenant'

/**
 * Formulario de captación.
 *
 * Publica en `/api/public/contact`, el mismo endpoint que ya usa la página
 * de Contacto: guarda el mensaje, crea o actualiza el lead en el CRM con
 * origen `web` y dispara la notificación interna. **No se ha añadido un
 * endpoint nuevo a propósito** — ese camino ya está limitado por IP (5 envíos
 * cada 10 minutos), valida el email y está cubierto por pruebas; duplicarlo
 * sería duplicar también su superficie de abuso.
 *
 * `subject` lo fija la inmobiliaria en el inspector y viaja con cada envío,
 * así que en el CRM se distingue un lead de este bloque de uno del formulario
 * de contacto general. Con «Quién escribe: Propietarios que venden»
 * (`purpose: 'seller'`) va como `form: 'seller'`: el lead es de captación y
 * el Contact recibe el rol «Vendedor» (server/api/public/contact.post.ts).
 *
 * El campo de mensaje es obligatorio porque lo es en el endpoint: un
 * formulario que lo escondiera tendría que inventarse un texto para que la
 * petición pasara, y ese texto acabaría en el CRM como si lo hubiera escrito
 * la persona.
 *
 * Diseño (Cola 18): composición premium a dos columnas con la tarjeta del
 * formulario en blanco y elevada, y el color de marca del Brand Kit en el
 * botón de envío y el filete bajo el título. El color del botón se calcula
 * con `heroButtonColors` (oscurece el color de marca hasta que el texto
 * blanco contrasta), el mismo helper que la barra del Hero: así el acento es
 * coherente en toda la web y nunca queda un botón ilegible.
 */
const props = withDefaults(
  defineProps<{
    content: Record<string, any>
    /** El renderizador lo pasa; sólo este bloque lo necesita, porque es el único con efecto real. */
    mode?: 'production' | 'builder' | 'preview'
  }>(),
  { mode: 'production' },
)

const layout = computed(() => (props.content.layout === 'centered' ? 'centered' : 'split'))

// Color de marca de la empresa (Brand Kit). En el Constructor, la vista previa
// inyecta un override para enseñar el color elegido sin recargar.
const { tenant } = useTenant()
const brandingOverride = inject(TENANT_BRANDING_OVERRIDE, null)
const brandColor = computed(() => brandingOverride?.value?.brandColor ?? tenant.value?.brandColor ?? null)

// Botón: color de marca con contraste garantizado; sin marca, se deja
// `.btn-primary` (tinta de la web) sin estilo en línea.
const buttonStyle = computed(() => {
  if (!brandColor.value) return undefined
  const c = heroButtonColors(null, brandColor.value)
  return { backgroundColor: c.bg, color: c.fg }
})
// Filete bajo el título: color de marca o, sin él, la tinta de la web.
const ruleColor = computed(() => (brandColor.value ? heroButtonColors(null, brandColor.value).bg : '#16150f'))

/**
 * En el lienzo el clic está interceptado y no llega a enviar, pero **Vista
 * previa sí navega y sí dispara handlers de verdad** (es su razón de ser).
 * Sin este bloqueo, probar la portada crearía leads y notificaciones reales
 * en el CRM de la inmobiliaria.
 */
const locked = computed(() => props.mode !== 'production')
// Cierre del núcleo (FASE 15): el lead llega con el idioma de quien escribe, para el enrutado por idioma.
const visitorLanguage = useVisitorLanguage()

const form = reactive({ name: '', email: '', phone: '', message: '' })
const sending = ref(false)
const sent = ref(false)
const error = ref('')

async function submit() {
  if (locked.value) return
  sending.value = true
  sent.value = false
  error.value = ''
  try {
    await $fetch('/api/public/contact', {
      method: 'POST',
      body: {
        ...form,
        type: 'contact',
        // En la bandeja de Comunicaciones el hilo se etiqueta «Formulario de captación» (núcleo N8a);
        // el de propietarios que quieren vender, «Vender propiedad»: su lead es de captación.
        form: props.content.purpose === 'seller' ? 'seller' : 'lead_form',
        subject: props.content.subject || (props.content.purpose === 'seller' ? 'Vender propiedad' : 'Formulario de captación'),
        language: visitorLanguage(),
      },
    })
    sent.value = true
    Object.assign(form, { name: '', email: '', phone: '', message: '' })
  } catch (e: any) {
    // 429 es el limitador por IP, y decirlo es más útil que un "algo salió mal".
    error.value =
      e?.statusCode === 429
        ? 'Has enviado varios mensajes seguidos. Inténtalo de nuevo en unos minutos.'
        : e?.data?.statusMessage || e?.statusMessage || 'Algo salió mal. Por favor, inténtalo de nuevo.'
  } finally {
    sending.value = false
  }
}
</script>
