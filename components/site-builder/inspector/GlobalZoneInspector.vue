<template>
  <div data-testid="global-zone-inspector">
    <div class="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-[12px] text-violet-900">
      <p class="font-semibold">{{ zone === 'header' ? 'Cabecera' : 'Pie de página' }} — elemento global</p>
      <p class="mt-1 text-violet-800">
        Aparece igual en todas las páginas de tu web, no sólo en Inicio. Cambiarlo aquí lo cambiaría en todas a la vez, así que se
        administra desde un solo sitio y no desde esta página.
      </p>
    </div>

    <div class="mt-4 space-y-3 text-[13px] text-stone-600">
      <div v-if="element === 'logo' || !element" class="rounded-lg border border-line p-3">
        <p class="font-semibold text-ink">Logo y nombre de la empresa</p>
        <p class="mt-0.5 text-[12px] text-stone-500">Son los de tu organización: se ven en la cabecera, el pie, las fichas y los emails.</p>
        <NuxtLink to="/admin/organizations" target="_blank" class="mt-1.5 inline-block text-[12px] font-semibold text-ink underline">Editar en Sistema → Empresas →</NuxtLink>
      </div>
      <div v-if="element === 'menu' || !element" class="rounded-lg border border-line p-3">
        <p class="font-semibold text-ink">Menú de navegación</p>
        <p class="mt-0.5 text-[12px] text-stone-500">
          Propiedades, Mapa, Comunidades, Promotoras, Equipo y Blog: cada entrada aparece cuando su página tiene contenido publicado. Los
          textos siguen el idioma del visitante.
        </p>
      </div>
      <div v-if="element === 'contact' || !element" class="rounded-lg border border-line p-3">
        <p class="font-semibold text-ink">{{ zone === 'header' ? 'Botón de contacto' : 'Datos legales y enlaces del pie' }}</p>
        <p class="mt-0.5 text-[12px] text-stone-500">
          {{ zone === 'header' ? 'Lleva siempre a la página de Contacto de tu web.' : 'El nombre legal, los enlaces a Privacidad y Términos y el año se rellenan solos con los datos de tu organización.' }}
        </p>
        <NuxtLink v-if="zone === 'footer'" to="/admin/privacidad" target="_blank" class="mt-1.5 inline-block text-[12px] font-semibold text-ink underline">Datos legales → Privacidad y RGPD →</NuxtLink>
      </div>
    </div>

    <p class="mt-4 text-[11px] text-stone-400">
      Para verlo con enlaces funcionando usa Vista previa. Para seguir editando la página, pulsa cualquier sección.
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * Lo que el inspector enseña al seleccionar la cabecera o el pie en el
 * lienzo: no son parte de la página de Inicio sino del sitio entero (los
 * pinta layouts/default.vue para todas las páginas), así que no se editan
 * aquí — se dice claramente de dónde salen y dónde se cambian, en vez de
 * crear una copia divergente sólo para Inicio.
 */
defineProps<{ zone: 'header' | 'footer'; element: string | null }>()
</script>
