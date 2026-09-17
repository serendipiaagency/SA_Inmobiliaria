<template>
  <section v-reveal :class="layout === 'split' ? 'border-y border-line bg-paper' : ''">
    <div class="mx-auto max-w-screen-2xl px-6 py-16 lg:px-10">
      <div :class="layout === 'split' ? 'grid items-start gap-10 lg:grid-cols-2' : 'mx-auto max-w-xl text-center'">
        <div>
          <p v-if="content.eyebrow" class="eyebrow">{{ content.eyebrow }}</p>
          <h2 class="heading-serif mt-3 text-3xl md:text-4xl">{{ content.title }}</h2>
          <p v-if="content.description" class="mt-4 text-[15px] text-stone-500" :class="layout === 'split' ? 'max-w-md' : ''">
            {{ content.description }}
          </p>
        </div>

        <form class="card space-y-4 p-6 text-left sm:p-8" :class="layout === 'split' ? '' : 'mt-8'" @submit.prevent="submit">
          <div>
            <label class="label">Nombre *</label>
            <input v-model="form.name" class="input" required :disabled="locked" >
          </div>
          <div>
            <label class="label">Email *</label>
            <input v-model="form.email" type="email" class="input" required :disabled="locked" >
          </div>
          <div v-if="content.showPhone !== false">
            <label class="label">Teléfono</label>
            <input v-model="form.phone" class="input" :disabled="locked" >
          </div>
          <div>
            <label class="label">{{ content.messageLabel || '¿Qué estás buscando?' }} *</label>
            <textarea v-model="form.message" class="input" rows="4" required :disabled="locked" :placeholder="content.messagePlaceholder || ''" />
          </div>

          <button type="submit" class="btn-primary w-full" :disabled="sending || locked">
            {{ sending ? 'Enviando…' : content.submitLabel || 'Enviar' }}
          </button>

          <p v-if="content.privacyNote" class="text-center text-[11px] text-stone-400">{{ content.privacyNote }}</p>
          <p v-if="sent" class="text-center text-sm font-medium text-ink">{{ content.successMessage || '¡Gracias! Te contactamos enseguida.' }}</p>
          <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>

          <!-- Sólo en el editor: deja claro por qué el formulario no envía,
               en vez de que parezca que está roto. -->
          <p v-if="locked" class="rounded-lg bg-stone-100 px-3 py-2 text-center text-[11px] text-stone-500">
            Desactivado mientras editas. En la web publicada, este formulario crea un lead real en tu CRM.
          </p>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
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
 * de contacto general. Es lo único que el bloque añade al payload.
 *
 * El campo de mensaje es obligatorio porque lo es en el endpoint: un
 * formulario que lo escondiera tendría que inventarse un texto para que la
 * petición pasara, y ese texto acabaría en el CRM como si lo hubiera escrito
 * la persona.
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

/**
 * En el lienzo el clic está interceptado y no llega a enviar, pero **Vista
 * previa sí navega y sí dispara handlers de verdad** (es su razón de ser).
 * Sin este bloqueo, probar la portada crearía leads y notificaciones reales
 * en el CRM de la inmobiliaria.
 */
const locked = computed(() => props.mode !== 'production')

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
        subject: props.content.subject || 'Formulario de captación',
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
