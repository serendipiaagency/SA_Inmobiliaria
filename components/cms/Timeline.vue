<template>
  <section class="cms-timeline" data-testid="cms-timeline" :aria-label="block.title || 'Línea temporal'">
    <p v-if="block.title" class="cms-timeline-title">{{ block.title }}</p>
    <ol class="cms-timeline-list">
      <li v-for="(step, i) in block.steps || []" :key="i" class="cms-timeline-step" :data-testid="`cms-timeline-step-${i + 1}`">
        <span class="cms-timeline-marker" aria-hidden="true">{{ i + 1 }}</span>
        <div class="cms-timeline-body">
          <div class="cms-timeline-head">
            <h3 class="cms-timeline-heading">{{ step.title }}</h3>
            <span v-if="step.when" class="cms-timeline-when">{{ step.when }}</span>
          </div>
          <p v-if="step.text" class="cms-timeline-text">{{ step.text }}</p>
          <ul v-if="step.docs?.length" class="cms-timeline-docs" :aria-label="`Documentos del paso ${i + 1}`">
            <li v-for="(d, j) in step.docs" :key="j">{{ d }}</li>
          </ul>
        </div>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
/** Línea temporal vertical: fases con su momento orientativo y la documentación de cada una. */
defineProps<{ block: { title?: string; steps?: Array<{ title: string; when?: string; text?: string; docs?: string[] }> } }>()
</script>

<style scoped>
.cms-timeline {
  margin: 3rem 0;
}
.cms-timeline-title {
  margin: 0 0 1.5rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cms-accent, #1f4e5f);
}
.cms-timeline-list {
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
}
.cms-timeline-list::before {
  content: '';
  position: absolute;
  left: 1.1rem;
  top: 1.2rem;
  bottom: 1.2rem;
  width: 2px;
  background: var(--cms-line, #e6e1d7);
}
.cms-timeline-step {
  position: relative;
  display: grid;
  grid-template-columns: 2.25rem minmax(0, 1fr);
  gap: 1.25rem;
  padding: 0 0 2.25rem;
}
.cms-timeline-step:last-child {
  padding-bottom: 0;
}
.cms-timeline-marker {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 999px;
  background: var(--cms-accent, #1f4e5f);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 700;
}
.cms-timeline-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem 1rem;
  padding-top: 0.35rem;
}
.cms-timeline-heading {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.cms-timeline-when {
  font-size: 0.8rem;
  font-weight: 600;
  color: #7a857a;
}
.cms-timeline-text {
  margin: 0.5rem 0 0;
  font-size: 1rem;
  line-height: 1.6;
  color: #4f5b53;
}
.cms-timeline-docs {
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.cms-timeline-docs li {
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  background: var(--cms-paper-2, #f6f4ef);
  border: 1px solid var(--cms-line, #e6e1d7);
  font-size: 0.78rem;
  color: #2b2a26;
}
</style>
