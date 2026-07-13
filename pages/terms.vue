<template>
  <div>
    <section class="border-b border-line bg-white">
      <div class="mx-auto max-w-screen-2xl px-6 py-20 text-center lg:px-10">
        <p class="eyebrow">Legal</p>
        <h1 class="heading-serif mx-auto mt-4 max-w-2xl text-5xl leading-tight">Términos y condiciones</h1>
        <p class="mt-4 text-sm text-stone-400">Última actualización: {{ lastUpdated }}</p>
      </div>
    </section>

    <div class="mx-auto max-w-3xl space-y-10 px-6 py-20 text-[15px] leading-[1.9] text-stone-600 lg:px-0">
      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">1. Aceptación de los términos</h2>
        <p>
          Al usar este sitio web aceptas estos términos y condiciones. Si no estás de acuerdo con ellos, por favor no
          uses el sitio.
        </p>
      </section>

      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">2. Naturaleza del servicio</h2>
        <p>
          M&M Real Estate es un marketplace que muestra proyectos off-plan, propiedades de segunda venta y
          comunidades residenciales de promotores y agentes autorizados en los Emiratos Árabes Unidos. No somos
          propietarios de los inmuebles listados salvo que se indique expresamente; actuamos como intermediarios
          entre compradores y promotores/agentes.
        </p>
      </section>

      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">3. Precisión de la información</h2>
        <p>
          Los precios, disponibilidad, plazos de entrega y características de cada propiedad se muestran de la forma
          más precisa posible, pero pueden cambiar sin previo aviso por parte del promotor. Cualquier análisis,
          puntuación o proyección generada por herramientas del sitio (incluida la sección de inteligencia
          artificial) tiene carácter informativo y no constituye asesoramiento financiero, legal ni de inversión.
        </p>
      </section>

      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">4. Uso del sitio</h2>
        <ul class="mt-3 list-disc space-y-2 pl-5">
          <li>Debes proporcionar información veraz en los formularios de contacto, visita y registro de proveedor.</li>
          <li>No está permitido usar el sitio para fines fraudulentos, de scraping masivo no autorizado, o para interferir con su funcionamiento normal.</li>
          <li>El contenido del sitio (textos, imágenes, diseño) es propiedad de M&M Real Estate o de sus licenciantes y no puede reproducirse sin autorización.</li>
        </ul>
      </section>

      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">5. Reservas y visitas</h2>
        <p>
          Agendar una visita o enviar una solicitud de reserva a través del sitio no constituye un contrato de
          compraventa. Cualquier acuerdo vinculante se formaliza directamente con el promotor o agente correspondiente,
          fuera de esta plataforma.
        </p>
      </section>

      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">6. Limitación de responsabilidad</h2>
        <p>
          M&M Real Estate no se hace responsable de decisiones de inversión tomadas exclusivamente en base al
          contenido del sitio, ni de incumplimientos por parte de terceros promotores o agentes listados en la
          plataforma.
        </p>
      </section>

      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">7. Modificaciones</h2>
        <p>
          Podemos actualizar estos términos en cualquier momento. El uso continuado del sitio tras un cambio implica
          la aceptación de los nuevos términos.
        </p>
      </section>

      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">8. Contacto</h2>
        <p>
          Para cualquier duda sobre estos términos, escríbenos a través del
          <NuxtLink to="/contact-us" class="underline hover:text-ink">formulario de contacto</NuxtLink>.
        </p>
      </section>

      <div class="pt-4">
        <NuxtLink to="/privacy" class="btn-secondary">Ver política de privacidad</NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
useHead({
  title: 'Términos y condiciones — M&M Real Estate',
  meta: [{ name: 'description', content: 'Términos y condiciones de uso del marketplace M&M Real Estate.' }],
})
const lastUpdated = '12 de julio de 2026'
</script>
