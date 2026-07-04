<template>
  <Teleport to="body">
    <div class="toast-host" role="status" aria-live="polite">
      <transition-group name="toast">
        <div v-for="t in toasts" :key="t.id" class="toast-item" :class="`toast-${t.type}`" @click="dismiss(t.id)">
          <svg v-if="t.type === 'success'" class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20 6 9 17l-5-5" /></svg>
          <svg v-else-if="t.type === 'error'" class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9" /><path stroke-linecap="round" d="M12 8v5M12 16h.01" /></svg>
          <svg v-else class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9" /><path stroke-linecap="round" d="M12 16v-5M12 8h.01" /></svg>
          <span class="toast-msg">{{ t.message }}</span>
        </div>
      </transition-group>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
const { toasts, dismiss } = useToast()
</script>

<style scoped>
.toast-host {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  gap: 8px;
  pointer-events: none;
  width: max-content;
  max-width: calc(100vw - 32px);
}
.toast-item {
  pointer-events: auto;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #16150f;
  color: #fff;
  padding: 11px 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.45);
}
.toast-success .toast-icon { color: #6ee7b7; }
.toast-error { background: #1c1210; }
.toast-error .toast-icon { color: #fb7185; }
.toast-info .toast-icon { color: #93c5fd; }
.toast-icon { height: 16px; width: 16px; flex-shrink: 0; }
.toast-msg { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60vw; }

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.28s var(--ease-out), transform 0.28s var(--ease-out);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
}
.toast-leave-active {
  position: absolute;
}
</style>
