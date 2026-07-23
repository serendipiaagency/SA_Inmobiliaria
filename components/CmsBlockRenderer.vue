<template>
  <div class="cms-content">
    <template v-for="block in blocks" :key="block.id">
      <h2 v-if="block.type === 'heading' && block.level === 2" :id="headingId(block)" class="mt-10 scroll-mt-24 font-serif text-2xl font-medium">{{ block.text }}</h2>
      <h3 v-else-if="block.type === 'heading'" :id="headingId(block)" class="mt-8 scroll-mt-24 font-serif text-xl font-medium">{{ block.text }}</h3>

      <p v-else-if="block.type === 'paragraph'" class="mt-5 leading-relaxed text-stone-600">{{ block.text }}</p>

      <blockquote v-else-if="block.type === 'quote'" class="mt-6 border-l-4 border-ink/20 pl-5 italic text-stone-600">
        <p>{{ block.text }}</p>
        <cite v-if="block.author" class="mt-2 block text-sm not-italic text-stone-450">— {{ block.author }}</cite>
      </blockquote>

      <div v-else-if="block.type === 'callout'" class="mt-6 rounded-xl border p-4" :class="CALLOUT_CLS[block.variant] || CALLOUT_CLS.info">
        <p>{{ block.text }}</p>
      </div>

      <hr v-else-if="block.type === 'divider'" class="my-8 border-line" />

      <figure v-else-if="block.type === 'image' && block.src" class="mt-6">
        <img :src="mediaUrl(block.src)" :alt="block.alt || ''" class="w-full rounded-xl object-cover" loading="lazy" />
        <figcaption v-if="block.caption" class="mt-2 text-center text-sm text-stone-450">{{ block.caption }}</figcaption>
      </figure>

      <div v-else-if="block.type === 'gallery' && block.images?.length" class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <img v-for="(img, i) in block.images" :key="i" :src="mediaUrl(img.src)" :alt="img.alt || ''" class="aspect-square rounded-lg object-cover" loading="lazy" />
      </div>

      <div v-else-if="block.type === 'video' && youtubeId(block.url)" class="mt-6 aspect-video overflow-hidden rounded-xl">
        <iframe :src="`https://www.youtube.com/embed/${youtubeId(block.url)}`" class="h-full w-full" allowfullscreen loading="lazy" />
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

      <div v-else-if="block.type === 'faq' && block.items?.length" class="mt-6 space-y-2">
        <details v-for="(item, fi) in block.items" :key="fi" class="rounded-xl border border-line p-4">
          <summary class="cursor-pointer font-medium">{{ item.q }}</summary>
          <p class="mt-2 text-stone-600">{{ item.a }}</p>
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
defineProps<{ blocks: any[] }>()

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
