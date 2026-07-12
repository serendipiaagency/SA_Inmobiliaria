<template>
  <Transition name="cookie-slide">
    <div
      v-if="visible"
      class="no-print fixed inset-x-0 bottom-0 z-50 border-t border-line bg-white/97 backdrop-blur"
      style="padding-bottom: env(safe-area-inset-bottom)"
      role="dialog"
      aria-label="Cookies"
    >
      <div class="mx-auto flex max-w-screen-2xl flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <p class="max-w-2xl text-[13px] leading-relaxed text-stone-600">
          {{ t('cookie.message') }}
          <NuxtLink to="/privacy" class="underline underline-offset-2 hover:text-ink">{{ t('cookie.learnMore') }}</NuxtLink>
        </p>
        <div class="flex shrink-0 gap-2.5">
          <button class="border border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest2 text-stone-600 transition hover:border-stone-300" @click="reject">
            {{ t('cookie.rejectAll') }}
          </button>
          <button class="bg-ink px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest2 text-white transition hover:bg-black" @click="accept">
            {{ t('cookie.acceptAll') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
const { t } = useI18n()
const STORAGE_KEY = 'sa_cookie_consent'
const visible = ref(false)

onMounted(() => {
  if (!localStorage.getItem(STORAGE_KEY)) visible.value = true
})

function accept() {
  localStorage.setItem(STORAGE_KEY, 'accepted')
  visible.value = false
}
function reject() {
  localStorage.setItem(STORAGE_KEY, 'rejected')
  visible.value = false
}
</script>

<style scoped>
.cookie-slide-enter-active,
.cookie-slide-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.cookie-slide-enter-from,
.cookie-slide-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
