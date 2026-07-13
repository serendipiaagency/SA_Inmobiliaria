<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center text-ink">
    <NuxtLink to="/" class="mb-10">
      <Logo size="md" />
    </NuxtLink>

    <p class="eyebrow">{{ isNotFound ? 'Error 404' : `Error ${error?.statusCode || ''}` }}</p>
    <h1 class="heading-serif mt-4 max-w-xl text-4xl leading-tight sm:text-5xl">
      {{ isNotFound ? 'Esta página no existe' : 'Algo ha ido mal' }}
    </h1>
    <p class="mt-5 max-w-md text-[15px] leading-relaxed text-stone-500">
      {{
        isNotFound
          ? 'Puede que el enlace esté roto o que la propiedad ya no esté disponible. Prueba a buscarla desde el listado.'
          : 'Ha ocurrido un error inesperado. Puedes volver al inicio e intentarlo de nuevo.'
      }}
    </p>

    <div class="mt-9 flex flex-wrap justify-center gap-4">
      <button class="btn-primary" @click="handleClear">Volver al inicio</button>
      <NuxtLink to="/properties" class="btn-secondary">Ver propiedades</NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ error: { statusCode?: number; statusMessage?: string } }>()
const isNotFound = computed(() => props.error?.statusCode === 404)

useHead({ title: isNotFound.value ? 'Página no encontrada — M&M Real Estate' : 'Error — M&M Real Estate' })

function handleClear() {
  clearError({ redirect: '/' })
}
</script>
