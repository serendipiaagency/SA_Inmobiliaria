<template>
  <div class="tp" :class="`tp-${variant}`" role="group" :aria-label="t('hero.type', 'Tipo de inmueble')" data-testid="type-tree">
    <!--
      HERO: sólo las SEIS categorías grandes (Viviendas, Locales, Oficinas,
      Garaje, Terreno, Naves). Cada una marca de golpe todos sus tipos reales;
      ni familias ni subtipos ni tipos sueltos a la vista (Cola 13).
    -->
    <template v-if="variant === 'hero'">
      <label v-for="cat in heroCategories" :key="cat.key" class="tp-check tp-hero-cat" :data-category="cat.key">
        <input
          type="checkbox"
          :checked="allOn(cat.types)"
          :indeterminate.prop="someOn(cat.types) && !allOn(cat.types)"
          :data-testid="`type-cat-${cat.key}`"
          @change="setMany(cat.types, !allOn(cat.types))"
        >
        <span class="tp-name">{{ t(cat.label[0], cat.label[1]) }}</span>
        <span v-if="countOf(cat.types)" class="tp-count" aria-hidden="true">{{ countOf(cat.types) }}</span>
      </label>
    </template>

    <!--
      PANEL: el catálogo ENTERO de Property Core, siempre a la vista: grupos como
      encabezados (con su casilla de todo/parte/nada), cada tipo con su casilla
      y sus subtipos en línea. Nada se esconde tras un desplegable.
    -->
    <section v-for="cat in (variant === 'hero' ? [] : categories)" :key="cat.key" class="tp-cat" :data-category="cat.key">
      <label class="tp-check tp-cat-head">
        <input
          type="checkbox"
          :checked="allOn(catTypes(cat))"
          :indeterminate.prop="someOn(catTypes(cat)) && !allOn(catTypes(cat))"
          :data-testid="`type-cat-${cat.key}`"
          @change="setMany(catTypes(cat), !allOn(catTypes(cat)))"
        >
        <span class="tp-cat-name">{{ t(cat.label[0], cat.label[1]) }}</span>
        <span v-if="countOf(catTypes(cat))" class="tp-count" aria-hidden="true">{{ countOf(catTypes(cat)) }}</span>
      </label>

      <div v-for="fam in cat.families" :key="fam.key" class="tp-fam">
        <label v-if="cat.families.length > 1" class="tp-check tp-fam-head">
          <input
            type="checkbox"
            :checked="allOn(fam.types)"
            :indeterminate.prop="someOn(fam.types) && !allOn(fam.types)"
            :data-testid="`type-family-${fam.key}`"
            @change="setMany(fam.types, !allOn(fam.types))"
          >
          <span class="tp-fam-name">{{ t(fam.label[0], fam.label[1]) }}</span>
        </label>

        <div v-for="ty in fam.types" :key="ty" class="tp-type" :class="{ 'tp-type-on': typeOn(ty) || typePartial(ty) }" :data-type="ty">
          <label class="tp-check">
            <input type="checkbox" :checked="typeOn(ty)" :indeterminate.prop="typePartial(ty)" :data-testid="`public-filter-type-${ty}`" @change="toggleType(ty)">
            <span class="tp-name">{{ typeLabel(ty) }}</span>
            <span v-if="counts && counts[ty]" class="tp-count" aria-hidden="true">{{ counts[ty] }}</span>
          </label>
          <div v-if="subsOf(ty).length" class="tp-subs" role="group" :aria-label="`${typeLabel(ty)}: ${t('types.subtypes', 'subtipos')}`">
            <label v-for="s in subsOf(ty)" :key="s" class="tp-sub" :class="{ 'tp-sub-on': subOn(s) }">
              <input type="checkbox" :checked="subOn(s)" :data-testid="`public-filter-subtype-${s}`" @change="toggleSub(s)">
              <span>{{ subLabel(ty, s) }}</span>
            </label>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { HERO_TYPE_CATEGORIES, PROPERTY_SUBTYPES } from '~/utils/propertySheet'
import { PROPERTY_TYPE_TREE, subtypeParent, type TypeCategory } from '~/utils/searchState'

/**
 * «Tipo de inmueble» del buscador público (Hero y panel de Propiedades), el
 * mismo en todas las webs: los tipos y subtipos reales de Property Core
 * (utils/propertySheet.ts, agrupados por PROPERTY_TYPE_GROUPS), TODOS, tengan
 * o no propiedades publicadas (un tipo sin inventario se puede elegir: da cero
 * resultados, no desaparece). Varios a la vez: un grupo o familia marca todos
 * sus tipos (y queda «parcial» si sólo hay parte); un tipo marcado entra
 * entero; si sólo se marcan algunos de sus subtipos, sólo esos. `counts` (las
 * facetas reales de la agencia) sólo añade un número informativo.
 */
const props = withDefaults(defineProps<{ types: string[]; subtypes: string[]; counts?: Record<string, number> | null; variant?: 'hero' | 'panel' }>(), {
  counts: null,
  variant: 'panel',
})
const emit = defineEmits<{ update: [{ types: string[]; subtypes: string[] }] }>()
const { t } = useI18n()
const typeLabel = usePropertyTypeLabel()

const categories = PROPERTY_TYPE_TREE
/** Hero: las seis categorías grandes (utils/propertySheet.ts). */
const heroCategories = HERO_TYPE_CATEGORIES
const catTypes = (c: TypeCategory) => c.families.flatMap((f) => f.types)
const subsOf = (ty: string) => Object.keys(PROPERTY_SUBTYPES[ty] || {})
const subLabel = (ty: string, s: string) => t(`filters.subtype.${s}`, PROPERTY_SUBTYPES[ty]?.[s] || s)
const countOf = (list: string[]) => (props.counts ? list.reduce((n, ty) => n + (props.counts![ty] || 0), 0) : 0)

const typeOn = (ty: string) => props.types.includes(ty)
const typePartial = (ty: string) => !typeOn(ty) && props.subtypes.some((s) => subtypeParent(s) === ty)
const allOn = (list: string[]) => list.length > 0 && list.every(typeOn)
const someOn = (list: string[]) => list.some((ty) => typeOn(ty) || typePartial(ty))
const subOn = (s: string) => typeOn(subtypeParent(s)!) || props.subtypes.includes(s)

function commit(types: string[], subtypes: string[]) {
  emit('update', { types: [...new Set(types)], subtypes: [...new Set(subtypes)] })
}
/** Marcar o desmarcar varios tipos enteros (un grupo o una familia). */
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
</script>

<style scoped>
/* Colores y tipografía: los del Brand Kit de la web (variables de la cabecera/catálogo); sin ellas, los neutros de la web. */
.tp {
  display: grid;
  gap: 14px;
  font-family: var(--sb-font-body, inherit);
  color: var(--sb-ink, #1c1b19);
}
.tp-cat {
  display: grid;
  gap: 2px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--sb-line, #ece8e1);
}
.tp-cat:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}
.tp-check {
  display: flex;
  min-height: 34px;
  cursor: pointer;
  align-items: center;
  gap: 10px;
  border-radius: 8px;
  padding: 0 6px;
  font-size: 14px;
  color: var(--sb-ink, #1c1b19);
}
.tp-check:hover {
  background: var(--sb-paper, #f6f3ee);
}
.tp-check input {
  height: 17px;
  width: 17px;
  flex-shrink: 0;
  accent-color: var(--sb-accent, var(--sb-ink, #1c1b19));
}
.tp-cat-head {
  min-height: 36px;
}
.tp-cat-name {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--sb-muted, #78716c);
}
.tp-fam {
  display: grid;
  gap: 2px;
}
.tp-fam-head {
  min-height: 30px;
}
.tp-fam-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--sb-muted-ink, #57534e);
}
.tp-type {
  border-radius: 10px;
}
.tp-type-on {
  background: var(--sb-paper, #f6f3ee);
}
.tp-name {
  font-weight: 600;
}
.tp-count {
  margin-left: auto;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--sb-muted, #a8a29e);
}
/* Subtipos en línea, como pastillas: a la vista, nunca detrás de un botón. */
.tp-subs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 2px 6px 8px 33px;
}
.tp-sub {
  display: inline-flex;
  min-height: 28px;
  cursor: pointer;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  border: 1px solid var(--sb-line, #e7e2d9);
  background: var(--sb-surface, #fff);
  padding: 0 10px 0 7px;
  font-size: 12.5px;
  color: var(--sb-muted-ink, #44403c);
  transition: border-color 0.15s, background-color 0.15s;
}
.tp-sub:hover {
  border-color: var(--sb-ink, #1c1b19);
}
.tp-sub-on {
  border-color: var(--sb-accent, var(--sb-ink, #1c1b19));
  background: color-mix(in srgb, var(--sb-accent, var(--sb-ink, #1c1b19)) 8%, #fff);
  color: var(--sb-ink, #1c1b19);
}
.tp-sub input {
  height: 14px;
  width: 14px;
  accent-color: var(--sb-accent, var(--sb-ink, #1c1b19));
}
/* Hero: las seis categorías grandes, como lista de casillas; nada de familias ni subtipos. */
.tp-hero {
  gap: 2px;
}
.tp-hero-cat {
  min-height: 42px;
  font-size: 15px;
}
.tp-hero-cat .tp-name {
  font-weight: 600;
}
.tp-hero-cat:has(input:checked) {
  background: var(--sb-paper, #f6f3ee);
}
/* En escritorio, las seis en dos columnas. */
@media (min-width: 720px) {
  .tp-hero {
    grid-template-columns: 1fr 1fr;
    column-gap: 18px;
  }
}
</style>
