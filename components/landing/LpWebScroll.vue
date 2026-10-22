<template>
  <div class="lp-webframe" role="img" aria-label="Demostración: una web inmobiliaria creada con el Constructor se desplaza por sus secciones (portada, buscador, propiedades y pie)">
    <div class="lp-web" :class="{ 'is-paused': paused }">
      <!-- Cabecera de la web -->
      <div class="mw-nav">
        <span class="mw-logo">tu<b>inmo</b></span>
        <span class="mw-menu"><i /><i /><i /><i /></span>
        <span class="mw-navbtn">Contacto</span>
      </div>
      <!-- Portada con buscador -->
      <div class="mw-hero">
        <div class="mw-hero-copy">
          <span class="mw-h1"/>
          <span class="mw-h1 short"/>
          <span class="mw-sub"/>
        </div>
        <div class="mw-search">
          <span class="mw-field">Comprar</span>
          <span class="mw-field">Ciudad o zona</span>
          <span class="mw-field">Precio</span>
          <span class="mw-searchbtn">Buscar</span>
        </div>
      </div>
      <!-- Propiedades destacadas -->
      <div class="mw-section">
        <span class="mw-eyebrow">Propiedades destacadas</span>
        <div class="mw-grid">
          <div v-for="n in 6" :key="n" class="mw-card">
            <span class="mw-photo" :data-n="n" />
            <span class="mw-price" />
            <span class="mw-specs" />
          </div>
        </div>
      </div>
      <!-- Banda corporativa -->
      <div class="mw-band">
        <div v-for="n in 3" :key="n" class="mw-stat"><b /><i /></div>
      </div>
      <!-- Contenido / sobre nosotros -->
      <div class="mw-content">
        <div class="mw-content-text"><span class="mw-h2" /><span class="mw-line" /><span class="mw-line short" /><span class="mw-cta">Conócenos</span></div>
        <div class="mw-content-media" />
      </div>
      <!-- Pie -->
      <div class="mw-footer">
        <span class="mw-logo light">tu<b>inmo</b></span>
        <div class="mw-foot-cols"><span /><span /><span /><span /></div>
      </div>
    </div>
    <div class="lp-web-hint" aria-hidden="true"><span class="lp-dot" /> Vista previa en vivo</div>
  </div>
</template>

<script setup lang="ts">
/**
 * Demostración del Constructor Web: una web inmobiliaria sintética (hecha con
 * bloques, sin imágenes externas para no penalizar la carga) que se desplaza
 * por sus secciones en bucle, como si se navegara por ella. Se pausa con
 * «reducir movimiento» y cuando la pestaña no está visible.
 */
const paused = ref(false)
function onVisibility() {
  paused.value = document.hidden
}
onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) paused.value = true
  document.addEventListener('visibilitychange', onVisibility)
})
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility))
</script>

<style scoped>
.lp-webframe {
  position: relative;
  height: var(--fh, 440px);
  overflow: hidden;
  background: #fff;
}
.lp-web {
  position: absolute;
  inset: 0 0 auto 0;
  display: flex;
  flex-direction: column;
  animation: lp-webscroll 24s ease-in-out infinite;
  will-change: transform;
}
.lp-web.is-paused {
  animation: none;
}
@keyframes lp-webscroll {
  0%, 4% {
    transform: translateY(0);
  }
  46%, 54% {
    transform: translateY(calc(-100% + var(--fh, 440px)));
  }
  96%, 100% {
    transform: translateY(0);
  }
}
/* Cabecera */
.mw-nav {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid #eef1f5;
}
.mw-logo {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.04em;
  color: var(--lp-ink);
}
.mw-logo b {
  color: var(--lp-blue);
}
.mw-logo.light {
  color: #fff;
}
.mw-logo.light b {
  color: #7bb5ff;
}
.mw-menu {
  display: flex;
  gap: 14px;
  margin-left: auto;
}
.mw-menu i {
  width: 36px;
  height: 7px;
  border-radius: 4px;
  background: #e7ebf1;
}
.mw-navbtn {
  padding: 7px 14px;
  border-radius: 7px;
  background: var(--lp-ink);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
}
/* Portada */
.mw-hero {
  position: relative;
  padding: 34px 24px 26px;
  background: radial-gradient(120% 120% at 100% 0, #e8f1ff, transparent 60%), #f7faff;
}
.mw-hero-copy {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mw-h1 {
  width: 62%;
  height: 20px;
  border-radius: 6px;
  background: #d6def0;
}
.mw-h1.short {
  width: 42%;
  background: #c3d6f5;
}
.mw-sub {
  width: 52%;
  height: 10px;
  border-radius: 5px;
  background: #e0e6f1;
  margin-top: 4px;
}
.mw-search {
  display: flex;
  gap: 8px;
  margin-top: 22px;
  padding: 10px;
  background: #fff;
  border: 1px solid #e2e8f2;
  border-radius: 12px;
  box-shadow: 0 16px 36px -24px rgba(8, 124, 250, 0.4);
}
.mw-field {
  flex: 1;
  padding: 11px 12px;
  border-radius: 8px;
  background: #f2f5fa;
  font-size: 10px;
  color: #8a93a3;
}
.mw-searchbtn {
  padding: 11px 18px;
  border-radius: 8px;
  background: var(--lp-blue);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
/* Secciones */
.mw-section {
  padding: 26px 24px;
}
.mw-eyebrow {
  display: inline-block;
  margin-bottom: 14px;
  font-size: 11px;
  font-weight: 700;
  color: var(--lp-blue);
}
.mw-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}
.mw-card {
  border: 1px solid #eef1f5;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
.mw-photo {
  display: block;
  height: 86px;
  background: linear-gradient(135deg, #cfe0f7, #aecbf2);
}
.mw-photo[data-n='2'] {
  background: linear-gradient(135deg, #d7e7d3, #bcd9c8);
}
.mw-photo[data-n='3'] {
  background: linear-gradient(135deg, #f0e2cf, #e6cdb0);
}
.mw-photo[data-n='5'] {
  background: linear-gradient(135deg, #e2d3f0, #cbb6e6);
}
.mw-photo[data-n='6'] {
  background: linear-gradient(135deg, #f3d3d9, #e6b0bc);
}
.mw-price {
  display: block;
  width: 54%;
  height: 11px;
  margin: 12px 12px 7px;
  border-radius: 5px;
  background: #cfd6e2;
}
.mw-specs {
  display: block;
  width: 78%;
  height: 8px;
  margin: 0 12px 14px;
  border-radius: 4px;
  background: #e7ebf1;
}
/* Banda */
.mw-band {
  display: flex;
  gap: 24px;
  justify-content: center;
  padding: 26px 24px;
  background: var(--lp-dark);
}
.mw-stat {
  display: flex;
  flex-direction: column;
  gap: 7px;
  align-items: center;
}
.mw-stat b {
  width: 56px;
  height: 18px;
  border-radius: 5px;
  background: #3a4252;
}
.mw-stat i {
  width: 78px;
  height: 8px;
  border-radius: 4px;
  background: #2a313e;
}
/* Contenido */
.mw-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: center;
  padding: 28px 24px;
}
.mw-content-text {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.mw-h2 {
  width: 70%;
  height: 16px;
  border-radius: 6px;
  background: #d6def0;
}
.mw-line {
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: #e7ebf1;
}
.mw-line.short {
  width: 64%;
}
.mw-cta {
  margin-top: 6px;
  padding: 9px 16px;
  width: fit-content;
  border-radius: 8px;
  background: var(--lp-ink);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
}
.mw-content-media {
  height: 120px;
  border-radius: 12px;
  background: linear-gradient(135deg, #cfe0f7, #b7d0f2);
}
/* Pie */
.mw-footer {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 22px 24px 30px;
  background: #0b0e14;
}
.mw-foot-cols {
  display: flex;
  gap: 18px;
  margin-left: auto;
}
.mw-foot-cols span {
  width: 46px;
  height: 8px;
  border-radius: 4px;
  background: #222a36;
}
.lp-web-hint {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(6px);
  border: 1px solid var(--lp-line);
  font-size: 11px;
  font-weight: 600;
  color: var(--lp-ink);
  box-shadow: 0 8px 20px -12px rgba(16, 19, 25, 0.4);
}
@media (max-width: 860px) {
  .mw-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (prefers-reduced-motion: reduce) {
  .lp-web {
    animation: none;
  }
}
</style>
