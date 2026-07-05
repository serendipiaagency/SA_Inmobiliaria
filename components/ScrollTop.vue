<template>
  <transition name="st">
    <button v-if="visible" type="button" class="st-btn" :class="{ 'st-btn-raised': hasActiveBar }" aria-label="Volver arriba" @click="toTop">
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
    </button>
  </transition>
</template>

<script setup lang="ts">
const { hasActiveBar } = useBottomBar()
const visible = ref(false)
function onScroll() {
  visible.value = window.scrollY > 640
}
function toTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
})
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
</script>

<style scoped>
.st-btn {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 40;
  display: flex;
  height: 42px;
  width: 42px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: #16150f;
  color: #fff;
  box-shadow: 0 10px 26px -10px rgba(0, 0, 0, 0.5);
  transition: transform 0.2s var(--ease-out), background-color 0.2s, bottom 0.25s var(--ease-out);
}
.st-btn-raised {
  bottom: 88px;
}
.st-btn:hover {
  background: #000;
  transform: translateY(-2px);
}
.st-btn:active {
  transform: scale(0.94);
}
.st-enter-active,
.st-leave-active {
  transition: opacity 0.25s var(--ease-out), transform 0.25s var(--ease-out);
}
.st-enter-from,
.st-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.9);
}
</style>
