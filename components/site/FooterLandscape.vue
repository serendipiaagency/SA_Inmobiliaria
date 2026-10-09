<template>
  <div class="fl" :class="hideOnMobile ? 'max-sm:hidden' : ''" :style="{ height: `${landscape.height}px`, opacity: landscape.opacity / 100 }" aria-hidden="true" data-testid="footer-landscape" :data-mode="landscape.mode" :data-preset="landscape.mode === 'preset' ? landscape.preset : undefined">
    <img v-if="landscape.mode === 'image' && landscape.image" :src="mediaUrl(landscape.image)" alt="" loading="lazy" decoding="async" class="fl-img" :style="{ objectPosition: `center ${landscape.position}` }" >
    <svg v-else-if="landscape.mode === 'preset'" class="fl-svg" viewBox="0 0 1440 200" :preserveAspectRatio="`xMidYMax slice`" fill="currentColor">
      <!-- Montaña y costa con faro -->
      <g v-if="landscape.preset === 'coast'">
        <path fill-opacity=".32" d="M0 150 L90 104 L150 122 L250 70 L340 112 L420 86 L520 128 L600 104 L700 140 L760 132 L760 200 L0 200 Z" />
        <path fill-opacity=".5" d="M0 168 C110 142 210 152 320 140 C430 128 530 150 650 162 C700 167 740 170 780 172 L780 200 L0 200 Z" />
        <path fill-opacity=".16" d="M640 170 H1440 V200 H640 Z" />
        <path fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="2" stroke-linecap="round" d="M700 180 q14 -5 28 0 t28 0 M820 188 q14 -5 28 0 t28 0 t28 0 M980 179 q14 -5 28 0 t28 0 M1090 190 q14 -5 28 0 t28 0" />
        <path fill-opacity=".62" d="M1160 200 L1166 160 C1196 146 1230 132 1266 128 L1340 126 C1380 128 1414 136 1440 142 L1440 200 Z" />
        <path fill-opacity=".85" d="M1291 128 L1295 82 L1309 82 L1313 128 Z" />
        <path fill-opacity=".35" d="M1293.6 112 H1310.4 L1311 120 H1293 Z M1294.8 96 H1309.2 L1309.7 103 H1294.3 Z" />
        <path fill-opacity=".9" d="M1290 82 H1314 V78 H1290 Z M1296 78 H1308 V68 H1296 Z M1293 68 L1302 59 L1311 68 Z" />
        <path fill-opacity=".14" d="M1308 72 L1400 56 L1400 90 Z" />
        <path fill="none" stroke="currentColor" stroke-opacity=".5" stroke-width="1.6" stroke-linecap="round" d="M470 52 q6 -6 12 0 q6 -6 12 0 M520 40 q5 -5 10 0 q5 -5 10 0 M930 64 q6 -6 12 0 q6 -6 12 0" />
      </g>
      <!-- Montañas -->
      <g v-else-if="landscape.preset === 'mountains'">
        <path fill-opacity=".28" d="M0 140 L110 70 L190 110 L300 40 L420 120 L520 80 L640 130 L760 60 L880 120 L980 74 L1110 128 L1230 58 L1340 110 L1440 80 L1440 200 L0 200 Z" />
        <path fill-opacity=".45" d="M0 170 L140 118 L240 150 L360 100 L480 158 L600 120 L720 166 L860 112 L990 160 L1120 124 L1260 170 L1360 136 L1440 160 L1440 200 L0 200 Z" />
        <path fill-opacity=".65" d="M0 188 C160 170 300 182 460 176 C640 168 800 186 980 180 C1150 174 1300 186 1440 178 L1440 200 L0 200 Z" />
      </g>
      <!-- Ciudad -->
      <g v-else-if="landscape.preset === 'city'">
        <path fill-opacity=".3" d="M0 200 V150 H50 V120 H90 V150 H130 V96 H170 V150 H220 V130 H260 V80 H300 V150 H350 V112 H400 V150 H460 V70 H490 V60 H520 V150 H580 V124 H630 V150 H690 V100 H740 V150 H800 V86 H840 V150 H900 V118 H950 V150 H1010 V64 H1050 V150 H1110 V108 H1160 V150 H1220 V90 H1270 V150 H1330 V126 H1380 V150 H1440 V200 Z" />
        <path fill-opacity=".55" d="M0 200 V170 H70 V146 H120 V170 H190 V136 H240 V170 H320 V150 H370 V170 H450 V128 H500 V170 H570 V152 H630 V170 H710 V140 H770 V170 H850 V132 H900 V170 H980 V150 H1040 V170 H1120 V138 H1180 V170 H1260 V154 H1310 V170 H1390 V144 H1440 V200 Z" />
      </g>
      <!-- Campo -->
      <g v-else>
        <path fill-opacity=".28" d="M0 150 C180 110 360 120 520 136 C700 154 860 118 1040 116 C1220 114 1340 132 1440 126 L1440 200 L0 200 Z" />
        <path fill-opacity=".5" d="M0 178 C220 150 420 162 640 170 C860 178 1080 150 1280 156 C1360 158 1410 164 1440 166 L1440 200 L0 200 Z" />
        <path fill-opacity=".6" d="M286 150 V128 L306 114 L326 128 V150 Z" />
        <circle cx="402" cy="128" r="14" fill-opacity=".55" />
        <circle cx="430" cy="134" r="10" fill-opacity=".55" />
        <circle cx="1120" cy="118" r="16" fill-opacity=".5" />
        <circle cx="1150" cy="126" r="11" fill-opacity=".5" />
        <path fill-opacity=".55" d="M400 142 h4 v14 h-4 Z M428 144 h4 v12 h-4 Z M1118 134 h4 v14 h-4 Z M1148 137 h4 v12 h-4 Z" />
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import type { FooterConfig } from '~/utils/siteFooter'

/**
 * El paisaje decorativo del pie, a todo el ancho y muy suave (opacidad baja,
 * con un fundido arriba para que no corte): uno de los dibujos de partida
 * (SVG, en el color del texto del pie) o una imagen propia de la biblioteca
 * de medios. Ninguno es «de» una empresa: cada una elige el suyo, o ninguno.
 */
defineProps<{ landscape: FooterConfig['landscape']; hideOnMobile?: boolean }>()
</script>

<style scoped>
.fl {
  position: relative;
  width: 100%;
  overflow: hidden;
  pointer-events: none;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 45%);
  mask-image: linear-gradient(to bottom, transparent 0%, #000 45%);
}
.fl-svg,
.fl-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.fl-img {
  object-fit: cover;
}
</style>
