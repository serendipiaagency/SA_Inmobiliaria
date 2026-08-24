<template>
  <footer class="no-print border-t border-line bg-white">
    <div class="mx-auto max-w-screen-2xl px-6 py-16 lg:px-10">
      <div class="grid gap-12 md:grid-cols-12">
        <div class="md:col-span-5">
          <Logo size="md" :company-name="tenant?.companyName" :logo-url="mediaUrl(tenant?.logo)" />
          <p class="mt-5 max-w-sm text-sm leading-relaxed text-stone-500">
            {{ t('footer.tagline') }}
          </p>
        </div>
        <div class="md:col-span-2">
          <p class="eyebrow mb-5">{{ t('footer.explore') }}</p>
          <ul class="space-y-3 text-sm text-stone-600">
            <li><NuxtLink class="transition hover:text-ink" to="/propiedades">{{ t('footer.offplan') }}</NuxtLink></li>
            <li><NuxtLink class="transition hover:text-ink" to="/zonas">{{ t('footer.communities') }}</NuxtLink></li>
            <li><NuxtLink class="transition hover:text-ink" to="/promotoras">{{ t('footer.developers') }}</NuxtLink></li>
          </ul>
        </div>
        <div class="md:col-span-2">
          <p class="eyebrow mb-5">{{ t('footer.company') }}</p>
          <ul class="space-y-3 text-sm text-stone-600">
            <li><NuxtLink class="transition hover:text-ink" to="/nosotros">{{ t('footer.about') }}</NuxtLink></li>
            <li><NuxtLink class="transition hover:text-ink" to="/equipo">{{ t('footer.team') }}</NuxtLink></li>
            <li><NuxtLink class="transition hover:text-ink" to="/blog">{{ t('footer.journal') }}</NuxtLink></li>
          </ul>
        </div>
        <div class="md:col-span-3">
          <p class="eyebrow mb-5">{{ t('footer.services') }}</p>
          <ul class="space-y-3 text-sm text-stone-600">
            <li><NuxtLink class="transition hover:text-ink" to="/visitante">{{ t('footer.visitor') }}</NuxtLink></li>
            <li><NuxtLink class="transition hover:text-ink" to="/proveedores/registro">{{ t('footer.vendor') }}</NuxtLink></li>
            <li><NuxtLink class="transition hover:text-ink" to="/reclamaciones">{{ t('footer.complaints') }}</NuxtLink></li>
            <li><NuxtLink class="transition hover:text-ink" to="/contacto">{{ t('footer.contactus') }}</NuxtLink></li>
          </ul>
        </div>
      </div>
      <div class="hairline mt-14 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-6 text-center text-xs tracking-wide text-stone-400">
        <span>© {{ new Date().getFullYear() }} {{ tenant?.companyName || tenant?.name }}. {{ t('footer.rights') }}</span>
        <NuxtLink class="transition hover:text-ink" to="/privacidad">{{ t('footer.privacy') }}</NuxtLink>
        <NuxtLink class="transition hover:text-ink" to="/terminos">{{ t('footer.terms') }}</NuxtLink>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
const { t } = useI18n()
const { tenant, load: loadTenant } = useTenant()
await loadTenant()
</script>
