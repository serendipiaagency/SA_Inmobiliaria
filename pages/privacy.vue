<template>
  <div>
    <section class="border-b border-line bg-white">
      <div class="mx-auto max-w-screen-2xl px-6 py-20 text-center lg:px-10">
        <p class="eyebrow">Legal</p>
        <h1 class="heading-serif mx-auto mt-4 max-w-2xl text-5xl leading-tight">Política de privacidad</h1>
        <p class="mt-4 text-sm text-stone-400">Última actualización: {{ lastUpdated }}</p>
      </div>
    </section>

    <div class="mx-auto max-w-3xl space-y-10 px-6 py-20 text-[15px] leading-[1.9] text-stone-600 lg:px-0">
      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">1. Quiénes somos</h2>
        <p>
          M&M Real Estate opera este sitio web como un marketplace de proyectos off-plan, propiedades de segunda venta
          y comunidades residenciales en los Emiratos Árabes Unidos. Esta política explica qué datos personales
          recogemos, con qué finalidad, y qué derechos tienes sobre ellos.
        </p>
      </section>

      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">2. Qué datos recogemos</h2>
        <p>Dependiendo de cómo interactúes con el sitio, podemos recoger:</p>
        <ul class="mt-3 list-disc space-y-2 pl-5">
          <li><strong>Datos de contacto:</strong> nombre, email y teléfono, cuando envías el formulario de contacto, una reclamación o agendas una visita a una propiedad.</li>
          <li><strong>Documentación de verificación:</strong> si usas el formulario de visitante, puede incluir copia de pasaporte, Emirates ID o extractos bancarios que subas voluntariamente para acreditar tu identidad o capacidad financiera ante un promotor.</li>
          <li><strong>Datos de proveedores:</strong> información fiscal y de contacto si te registras como proveedor.</li>
          <li><strong>Preferencias de navegación:</strong> propiedades guardadas como favoritas y búsquedas guardadas, almacenadas localmente en tu navegador (no en nuestros servidores) salvo que inicies sesión.</li>
          <li><strong>Datos técnicos:</strong> dirección IP, tipo de navegador y páginas visitadas, mediante cookies (ver la sección de Cookies más abajo).</li>
        </ul>
      </section>

      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">3. Para qué usamos tus datos</h2>
        <ul class="mt-3 list-disc space-y-2 pl-5">
          <li>Responder a tus consultas y gestionar reservas de visita.</li>
          <li>Verificar tu identidad o capacidad financiera cuando lo requiere el proceso de compra de una propiedad.</li>
          <li>Mejorar el sitio y personalizar el contenido que ves.</li>
          <li>Cumplir obligaciones legales y contractuales frente a promotores y autoridades.</li>
        </ul>
        <p class="mt-3">No vendemos tus datos personales a terceros.</p>
      </section>

      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">4. Documentos sensibles (pasaporte, Emirates ID, extractos bancarios)</h2>
        <p>
          Estos documentos, cuando los subes voluntariamente, se almacenan de forma privada y solo son accesibles por
          personal autorizado para el propósito específico de la transacción inmobiliaria correspondiente. Puedes
          solicitar su eliminación en cualquier momento a través del formulario de contacto.
        </p>
      </section>

      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">5. Cookies</h2>
        <p>
          Usamos cookies esenciales para el funcionamiento del sitio y, si las aceptas, cookies analíticas para
          entender cómo se usa el sitio. Puedes gestionar tu preferencia desde el aviso de cookies que aparece en tu
          primera visita, o borrando las cookies desde la configuración de tu navegador.
        </p>
      </section>

      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">6. Tus derechos</h2>
        <p>
          Puedes solicitar acceso, rectificación o eliminación de tus datos personales, así como oponerte a su
          tratamiento, escribiéndonos a través del <NuxtLink to="/contact-us" class="underline hover:text-ink">formulario de contacto</NuxtLink>.
          Responderemos a tu solicitud en un plazo razonable.
        </p>
      </section>

      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">7. Conservación de datos</h2>
        <p>
          Conservamos tus datos solo durante el tiempo necesario para cumplir la finalidad para la que fueron
          recogidos, o mientras exista una obligación legal o contractual que lo requiera.
        </p>
      </section>

      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">8. Cambios en esta política</h2>
        <p>
          Podemos actualizar esta política ocasionalmente. Publicaremos cualquier cambio en esta misma página con la
          fecha de última actualización.
        </p>
      </section>

      <div class="pt-4">
        <NuxtLink to="/contact-us" class="btn-primary">Contactar sobre tus datos</NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
useHead({
  title: 'Política de privacidad — M&M Real Estate',
  meta: [{ name: 'description', content: 'Cómo M&M Real Estate recoge, usa y protege tus datos personales.' }],
})
const lastUpdated = '12 de julio de 2026'
</script>
