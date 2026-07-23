<template>
  <img v-if="logoUrl" :src="logoUrl" :alt="companyName" class="mm-logo-img" :class="markSizeCls" />
  <span v-else-if="variant === 'mark'" class="mm-mark" :class="[markSizeCls, dark ? 'mm-mark-dark' : 'mm-mark-light']">{{ initials }}</span>
  <span v-else class="mm-full" :class="dark ? 'mm-full-dark' : 'mm-full-light'">
    <span class="mm-word" :class="wordSizeCls">{{ wordText }}</span>
    <span v-if="subText" class="mm-sub" :class="subSizeCls">{{ subText }}</span>
  </span>
</template>

<script setup lang="ts">
/**
 * Defaults to the M&M brand (the pre-existing tenant) so nothing changes
 * visually unless real per-organization branding is provided — pass
 * `companyName`/`logoUrl` explicitly (e.g. from useTenant()) to brand this
 * for a different client company.
 */
const props = withDefaults(
  defineProps<{ variant?: 'full' | 'mark'; size?: 'sm' | 'md' | 'lg'; dark?: boolean; companyName?: string | null; logoUrl?: string | null }>(),
  { variant: 'full', size: 'md', dark: false, companyName: null, logoUrl: null },
)

const wordText = computed(() => {
  if (!props.companyName) return 'M&M'
  const parts = props.companyName.trim().split(/\s+/)
  return parts[0]
})
const subText = computed(() => {
  if (!props.companyName) return 'Real Estate'
  const parts = props.companyName.trim().split(/\s+/)
  return parts.slice(1).join(' ') || null
})
const initials = computed(() => {
  if (!props.companyName) return 'M&M'
  return props.companyName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
})

const markSizeCls = computed(() => ({ sm: 'mm-mark-sm', md: 'mm-mark-md', lg: 'mm-mark-lg' }[props.size]))
const wordSizeCls = computed(() => ({ sm: 'mm-word-sm', md: 'mm-word-md', lg: 'mm-word-lg' }[props.size]))
const subSizeCls = computed(() => ({ sm: 'mm-sub-sm', md: 'mm-sub-md', lg: 'mm-sub-lg' }[props.size]))
</script>

<style scoped>
.mm-logo-img {
  display: inline-block;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 0.4em;
}
.mm-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.55em;
  font-family: 'Playfair Display', Georgia, serif;
  font-weight: 700;
  letter-spacing: -0.02em;
  flex-shrink: 0;
}
.mm-mark-light {
  background: #16150f;
  color: #fdfcfa;
}
.mm-mark-dark {
  background: #fdfcfa;
  color: #16150f;
}
.mm-mark-sm {
  height: 1.75rem;
  width: 1.75rem;
  font-size: 10px;
}
.mm-mark-md {
  height: 2.25rem;
  width: 2.25rem;
  font-size: 12px;
}
.mm-mark-lg {
  height: 3rem;
  width: 3rem;
  font-size: 15px;
}

.mm-full {
  display: inline-flex;
  flex-direction: column;
  line-height: 1;
}
.mm-word {
  font-family: 'Playfair Display', Georgia, serif;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.mm-word-sm {
  font-size: 1.15rem;
}
.mm-word-md {
  font-size: 1.5rem;
}
.mm-word-lg {
  font-size: 2.75rem;
}
.mm-sub {
  margin-top: 0.28em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.32em;
  opacity: 0.6;
}
.mm-sub-sm {
  font-size: 8px;
}
.mm-sub-md {
  font-size: 9.5px;
}
.mm-sub-lg {
  font-size: 12px;
}
.mm-full-light {
  color: #16150f;
}
.mm-full-dark {
  color: #fdfcfa;
}
</style>
