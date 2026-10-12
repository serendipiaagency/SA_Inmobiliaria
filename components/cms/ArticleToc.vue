<template>
  <nav v-if="headings.length >= 2" class="cms-toc" :class="{ 'cms-toc--sticky': sticky }" aria-label="Índice del artículo" data-testid="cms-toc">
    <details v-if="!sticky" class="cms-toc-details">
      <summary class="cms-toc-summary">Índice <span class="cms-toc-count">{{ headings.length }} secciones</span></summary>
      <ol class="cms-toc-list">
        <li v-for="h in headings" :key="h.id" :class="[h.level === 3 ? 'is-sub' : '', h.id === active ? 'is-active' : '']">
          <a :href="`#${h.id}`" @click="track(h.id)">{{ h.text }}</a>
        </li>
      </ol>
    </details>
    <template v-else>
      <p class="cms-toc-title">Índice</p>
      <ol class="cms-toc-list">
        <li v-for="h in headings" :key="h.id" :class="[h.level === 3 ? 'is-sub' : '', h.id === active ? 'is-active' : '']">
          <a :href="`#${h.id}`" :aria-current="h.id === active ? 'location' : undefined" @click="track(h.id)">{{ h.text }}</a>
        </li>
      </ol>
    </template>
  </nav>
</template>

<script setup lang="ts">
/**
 * Índice del artículo a partir de sus encabezados (h2/h3 del CMS). En
 * escritorio va fijo al lado del texto y marca la sección visible; en móvil
 * es un desplegable encima del cuerpo. Las anclas son las de cmsHeadingId.
 */
const props = defineProps<{ blocks: any[]; sticky?: boolean }>()
const headings = computed(() =>
  props.blocks
    .filter((b) => b.type === 'heading' && b.text)
    .map((b) => ({ id: cmsHeadingId(b), text: String(b.text).replace(/^\d+\.\s*/, ''), level: b.level })),
)
const active = ref<string>('')
function track(id: string) {
  active.value = id
}

let observer: IntersectionObserver | null = null
onMounted(() => {
  if (!props.sticky || typeof IntersectionObserver === 'undefined') return
  const visible = new Map<string, number>()
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top)
        else visible.delete(e.target.id)
      }
      if (visible.size) {
        // La sección activa es la más alta de las visibles.
        active.value = [...visible.entries()].sort((a, b) => a[1] - b[1])[0][0]
      }
    },
    { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
  )
  for (const h of headings.value) {
    const el = document.getElementById(h.id)
    if (el) observer.observe(el)
  }
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<style scoped>
.cms-toc--sticky {
  position: sticky;
  top: 6rem;
  max-height: calc(100vh - 7rem);
  overflow: auto;
  padding-right: 0.5rem;
}
.cms-toc-title,
.cms-toc-summary {
  margin: 0 0 0.75rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cms-accent, #1f4e5f);
}
.cms-toc-details {
  border: 1px solid var(--cms-line, #e6e1d6);
  border-radius: 1rem;
  padding: 1rem 1.25rem;
  background: var(--cms-paper-2, #f6f4ef);
}
.cms-toc-summary {
  cursor: pointer;
  margin: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  list-style: none;
}
.cms-toc-summary::-webkit-details-marker {
  display: none;
}
.cms-toc-count {
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  color: #8a8478;
}
.cms-toc-details[open] .cms-toc-summary {
  margin-bottom: 0.75rem;
}
.cms-toc-list {
  margin: 0;
  padding: 0;
  list-style: none;
  border-left: 1px solid var(--cms-line, #e6e1d6);
}
.cms-toc-list li {
  margin: 0;
}
.cms-toc-list a {
  display: block;
  padding: 0.35rem 0 0.35rem 1rem;
  margin-left: -1px;
  border-left: 2px solid transparent;
  font-size: 0.9rem;
  line-height: 1.4;
  color: #5b574f;
  text-decoration: none;
  transition: color 0.15s, border-color 0.15s;
}
.cms-toc-list li.is-sub a {
  padding-left: 1.75rem;
  font-size: 0.84rem;
}
.cms-toc-list a:hover,
.cms-toc-list li.is-active a {
  color: var(--cms-accent, #1f4e5f);
  border-left-color: var(--cms-accent, #1f4e5f);
}
.cms-toc-list li.is-active a {
  font-weight: 600;
}
</style>
