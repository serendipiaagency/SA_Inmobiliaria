<template>
  <span class="pi-lockup" :class="[`pi-${size}`, dark ? 'pi-dark' : 'pi-light']" data-testid="portal-inmo-logo">
    <!-- Logotipo de la marca del SaaS (Portal INMO), no de ninguna inmobiliaria.
         Imagen de marca fija (fondo transparente): sirve sobre claro y oscuro,
         e independiente del Brand Kit de ningún tenant. -->
    <img class="pi-mark" src="/portal-inmo-logo.png" alt="Portal INMO" width="732" height="647" >
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
  width: auto;
  object-fit: contain;
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
}
.pi-sm .pi-word {
  font-size: 1.05rem;
}
.pi-md .pi-mark {
  height: 2.25rem;
}
.pi-md .pi-word {
  font-size: 1.4rem;
}
.pi-lg .pi-mark {
  height: 3rem;
}
.pi-lg .pi-word {
  font-size: 1.9rem;
}
</style>
