<template>
  <ClientBuilder mode="create" />
</template>

<script setup lang="ts">
import ClientBuilder from '~/components/client-builder/ClientBuilder.vue'

// Alta y edición usan el mismo editor: son la misma tarea con distinto punto
// de partida. Ver components/client-builder/ClientBuilder.vue.
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Nuevo cliente' })
</script>
