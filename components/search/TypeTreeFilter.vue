<template>
  <div class="tt" data-testid="type-tree">
    <div v-for="cat in categories" :key="cat.key" class="tt-cat" :data-category="cat.key">
      <!-- Una categoría de varios tipos (Viviendas) se marca entera o por partes -->
      <template v-if="cat.families.length > 1 || cat.families[0]!.types.length > 1">
        <div class="tt-row">
          <label class="tt-check">
            <input type="checkbox" :checked="allOn(catTypes(cat))" :indeterminate.prop="someOn(catTypes(cat)) && !allOn(catTypes(cat))" :data-testid="`type-cat-${cat.key}`" @change="setMany(catTypes(cat), !allOn(catTypes(cat)))" >
            <span class="tt-name">{{ t(cat.label[0], cat.label[1]) }}</span>
          </label>
          <button type="button" class="tt-exp" :aria-expanded="expanded.has(cat.key)" :aria-label="t('types.expand', 'Ver subtipos')" @click="toggleExp(cat.key)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" :class="{ 'rotate-90': expanded.has(cat.key) }"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
        <div v-if="expanded.has(cat.key)" class="tt-children">
          <div v-for="fam in cat.families" :key="fam.key" class="tt-fam">
            <label v-if="cat.families.length > 1" class="tt-check tt-fam-head">
              <input type="checkbox" :checked="allOn(fam.types)" :indeterminate.prop="someOn(fam.types) && !allOn(fam.types)" :data-testid="`type-family-${fam.key}`" @change="setMany(fam.types, !allOn(fam.types))" >
              <span class="tt-name">{{ t(fam.label[0], fam.label[1]) }}</span>
            </label>
            <TypeLeaf v-for="ty in fam.types" :key="ty" :type="ty" />
          </div>
        </div>
      </template>
      <TypeLeaf v-else :type="cat.families[0]!.types[0]!" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { PROPERTY_SUBTYPES } from '~/utils/propertySheet'
import { PROPERTY_TYPE_TREE, subtypeParent, type TypeCategory } from '~/utils/searchState'

/**
 * Tipo de propiedad con subtipos, varios a la vez: Viviendas (Pisos: piso,
 * ático, dúplex, estudio…; Casas y chalets: casa, chalet, adosado…), Locales,
 * Oficinas, Garajes, Terrenos, Naves, Edificios y Promociones — los tipos y
 * subtipos reales de Property Core (utils/propertySheet.ts), sólo los que la
 * agencia tiene publicados. Un tipo marcado entra entero; si sólo se marcan
 * algunos de sus subtipos, sólo esos.
 */
const props = defineProps<{ types: string[]; subtypes: string[]; available: string[] }>()
const emit = defineEmits<{ update: [{ types: string[]; subtypes: string[] }] }>()
const { t } = useI18n()
const typeLabel = usePropertyTypeLabel()

const availableSet = computed(() => new Set(props.available))
const categories = computed(() =>
  PROPERTY_TYPE_TREE.map((c) => ({ ...c, families: c.families.map((f) => ({ ...f, types: f.types.filter((ty) => availableSet.value.has(ty)) })).filter((f) => f.types.length) })).filter((c) => c.families.length),
)
const catTypes = (c: TypeCategory) => c.families.flatMap((f) => f.types)

// Abiertos: los que ya tienen algo marcado (p. ej. al llegar desde un enlace).
const expanded = ref(new Set<string>([...PROPERTY_TYPE_TREE.filter((c) => catTypes(c).some((ty) => props.types.includes(ty) || props.subtypes.some((s) => subtypeParent(s) === ty))).map((c) => c.key), ...props.types, ...props.subtypes.map((s) => subtypeParent(s)!)]))
function toggleExp(k: string) {
  const next = new Set(expanded.value)
  if (next.has(k)) next.delete(k)
  else next.add(k)
  expanded.value = next
}

const subsOf = (ty: string) => Object.keys(PROPERTY_SUBTYPES[ty] || {})
const typeOn = (ty: string) => props.types.includes(ty)
const typePartial = (ty: string) => !typeOn(ty) && props.subtypes.some((s) => subtypeParent(s) === ty)
const allOn = (list: string[]) => list.length > 0 && list.every(typeOn)
const someOn = (list: string[]) => list.some((ty) => typeOn(ty) || typePartial(ty))
const subOn = (s: string) => typeOn(subtypeParent(s)!) || props.subtypes.includes(s)

function commit(types: string[], subtypes: string[]) {
  emit('update', { types: [...new Set(types)], subtypes: [...new Set(subtypes)] })
}
/** Marcar o desmarcar varios tipos enteros (una categoría o familia). */
function setMany(list: string[], on: boolean) {
  const subs = props.subtypes.filter((s) => !list.includes(subtypeParent(s)!))
  commit(on ? [...props.types, ...list] : props.types.filter((ty) => !list.includes(ty)), subs)
}
function toggleType(ty: string) {
  setMany([ty], !typeOn(ty))
}
function toggleSub(s: string) {
  const parent = subtypeParent(s)!
  const all = subsOf(parent)
  if (typeOn(parent)) {
    // Estaba entero: queda con los demás subtipos.
    commit(props.types.filter((x) => x !== parent), [...props.subtypes.filter((x) => subtypeParent(x) !== parent), ...all.filter((x) => x !== s)])
    return
  }
  const next = props.subtypes.includes(s) ? props.subtypes.filter((x) => x !== s) : [...props.subtypes, s]
  const mine = next.filter((x) => subtypeParent(x) === parent)
  // Todos sus subtipos marcados = el tipo entero.
  if (all.length && mine.length === all.length) commit([...props.types, parent], next.filter((x) => subtypeParent(x) !== parent))
  else commit(props.types, next)
}

// Un tipo con sus subtipos desplegables.
const TypeLeaf = defineComponent({
  props: { type: { type: String, required: true } },
  setup(p) {
    return () => {
      const ty = p.type
      const subs = subsOf(ty)
      const open = expanded.value.has(ty)
      return h('div', { class: 'tt-leaf', 'data-type': ty }, [
        h('div', { class: 'tt-row' }, [
          h('label', { class: 'tt-check' }, [
            h('input', { type: 'checkbox', checked: typeOn(ty), indeterminate: typePartial(ty), 'data-testid': `public-filter-type-${ty}`, onChange: () => toggleType(ty) }),
            h('span', { class: 'tt-name' }, typeLabel(ty)),
          ]),
          subs.length
            ? h(
                'button',
                { type: 'button', class: 'tt-exp', 'aria-expanded': open, 'aria-label': t('types.expand', 'Ver subtipos'), onClick: () => toggleExp(ty) },
                [h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: open ? 'rotate-90' : '' }, [h('path', { d: 'm9 18 6-6-6-6' })])],
              )
            : null,
        ]),
        open && subs.length
          ? h(
              'div',
              { class: 'tt-subs' },
              subs.map((s) =>
                h('label', { class: 'tt-check tt-sub' }, [
                  h('input', { type: 'checkbox', checked: subOn(s), 'data-testid': `public-filter-subtype-${s}`, onChange: () => toggleSub(s) }),
                  h('span', null, t(`filters.subtype.${s}`, PROPERTY_SUBTYPES[ty]![s]!)),
                ]),
              ),
            )
          : null,
      ])
    }
  },
})
</script>

<style>
/* Sin «scoped»: TypeLeaf se pinta con h() y no lleva el atributo de ámbito. Prefijo tt- propio. */
.tt {
  display: grid;
  gap: 2px;
}
.tt-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.tt-check {
  display: flex;
  min-height: 36px;
  flex: 1;
  cursor: pointer;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #1c1b19;
}
.tt-check input {
  height: 17px;
  width: 17px;
  flex-shrink: 0;
  accent-color: #1c1b19;
}
.tt-name {
  font-weight: 600;
}
.tt-exp {
  display: inline-flex;
  height: 30px;
  width: 30px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: #78716c;
}
.tt-exp:hover {
  background: #f1eee8;
  color: #1c1b19;
}
.tt-children {
  margin-left: 10px;
  border-left: 1px solid #ece8e1;
  padding-left: 12px;
}
.tt-fam-head .tt-name {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #57534e;
}
.tt-subs {
  margin-left: 26px;
  display: grid;
}
.tt-sub {
  min-height: 32px;
  font-size: 13px;
  color: #44403c;
}
</style>
