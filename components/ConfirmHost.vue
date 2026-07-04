<template>
  <Teleport to="body">
    <transition name="confirm-fade">
      <div v-if="request" class="confirm-backdrop" @click.self="settle(false)" @keydown.esc="settle(false)">
        <transition name="confirm-pop" appear>
          <div v-if="request" class="confirm-box" role="alertdialog" aria-modal="true">
            <h3 class="confirm-title">{{ request.title }}</h3>
            <p class="confirm-message">{{ request.message }}</p>
            <div class="confirm-actions">
              <button type="button" class="confirm-btn confirm-cancel" @click="settle(false)">{{ request.cancelLabel }}</button>
              <button type="button" class="confirm-btn" :class="request.danger ? 'confirm-danger' : 'confirm-ok'" @click="settle(true)">
                {{ request.confirmLabel }}
              </button>
            </div>
          </div>
        </transition>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
const { request, settle } = useConfirm()
</script>

<style scoped>
.confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 15, 13, 0.45);
  backdrop-filter: blur(3px);
  padding: 20px;
}
.confirm-box {
  width: min(400px, 100%);
  background: #fff;
  border-radius: 16px;
  padding: 22px 22px 18px;
  box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.45);
}
.confirm-title {
  font-size: 16px;
  font-weight: 700;
  color: #16150f;
}
.confirm-message {
  margin-top: 8px;
  font-size: 13.5px;
  line-height: 1.5;
  color: #78716c;
}
.confirm-actions {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.confirm-btn {
  border-radius: 9px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  transition: transform 0.15s var(--ease-out), opacity 0.15s;
}
.confirm-btn:active {
  transform: scale(0.96);
}
.confirm-cancel {
  color: #57534e;
  background: #f5f5f4;
}
.confirm-cancel:hover {
  background: #e7e4de;
}
.confirm-ok {
  color: #fff;
  background: #16150f;
}
.confirm-ok:hover {
  background: #000;
}
.confirm-danger {
  color: #fff;
  background: #dc2626;
}
.confirm-danger:hover {
  background: #b91c1c;
}

.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.2s var(--ease-out);
}
.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}
.confirm-pop-enter-active {
  transition: transform 0.28s var(--ease-spring), opacity 0.2s var(--ease-out);
}
.confirm-pop-leave-active {
  transition: transform 0.16s var(--ease-out), opacity 0.16s var(--ease-out);
}
.confirm-pop-enter-from,
.confirm-pop-leave-to {
  opacity: 0;
  transform: scale(0.94) translateY(6px);
}
</style>
