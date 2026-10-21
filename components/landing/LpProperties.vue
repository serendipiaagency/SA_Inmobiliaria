<template>
  <section id="propiedades" class="lp-section lp-props" data-testid="landing-properties">
    <div class="lp-shell">
      <div class="lp-section-top lp-reveal">
        <h2 class="lp-h2">{{ LANDING_PROPERTIES.title[0] }}<br><span>{{ LANDING_PROPERTIES.title[1] }}</span></h2>
        <div>
          <p>{{ LANDING_PROPERTIES.subtitle }}</p>
        </div>
      </div>

      <div class="lp-gallery lp-reveal">
        <figure v-for="g in LANDING_PROPERTIES.gallery" :key="g.photo">
          <img :src="LANDING_PHOTOS[g.photo].src" :alt="LANDING_PHOTOS[g.photo].alt" :width="LANDING_PHOTOS[g.photo].width" :height="LANDING_PHOTOS[g.photo].height" loading="lazy" decoding="async">
          <figcaption>{{ g.caption }}</figcaption>
        </figure>
      </div>

      <ul class="lp-chips" aria-label="Qué incluye la gestión de propiedades">
        <li v-for="b in LANDING_PROPERTIES.benefits" :key="b"><LpIcon name="check" />{{ b }}</li>
      </ul>

      <p class="lp-footnote">{{ LANDING_PROPERTIES.footnote }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import LpIcon from './LpIcon.vue'
import { LANDING_PHOTOS, LANDING_PROPERTIES } from '~/utils/landing'

/** Propiedades: fotografía de ambiente (propiedades de lujo) y los puntos reales de la gestión del catálogo. */
</script>

<style scoped>
.lp-props {
  background: var(--lp-paper);
}
.lp-gallery {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 20px;
}
.lp-gallery figure {
  position: relative;
  margin: 0;
  height: clamp(260px, 30vw, 350px);
  border-radius: 10px;
  overflow: hidden;
}
.lp-gallery figure:nth-child(2) {
  margin-top: 45px;
}
.lp-gallery figure:nth-child(3) {
  margin-top: 90px;
}
.lp-gallery img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 1.1s var(--lp-ease);
}
.lp-gallery figure:hover img {
  transform: scale(1.06);
}
.lp-gallery figcaption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 60px 22px 22px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.6));
  color: #fff;
  font-size: 12px;
}
.lp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 36px 0 0;
  padding: 0;
  list-style: none;
}
.lp-chips li {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 10px 15px;
  border-radius: 999px;
  background: var(--lp-paper-2);
  border: 1px solid var(--lp-line);
  font-size: 13px;
  font-weight: 500;
  color: var(--lp-ink);
}
.lp-chips svg {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  color: var(--lp-blue);
}
.lp-footnote {
  margin: 24px 0 0;
  font-size: 10px;
  color: #999;
}
@media (max-width: 860px) {
  .lp-gallery {
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .lp-gallery figure {
    height: 230px;
  }
  .lp-gallery figure:first-child {
    grid-column: 1 / -1;
    height: 290px;
  }
  .lp-gallery figure:nth-child(2),
  .lp-gallery figure:nth-child(3) {
    margin-top: 0;
  }
}
</style>
