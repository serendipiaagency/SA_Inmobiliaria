<template>
  <span v-if="variant === 'mark'" class="mm-mark" :class="[markSizeCls, dark ? 'mm-mark-dark' : 'mm-mark-light']">M&amp;M</span>
  <span v-else class="mm-full" :class="dark ? 'mm-full-dark' : 'mm-full-light'">
    <span class="mm-word" :class="wordSizeCls">M&amp;M</span>
    <span class="mm-sub" :class="subSizeCls">Real Estate</span>
  </span>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ variant?: 'full' | 'mark'; size?: 'sm' | 'md' | 'lg'; dark?: boolean }>(), {
  variant: 'full',
  size: 'md',
  dark: false,
})

const markSizeCls = computed(() => ({ sm: 'mm-mark-sm', md: 'mm-mark-md', lg: 'mm-mark-lg' }[props.size]))
const wordSizeCls = computed(() => ({ sm: 'mm-word-sm', md: 'mm-word-md', lg: 'mm-word-lg' }[props.size]))
const subSizeCls = computed(() => ({ sm: 'mm-sub-sm', md: 'mm-sub-md', lg: 'mm-sub-lg' }[props.size]))
</script>

<style scoped>
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
