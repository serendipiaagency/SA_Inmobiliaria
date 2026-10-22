<template>
  <span class="pi-lockup" :class="[`pi-${size}`, dark ? 'pi-dark' : 'pi-light']" data-testid="portal-inmo-logo">
    <!-- Monograma de la marca del SaaS (Portal INMO), no de ninguna inmobiliaria.
         Colores fijos de marca: no depende del Brand Kit de ningún tenant. -->
    <svg class="pi-mark" viewBox="0 0 32 32" role="img" aria-label="Portal INMO" focusable="false">
      <rect width="32" height="32" rx="7" fill="#16150f" />
      <path d="M16 6.5 L26 14.5 V26 H6 V14.5 Z" fill="#fdfcfa" />
      <rect x="13.4" y="18.4" width="5.2" height="7.6" fill="#16150f" />
      <rect x="13.4" y="12.8" width="5.2" height="3.4" rx="0.5" fill="#c07a54" />
    </svg>
    <span v-if="variant === 'full'" class="pi-word">Portal<span class="pi-strong"> INMO</span></span>
  </span>
</template>

<script setup lang="ts">
/**
 * El logotipo de la PLATAFORMA (Portal INMO), para el chrome del SaaS —login
 * del panel, registro de empresa, recuperación de contraseña y la barra del
 * panel—, nunca la marca de una inmobiliaria (esa la pinta `components/Logo.vue`
 * con el Brand Kit del tenant). Es un monograma SVG propio con el nombre al
 * lado; colores fijos de marca, independientes del Brand Kit de ningún tenant.
 */
withDefaults(
  defineProps<{ variant?: 'full' | 'mark'; size?: 'sm' | 'md' | 'lg'; dark?: boolean }>(),
  { variant: 'full', size: 'md', dark: false },
)
</script>

<style scoped>
.pi-lockup {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
}
.pi-mark {
  display: inline-block;
  flex-shrink: 0;
  border-radius: 0.5em;
}
.pi-word {
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1;
}
.pi-strong {
  font-weight: 800;
}
.pi-light .pi-word {
  color: #16150f;
}
.pi-dark .pi-word {
  color: #fdfcfa;
}
.pi-sm .pi-mark {
  height: 1.75rem;
  width: 1.75rem;
}
.pi-sm .pi-word {
  font-size: 1.05rem;
}
.pi-md .pi-mark {
  height: 2.25rem;
  width: 2.25rem;
}
.pi-md .pi-word {
  font-size: 1.4rem;
}
.pi-lg .pi-mark {
  height: 3rem;
  width: 3rem;
}
.pi-lg .pi-word {
  font-size: 1.9rem;
}
</style>
