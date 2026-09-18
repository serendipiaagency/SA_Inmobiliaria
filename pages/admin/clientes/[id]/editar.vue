<template>
  <ClientBuilder mode="edit" :id="id" />
</template>

<script setup lang="ts">
import ClientBuilder from '~/components/client-builder/ClientBuilder.vue'

definePageMeta({ layout: 'admin', middleware: 'admin' })

const route = useRoute()
const id = route.params.id as string
useHead({ title: 'Editar cliente' })
</script>
