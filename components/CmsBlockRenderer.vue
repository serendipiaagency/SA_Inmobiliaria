<template>
  <div class="cms-content">
    <template v-for="block in blocks" :key="block.id">
      <h2 v-if="block.type === 'heading' && block.level === 2" :id="headingId(block)" class="mt-10 scroll-mt-24 font-serif text-2xl font-medium">{{ block.text }}</h2>
      <h3 v-else-if="block.type === 'heading'" :id="headingId(block)" class="mt-8 scroll-mt-24 font-serif text-xl font-medium">{{ block.text }}</h3>

      <!-- eslint-disable-next-line vue/no-v-html -->
      <p v-else-if="block.type === 'paragraph'" class="mt-5 leading-relaxed text-stone-600" v-html="inline(block.text)" />

      <blockquote v-else-if="block.type === 'quote'" class="mt-6 border-l-4 border-ink/20 pl-5 italic text-stone-600">
        <p>{{ block.text }}</p>
        <cite v-if="block.author" class="mt-2 block text-sm not-italic text-stone-450">— {{ block.author }}</cite>
      </blockquote>

      <div v-else-if="block.type === 'callout'" class="mt-6 rounded-xl border p-4" :class="CALLOUT_CLS[block.variant] || CALLOUT_CLS.info">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <p v-html="inline(block.text)" />
      </div>

      <hr v-else-if="block.type === 'divider'" class="my-8 border-line" >

      <figure v-else-if="block.type === 'image' && block.src" class="mt-6" :class="block.wide ? 'cms-wide' : ''" :data-testid="block.wide ? 'cms-image-wide' : 'cms-image'">
        <img :src="mediaUrl(block.src)" :alt="block.alt || ''" :width="block.width || undefined" :height="block.height || undefined" class="w-full rounded-xl object-cover" loading="lazy" decoding="async" >
        <figcaption v-if="block.caption || block.credit" class="mt-2 text-center text-sm text-stone-450">{{ block.caption }}<span v-if="block.credit" class="cms-credit">{{ block.caption ? ' · ' : '' }}{{ block.credit }}</span></figcaption>
      </figure>

      <!-- Bloques editoriales de las guías (components/cms/*) -->
      <CmsKeyPoints v-else-if="block.type === 'keypoints'" :block="block" />
      <CmsTimeline v-else-if="block.type === 'timeline'" :block="block" />
      <CmsChecklist v-else-if="block.type === 'checklist'" :block="block" />
      <CmsCostCalculator v-else-if="block.type === 'cost_calculator'" :block="block" />
      <CmsFactorsChart v-else-if="block.type === 'factors_chart'" :block="block" />
      <CmsComparator v-else-if="block.type === 'comparator'" :block="block" />
      <CmsAccordion v-else-if="block.type === 'accordion'" :block="block" />

      <div v-else-if="block.type === 'gallery' && block.images?.length" class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <img v-for="(img, i) in block.images" :key="i" :src="mediaUrl(img.src)" :alt="img.alt || ''" class="aspect-square rounded-lg object-cover" loading="lazy" >
      </div>

      <!-- Reproductor sin cookies (el único origen de YouTube que admite la CSP) y sólo con consentimiento. -->
      <div v-else-if="block.type === 'video' && youtubeId(block.url)" class="mt-6 aspect-video overflow-hidden rounded-xl">
        <ConsentGate provider="YouTube" :href="block.url" class="h-full w-full">
          <iframe :src="`https://www.youtube-nocookie.com/embed/${youtubeId(block.url)}?rel=0`" class="h-full w-full" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin" />
        </ConsentGate>
      </div>

      <a v-else-if="block.type === 'button'" :href="block.url" class="mt-6 inline-block rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90">{{ block.text }}</a>

      <div v-else-if="block.type === 'cta'" class="mt-8 rounded-2xl border border-line bg-stone-50 p-6 text-center">
        <p class="font-serif text-xl font-medium">{{ block.title }}</p>
        <p v-if="block.text" class="mt-2 text-stone-500">{{ block.text }}</p>
        <a v-if="block.buttonText" :href="block.buttonUrl" class="mt-4 inline-block rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90">{{ block.buttonText }}</a>
      </div>

      <div v-else-if="block.type === 'table' && block.rows?.length" class="mt-6 overflow-x-auto">
        <table class="w-full border-collapse text-sm">
          <tbody>
            <tr v-for="(row, ri) in block.rows" :key="ri" :class="ri === 0 ? 'font-semibold' : ''">
              <td v-for="(cell, ci) in row" :key="ci" class="border border-line px-3 py-2">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <pre v-else-if="block.type === 'code'" class="mt-6 overflow-x-auto rounded-xl bg-[#16150f] p-4 text-[13px] text-stone-100"><code>{{ block.code }}</code></pre>

      <div v-else-if="block.type === 'columns'" class="mt-6 grid gap-5 sm:grid-cols-2">
        <p class="leading-relaxed text-stone-600">{{ block.left }}</p>
        <p class="leading-relaxed text-stone-600">{{ block.right }}</p>
      </div>

      <div v-else-if="block.type === 'faq' && block.items?.length" class="mt-6 space-y-2" data-testid="cms-faq">
        <details v-for="(item, fi) in block.items" :key="fi" class="rounded-xl border border-line p-4">
          <summary class="cursor-pointer font-medium">{{ item.q }}</summary>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <p class="mt-2 text-stone-600" v-html="inline(item.a)" />
        </details>
      </div>

      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-else-if="block.type === 'html'" class="mt-6" v-html="block.html" />

      <ClientOnly v-else-if="block.type === 'properties'">
        <CmsPropertiesBlock :mode="block.mode" :limit="block.limit" />
      </ClientOnly>

      <div v-else-if="block.type === 'mortgage_calculator'" class="mt-6">
        <MortgageCalculator :price="block.price || 0" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import CmsKeyPoints from '~/components/cms/KeyPoints.vue'
import CmsTimeline from '~/components/cms/Timeline.vue'
import CmsChecklist from '~/components/cms/Checklist.vue'
import CmsCostCalculator from '~/components/cms/CostCalculator.vue'
import CmsFactorsChart from '~/components/cms/FactorsChart.vue'
import CmsComparator from '~/components/cms/Comparator.vue'
import CmsAccordion from '~/components/cms/Accordion.vue'
import { renderInline } from '~/utils/cmsInline'

defineProps<{ blocks: any[] }>()

// Enlaces [texto](url) y **negritas** de los textos del CMS: el texto se escapa antes (utils/cmsInline.ts).
const inline = (text: string) => renderInline(text || '')

const CALLOUT_CLS: Record<string, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
}

function youtubeId(url: string): string | null {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/)
  return m ? m[1] : null
}

const headingId = cmsHeadingId

</script>

<style>
/* Las figuras «anchas» se salen de la columna de lectura cuando hay sitio (ver pages/blog/[slug].vue). */
.cms-content .cms-credit {
  color: #a39d92;
}
.cms-content .cms-btn-ghost,
.cms-btn-ghost {
  display: inline-flex;
  align-items: center;
  min-height: 2.5rem;
  padding: 0 1rem;
  border-radius: 999px;
  border: 1px solid #d9d3c7;
  background: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  color: #2b2a26;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
}
.cms-btn-ghost:hover {
  border-color: #2b2a26;
}
.cms-content .cms-link {
  color: var(--cms-accent, #1f4e5f);
  text-decoration: underline;
  text-underline-offset: 0.2em;
  text-decoration-thickness: 1px;
}
.cms-content .cms-link:hover {
  text-decoration-thickness: 2px;
}
</style>
