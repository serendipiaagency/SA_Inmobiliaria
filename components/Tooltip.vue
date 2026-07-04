<template>
  <span class="tt-wrap" @mouseenter="onEnter" @mouseleave="onLeave" @focusin="show = true" @focusout="show = false">
    <slot />
    <transition name="tt">
      <span v-if="show && text" class="tt-bubble" :class="`tt-${side}`" role="tooltip">{{ text }}</span>
    </transition>
  </span>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ text?: string; side?: 'top' | 'bottom'; delay?: number }>(), {
  side: 'top',
  delay: 350,
})
const show = ref(false)
let timer: any = null

function onEnter() {
  timer = setTimeout(() => (show.value = true), props.delay)
}
function onLeave() {
  clearTimeout(timer)
  show.value = false
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<style scoped>
.tt-wrap {
  position: relative;
  display: inline-flex;
}
.tt-bubble {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  background: #16150f;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  padding: 5px 9px;
  border-radius: 7px;
  pointer-events: none;
  z-index: 60;
  box-shadow: 0 8px 20px -8px rgba(0, 0, 0, 0.5);
}
.tt-top {
  bottom: calc(100% + 8px);
}
.tt-bottom {
  top: calc(100% + 8px);
}
.tt-enter-active,
.tt-leave-active {
  transition: opacity 0.15s var(--ease-out), transform 0.15s var(--ease-out);
}
.tt-enter-from,
.tt-leave-to {
  opacity: 0;
}
.tt-top.tt-enter-from,
.tt-top.tt-leave-to {
  transform: translateX(-50%) translateY(3px);
}
.tt-bottom.tt-enter-from,
.tt-bottom.tt-leave-to {
  transform: translateX(-50%) translateY(-3px);
}
</style>
