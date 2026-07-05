<template>
  <div class="pt-wrap">
    <div class="pt-track">
      <div class="pt-fill" :style="{ width: fillPercent + '%' }" />
    </div>
    <ol class="pt-steps">
      <li v-for="(s, i) in steps" :key="i" class="pt-step">
        <span class="pt-dot" :class="{ 'pt-dot-done': s.done, 'pt-dot-active': s.active }" v-html="s.icon" />
        <p class="pt-title" :class="{ 'text-stone-400': !s.done && !s.active }">{{ s.title }}</p>
        <p class="pt-detail">{{ s.detail }}</p>
        <div v-if="s.progress != null" class="pt-mini-track">
          <div class="pt-mini-fill" :style="{ width: s.progress + '%' }" />
        </div>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  publishedAt?: string | null
  status?: string | null
  constructionPercentage?: string | number | null
  handoverDate?: string | null
}>()

function ic(k: string) {
  const p: Record<string, string> = {
    flag: '<path stroke-linecap="round" stroke-linejoin="round" d="M6 21V4m0 1l11-1-3 5 3 5-11-1"/>',
    rocket: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 2c3 2 5 6 5 10 0 3-1 6-5 10-4-4-5-7-5-10 0-4 2-8 5-10z"/><circle cx="12" cy="10" r="1.6"/><path stroke-linecap="round" d="M8 16l-3 3M16 16l3 3"/>',
    crane: '<path stroke-linecap="round" stroke-linejoin="round" d="M4 21h9M6 21V7l12-3v4M6 10h9M18 8v6l-3 3"/>',
    key: '<circle cx="8" cy="15" r="3.5"/><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 12.5L19 4M16 7l2 2M13 10l2 2"/>',
  }
  return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24">${p[k] || ''}</svg>`
}

const steps = computed(() => {
  const isUnderConstruction = props.status === 'under_construction'
  const isReady = props.status === 'ready'
  const constructionPct = props.constructionPercentage != null ? Number(props.constructionPercentage) : null

  const out: { title: string; detail: string; icon: string; done: boolean; active: boolean; progress?: number | null }[] = []

  out.push({
    title: 'Publicado',
    detail: props.publishedAt ? new Date(props.publishedAt.replace(' ', 'T') + 'Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Fecha no disponible',
    icon: ic('flag'),
    done: true,
    active: false,
  })

  out.push({
    title: 'Lanzamiento comercial',
    detail: 'Inicio de comercialización',
    icon: ic('rocket'),
    done: true,
    active: false,
  })

  out.push({
    title: 'En construcción',
    detail: isReady ? 'Obra finalizada' : isUnderConstruction ? (constructionPct != null ? `${constructionPct}% de avance` : 'Avance de obra') : 'Aún no iniciada',
    icon: ic('crane'),
    done: isUnderConstruction || isReady,
    active: isUnderConstruction,
    progress: isReady ? 100 : isUnderConstruction ? constructionPct : null,
  })

  out.push({
    title: 'Entrega de llaves',
    detail: props.handoverDate || 'Por confirmar',
    icon: ic('key'),
    done: isReady,
    active: false,
  })

  return out
})

const fillPercent = computed(() => {
  const doneCount = steps.value.filter((s) => s.done).length
  return Math.round(((doneCount - 1) / (steps.value.length - 1)) * 100)
})
</script>

<style scoped>
.pt-wrap {
  position: relative;
}
.pt-track {
  position: absolute;
  left: 0;
  right: 0;
  top: 14px;
  height: 2px;
  background: #e7e4de;
}
@media (max-width: 639px) {
  .pt-track {
    display: none;
  }
}
.pt-fill {
  height: 100%;
  background: #16150f;
  transition: width 0.5s var(--ease-out, ease-out);
}
.pt-steps {
  position: relative;
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.75rem;
}
@media (min-width: 640px) {
  .pt-steps {
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
  }
}
.pt-step {
  position: relative;
  padding-left: 2rem;
}
@media (min-width: 640px) {
  .pt-step {
    padding-left: 0;
  }
}
.pt-dot {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  height: 1.75rem;
  width: 1.75rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: #fff;
  color: #a8a29e;
  border: 2px solid #e7e4de;
}
@media (min-width: 640px) {
  .pt-dot {
    position: static;
    margin-bottom: 0.9rem;
  }
}
.pt-dot-done {
  background: #16150f;
  border-color: #16150f;
  color: #fff;
}
.pt-dot-active {
  background: #fff;
  border-color: #16150f;
  color: #16150f;
}
.pt-title {
  font-size: 13px;
  font-weight: 600;
  color: #16150f;
}
.pt-detail {
  margin-top: 2px;
  font-size: 12px;
  color: #78716c;
}
.pt-mini-track {
  margin-top: 0.5rem;
  height: 4px;
  width: 100%;
  max-width: 10rem;
  overflow: hidden;
  border-radius: 9999px;
  background: #e7e4de;
}
.pt-mini-fill {
  height: 100%;
  border-radius: 9999px;
  background: #16150f;
  transition: width 0.5s var(--ease-out, ease-out);
}
</style>
