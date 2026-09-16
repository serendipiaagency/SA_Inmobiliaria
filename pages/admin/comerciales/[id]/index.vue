<template>
  <TeamBuilderCommercialBuilder :id="route.params.id as string" />
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
const route = useRoute()
</script>
