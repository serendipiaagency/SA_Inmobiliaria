<template>
  <aside class="cms-keypoints" data-testid="cms-keypoints" :aria-label="block.title || 'En resumen'">
    <p class="cms-keypoints-title">{{ block.title || 'En resumen' }}</p>
    <ul>
      <li v-for="(item, i) in block.items || []" :key="i">{{ item }}</li>
    </ul>
  </aside>
</template>

<script setup lang="ts">
/** «En resumen»: los puntos esenciales del artículo antes de empezar a leer. */
defineProps<{ block: { title?: string; items?: string[] } }>()
</script>

<style scoped>
.cms-keypoints {
  margin: 2.5rem 0;
  padding: 1.75rem 2rem;
  border-left: 3px solid var(--cms-accent, #1f4e5f);
  background: var(--cms-paper-2, #f6f4ef);
  border-radius: 0 1rem 1rem 0;
}
.cms-keypoints-title {
  margin: 0 0 0.75rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cms-accent, #1f4e5f);
}
.cms-keypoints ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.6rem;
}
.cms-keypoints li {
  position: relative;
  padding-left: 1.4rem;
  font-size: 1rem;
  line-height: 1.55;
  color: #2b2a26;
}
.cms-keypoints li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.62rem;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: var(--cms-accent, #1f4e5f);
}
</style>
