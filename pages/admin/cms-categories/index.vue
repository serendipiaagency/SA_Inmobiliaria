<template>
  <div>
    <div class="mb-6 flex items-end justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Categorías del Blog</h1>
        <p class="mt-1 text-sm text-stone-500">{{ categories.length }} categoría(s) · jerarquía infinita</p>
      </div>
      <button class="btn-primary" @click="openNew(null)">+ Nueva categoría</button>
    </div>

    <div class="card p-5">
      <ul class="space-y-1">
        <CategoryNode v-for="c in tree" :key="c.id" :node="c" :depth="0" @add-child="openNew" @edit="openEdit" @remove="remove" />
      </ul>
      <p v-if="!tree.length" class="py-10 text-center text-sm text-stone-450">Aún no hay categorías. Crea la primera.</p>
    </div>

    <!-- Create/edit modal -->
    <div v-if="editing" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" @click.self="editing = null">
      <div class="w-full max-w-md rounded-2xl bg-white p-6">
        <h3 class="mb-4 font-semibold">{{ editing.id ? 'Editar categoría' : 'Nueva categoría' }}</h3>
        <div class="space-y-3">
          <div>
            <label class="label">Nombre *</label>
            <input v-model="editing.name" class="input" />
          </div>
          <div>
            <label class="label">Categoría padre</label>
            <select v-model="editing.parentId" class="input">
              <option :value="null">Ninguna (raíz)</option>
              <option v-for="c in categories.filter((c) => c.id !== editing?.id)" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">Color</label>
              <input v-model="editing.color" type="color" class="input !h-10 !p-1" />
            </div>
            <div>
              <label class="label">Icono (emoji)</label>
              <input v-model="editing.icon" class="input" placeholder="🏠" />
            </div>
          </div>
          <div>
            <label class="label">Descripción</label>
            <textarea v-model="editing.description" class="input" rows="2" />
          </div>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <button class="btn-secondary" @click="editing = null">Cancelar</button>
          <button class="btn-primary" @click="save">Guardar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Categorías — Blog & CMS' })

const { data, refresh } = await useFetch<any>('/api/admin/cms-categories', { query: { perPage: 200 } })
const categories = computed(() => data.value?.rows || [])
const toast = useToast()
const { confirm } = useConfirm()

interface TreeNode {
  id: number
  name: string
  parentId: number | null
  color?: string | null
  icon?: string | null
  children: TreeNode[]
}
const tree = computed<TreeNode[]>(() => {
  const byId = new Map<number, TreeNode>(categories.value.map((c: any) => [c.id, { ...c, children: [] }]))
  const roots: TreeNode[] = []
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node)
    else roots.push(node)
  }
  return roots
})

const editing = ref<any>(null)
function openNew(parentId: number | null) {
  editing.value = { id: null, name: '', parentId, color: '#16150f', icon: '', description: '' }
}
function openEdit(node: any) {
  editing.value = { ...node }
}
async function save() {
  if (!editing.value.name?.trim()) {
    toast.error('El nombre es obligatorio')
    return
  }
  try {
    if (editing.value.id) {
      await $fetch(`/api/admin/cms-categories/${editing.value.id}`, { method: 'PUT', body: editing.value })
    } else {
      await $fetch('/api/admin/cms-categories', { method: 'POST', body: editing.value })
    }
    toast.success('Guardado')
    editing.value = null
    await refresh()
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo guardar')
  }
}
async function remove(id: number) {
  const ok = await confirm('Las subcategorías quedarán sin padre.', { title: '¿Eliminar categoría?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  await $fetch(`/api/admin/cms-categories/${id}`, { method: 'DELETE' })
  toast.success('Eliminada')
  await refresh()
}

// Recursive tree node renderer, defined inline to keep this self-contained.
const CategoryNode = defineComponent({
  name: 'CategoryNode',
  props: { node: { type: Object, required: true }, depth: { type: Number, default: 0 } },
  emits: ['add-child', 'edit', 'remove'],
  setup(props, { emit }) {
    return () =>
      h('li', {}, [
        h('div', { class: 'flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-stone-50', style: { paddingLeft: `${props.depth * 1.25}rem` } }, [
          h('span', { class: 'h-2.5 w-2.5 rounded-full shrink-0', style: { background: props.node.color || '#a8a29e' } }),
          props.node.icon ? h('span', {}, props.node.icon) : null,
          h('span', { class: 'flex-1 text-sm font-medium' }, props.node.name),
          h('button', { class: 'text-xs text-stone-450 hover:underline', onClick: () => emit('add-child', props.node.id) }, '+ subcategoría'),
          h('button', { class: 'text-xs text-emerald-700 hover:underline', onClick: () => emit('edit', props.node) }, 'Editar'),
          h('button', { class: 'text-xs text-red-600 hover:underline', onClick: () => emit('remove', props.node.id) }, 'Eliminar'),
        ]),
        props.node.children?.length
          ? h(
              'ul',
              {},
              props.node.children.map((child: any) =>
                h(CategoryNode as any, { node: child, depth: props.depth + 1, onAddChild: (id: number) => emit('add-child', id), onEdit: (n: any) => emit('edit', n), onRemove: (id: number) => emit('remove', id) }),
              ),
            )
          : null,
      ])
  },
})
</script>
