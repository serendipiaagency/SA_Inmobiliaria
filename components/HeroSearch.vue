<template>
  <section ref="root" class="hero relative z-[1] flex flex-col bg-ink" :style="{ minHeight: '100svh' }">
    <!-- Fondo: bucle de imágenes (fundido + zoom lento) o imagen fija, con un parallax suave (utils/siteBuilder/heroMedia.ts).
         El recorte va aquí y no en la sección: así los desplegables del buscador nunca se cortan ni quedan detrás. -->
    <div class="absolute inset-0 overflow-hidden" aria-hidden="true">
    <div class="absolute -inset-y-[7%] inset-x-0 will-change-transform" :style="parallaxStyle" data-testid="hero-background">
      <div
        v-for="(img, i) in frames"
        :key="`${i}:${img}`"
        class="hero-slide absolute inset-0 bg-cover"
        :class="frames.length === 1 ? 'is-static' : { 'is-active': i === active, 'is-leaving': i === leaving }"
        :style="{ backgroundImage: `url(${img})`, backgroundPosition: backgroundPosition }"
        data-testid="hero-slide"
      />
      <div class="absolute inset-0 bg-gradient-to-b from-black/55 via-black/20 to-black/70" />
      <div class="absolute inset-0 bg-black/10" />
      <!-- Builder-configurable extra scrim (Diseño > Overlay), on top of the fixed gradient above — 0 by default, pixel-identical to before this existed. -->
      <div v-if="overlayOpacity > 0" class="absolute inset-0 bg-black" :style="{ opacity: overlayOpacity / 100 }" />
      <div class="pointer-events-none absolute inset-0 hero-vignette" />
    </div>
    </div>

    <!-- Content -->
    <div class="relative z-10 mx-auto flex w-full max-w-screen-2xl flex-1 flex-col px-6 lg:px-10">
      <div class="flex flex-1 flex-col justify-center pb-4 pt-24 md:pt-28" :class="contentAlign === 'center' ? 'items-center text-center' : ''">
        <SbText tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="rise eyebrow w-fit bg-white/15 !text-white/90 backdrop-blur-sm" :style="delay(0)" :text="heroEyebrow" />
        <h1
          class="rise mt-7 max-w-4xl font-serif text-[clamp(3rem,7.5vw,6.75rem)] font-medium leading-[1.01] tracking-[-0.01em] text-white"
          :style="delay(1)"
        >
          <SbText tag="span" field="title1" kind="heading" label="Título (línea 1)" :text="heroTitle1" /> <br class="hidden sm:block" ><SbText tag="span" field="title2" kind="heading" label="Título (línea 2)" class="italic" :text="heroTitle2" />
        </h1>
        <SbText tag="p" field="subtitle" label="Subtítulo" multiline class="rise mt-8 max-w-md text-base leading-relaxed text-white/80 md:text-lg" :style="delay(2)" :text="heroSubtitle" />

        <!-- El buscador, protagonista del Hero (megaprompt «Hero»): Comprar | Alquilar, una barra con
             Tipo de inmueble, Ubicación, Precio y Habitaciones y el botón «Buscar», y debajo, fuera de
             la barra, «Más filtros» con todo lo demás. Colores: los de la marca de cada inmobiliaria. -->
        <div ref="searchRoot" class="rise relative z-30 mt-10 w-full max-w-6xl" :style="[delay(3), accentVars]" :class="contentAlign === 'center' ? 'text-left' : ''" data-testid="hero-searchbox">
          <!-- Comprar | Alquilar -->
          <div class="hs-seg" role="group" :aria-label="t('hero.operation', 'Operación')" data-testid="hero-operation">
            <button
              v-for="tabItem in tabs"
              :key="tabItem.key"
              type="button"
              class="tab hs-seg-btn"
              :class="{ 'is-on': activeTab === tabItem.key }"
              :aria-pressed="activeTab === tabItem.key"
              :data-op="tabItem.key"
              @click="setTab(tabItem.key)"
            >
              <svg v-if="tabItem.key === 'buy'" class="hs-seg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-5.5h4V21" /></svg>
              <svg v-else class="hs-seg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 9.3-9.3" /><path d="m17 6 3 3" /><path d="m14.5 8.5 2 2" /></svg>
              {{ tabItem.label }}
            </button>
          </div>

          <!-- Barra: los campos visibles, en el orden del Constructor, y el botón «Buscar» -->
          <div class="hs-bar" :style="{ '--hs-radius': `${radiusPx}px` }" :data-fields="opts.fields.length" data-testid="hero-bar">
            <div v-if="opts.fields.length" class="hs-fields">
              <template v-for="key in opts.fields" :key="key">
                <!-- Tipo de inmueble: los tipos y subtipos reales de Property Core, varios a la vez -->
                <div v-if="key === 'type'" class="hs-cell" :class="cellCls('type')" data-field="type">
                  <button type="button" class="hs-cell-btn" :aria-expanded="open === 'type'" aria-haspopup="dialog" data-testid="hero-cell-type" @click="toggle('type')">
                    <svg class="hs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-5.5h4V21" /></svg>
                    <span class="hs-text">
                      <span class="hs-label">{{ t('hero.type', 'Tipo de inmueble') }}</span>
                      <span class="hs-value" :class="{ 'hs-placeholder': !typeSummary }">{{ typeSummary || t('hero.any', 'Cualquiera') }}</span>
                    </span>
                    <svg class="hs-chev" :class="{ 'rotate-180': open === 'type' }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                  <transition name="pop">
                    <div v-if="open === 'type'" class="popover hs-pop-type" role="dialog" :aria-label="t('hero.type', 'Tipo de inmueble')" data-testid="hero-pop-type">
                      <TypeTreeFilter :types="form.types" :subtypes="form.subtypes" :available="typeOptions" @update="onTypes" />
                      <div class="pop-foot">
                        <button type="button" class="pop-link" :disabled="!form.types.length && !form.subtypes.length" data-testid="hero-type-clear" @click="onTypes({ types: [], subtypes: [] })">{{ t('hero.any', 'Cualquiera') }}</button>
                        <button type="button" class="pop-done" data-testid="hero-type-done" @click="open = null">{{ t('hero.done', 'Hecho') }}</button>
                      </div>
                    </div>
                  </transition>
                </div>

                <!-- Ubicación: sugerencias reales, varias zonas a la vez -->
                <div v-else-if="key === 'location'" class="hs-cell hs-cell-wide" :class="cellCls('location')" data-field="location">
                  <button type="button" class="hs-cell-btn" :aria-expanded="open === 'location'" aria-haspopup="dialog" data-testid="hero-cell-location" @click="toggle('location')">
                    <svg class="hs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.3a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.7" r="2.5" /></svg>
                    <span class="hs-text">
                      <span class="hs-label">{{ t('hero.location', 'Ubicación') }}</span>
                      <span class="hs-value" :class="{ 'hs-placeholder': !locationLabel }">{{ locationLabel || t('hero.locationPlaceholder', 'Ciudad, zona o barrio') }}</span>
                    </span>
                    <svg class="hs-chev" :class="{ 'rotate-180': open === 'location' }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                  <transition name="pop">
                    <div v-if="open === 'location'" class="popover hs-pop-location" data-testid="hero-pop-location">
                      <LocationAutocomplete ref="locAc" v-model="form.locations" variant="hero" :map-area="!!form.mapArea" @clear-map-area="form.mapArea = null" />
                    </div>
                  </transition>
                </div>

                <!-- Precio: rango con dos extremos y campos editables (venta o renta mensual) -->
                <div v-else-if="key === 'price'" class="hs-cell" :class="cellCls('price')" data-field="price">
                  <button type="button" class="hs-cell-btn" :aria-expanded="open === 'price'" aria-haspopup="dialog" data-testid="hero-cell-price" @click="toggle('price')">
                    <svg class="hs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5.8" rx="7" ry="2.8" /><path d="M5 5.8v4.1c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V5.8" /><path d="M5 9.9V14c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V9.9" /><path d="M5 14v4.1c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V14" /></svg>
                    <span class="hs-text">
                      <span class="hs-label">{{ t('hero.price', 'Precio') }}</span>
                      <span class="hs-value" :class="{ 'hs-placeholder': !priceLabel }">{{ priceLabel || t('hero.anyPrice', 'Cualquier precio') }}</span>
                    </span>
                    <svg class="hs-chev" :class="{ 'rotate-180': open === 'price' }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                  <transition name="pop">
                    <div v-if="open === 'price'" class="popover hs-pop-price" data-testid="hero-pop-price">
                      <PriceRangeSlider :min="form.minPrice" :max="form.maxPrice" :operation="operation" @update="onPrice" />
                    </div>
                  </transition>
                </div>

                <!-- Habitaciones: sólo con tipos que las tienen; con locales, garajes o terrenos, «No aplica» -->
                <div v-else-if="key === 'beds'" class="hs-cell" :class="[cellCls('beds'), { 'hs-cell-off': !bedsApply }]" data-field="beds">
                  <button type="button" class="hs-cell-btn" :aria-expanded="open === 'beds'" :aria-disabled="!bedsApply" aria-haspopup="dialog" data-testid="hero-cell-beds" @click="bedsApply && toggle('beds')">
                    <svg class="hs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11V6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5V11" /><path d="M2.5 17v-4.5A1.5 1.5 0 0 1 4 11h16a1.5 1.5 0 0 1 1.5 1.5V17z" /><path d="M4 17v2.5M20 17v2.5" /><path d="M7 11V9.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V11M12 11V9.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V11" /></svg>
                    <span class="hs-text">
                      <span class="hs-label">{{ t('hero.bedrooms', 'Habitaciones') }}</span>
                      <span class="hs-value" :class="{ 'hs-placeholder': !form.beds || !bedsApply }">{{ !bedsApply ? t('hero.notApplicable', 'No aplica') : form.beds ? `${form.beds}+ ${t('catalog.bedroomsShort', 'habitaciones')}` : t('hero.any', 'Cualquiera') }}</span>
                    </span>
                    <svg class="hs-chev" :class="{ 'rotate-180': open === 'beds' }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                  <transition name="pop">
                    <div v-if="open === 'beds'" class="popover hs-pop-beds" data-testid="hero-pop-beds">
                      <div class="flex flex-wrap gap-2" role="group" :aria-label="t('hero.bedrooms', 'Habitaciones')">
                        <button v-for="n in [0, 1, 2, 3, 4, 5]" :key="n" type="button" class="pill" :class="{ 'pill-on': form.beds === n }" :aria-pressed="form.beds === n" :data-testid="`hero-beds-${n}`" @click="pickBeds(n)">
                          {{ n ? `${n}+` : t('catalog.anyCount', 'Cualquiera') }}
                        </button>
                      </div>
                    </div>
                  </transition>
                </div>
              </template>
            </div>

            <!-- Buscar: la acción principal, grande y con el color de la marca -->
            <div class="hs-action">
              <button type="button" class="hs-search group" data-testid="hero-search" @click="submit">
                <svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <span class="hs-search-label">{{ opts.buttonLabel || t('hero.search', 'Buscar') }}</span>
                <svg class="h-5 w-5 shrink-0 transition-transform duration-300 group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </div>
          </div>

          <!-- «Más filtros»: un enlace discreto, fuera de la barra, con cuántos filtros hay puestos -->
          <div v-if="opts.showMoreFilters || hasFilters" class="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <button v-if="opts.showMoreFilters" type="button" class="hs-more" :aria-expanded="moreOpen" aria-controls="hero-more-panel" data-testid="hero-more" @click="toggleMore">
              <svg class="h-4 w-4 transition-transform duration-300" :class="{ 'rotate-180': moreOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              <span>{{ t('hero.more', 'Más filtros') }}<span v-if="extraCount" data-testid="hero-more-count"> ({{ extraCount }})</span></span>
            </button>
            <button v-if="hasFilters" type="button" class="hs-clear" data-testid="hero-clear" @click="clearAll">{{ t('hero.clear', 'Limpiar') }}</button>
          </div>

          <transition name="more">
            <div v-if="moreOpen && opts.showMoreFilters" id="hero-more-panel" ref="morePanel" class="hs-more-panel" role="region" :aria-label="t('hero.more', 'Más filtros')" data-testid="hero-more-panel">
              <div class="hs-more-grid">
                <!-- Baños -->
                <section class="hs-group">
                  <h3 class="hs-group-title">{{ t('hero.bathrooms', 'Baños') }}</h3>
                  <div v-if="bedsApply" class="flex flex-wrap gap-2" role="group" :aria-label="t('hero.bathrooms', 'Baños')">
                    <button v-for="n in [0, 1, 2, 3, 4]" :key="n" type="button" class="pill" :class="{ 'pill-on': form.baths === n }" :aria-pressed="form.baths === n" :data-testid="`hero-baths-${n}`" @click="form.baths = n">
                      {{ n ? `${n}+` : t('catalog.anyCount', 'Cualquiera') }}
                    </button>
                  </div>
                  <p v-else class="hs-note">{{ t('hero.notApplicable', 'No aplica') }}</p>
                </section>

                <!-- Superficie -->
                <section class="hs-group">
                  <h3 class="hs-group-title">{{ t('hero.area', 'Superficie') }}</h3>
                  <div class="grid grid-cols-2 gap-3">
                    <label class="pop-label">
                      {{ t('catalog.min', 'Mínimo') }}
                      <input v-model.number="form.minArea" type="number" inputmode="numeric" min="0" class="pop-select" placeholder="0 m²" :aria-invalid="!!areaError" data-testid="hero-area-min" >
                    </label>
                    <label class="pop-label">
                      {{ t('catalog.max', 'Máximo') }}
                      <input v-model.number="form.maxArea" type="number" inputmode="numeric" min="0" class="pop-select" :placeholder="t('catalog.noLimit', 'Sin límite')" :aria-invalid="!!areaError" data-testid="hero-area-max" >
                    </label>
                  </div>
                  <p v-if="areaError" class="mt-2 text-[12px] text-red-700" role="alert" data-testid="hero-area-error">{{ areaError }}</p>
                </section>

                <!-- Estado: obra nueva / segunda mano y conservación -->
                <section class="hs-group">
                  <h3 class="hs-group-title">{{ t('catalog.status', 'Estado') }}</h3>
                  <div v-for="row in [NEW_BUILD_KEYS, CONDITION_KEYS]" :key="row[0]" class="mb-2 flex flex-wrap gap-2">
                    <button v-for="k in row" :key="k" type="button" class="pill" :class="{ 'pill-on': form.estado.includes(k) }" :aria-pressed="form.estado.includes(k)" :data-testid="`hero-estado-${k}`" @click="toggleIn('estado', k)">
                      {{ t(ESTADO_LABELS[k][0], ESTADO_LABELS[k][1]) }}
                    </button>
                  </div>
                </section>

                <!-- Comprar: inversión. Alquilar: modalidad y gastos. -->
                <section v-if="operation === 'venta'" class="hs-group">
                  <h3 class="hs-group-title">{{ t('hero.investment', 'Inversión') }}</h3>
                  <!-- Rentabilidad bruta declarada en la ficha (rentalYield), nunca estimada -->
                  <select v-model="form.minYield" class="pop-select w-full" :aria-label="t('hero.investment', 'Inversión')" data-testid="hero-min-yield">
                    <option value="">{{ t('hero.any', 'Cualquiera') }}</option>
                    <option v-for="y in [3, 4, 5, 6, 8]" :key="y" :value="y">{{ t('hero.minYield', 'Rentabilidad desde {n} %').replace('{n}', String(y)) }}</option>
                  </select>
                </section>
                <section v-else class="hs-group">
                  <h3 class="hs-group-title">{{ t('catalog.rental', 'Tipo de alquiler') }}</h3>
                  <div class="flex flex-wrap gap-2">
                    <button v-for="k in RENTAL_TERM_KEYS" :key="k" type="button" class="pill" :class="{ 'pill-on': form.rentalTerms.includes(k) }" :aria-pressed="form.rentalTerms.includes(k)" :data-testid="`hero-rental-${k}`" @click="toggleIn('rentalTerms', k)">
                      {{ t(RENTAL_TERM_LABELS[k][0], RENTAL_TERM_LABELS[k][1]) }}
                    </button>
                    <button type="button" class="pill" :class="{ 'pill-on': form.features.includes('expensesIncluded') }" :aria-pressed="form.features.includes('expensesIncluded')" data-testid="hero-feature-expensesIncluded" @click="toggleIn('features', 'expensesIncluded')">
                      {{ t(FEATURE_LABELS.expensesIncluded![0], FEATURE_LABELS.expensesIncluded![1]) }}
                    </button>
                  </div>
                </section>

                <!-- Situación de la vivienda: sólo si la agencia anuncia alguna -->
                <section v-if="availableSituations.length" class="hs-group">
                  <h3 class="hs-group-title">{{ t('catalog.situation', 'Situación de la vivienda') }}</h3>
                  <div class="flex flex-wrap gap-2">
                    <button v-for="k in availableSituations" :key="k" type="button" class="pill" :class="{ 'pill-on': form.situations.includes(k) }" :aria-pressed="form.situations.includes(k)" :data-testid="`hero-situation-${k}`" @click="toggleIn('situations', k)">
                      {{ t(SITUATION_LABELS[k][0], SITUATION_LABELS[k][1]) }}
                    </button>
                  </div>
                </section>

                <!-- Características, por grupos (los campos estructurados de Property Core) -->
                <section class="hs-group hs-group-wide">
                  <h3 class="hs-group-title">{{ t('catalog.features', 'Características') }}</h3>
                  <div class="grid gap-3 sm:grid-cols-2">
                    <div v-for="fg in FEATURE_GROUPS" :key="fg.key">
                      <p class="hs-sub">{{ t(fg.label[0], fg.label[1]) }}</p>
                      <div class="mt-1.5 flex flex-wrap gap-2">
                        <button v-for="f in fg.features" :key="f" type="button" class="pill" :class="{ 'pill-on': form.features.includes(f) }" :aria-pressed="form.features.includes(f)" :data-testid="`hero-feature-${f}`" @click="toggleIn('features', f)">
                          {{ t(FEATURE_LABELS[f]![0], FEATURE_LABELS[f]![1]) }}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <!-- Orientación, eficiencia y orden -->
                <section class="hs-group">
                  <h3 class="hs-group-title">{{ t('hero.otherFilters', 'Más criterios') }}</h3>
                  <div class="grid gap-3">
                    <label class="pop-label">
                      {{ t('compare.spec.orientation', 'Orientación') }}
                      <select v-model="form.orientation" class="pop-select" data-testid="hero-orientation">
                        <option value="">{{ t('catalog.anyCount', 'Cualquiera') }}</option>
                        <option v-for="o in ORIENTATION_OPTIONS" :key="o.v" :value="o.v">{{ t(o.k, o.l) }}</option>
                      </select>
                    </label>
                    <label class="pop-label">
                      {{ t('filters.energyMin', 'Eficiencia energética (mín.)') }}
                      <select v-model="form.energy" class="pop-select" data-testid="hero-energy">
                        <option value="">{{ t('catalog.anyCount', 'Cualquiera') }}</option>
                        <option v-for="e in ENERGY_FILTER_LETTERS" :key="e" :value="e">{{ e }}{{ e === 'G' ? '' : '+' }}</option>
                      </select>
                    </label>
                    <label class="pop-label">
                      {{ t('sort.label', 'Ordenar por') }}
                      <select v-model="form.sort" class="pop-select" data-testid="hero-sort">
                        <option v-for="k in SORT_KEYS" :key="k || 'relevance'" :value="k">{{ t(SORT_LABELS[k][0], SORT_LABELS[k][1]) }}</option>
                      </select>
                    </label>
                  </div>
                </section>
              </div>

              <div class="hs-more-foot">
                <button type="button" class="pop-link" :disabled="!extraCount" data-testid="hero-more-clear" @click="clearExtra">{{ t('hero.clearFilters', 'Limpiar filtros') }}</button>
                <button type="button" class="hs-apply" data-testid="hero-more-apply" @click="applyMore">{{ t('hero.apply', 'Aplicar') }}</button>
              </div>
            </div>
          </transition>
        </div>
      </div>

      <!-- Scroll cue -->
      <div class="rise flex flex-col items-center gap-3 pb-10" :style="delay(4)">
        <span class="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/50">{{ t('hero.scrollCue') }}</span>
        <span class="flex h-10 w-6 items-start justify-center rounded-full border border-white/30 p-1.5">
          <span class="scroll-dot h-1.5 w-1.5 rounded-full bg-white/70" />
        </span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// Content props are all optional and default to the original hardcoded copy
// (via i18n) so this component keeps working standalone. They exist so the
// Website Builder's hero block editor can override the copy per tenant
// without forking this component — the search form/tabs logic below stays
// shared and untouched either way. Los textos son nodos editables cuando el
// hero lo pinta el Constructor Web (doble clic sobre el título para escribir);
// fuera de él, los mismos componentes no añaden nada. El Hero ya no lleva los
// dos botones «Ver propiedades» / «Hablar con un asesor»: un contenido guardado
// con ellos (exploreCta/advisorCta) se ignora.
import SbText from '~/components/site-builder/nodes/SbText.vue'
import { PROPERTY_SUBTYPES, PROPERTY_TYPES } from '~/utils/propertySheet'
import {
  CONDITION_KEYS,
  ENERGY_FILTER_LETTERS,
  ESTADO_LABELS,
  FEATURE_GROUPS,
  FEATURE_LABELS,
  LOCATION_KINDS,
  NEW_BUILD_KEYS,
  ORIENTATION_OPTIONS,
  RENTAL_TERM_KEYS,
  RENTAL_TERM_LABELS,
  SITUATION_KEYS,
  SITUATION_LABELS,
  SORT_KEYS,
  SORT_LABELS,
  bedroomsApply,
  firstString,
  orderedRange,
  parseAmount,
  parseEstado,
  parseFeatures,
  parseLocations,
  parseOperation,
  parseRentalTerms,
  parseSituations,
  parseSort,
  parseTypes,
  subtypeParent,
  type EstadoKey,
  type LocationSelection,
  type Operation,
  type SortKey,
} from '~/utils/searchState'
import { HERO_SLIDE_SECONDS, heroFrames } from '~/utils/siteBuilder/heroMedia'
import { HERO_SEARCH_RADIUS_PX, countHeroExtraFilters, heroButtonColors, heroSearchOptions, heroTypeSummary } from '~/utils/heroSearch'
import { TENANT_BRANDING_OVERRIDE } from '~/composables/useTenant'
import LocationAutocomplete from '~/components/search/LocationAutocomplete.vue'
import PriceRangeSlider from '~/components/search/PriceRangeSlider.vue'
import TypeTreeFilter from '~/components/search/TypeTreeFilter.vue'

const props = defineProps<{
  eyebrow?: string
  title1?: string
  title2?: string
  subtitle?: string
  slides?: string[]
  /** «Bucle de imágenes» (por defecto) o «Imagen fija» — Constructor Web › Hero › Multimedia. */
  backgroundMode?: 'slideshow' | 'static'
  /** La imagen de «Imagen fija»; vacía = la primera del bucle. */
  backgroundImage?: string
  /** Website Builder-only additive options — all default to today's fixed look. */
  overlayOpacity?: number
  backgroundPosition?: string
  contentAlign?: 'left' | 'center'
  /**
   * Presentación del buscador (Constructor Web › Hero › Buscador, utils/heroSearch.ts):
   * campos visibles y su orden, texto del botón, «Más filtros», operación de
   * partida, color del botón y radio de la barra. Sin nada, lo de partida.
   */
  searchOptions?: Record<string, any> | null
}>()

const { t } = useI18n()
const router = useRouter()
const root = ref<HTMLElement | null>(null)

const defaultSlides = [
  'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=2400&q=80',
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=2400&q=80',
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=2400&q=80',
]
const frames = computed(() => heroFrames({ mode: props.backgroundMode, image: props.backgroundImage, slides: props.slides, fallback: defaultSlides }))

// La imagen visible del bucle la marca JS (`is-active`) cada HERO_SLIDE_SECONDS,
// así rota igual con 2 imágenes que con 10. Antes era una animación CSS de 21 s
// pensada para 3: con 1 imagen el fondo se quedaba negro 14 s de cada 21, con
// 2 había huecos y con 4 o más se pisaban. `is-leaving` mantiene el zoom de la
// que se va mientras se funde, para que no dé un salto.
const active = ref(0)
const leaving = ref(-1)
let rotateTimer: ReturnType<typeof setInterval> | null = null
function stopRotation() {
  if (rotateTimer) clearInterval(rotateTimer)
  rotateTimer = null
}
function startRotation() {
  stopRotation()
  active.value = 0
  leaving.value = -1
  if (frames.value.length < 2 || reduceMotion.value) return
  rotateTimer = setInterval(() => {
    leaving.value = active.value
    active.value = (active.value + 1) % frames.value.length
  }, HERO_SLIDE_SECONDS * 1000)
}
const heroEyebrow = computed(() => props.eyebrow || t('hero.eyebrow'))
const heroTitle1 = computed(() => props.title1 || t('hero.title1'))
const heroTitle2 = computed(() => props.title2 || t('hero.title2'))
const heroSubtitle = computed(() => props.subtitle || t('hero.subtitle'))
const overlayOpacity = computed(() => props.overlayOpacity || 0)
const backgroundPosition = computed(() => props.backgroundPosition || 'center center')
const contentAlign = computed(() => props.contentAlign || 'left')

// El buscador según el Constructor, y sus colores: los de la marca de la
// empresa (en el lienzo, la que se edita), siempre con texto legible.
const opts = computed(() => heroSearchOptions(props.searchOptions))
const { tenant } = useTenant()
const brandingOverride = inject(TENANT_BRANDING_OVERRIDE, null)
const accent = computed(() => heroButtonColors(opts.value.buttonColor, brandingOverride?.value?.brandColor ?? tenant.value?.brandColor))
const accentVars = computed(() => ({ '--hs-accent': accent.value.bg, '--hs-accent-fg': accent.value.fg }))
const radiusPx = computed(() => HERO_SEARCH_RADIUS_PX[opts.value.radius])

// Subtle parallax on the background layer — capped and respects
// prefers-reduced-motion. The background wrapper is oversized (-inset-y-7%)
// so it always has room to move without exposing its edges.
const scrollY = ref(0)
const reduceMotion = ref(false)
let rafId = 0
function onScroll() {
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    scrollY.value = window.scrollY
    rafId = 0
  })
}
const parallaxStyle = computed(() => {
  if (reduceMotion.value) return {}
  const offset = Math.min(scrollY.value * 0.28, 60)
  return { transform: `translate3d(0, ${offset}px, 0)` }
})

// La operación: sólo Comprar y Alquilar, excluyentes. Obra nueva, inversión y
// los tipos (locales, garajes, terrenos, naves…) no son operaciones: están en
// «Más filtros», cada uno con su criterio real.
const tabs = computed(() => [
  { key: 'buy', label: t('tab.buy') },
  { key: 'rent', label: t('tab.rent') },
])
// De partida, la operación del Constructor; al volver de una búsqueda, la suya.
const activeTab = ref<'buy' | 'rent'>(opts.value.defaultOperation === 'alquiler' ? 'rent' : 'buy')
const operation = computed<Operation>(() => (activeTab.value === 'rent' ? 'alquiler' : 'venta'))
function setTab(k: string) {
  const next = k === 'rent' ? 'rent' : 'buy'
  if (next === activeTab.value) return
  activeTab.value = next
  // Venta y alquiler no comparten escala de precio; la inversión es de compra y
  // la modalidad y los gastos, de alquiler (como operationSwitchPatch en el catálogo).
  form.minPrice = null
  form.maxPrice = null
  if (next === 'rent') form.minYield = ''
  else {
    form.rentalTerms = []
    form.features = form.features.filter((f) => f !== 'expensesIncluded')
  }
}

// El estado del buscador: el mismo modelo que la URL de /propiedades
// (utils/searchState.ts). Sólo se aplica al pulsar «Buscar».
const form = reactive({
  locations: [] as LocationSelection[],
  /** Zona del mapa que venía de la búsqueda anterior (se conserva o se quita, no se edita aquí). */
  mapArea: null as Record<string, string> | null,
  minPrice: null as number | null,
  maxPrice: null as number | null,
  beds: 0,
  baths: 0,
  minArea: '' as number | '',
  maxArea: '' as number | '',
  types: [] as string[],
  subtypes: [] as string[],
  // «Más filtros»: todo lo que admite Property Search fuera de la barra.
  estado: [] as EstadoKey[],
  minYield: '' as number | '',
  features: [] as string[],
  orientation: '',
  energy: '',
  rentalTerms: [] as string[],
  situations: [] as string[],
  sort: '' as SortKey,
})

// Al volver a Inicio desde Propiedades (sin recargar), el buscador recupera
// los criterios de la búsqueda que se estaba viendo.
const lastSearch = useState<Record<string, any> | null>('last-search', () => null)
function prefill(qy: Record<string, any> | null) {
  if (!qy) return
  activeTab.value = parseOperation(qy.operacion) === 'alquiler' ? 'rent' : 'buy'
  form.locations = parseLocations(qy)
  form.mapArea = ['north', 'south', 'east', 'west'].every((k) => firstString(qy[k])) ? { north: firstString(qy.north), south: firstString(qy.south), east: firstString(qy.east), west: firstString(qy.west) } : null
  ;[form.minPrice, form.maxPrice] = orderedRange(parseAmount(qy.minPrice), parseAmount(qy.maxPrice))
  form.beds = parseAmount(qy.bedrooms, 5) ?? 0
  form.baths = parseAmount(qy.bathrooms, 4) ?? 0
  form.minArea = parseAmount(qy.minArea, 1e6) ?? ''
  form.maxArea = parseAmount(qy.maxArea, 1e6) ?? ''
  const types = parseTypes(qy)
  form.types = types.types
  form.subtypes = types.subtypes
  form.estado = parseEstado(qy)
  form.minYield = parseAmount(qy.minYield, 100) ?? ''
  form.features = parseFeatures(qy)
  form.orientation = ORIENTATION_OPTIONS.some((o) => o.v === firstString(qy.orientation)) ? firstString(qy.orientation) : ''
  form.energy = (ENERGY_FILTER_LETTERS as readonly string[]).includes(firstString(qy.energy)) ? firstString(qy.energy) : ''
  form.rentalTerms = parseRentalTerms(qy)
  form.situations = parseSituations(qy)
  form.sort = parseSort(qy.sort)
}
prefill(lastSearch.value)
// En el Constructor, cambiar la operación de partida se ve al momento (si no se vuelve de una búsqueda).
watch(
  () => opts.value.defaultOperation,
  (op) => {
    if (!lastSearch.value) setTab(op === 'alquiler' ? 'rent' : 'buy')
  },
)

const open = ref<string | null>(null)
const moreOpen = ref(false)
const searchRoot = ref<HTMLElement | null>(null)
const morePanel = ref<HTMLElement | null>(null)
const locAc = ref<{ focus: () => void } | null>(null)

// Un solo desplegable abierto a la vez; cambiar de campo no pierde lo elegido.
function toggle(key: string) {
  open.value = open.value === key ? null : key
  if (open.value) moreOpen.value = false
  if (open.value === 'location') nextTick(() => locAc.value?.focus())
}
function toggleMore() {
  moreOpen.value = !moreOpen.value
  if (moreOpen.value) {
    open.value = null
    // En el móvil el panel queda por debajo de la pantalla: se acerca a la vista.
    nextTick(() => morePanel.value?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }))
  }
}
/** «Aplicar»: se cierra el panel; lo marcado se queda y «Buscar» lo incluye. */
function applyMore() {
  if (areaError.value) return
  moreOpen.value = false
}
function cellCls(key: string) {
  return open.value === key ? 'cell-active' : ''
}

// Tipos publicados por la agencia y situaciones que anuncia (`facets=filters`,
// lo mismo que pide el panel de Propiedades); sin respuesta, el catálogo entero.
const { data: facetData } = await useFetch<{ facets?: { types: string[]; situations?: string[] } }>('/api/public/properties', { key: 'hero-facets', query: { countOnly: '1', facets: 'filters' } })
const typeOptions = computed<string[]>(() => (facetData.value?.facets?.types?.length ? facetData.value.facets.types : [...PROPERTY_TYPES]))
const availableSituations = computed(() => SITUATION_KEYS.filter((k) => (facetData.value?.facets?.situations || []).includes(k)))
const typeLabel = usePropertyTypeLabel()

const bedsApply = computed(() => bedroomsApply(form.types, form.subtypes))
/** El tipo elegido en su desplegable (el árbol de tipos y subtipos del catálogo). */
function onTypes(sel: { types: string[]; subtypes: string[] }) {
  form.types = sel.types
  form.subtypes = sel.subtypes
  // Sólo no residenciales (locales, garajes…): habitaciones y baños no aplican.
  if (!bedroomsApply(form.types, form.subtypes)) {
    form.beds = 0
    form.baths = 0
    if (open.value === 'beds') open.value = null
  }
}
const typeSummary = computed(() =>
  heroTypeSummary(form.types, form.subtypes, typeOptions.value, t, typeLabel, (st) => {
    const parent = subtypeParent(st)
    return t(`filters.subtype.${st}`, (parent && PROPERTY_SUBTYPES[parent]?.[st]) || st)
  }),
)

/** Marcar o desmarcar una opción de una lista de «Más filtros». */
function toggleIn(list: 'estado' | 'features' | 'rentalTerms' | 'situations', k: string) {
  const cur = form[list] as string[]
  ;(form as any)[list] = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]
}

function onPrice([min, max]: [number | null, number | null]) {
  form.minPrice = min
  form.maxPrice = max
}
function pickBeds(n: number) {
  form.beds = n
  open.value = null
}

const { format: money } = useCurrency()
const locationLabel = computed(() => {
  const list = form.locations.map((l) => (l.kind === 'postalCode' ? `CP ${l.value}` : l.value))
  if (form.mapArea) list.push(t('catalog.mapArea', 'Zona del mapa'))
  if (!list.length) return ''
  return list.length === 1 ? list[0]! : `${list[0]} +${list.length - 1}`
})
const priceLabel = computed(() => {
  const { minPrice: min, maxPrice: max } = form
  if (min != null && max != null) return `${money(min)} – ${money(max)}`
  if (min != null) return `${t('catalog.since', 'Desde')} ${money(min)}`
  if (max != null) return `${t('price.upTo', 'Hasta')} ${money(max)}`
  return ''
})
const areaError = computed(() => (form.minArea !== '' && form.maxArea !== '' && Number(form.minArea) > Number(form.maxArea) ? t('area.minOverMax', 'El mínimo no puede ser mayor que el máximo.') : ''))

// «Más filtros (n)»: sólo lo de dentro del panel (utils/heroSearch.ts).
const extraCount = computed(() => countHeroExtraFilters(form, operation.value))
const hasFilters = computed(
  () =>
    form.locations.length > 0 ||
    !!form.mapArea ||
    form.minPrice != null ||
    form.maxPrice != null ||
    form.beds > 0 ||
    form.types.length > 0 ||
    form.subtypes.length > 0 ||
    extraCount.value > 0 ||
    form.sort !== '',
)
function clearExtra() {
  Object.assign(form, { baths: 0, minArea: '', maxArea: '', estado: [], minYield: '', features: [], orientation: '', energy: '', rentalTerms: [], situations: [], sort: '' })
}
function clearAll() {
  Object.assign(form, { locations: [], mapArea: null, minPrice: null, maxPrice: null, beds: 0, types: [], subtypes: [] })
  clearExtra()
}

/** La búsqueda del Hero como URL de /propiedades: el mismo modelo que lee el catálogo. */
function searchQuery(): Record<string, string | string[]> {
  const q: Record<string, string | string[]> = { operacion: operation.value }
  for (const kind of LOCATION_KINDS) {
    const values = form.locations.filter((l) => l.kind === kind).map((l) => l.value)
    if (values.length) q[kind] = values
  }
  if (form.mapArea) Object.assign(q, form.mapArea)
  const [min, max] = orderedRange(form.minPrice, form.maxPrice)
  if (min != null) q.minPrice = String(min)
  if (max != null) q.maxPrice = String(max)
  if (form.beds) q.bedrooms = String(form.beds)
  if (form.baths) q.bathrooms = String(form.baths)
  const [minA, maxA] = orderedRange(parseAmount(form.minArea, 1e6), parseAmount(form.maxArea, 1e6))
  if (minA) q.minArea = String(minA)
  if (maxA) q.maxArea = String(maxA)
  if (form.types.length) q.type = form.types
  if (form.subtypes.length) q.subtype = form.subtypes
  if (form.estado.length) q.estado = form.estado
  if (form.minYield !== '' && operation.value === 'venta') q.minYield = String(form.minYield)
  // Las características como las escribe el panel de Propiedades («amueblado» es `furnished=yes`).
  for (const f of form.features) {
    if (f === 'expensesIncluded' && operation.value !== 'alquiler') continue
    q[f] = f === 'furnished' ? 'yes' : '1'
  }
  if (form.orientation) q.orientation = form.orientation
  if (form.energy) q.energy = form.energy
  if (form.rentalTerms.length && operation.value === 'alquiler') q.rentalTerm = form.rentalTerms
  if (form.situations.length) q.situacion = form.situations
  if (form.sort) q.sort = form.sort
  return q
}
function submit() {
  // Una superficie mínima mayor que la máxima no se busca: se enseña dónde está el error.
  if (areaError.value) {
    open.value = null
    moreOpen.value = true
    return
  }
  // Nada abierto sobre la página de resultados.
  open.value = null
  moreOpen.value = false
  router.push({ path: '/propiedades', query: searchQuery() })
}

// Pulsar fuera del buscador o Escape cierran el desplegable (lo elegido se queda).
function onDocClick(e: MouseEvent) {
  if (open.value && searchRoot.value && !searchRoot.value.contains(e.target as Node)) open.value = null
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  // Escape cierra lo de encima: el desplegable abierto o, si no hay, «Más filtros».
  if (open.value) open.value = null
  else if (moreOpen.value) moreOpen.value = false
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
  reduceMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!reduceMotion.value) window.addEventListener('scroll', onScroll, { passive: true })
  startRotation()
  // En el Constructor, cambiar las imágenes o el modo reinicia el bucle.
  watch(() => frames.value.join('\n'), startRotation)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', onScroll)
  if (rafId) cancelAnimationFrame(rafId)
  stopRotation()
})

function delay(i: number) {
  return { animationDelay: `${0.15 + i * 0.12}s` }
}
</script>

<style scoped>
/* Bucle: fundido cruzado + zoom lento (Ken Burns) de la imagen activa, que
   dura lo mismo que se ve (HERO_SLIDE_SECONDS); la que se va conserva el zoom
   final mientras se funde. */
.hero-slide {
  opacity: 0;
  transition: opacity 1.2s ease;
  will-change: opacity, transform;
}
.hero-slide.is-active {
  opacity: 1;
  animation: heroZoom 7s linear forwards;
}
.hero-slide.is-leaving {
  transform: scale(1.09);
}
@keyframes heroZoom {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.09);
  }
}
/* Imagen fija (o una sola imagen en el bucle): quieta, sin fundido ni zoom. */
.hero-slide.is-static {
  opacity: 1;
  transition: none;
  will-change: auto;
}

/* Soft radial vignette to keep focus on the centered content */
.hero-vignette {
  background: radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.35) 100%);
}

/* Entrance */
.rise {
  opacity: 0;
  transform: translateY(22px);
  animation: rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
@keyframes rise {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ── Comprar | Alquilar: control segmentado blanco; el activo, con el color de la marca ── */
.hs-seg {
  display: inline-flex;
  gap: 4px;
  border-radius: 9999px;
  background: #fff;
  padding: 5px;
  box-shadow: 0 10px 30px -12px rgba(0, 0, 0, 0.45);
}
.hs-seg-btn {
  display: inline-flex;
  min-height: 48px;
  min-width: 9.5rem;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 9999px;
  padding: 0 1.4rem;
  font-size: 16px;
  font-weight: 500;
  color: #1c1b19;
  transition: background-color 0.25s, color 0.25s;
}
.hs-seg-btn:hover:not(.is-on) {
  background: #f4f2ee;
}
.hs-seg-btn.is-on {
  background: var(--hs-accent);
  color: var(--hs-accent-fg);
}
.hs-seg-icon {
  height: 20px;
  width: 20px;
  flex-shrink: 0;
}
@media (max-width: 479px) {
  .hs-seg {
    display: flex;
  }
  .hs-seg-btn {
    flex: 1;
    min-width: 0;
    padding: 0 0.9rem;
  }
}

/* ── La barra: blanca, redondeada, con sombra suave; campos con icono, etiqueta, valor y flecha ── */
.hs-bar {
  margin-top: 1.1rem;
  display: flex;
  flex-direction: column;
  border-radius: min(var(--hs-radius, 22px), 22px);
  background: #fff;
  box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.5);
  transition: box-shadow 0.3s;
}
.hs-bar:focus-within,
.hs-bar:hover {
  box-shadow: 0 34px 70px -18px rgba(0, 0, 0, 0.55);
}
.hs-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}
.hs-cell {
  position: relative;
  min-width: 0;
  border-radius: 14px;
  transition: background-color 0.2s;
}
.hs-cell + .hs-cell {
  border-top: 1px solid #efece6;
}
.hs-cell:hover,
.hs-cell-active {
  background-color: #f7f5f1;
}
.hs-cell-btn {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 14px;
  padding: 0.95rem 1.25rem;
  text-align: left;
}
.hs-cell-btn:focus-visible,
.hs-seg-btn:focus-visible,
.hs-search:focus-visible,
.hs-more:focus-visible,
.hs-apply:focus-visible {
  outline: 2px solid var(--hs-accent, #16150f);
  outline-offset: 2px;
}
.hs-seg-btn.is-on:focus-visible,
.hs-search:focus-visible,
.hs-apply:focus-visible {
  outline-color: #fff;
  box-shadow: 0 0 0 4px var(--hs-accent, #16150f);
}
.hs-cell-off .hs-cell-btn {
  cursor: not-allowed;
}
.hs-cell-off .hs-icon,
.hs-cell-off .hs-label {
  opacity: 0.55;
}
.hs-icon {
  height: 26px;
  width: 26px;
  flex-shrink: 0;
  color: #44403c;
}
.hs-text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;
}
.hs-label {
  font-size: 14px;
  font-weight: 600;
  color: #1c1b19;
}
.hs-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  color: #44403c;
}
.hs-placeholder {
  color: #8a857d;
}
.hs-chev {
  height: 18px;
  width: 18px;
  flex-shrink: 0;
  color: #57534e;
  transition: transform 0.2s;
}
.hs-action {
  padding: 0.6rem;
}
.hs-search {
  display: flex;
  width: 100%;
  min-height: 58px;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border-radius: max(10px, calc(min(var(--hs-radius, 22px), 22px) - 6px));
  background: var(--hs-accent);
  padding: 0 1.75rem;
  color: var(--hs-accent-fg);
  font-size: 17px;
  font-weight: 600;
  transition: filter 0.2s, transform 0.2s;
}
.hs-search:hover {
  filter: brightness(0.92);
}
.hs-search:active {
  transform: translateY(1px);
}
/* Tableta: dos campos por fila y el botón debajo, a todo el ancho. */
@media (min-width: 640px) and (max-width: 1023px) {
  .hs-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .hs-cell + .hs-cell {
    border-top: 0;
  }
  .hs-cell:nth-child(n + 3) {
    border-top: 1px solid #efece6;
  }
  .hs-cell:nth-child(2n) {
    border-left: 1px solid #efece6;
  }
  .hs-bar[data-fields='1'] .hs-fields,
  .hs-bar[data-fields='3'] .hs-cell:last-child {
    grid-column: 1 / -1;
  }
}
/* Escritorio: una sola fila, separadores finos y el botón grande a la derecha. */
@media (min-width: 1024px) {
  .hs-bar {
    flex-direction: row;
    align-items: stretch;
    border-radius: var(--hs-radius, 22px);
  }
  .hs-fields {
    display: flex;
    flex: 1;
    min-width: 0;
    padding: 0.45rem;
  }
  .hs-cell {
    flex: 1 1 0;
    border-radius: calc(min(var(--hs-radius, 22px), 22px) - 6px);
  }
  .hs-cell-wide {
    flex-grow: 1.15;
  }
  .hs-cell + .hs-cell {
    border-top: 0;
  }
  .hs-cell + .hs-cell::before {
    content: '';
    position: absolute;
    left: -0.5px;
    top: 22%;
    height: 56%;
    width: 1px;
    background: #e7e4de;
  }
  .hs-cell-btn {
    min-height: 74px;
    padding: 0.8rem 1.15rem;
  }
  .hs-action {
    display: flex;
    flex-shrink: 0;
    padding: 0.55rem 0.55rem 0.55rem 0;
  }
  .hs-search {
    min-width: 15rem;
    border-radius: max(10px, calc(min(var(--hs-radius, 22px), 22px) - 6px));
  }
  .hs-bar[data-fields='0'] .hs-action {
    width: 100%;
    padding-left: 0.55rem;
  }
}
@media (min-width: 1280px) {
  .hs-search {
    min-width: 18rem;
  }
}

/* ── «Más filtros»: un enlace discreto, blanco, sin caja ── */
.hs-more {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.95);
  transition: color 0.2s;
}
.hs-more:hover {
  color: #fff;
  text-decoration: underline;
  text-underline-offset: 4px;
}
.hs-clear {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.hs-clear:hover {
  color: #fff;
}
.hs-more-panel {
  margin-top: 0.9rem;
  border-radius: min(var(--hs-radius, 22px), 22px);
  background: #fff;
  padding: 1.25rem;
  box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.5);
}
.hs-more-grid {
  display: grid;
  gap: 1.25rem;
}
@media (min-width: 768px) {
  .hs-more-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .hs-group-wide {
    grid-column: 1 / -1;
  }
}
@media (min-width: 1024px) {
  .hs-more-panel {
    padding: 1.5rem 1.75rem;
  }
  .hs-more-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
.hs-group-title {
  margin-bottom: 0.6rem;
  font-size: 14px;
  font-weight: 600;
  color: #1c1b19;
}
.hs-sub {
  font-size: 12px;
  font-weight: 600;
  color: #78716c;
}
.hs-note {
  font-size: 13px;
  color: #78716c;
}
.hs-more-foot {
  margin-top: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-top: 1px solid #efece6;
  padding-top: 1rem;
}
.hs-apply {
  min-height: 46px;
  border-radius: 12px;
  background: var(--hs-accent);
  padding: 0 1.6rem;
  font-size: 15px;
  font-weight: 600;
  color: var(--hs-accent-fg);
  transition: filter 0.2s;
}
.hs-apply:hover {
  filter: brightness(0.92);
}
.pop-link {
  font-size: 14px;
  font-weight: 500;
  color: #44403c;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.pop-link:disabled {
  cursor: default;
  opacity: 0.4;
  text-decoration: none;
}
.pop-foot {
  margin-top: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #efece6;
  padding-top: 0.75rem;
}
.pop-done {
  min-height: 38px;
  border-radius: 10px;
  background: var(--hs-accent, #16150f);
  padding: 0 1rem;
  font-size: 14px;
  font-weight: 600;
  color: var(--hs-accent-fg, #fff);
}
.hs-pop-type {
  left: 0;
  width: min(92vw, 360px);
  max-height: min(70vh, 520px);
  overflow-y: auto;
}
.hs-pop-location {
  left: 0;
  width: min(92vw, 400px);
}
.hs-pop-price {
  left: 0;
  width: min(92vw, 400px);
}
.hs-pop-beds {
  right: 0;
  width: min(92vw, 340px);
}
@media (max-width: 1023px) {
  .hs-pop-beds {
    right: auto;
    left: 0;
  }
}

/* Popover */
.popover {
  position: absolute;
  top: calc(100% + 12px);
  z-index: 30;
  background: #fff;
  border: 1px solid #e7e4de;
  border-radius: 1rem;
  padding: 1rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
}
@media (max-width: 1023px) {
  .popover {
    top: calc(100% - 4px);
  }
}
.pill {
  min-height: 40px;
  min-width: 3rem;
  border: 1px solid #e7e4de;
  border-radius: 9999px;
  padding: 0.5rem 1rem;
  font-size: 14px;
  color: #44403c;
  transition: all 0.2s;
}
.pill:hover {
  border-color: #16150f;
}
.pill-on {
  background: var(--hs-accent, #16150f);
  border-color: var(--hs-accent, #16150f);
  color: var(--hs-accent-fg, #fff);
}
.pop-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: #57534e;
}
.pop-select {
  border: 1px solid #e7e4de;
  border-radius: 0.6rem;
  padding: 0.6rem 0.7rem;
  font-size: 14px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  color: #16150f;
  background: #fff;
}
.pop-select:focus {
  border-color: #16150f;
}
.pop-select:focus-visible {
  outline: 2px solid #16150f;
  outline-offset: 2px;
}

/* Popover transition */
.pop-enter-active,
.pop-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
.more-enter-active,
.more-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}
.more-enter-from,
.more-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* Scroll cue — mouse-wheel style indicator with a bouncing dot */
.scroll-dot {
  animation: scrollDot 1.8s ease-in-out infinite;
}
@keyframes scrollDot {
  0% {
    transform: translateY(0);
    opacity: 1;
  }
  70% {
    transform: translateY(14px);
    opacity: 0;
  }
  71% {
    transform: translateY(0);
    opacity: 0;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-slide,
  .rise,
  .scroll-dot {
    animation: none;
  }
  .hero-slide.is-active {
    animation: none;
  }
  .hero-slide:first-child {
    opacity: 1;
  }
  .rise {
    opacity: 1;
    transform: none;
  }
}
</style>
