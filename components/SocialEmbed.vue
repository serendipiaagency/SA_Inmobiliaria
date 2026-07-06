<template>
  <div class="social-embed shrink-0">
    <blockquote
      v-if="platform === 'instagram'"
      class="instagram-media"
      :data-instgrm-permalink="url"
      data-instgrm-version="14"
      style="background: #fff; border: 0; margin: 0; max-width: 340px; min-width: 280px; padding: 0; width: 100%"
    />
    <blockquote v-else class="tiktok-embed" :cite="url" :data-video-id="tiktokVideoId" style="max-width: 340px; min-width: 280px">
      <section><a target="_blank" rel="noopener" :href="url">Ver en TikTok</a></section>
    </blockquote>
    <p v-if="caption" class="mt-2 max-w-[280px] text-[12px] text-stone-500">{{ caption }}</p>
  </div>
</template>

<script lang="ts">
// Module scope (shared across every SocialEmbed instance on the page) — a
// single Instagram embed.js load, reprocessed for each new blockquote
// rather than re-injected; TikTok's script is debounced so N embeds
// mounting in the same tick only trigger one script load.
let igScriptPromise: Promise<void> | null = null
function ensureInstagramScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if ((window as any).instgrm) return Promise.resolve()
  if (igScriptPromise) return igScriptPromise
  igScriptPromise = new Promise((resolve) => {
    const s = document.createElement('script')
    s.async = true
    s.src = 'https://www.instagram.com/embed.js'
    s.onload = () => resolve()
    s.onerror = () => resolve()
    document.body.appendChild(s)
  })
  return igScriptPromise
}

let tiktokTimer: ReturnType<typeof setTimeout> | null = null
function scheduleTikTokScript() {
  if (typeof window === 'undefined') return
  if (tiktokTimer) clearTimeout(tiktokTimer)
  tiktokTimer = setTimeout(() => {
    const s = document.createElement('script')
    s.async = true
    s.src = 'https://www.tiktok.com/embed.js'
    document.body.appendChild(s)
  }, 60)
}
</script>

<script setup lang="ts">
const props = defineProps<{ platform: 'instagram' | 'tiktok'; url: string; caption?: string | null }>()

// TikTok's embed script keys off data-video-id on the blockquote to know
// which video to render — cite/href alone isn't enough for it to swap in
// the real player, so it silently falls back to the plain link.
const tiktokVideoId = computed(() => props.url.match(/\/video\/(\d+)/)?.[1] || '')

onMounted(async () => {
  if (props.platform === 'instagram') {
    await ensureInstagramScript()
    ;(window as any).instgrm?.Embeds?.process()
  } else {
    scheduleTikTokScript()
  }
})
</script>
