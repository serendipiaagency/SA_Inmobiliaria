<template>
  <div ref="root" class="relative inline-block text-left">
    <button
      ref="trigger"
      type="button"
      :class="triggerClass"
      :aria-label="label"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click.stop="toggle"
      @keydown.down.prevent="openWith(1)"
      @keydown.up.prevent="openWith(-1)"
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
    </button>

    <!--
      El panel se teletransporta al <body> con posición fija calculada desde el
      botón: así nunca lo recorta un contenedor con overflow (p. ej. la tabla de
      clientes dentro de `overflow-x-auto`), que era el defecto de los cuatro
      menús ad-hoc. Se cierra al hacer clic fuera, con Escape y al hacer scroll o
      redimensionar (un panel fijo no seguiría al botón). Teclado completo:
      flechas para moverse, Enter/Espacio para activar, Home/End a los extremos.
    -->
    <Teleport to="body">
      <div
        v-if="open"
        ref="panel"
        class="fixed z-[80] w-44 overflow-hidden rounded-lg border border-line bg-white py-1 text-left text-[13px] shadow-lg"
        :style="panelStyle"
        role="menu"
        :aria-label="label"
        tabindex="-1"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.home.prevent="focusEdge(1)"
        @keydown.end.prevent="focusEdge(-1)"
        @keydown.esc.prevent="close(true)"
        @keydown.tab="close(false)"
      >
        <template v-for="(it, i) in items" :key="it.key ?? i">
          <span v-if="it.divider" class="my-1 block h-px bg-line" />
          <NuxtLink
            v-if="it.to && !it.disabled"
            :ref="(el) => setItemRef(el, i)"
            :to="it.to"
            role="menuitem"
            tabindex="-1"
            class="block px-3 py-2 hover:bg-stone-50 hover:text-ink focus:bg-stone-50 focus:outline-none"
            :class="it.danger ? 'text-red-600 hover:bg-red-50 hover:text-red-700 focus:bg-red-50' : 'text-stone-600'"
            @click="onPick(it)"
          >{{ it.label }}</NuxtLink>
          <a
            v-else-if="it.href && !it.disabled"
            :ref="(el) => setItemRef(el, i)"
            :href="it.href"
            :target="it.target || '_self'"
            :rel="it.target === '_blank' ? 'noopener' : undefined"
            role="menuitem"
            tabindex="-1"
            class="block px-3 py-2 hover:bg-stone-50 hover:text-ink focus:bg-stone-50 focus:outline-none"
            :class="it.danger ? 'text-red-600 hover:bg-red-50 hover:text-red-700 focus:bg-red-50' : 'text-stone-600'"
            @click="onPick(it)"
          >{{ it.label }}</a>
          <button
            v-else
            :ref="(el) => setItemRef(el, i)"
            type="button"
            role="menuitem"
            tabindex="-1"
            :disabled="it.disabled"
            class="block w-full px-3 py-2 text-left hover:bg-stone-50 hover:text-ink focus:bg-stone-50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            :class="it.danger ? 'text-red-600 hover:bg-red-50 hover:text-red-700 focus:bg-red-50' : 'text-stone-600'"
            @click="onPick(it)"
          >{{ it.label }}</button>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
export interface AdminActionItem {
  /** Texto visible de la acción. */
  label?: string
  /** Enlace interno (NuxtLink). */
  to?: string
  /** Enlace externo (<a>); con target '_blank' se añade rel noopener. */
  href?: string
  target?: '_blank' | '_self'
  /** Acción de botón. */
  onClick?: () => void
  /** Rojo (acción destructiva). */
  danger?: boolean
  disabled?: boolean
  /** Dibuja un separador ANTES de este elemento. */
  divider?: boolean
  key?: string | number
}

const props = withDefaults(
  defineProps<{
    items: AdminActionItem[]
    /** Etiqueta accesible del botón y del menú. */
    label?: string
    /** Alineación del panel respecto al botón. */
    align?: 'left' | 'right'
    /** Clases del botón disparador (para respetar el aspecto de cada sitio). */
    triggerClass?: string
  }>(),
  {
    label: 'Acciones',
    align: 'right',
    triggerClass:
      'flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-ink',
  },
)

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

// Índices de los elementos activables (ni separadores ni deshabilitados).
const actionable = computed(() => props.items.map((it, i) => ({ it, i })).filter(({ it }) => !it.disabled))

const itemEls = new Map<number, HTMLElement>()
function setItemRef(el: any, i: number) {
  const node = (el?.$el ?? el) as HTMLElement | null
  if (node && node.nodeType === 1) itemEls.set(i, node)
  else itemEls.delete(i)
}

const GUTTER = 8
function place() {
  const t = trigger.value
  if (!t) return
  const r = t.getBoundingClientRect()
  const width = panel.value?.offsetWidth || 176
  const height = panel.value?.offsetHeight || props.items.length * 36 + 8
  let left = props.align === 'right' ? r.right - width : r.left
  left = Math.max(GUTTER, Math.min(left, window.innerWidth - width - GUTTER))
  let top = r.bottom + 4
  const spaceBelow = window.innerHeight - r.bottom
  if (spaceBelow < height + GUTTER && r.top > spaceBelow) {
    top = Math.max(GUTTER, r.top - 4 - height)
  }
  panelStyle.value = { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` }
}

async function openMenu() {
  open.value = true
  await nextTick()
  place()
  place() // segunda pasada: ya con la altura real del panel medida
  panel.value?.focus()
}

function close(focusTrigger: boolean) {
  if (!open.value) return
  open.value = false
  itemEls.clear()
  if (focusTrigger) trigger.value?.focus()
}

function toggle() {
  if (open.value) close(false)
  else openMenu()
}

async function openWith(dir: number) {
  if (!open.value) await openMenu()
  focusEdge(dir)
}

function focusEdge(dir: number) {
  const list = actionable.value
  if (!list.length) return
  const target = dir >= 0 ? list[0] : list[list.length - 1]
  itemEls.get(target.i)?.focus()
}

function move(delta: number) {
  const list = actionable.value
  if (!list.length) return
  const active = document.activeElement as HTMLElement
  let pos = list.findIndex(({ i }) => itemEls.get(i) === active)
  pos = pos === -1 ? (delta > 0 ? -1 : 0) : pos
  const next = (pos + delta + list.length) % list.length
  itemEls.get(list[next].i)?.focus()
}

function onPick(it: AdminActionItem) {
  close(false)
  it.onClick?.()
}

function onDocPointer(e: Event) {
  const target = e.target as Node
  if (root.value?.contains(target) || panel.value?.contains(target)) return
  close(false)
}
function onScrollOrResize() {
  if (open.value) close(false)
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer, true)
  window.addEventListener('scroll', onScrollOrResize, true)
  window.addEventListener('resize', onScrollOrResize)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer, true)
  window.removeEventListener('scroll', onScrollOrResize, true)
  window.removeEventListener('resize', onScrollOrResize)
})
</script>
