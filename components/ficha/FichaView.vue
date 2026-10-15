<template>
  <div v-if="data" class="bg-[#faf8f4]">
    <div class="mx-auto max-w-screen-2xl px-4 pb-14 pt-5 sm:px-6 lg:px-10">
      <!-- Migas, compartir, comparar y Anterior / Siguiente en el contexto del catálogo (#111). -->
      <PropertyBreadcrumbs v-bind="n('b.breadcrumbs')" :slug="slug" :name="data.project.name" :project="data.project" :reference="reference" />

      <!-- Galería multimedia (Cola 5): a ancho completo del contenedor, encima de las dos columnas. Mosaico con la portada grande y «Ver todas las fotos (n)»; el visor y sus categorías salen de la multimedia real de la propiedad (utils/mediaGallery.ts). -->
      <div id="fotos" ref="heroRef" v-bind="n('b.gallery')" class="mt-4 scroll-mt-28" data-testid="ficha-gallery-wrap">
        <PropertyGalleryBlock :data="(data as any)" :options="display.gallery" :status-label="statusLabel" :accent="tenant?.brandColor || null" />
      </div>

      <!-- Dos columnas (#111): el contenido a la izquierda (≈⅔) y la información comercial a la derecha (≈⅓). -->
      <div class="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.44fr)] lg:gap-8">
        <!-- Orden y visibilidad de las secciones: los del Constructor (#110, PAGE_CORE_OPTIONS.sections) con `order`.
        Galería, barra de apartados y tarjeta principal van siempre delante; en el móvil, el precio y
        «Solicitar visita» se intercalan como pide la referencia. -->
        <div class="flex min-w-0 flex-col gap-5" data-testid="ficha-main">

          <!-- Móvil y tableta: el precio y la próxima visita justo después de la galería. -->
          <div class="order-[-5] lg:hidden" data-testid="ficha-mobile-price">
            <PropertyPriceCard v-bind="n('b.price')" :slug="slug" :project="data.project" :agent-slug="agentSlug" @book="(start) => openVisit('in_person', start)" @video="openVisit('video')" @visit-state="(s) => (agendaState = s)" />
          </div>

          <!-- Tarjeta principal: estado, título, ubicación pública, cifras y características destacadas. -->
          <header id="principal" v-bind="n('b.summary')" class="pcard order-[-4] scroll-mt-28 !p-5 sm:!p-6" data-testid="ficha-summary">
            <div class="flex flex-wrap items-center gap-2">
              <span v-bind="n('d.status')" class="eyebrow">{{ statusLabel }}</span>
              <span v-if="data.project.rentalYield" class="rounded-full bg-[#eef6f0] px-3 py-1 text-[11px] font-semibold text-emerald-800">{{ data.project.rentalYield }}% {{ t('propertyDetails.facts.profitability', 'rentabilidad') }}</span>
            </div>
            <h1 v-bind="n('d.title')" class="mt-3 text-[28px] font-bold leading-[1.15] tracking-tight text-ink [overflow-wrap:anywhere] sm:text-[34px] xl:text-[40px]">{{ data.project.name }}</h1>
            <p v-if="locationLine" v-bind="n('d.location')" class="mt-3 flex items-start gap-2 text-[14px] text-stone-500" data-testid="ficha-location">
              <svg class="mt-0.5 shrink-0 text-stone-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.3a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.7" r="2.5" /></svg>
              <span class="min-w-0 [overflow-wrap:anywhere]">{{ locationLine }}</span>
            </p>

            <!-- Descripción: justo después del título y la ubicación, antes de los datos clave, con «Ver más». -->
            <div v-if="showDescription" id="descripcion" v-bind="n('b.description')" class="mt-5 scroll-mt-28 border-t border-[#f1eee8] pt-5" data-testid="ficha-description">
              <div class="grid grid-cols-1 gap-6" :class="{ 'xl:grid-cols-[minmax(0,1fr)_minmax(0,0.42fr)]': highlights.items.length }">
                <div class="min-w-0">
                  <SbText tag="h2" field="t.description.title" kind="caption" label="Título de la descripción" :text="tx('t.description.title', t('propertyDetails.description.eyebrow', 'Descripción'))" class="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400" />
                  <!-- whitespace-pre-line keeps line breaks from descriptions written before the
                  rich-text editor existed (plain text, no tags); v-html renders real formatting
                  for anything saved since (bold/italic/lists/links) — both read correctly here. -->
                  <!-- eslint-disable-next-line vue/no-v-html -->
                  <div
                    :id="descId"
                    ref="descEl"
                    v-bind="n('d.description')"
                    class="desc mt-2 whitespace-pre-line text-[14px] leading-[1.8] text-stone-600 [&_a]:text-accent-700 [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5"
                    :class="{ 'desc-clamped': !descOpen && descOverflows }"
                    :style="{ '--desc-lines': display.descriptionLines }"
                    data-testid="ficha-description-text"
                    v-html="data.project.description"
                  />
                  <button v-if="descOverflows" type="button" class="peach-btn mt-3" :aria-expanded="descOpen" :aria-controls="descId" data-testid="ficha-description-more" @click="descOpen = !descOpen">
                    {{ descOpen ? t('ficha.readLess', 'Ver menos') : t('ficha.readMore', 'Ver más') }}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </button>
                </div>
                <ul v-if="highlights.items.length" v-bind="n('b.highlights')" class="self-start rounded-xl border border-[#dcefe2] bg-[#f1f9f3] p-5" :data-source="highlights.source" data-testid="ficha-highlights">
                  <li v-for="h in highlights.items" :key="h" class="flex items-start gap-3 py-1.5 text-[13.5px] text-stone-600">
                    <svg class="mt-0.5 shrink-0 text-emerald-600" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8 12.3 2.7 2.7L16 9.7" /></svg>
                    <span class="min-w-0 [overflow-wrap:anywhere]">{{ h }}</span>
                  </li>
                </ul>
              </div>
            </div>

            <ul v-if="keyFacts.length" v-bind="n('b.keyfacts')" class="ficha-facts mt-6" :class="{ 'border-t border-[#f1eee8] pt-6': showDescription }" :data-cols="display.factsColumns" data-testid="ficha-key-facts">
              <li v-for="f in keyFacts" :key="f.key" class="ficha-fact" :data-fact="f.key">
                <!-- SVG fijo de utils/featureIcons.ts, nunca datos -->
                <span class="shrink-0 text-stone-400" aria-hidden="true" v-html="featureIconSvg(f.key, 22)" />
                <span class="min-w-0">
                  <span class="block text-[16px] font-bold leading-tight text-ink">{{ f.value }}</span>
                  <span class="mt-0.5 block text-[11.5px] leading-snug text-stone-500">{{ f.label }}</span>
                </span>
              </li>
            </ul>

            <div v-if="datosInHeader" id="datos" v-bind="n('s.datos')" class="mt-6 scroll-mt-28 border-t border-[#f1eee8] pt-6">
              <h2 class="pcard-title">{{ t('ficha.features', 'Características destacadas') }}</h2>
              <div class="mt-4"><QuickFacts :project="data.project" :details="data.details" variant="features" :exclude="['propertyType', 'yearBuilt']" /></div>
            </div>
          </header>

          <!-- Móvil: «Solicitar visita» después de los datos clave. -->
          <div class="order-[-3] lg:hidden">
            <button type="button" class="btn-visit w-full" data-testid="ficha-mobile-request-visit" @click="requestVisit">{{ t('propertyStickyBar.requestVisit', 'Solicitar visita') }}</button>
          </div>

          <!-- Barra de apartados: debajo de las miniaturas en escritorio; fija al desplazarse. -->
          <nav v-bind="n('b.nav')" class="no-print sticky top-[73px] z-30 order-[-3] rounded-xl border border-[#ece8e1] bg-white/95 px-2 shadow-[0_1px_2px_rgba(28,27,25,0.04)] backdrop-blur lg:order-[-5]" :aria-label="t('ficha.sections', 'Apartados de la ficha')" data-testid="ficha-section-nav">
            <div class="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <a
                v-for="s in sections"
                :key="s.id"
                :href="`#${s.id}`"
                class="relative whitespace-nowrap px-2 py-3.5 text-[12.5px] transition"
                :class="activeSection === s.id ? 'font-semibold text-ink' : 'text-stone-500 hover:text-ink'"
                :aria-current="activeSection === s.id ? 'location' : undefined"
              >
                {{ s.label }}
                <span v-if="activeSection === s.id" class="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-ink" />
              </a>
            </div>
          </nav>

          <!-- Características destacadas en su propia tarjeta, si en el Constructor se colocaron más abajo. -->
          <section v-if="hasQuickFacts && show('datos') && !datosInHeader" id="datos" v-bind="n('s.datos')" class="pcard min-w-0 scroll-mt-28" :style="at('datos')">
            <h2 class="pcard-title">{{ t('ficha.features', 'Características destacadas') }}</h2>
            <div class="mt-4"><QuickFacts :project="data.project" :details="data.details" variant="features" :exclude="['propertyType', 'yearBuilt']" /></div>
          </section>

          <!-- Eficiencia energética: la etiqueta A–G con los valores reales de Property Core (megaprompt «ficha»). -->
          <section v-if="show('energia') && has('energia')" id="energia" v-bind="n('s.energia')" class="min-w-0 scroll-mt-28" :style="at('energia')" data-testid="ficha-energy">
            <PropertyEnergyCard :data="energy" :options="display.energy" />
          </section>

          <!-- Serendipia Score -->
          <section v-if="show('score') && has('score')" id="score" v-bind="n('s.score')" class="min-w-0 scroll-mt-28" :style="at('score')">
            <SerendipiaScore :slug="slug" />
          </section>

          <!-- Plano de la vivienda y Estado del inmueble (#110): los planos del
          editor (sin recortar, con visor a pantalla completa) y el estado
          real de la ficha ampliada. Lo que no hay no sale. -->
          <div v-if="show('plano-estado') && has('plano-estado')" v-bind="n('s.plano-estado')" class="grid grid-cols-1 items-start gap-5" :class="{ 'xl:grid-cols-[1.2fr_1fr]': floorPlans.length && conditionFacts.length }" :style="at('plano-estado')">
            <PropertyFloorPlans :plans="floorPlans" :facts="{ area: p.area, bedrooms: p.bedrooms, bathrooms: p.bathrooms, hasTerrace: p.hasTerrace }" />
            <PropertyFactsCard anchor="estado" testid="property-condition" :title="t('facts.conditionHeading', 'Estado del inmueble')" :rows="conditionFacts" />
          </div>

          <!-- El edificio (separado de la vivienda) y Documentación (#110). -->
          <div v-if="show('edificio-documentacion') && has('edificio-documentacion')" v-bind="n('s.edificio-documentacion')" class="grid grid-cols-1 items-start gap-5" :class="{ 'xl:grid-cols-[1.25fr_1fr]': buildingFacts.length && publicDocs.length }" :style="at('edificio-documentacion')">
            <PropertyFactsCard anchor="edificio" testid="property-building" :title="t('facts.buildingHeading', 'El edificio')" :rows="buildingFacts" :columns="2" />
            <PropertyDocumentsCard :documents="publicDocs" />
          </div>

          <!-- Amenities -->
          <PropertySectionCard v-if="data.amenities.length && show('comodidades')" id="comodidades" v-bind="n('s.comodidades')" title-field="t.comodidades.title" :title="tx('t.comodidades.title', t('propertyDetails.amenities.heading', 'Comodidades'))" :style="at('comodidades')">
            <ul class="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <li v-for="a in data.amenities" :key="a.id" class="flex items-center gap-3 text-[14px] text-stone-600"><span class="h-1.5 w-1.5 shrink-0 rounded-full bg-[#e8792b]" />{{ a.name }}</li>
            </ul>
          </PropertySectionCard>

          <!-- Campos personalizados que la agencia marcó «visible en la web pública» (FASE 0). Los internos nunca llegan aquí. -->
          <PropertySectionCard v-if="data.customFields?.length && show('mas-informacion')" id="mas-informacion" data-testid="property-public-custom-fields" v-bind="n('s.mas-informacion')" title-field="t.mas-informacion.title" :title="tx('t.mas-informacion.title', t('propertyDetails.customFields.heading', 'Más información'))" :style="at('mas-informacion')">
            <dl class="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <div v-for="f in data.customFields" :key="f.key">
                <dt class="text-[12px] text-stone-400">{{ f.label }}</dt>
                <dd class="mt-0.5 text-[14px] font-medium text-ink">{{ f.display }}</dd>
              </div>
            </dl>
          </PropertySectionCard>

          <!-- Units -->
          <PropertySectionCard v-if="data.unitTypes.length && show('tipologias')" id="tipologias" v-bind="n('s.tipologias')" title-field="t.tipologias.title" :title="tx('t.tipologias.title', t('propertyDetails.units.heading', 'Tipologías disponibles'))" :style="at('tipologias')">
            <div class="overflow-x-auto rounded-xl border border-[#ece8e1]">
              <table class="w-full text-left text-sm">
                <thead><tr class="border-b border-[#ece8e1] bg-[#faf8f4] text-[11px] uppercase tracking-widest text-stone-450"><th class="px-5 py-3 font-semibold">{{ t('propertyDetails.units.type', 'Tipo') }}</th><th class="px-5 py-3 font-semibold">{{ t('propertyDetails.units.unit', 'Unidad') }}</th><th class="px-5 py-3 font-semibold">{{ t('propertyDetails.units.size', 'Superficie') }}</th></tr></thead>
                <tbody><tr v-for="u in data.unitTypes" :key="u.id" class="border-b border-[#f1eee8] last:border-0"><td class="px-5 py-3 font-medium">{{ u.propertyType }}</td><td class="px-5 py-3 text-stone-600">{{ u.unitType }}</td><td class="px-5 py-3 text-stone-600">{{ u.size }}</td></tr></tbody>
              </table>
            </div>
          </PropertySectionCard>

          <!-- Lo que debes saber: el resumen guardado y lo que dicen los datos (sin frases de relleno). -->
          <PropertySectionCard v-if="hasResumen && show('resumen')" id="resumen" v-bind="n('s.resumen')" title-field="t.resumen.title" :title="tx('t.resumen.title', t('propertyDetails.aiSummary.heading', 'Lo que debes saber'))" :style="at('resumen')">
            <p v-if="data.project.aiSummary" class="max-w-3xl text-[14px] leading-[1.8] text-stone-600">{{ data.project.aiSummary }}</p>
            <div v-if="pros.length || cons.length" class="grid gap-4 sm:grid-cols-2" :class="{ 'mt-5': data.project.aiSummary }">
              <div v-if="pros.length" class="rounded-xl border border-[#dcefe2] bg-[#f1f9f3] p-5">
                <p class="mb-3 text-[12px] font-semibold uppercase tracking-widest text-emerald-700">{{ t('propertyDetails.aiSummary.pros', 'Lo mejor') }}</p>
                <ul class="space-y-2.5">
                  <li v-for="pro in pros" :key="pro" class="flex items-start gap-2.5 text-sm text-stone-700"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />{{ pro }}</li>
                </ul>
              </div>
              <div v-if="cons.length" class="rounded-xl border border-[#f6e3cf] bg-[#fdf6ee] p-5">
                <p class="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#b4572a]">{{ t('propertyDetails.aiSummary.cons', 'A considerar') }}</p>
                <ul class="space-y-2.5">
                  <li v-for="c in cons" :key="c" class="flex items-start gap-2.5 text-sm text-stone-700"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#e8792b]" />{{ c }}</li>
                </ul>
              </div>
            </div>
          </PropertySectionCard>

          <!-- Análisis de inversión -->
          <PropertySectionCard v-if="show('analisis') && has('analisis')" id="analisis" v-bind="n('s.analisis')" title-field="t.analisis.title" :title="tx('t.analisis.title', t('propertyDetails.investment.heading', 'Análisis de inversión'))" :style="at('analisis')">
            <LazyAIAnalysis hydrate-on-visible :slug="slug" :price="data.project.price" :area="data.project.area" :rental-yield="data.project.rentalYield" @empty="markEmpty('analisis')" />
          </PropertySectionCard>

          <!-- Evolución de precio -->
          <PropertySectionCard v-if="show('precio') && has('precio')" id="precio" v-bind="n('s.precio')" title-field="t.precio.title" :title="tx('t.precio.title', t('propertyDetails.priceHistory.heading', 'Evolución de precio'))" :style="at('precio')">
            <LazyPriceChart hydrate-on-visible :slug="slug" />
          </PropertySectionCard>

          <!-- Servicios cercanos -->
          <PropertySectionCard v-if="show('servicios') && has('servicios')" id="servicios" v-bind="n('s.servicios')" title-field="t.servicios.title" :title="tx('t.servicios.title', t('propertyDetails.lifestyle.heading', 'Estilo de vida'))" :subtitle="t('propertyDetails.lifestyle.subtitle', 'Datos reales del entorno, obtenidos de OpenStreetMap dentro de un radio de 2 km.')" :style="at('servicios')">
            <LazyLifestyleBlock hydrate-on-visible :slug="slug" @empty="markEmpty('servicios')" />
          </PropertySectionCard>

          <!-- Ubicación / mapa -->
          <PropertySectionCard v-if="show('ubicacion') && has('ubicacion')" id="ubicacion" v-bind="n('s.ubicacion')" title-field="t.ubicacion.title" :title="tx('t.ubicacion.title', t('propertyDetails.location.heading', 'Dónde está'))" :style="at('ubicacion')">
            <div class="relative overflow-hidden rounded-xl border border-[#ece8e1]" :class="MAP_HEIGHT_CLASS[display.mapHeight]" :data-map-height="display.mapHeight" data-testid="ficha-map">
              <ClientOnly>
                <PropertyLocationMap v-if="hasValidCoords(data.project)" :lat="data.project.lat" :lng="data.project.lng" :label="data.project.community || data.project.name" />
                <template v-else>
                  <div class="absolute inset-0 flex items-center justify-center bg-paper">
                    <p class="max-w-xs text-center text-[12px] text-stone-400">{{ t('propertyDetails.location.noCoords') }}</p>
                  </div>
                </template>
                <template #fallback>
                  <div class="absolute inset-0 bg-gradient-to-br from-blue-50 to-blue-100" />
                  <div class="absolute inset-0" style="background-image:radial-gradient(circle,rgba(30,64,175,0.08) 1px,transparent 1px);background-size:26px 26px" />
                  <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <span class="flex h-6 w-6 items-center justify-center rounded-full bg-blue-700 text-white shadow-lg ring-4 ring-white">●</span>
                  </div>
                  <span class="absolute bottom-4 left-4 rounded-full bg-white/90 px-4 py-2 text-[11px] uppercase tracking-widest2 text-stone-600 backdrop-blur">{{ data.project.community }}</span>
                </template>
              </ClientOnly>
            </div>
          </PropertySectionCard>

          <!-- Guía de la zona (docs/zonas.md): «Descubre cómo es vivir en…», sólo si la agencia tiene una guía publicada para la ubicación. -->
          <ZoneLink v-if="show('ubicacion') && zoneLocation.municipality" class="mt-4" :municipality="zoneLocation.municipality" :neighborhood="zoneLocation.neighborhood" />

          <!-- Sol y orientación -->
          <PropertySectionCard v-if="show('orientacion') && has('orientacion')" id="orientacion" v-bind="n('s.orientacion')" title-field="t.orientacion.title" :title="tx('t.orientacion.title', t('propertyDetails.orientation.heading', 'Sol y orientación'))" :style="at('orientacion')">
            <LazySunOrientation hydrate-on-visible :orientation="data.project.orientation" :lat="data.project.lat" :lng="data.project.lng" />
          </PropertySectionCard>

          <!-- Hipoteca y costes: la calculadora y el coste mensual estimado de esta vivienda. -->
          <PropertySectionCard v-if="show('hipoteca') && has('hipoteca')" id="hipoteca" v-bind="n('s.hipoteca')" title-field="t.hipoteca.title" :title="tx('t.hipoteca.title', t('propertyDetails.mortgage.heading', 'Hipoteca y costes'))" :style="at('hipoteca')">
            <LazyMortgageCalculator hydrate-on-visible :price="data.project.price || 0" :rental-yield="data.project.rentalYield" :status="data.project.status" />
            <PropertyMonthlyCost class="mt-5" :price="data.project.price" :service-charge-annual="data.project.serviceChargeAnnual" :details="data.details" />
          </PropertySectionCard>

          <!-- Pregúntale -->
          <section v-if="show('preguntar')" v-bind="n('s.preguntar')" class="no-print min-w-0" :style="at('preguntar')">
            <LazyAskAI hydrate-on-visible :slug="slug" />
          </section>

          <!-- Visualiza el potencial -->
          <PropertySectionCard v-if="show('staging') && has('staging')" class="no-print" v-bind="n('s.staging')" title-field="t.staging.title" :title="tx('t.staging.title', t('propertyDetails.staging.heading', 'Visualiza el potencial'))" :style="at('staging')">
            <div class="grid gap-4 sm:grid-cols-2">
              <div v-for="s in staging" :key="s.title" class="group relative overflow-hidden rounded-xl border border-[#ece8e1] bg-white">
                <div class="aspect-[16/10] overflow-hidden bg-stone-100"><img :src="photos[s.i % photos.length]" alt="" class="h-full w-full object-cover transition duration-700 group-hover:scale-105" loading="lazy" ></div>
                <div class="flex items-center justify-between gap-3 p-4">
                  <div class="min-w-0"><p class="text-[15px] font-semibold">{{ s.title }}</p><p class="text-[13px] text-stone-500">{{ s.desc }}</p></div>
                  <NuxtLink to="/contacto" class="shrink-0 rounded-full bg-[#fdf1e7] px-4 py-2 text-[12px] font-semibold text-[#b4572a]">{{ t('propertyDetails.staging.generate', 'Generar') }}</NuxtLink>
                </div>
              </div>
            </div>
          </PropertySectionCard>

          <!-- Historia / timeline -->
          <PropertySectionCard v-if="show('historia') && has('historia')" id="historia" v-bind="n('s.historia')" title-field="t.historia.title" :title="tx('t.historia.title', t('propertyDetails.history.heading', 'Historia del inmueble'))" :style="at('historia')">
            <LazyPropertyTimeline hydrate-on-visible :published-at="data.project.publishedAt" :status="data.project.status" :construction-percentage="data.project.constructionPercentage" :handover-date="data.project.handoverDate" />
          </PropertySectionCard>
        </div>

        <!-- Columna derecha (#111): precio y próxima visita y «Atendido por» con el formulario, que
        en escritorio se queda a la vista mientras se lee la ficha (megaprompt «ficha»: sticky real,
        bajo la cabecera de la web y sin tapar nada). Su hueco ocupa la columna hasta el final del
        contenido; indicadores, decisión rápida y promotora van debajo, sin que la tarjeta los tape. -->
        <aside class="flex min-w-0 flex-col gap-5" data-testid="ficha-aside">
          <div class="hidden lg:block">
            <PropertyPriceCard v-bind="n('b.price')" :slug="slug" :project="data.project" :agent-slug="agentSlug" @book="(start) => openVisit('in_person', start)" @video="openVisit('video')" @visit-state="(s) => (agendaState = s)" />
          </div>
          <div class="ficha-contact-rail" :style="{ '--ficha-sticky-top': `${stickyTop}px` }">
            <div id="contacto" ref="contactRef" class="ficha-contact-sticky scroll-mt-28" data-testid="ficha-contact-sticky">
              <PropertyContactCard v-bind="n('b.contact')" :readonly="mode !== 'production'" :texts="coreOptions" :project="data.project" :agent="data.agent" :tone="contactTone" :can-book="!!agentSlug && agendaState !== 'none'" :sticky-head="contactTall" @visit="requestVisit" />
            </div>
          </div>
          <!-- Última actualización, fecha de publicación y la misma «REF:» de las migas: sin datos, no existe. -->
          <PropertyListingMeta v-bind="n('b.listing-meta')" :project="data.project" :reference="reference" />
          <PropertyIndicatorsCard v-bind="n('b.indicators')" :slug="slug" />
          <PropertyQuickDecisionCard v-bind="n('b.quick-decision')" :slug="slug" />
          <div v-if="data.developer" v-bind="n('b.developer')" class="pcard" data-testid="ficha-developer">
            <span class="eyebrow">{{ t('propertyDetails.developer.eyebrow', 'Promotora') }}</span>
            <div class="mt-4 flex items-center gap-4">
              <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#ece8e1] bg-[#faf8f4]">
                <img v-if="data.developer.logo" :src="mediaUrl(data.developer.logo)" :alt="data.developer.name" class="max-h-8 max-w-[40px] object-contain" >
                <span v-else class="text-lg font-bold">{{ data.developer.name.charAt(0) }}</span>
              </div>
              <p class="min-w-0 text-[16px] font-bold leading-tight [overflow-wrap:anywhere]">{{ data.developer.name }}</p>
            </div>
            <p v-if="data.developer.description" class="mt-3 text-[13px] leading-relaxed text-stone-500">{{ data.developer.description }}</p>
          </div>
        </aside>
      </div>
    </div>

    <!-- Propiedades similares (y, debajo, las destacadas) -->
    <div v-if="has('similares')" id="similares" class="no-print mx-auto max-w-screen-2xl scroll-mt-28 px-4 pb-16 sm:px-6 lg:px-10">
      <div v-bind="n('b.similar')" class="pcard !p-6">
        <SbText tag="h2" field="t.similar.title" kind="heading" label="Título de «Propiedades similares»" :text="tx('t.similar.title', t('propertyDetails.similar.heading', 'Propiedades similares'))" class="pcard-title" />
        <div class="mt-5"><FichaNoNodes><LazySimilarProperties hydrate-on-visible :slug="slug" :show-featured="coreOptions.showFeatured !== false" :featured-title="coreOptions.featuredTitle || ''" @empty="markEmpty('similares')" /></FichaNoNodes></div>
      </div>
    </div>

    <PropertyStickyBar v-if="mode === 'production'" :price="formatPrice(data.project.price, data.project.transactionType)" :visible="showMobileBar" @request="requestVisit" />

    <BookAppointmentModal
      v-if="agentSlug && mode === 'production'"
      class="no-print"
      :open="visitModal.open"
      :agent-slug="agentSlug"
      :agent-name="data.agent?.name"
      :property-id="data.project.id"
      :property-name="data.project.name"
      :channel="visitModal.channel"
      :initial-slot="visitModal.slot"
      @close="visitModal.open = false"
    />
  </div>
</template>

<script setup lang="ts">
import { hasValidCoords } from '~/utils/maps/coords'
import ZoneLink from '~/components/zones/ZoneLink.vue'
import { buildQuickFacts } from '~/utils/quickFacts'
import { buildingRows, conditionRows, type PublicDocument } from '~/utils/propertyFacts'
import type { PublicFloorPlan } from '~/utils/floorPlans'
import { featureIconSvg } from '~/utils/featureIcons'
import { derivedCons, derivedPros, fichaHighlights } from '~/utils/fichaHighlights'
import { fichaDisplayOptions, fichaSectionLayout } from '~/utils/siteBuilder/pages'
import { energyData } from '~/utils/energyCertificate'
import { fichaDataContext, fichaSectionVisible } from '~/utils/fichaVisibility'
import { useFichaNodes } from '~/composables/useFichaNodes'
import SbText from '~/components/site-builder/nodes/SbText.vue'
import FichaNoNodes from '~/components/ficha/NoNodes.vue'

/**
 * La ficha pública de una propiedad: lo que la página `/propiedades/<slug>` pinta
 * como zona dinámica de «Ficha de propiedad» (Constructor Web), extraído para que
 * la vean igual la web y el lienzo del Constructor. Recibe los datos ya cargados
 * (`/api/public/properties/<slug>`: la propiedad real en la web, la de ejemplo en
 * el lienzo) y lo que el Constructor guarda de la zona (`coreOptions`); no carga
 * la propiedad, no escribe el SEO ni cuenta la visita: eso es de la página.
 *
 * `mode`: `production` es la web. En `builder` (lienzo) y `preview` (Vista previa)
 * no hay efectos reales: ni reserva de visita ni barra fija ni envío del formulario.
 */
const props = withDefaults(defineProps<{ data: any; slug: string; coreOptions?: Record<string, any>; mode?: 'production' | 'builder' | 'preview' }>(), {
  coreOptions: () => ({}),
  mode: 'production',
})
const { t } = useI18n()
const { format: formatPrice } = useCurrency()
const { tenant } = useTenant()
const data = computed<any>(() => props.data)
const slug = computed(() => props.slug)
const coreOptions = computed<Record<string, any>>(() => props.coreOptions || {})
// Lo demás de la zona (megaprompt «ficha»): referencia y descripción en la
// tarjeta principal, fondo de «Atendido por», presentación de la tabla
// energética y si las secciones sin datos se ocultan solas.
const display = computed(() => fichaDisplayOptions(coreOptions.value))
// Altura del mapa de «Ubicación» según la opción del Constructor (la de siempre es h-80).
const MAP_HEIGHT_CLASS: Record<string, string> = { compact: 'h-56', standard: 'h-80', tall: 'h-[30rem]' }
// Los nodos de la ficha editable (utils/siteBuilder/fichaNodes.ts): `n('b.price')` pone en el
// elemento los atributos que lo hacen seleccionable y estilizable desde el Constructor.
const { attrs: n } = useFichaNodes()
// Un texto fijo de la plantilla: el que se reescribió en el Constructor o, sin él, el traducido de siempre.
const tx = (field: string, translated: string) => {
  const saved = coreOptions.value[field]
  return typeof saved === 'string' && saved.trim() ? saved : translated
}

// La galería ya llega filtrada del servidor: sólo fotos publicables, no
// privadas y no ocultas, en su orden (FASE 7). El alt de cada foto, si lo
// tiene; si no, el nombre de la promoción.
const galleryRows = computed<any[]>(() => {
  const rows: any[] = []
  const seen = new Set<string>()
  if (data.value?.project.coverImage) {
    seen.add(data.value.project.coverImage)
    rows.push({ image: data.value.project.coverImage, alt: null })
  }
  for (const g of (data.value?.gallery as any[]) || []) {
    if (!g.image || seen.has(g.image)) continue
    seen.add(g.image)
    rows.push(g)
  }
  return rows
})
const photos = computed<string[]>(() => galleryRows.value.map((g) => mediaUrl(g.image)))
const publicMedia = computed<any[]>(() => ((data.value as any)?.media as any[]) || [])
// Documentación (#110): los PDF publicables de la multimedia y los documentos «Público» (sin caducar).
const publicDocs = computed<PublicDocument[]>(() => [
  ...publicMedia.value.filter((m) => m.mediaType === 'pdf').map((m) => ({ key: `m${m.id}`, title: m.title || t('propertyDetails.documents.brochure', 'Folleto'), typeLabel: m.caption || null, mimeType: 'application/pdf', url: m.url })),
  ...((((data.value as any)?.documents as any[]) || []).map((d) => ({ key: `d${d.id}`, title: d.title, typeLabel: d.docTypeLabel, mimeType: d.mimeType, sizeBytes: d.sizeBytes, url: d.url, isDocument: true }))),
])
// Planos (paso «Planos» del editor), estado del inmueble y edificio (#110).
const floorPlans = computed<PublicFloorPlan[]>(() => (((data.value as any)?.floorPlans as PublicFloorPlan[]) || []).filter((f) => !!f.image))
const conditionFacts = computed(() => conditionRows(p.value, (data.value as any)?.details, t))
const buildingFacts = computed(() => buildingRows(p.value, (data.value as any)?.details, t, formatPrice))

const p = computed(() => data.value!.project)
const statusLabel = computed(() => ({ new: t('propertyDetails.status.new', 'Obra nueva'), under_construction: t('propertyDetails.status.underConstruction', 'En construcción'), ready: t('propertyDetails.status.ready', 'Listo para entrar') }[p.value.status as string] || p.value.status))
// La ubicación pública (la privacidad ya quitó portal, planta y número en el
// servidor) y la promotora, como en la referencia: «Residencial … · Promotora».
const locationLine = computed(() => [p.value.community || (p.value as any).city, data.value?.developer?.name].filter(Boolean).join(' · '))
// Ubicación con la que se busca la guía de zona: municipio y barrio de la ficha ampliada o, si faltan, ciudad y zona de la propiedad.
const zoneLocation = computed(() => ({
  municipality: String((data.value as any)?.details?.municipality || (p.value as any).city || '').trim() || null,
  neighborhood: String((data.value as any)?.details?.neighborhood || p.value.community || '').trim() || null,
}))
const agentSlug = computed<string | null>(() => (data.value as any)?.agent?.slug || null)
// «REF:» (junto a las migas) y «Referencia del anuncio» (bloque de fechas): la
// referencia del anuncio la calcula el servidor (`referenceLabel`,
// server/utils/properties/publicDetail.ts: referencia de agencia, si no el
// código comercial, si no la referencia propia), si el Constructor no la oculta.
const reference = computed(() => (display.value.showReference ? String((data.value as any)?.referenceLabel || '').trim() : ''))
// La descripción va en la tarjeta principal, bajo el título y la ubicación; sin texto, no hay bloque.
const showDescription = computed(() => display.value.showDescription && !!String(data.value?.project.description || '').trim())
const descId = `ficha-desc-${useId()}`
// La etiqueta energética: los valores reales de la propiedad y de su ficha ampliada, nunca inventados.
const energy = computed(() => energyData(p.value, (data.value as any)?.details))

// Orden y visibilidad de las secciones que se configuran en el Constructor
// (#110). Sin configuración, el orden de partida de FICHA_SECTIONS (#111).
const layout = computed(() => fichaSectionLayout(coreOptions.value.sections))
const show = (key: string) => !layout.value.hidden.has(key)
const at = (key: string) => ({ order: layout.value.order[key] })

// Los mismos datos que pinta QuickFacts (sin el tipo ni el año, que van en la fila de cifras).
const typeLabel = usePropertyTypeLabel()
const hasQuickFacts = computed(() => buildQuickFacts(p.value, (data.value as any)?.details, t, typeLabel).some((f) => f.key !== 'propertyType' && f.key !== 'yearBuilt'))
// «Características destacadas» va dentro de la tarjeta principal, como en la
// referencia, mientras sea la primera sección; si en el Constructor se movió
// más abajo, sale en su propia tarjeta en ese puesto.
const datosInHeader = computed(() => {
  if (!hasQuickFacts.value || !show('datos')) return false
  const { order, hidden } = layout.value
  return Object.keys(order).every((k) => k === 'datos' || hidden.has(k) || order[k] > order.datos)
})

// Las cifras bajo el título (#111): icono, valor y etiqueta; sólo lo que consta.
const keyFacts = computed(() => {
  const out: { key: string; value: string; label: string }[] = []
  const pr = p.value
  if (pr.bedrooms != null) out.push({ key: 'bedrooms', value: pr.bedrooms ? String(pr.bedrooms) : t('card.studio', 'Estudio'), label: pr.bedrooms === 1 ? t('ficha.bedroom', 'Habitación') : t('propertyDetails.facts.bedrooms', 'Habitaciones') })
  if (pr.bathrooms != null) out.push({ key: 'bathrooms', value: String(pr.bathrooms), label: pr.bathrooms === 1 ? t('ficha.bathroom', 'Baño') : t('propertyDetails.facts.bathrooms', 'Baños') })
  if (pr.area) out.push({ key: 'area', value: `${Math.round(pr.area)} m²`, label: t('propertyDetails.facts.area', 'Superficie') })
  if (pr.energyRating) out.push({ key: 'energyRating', value: pr.energyRating, label: t('ficha.energyRating', 'Eficiencia energética') })
  if (pr.orientation) out.push({ key: 'orientation', value: pr.orientation, label: t('propertyDetails.facts.orientation', 'Orientación') })
  if (pr.propertyType) out.push({ key: 'propertyType', value: typeLabel(pr.propertyType), label: t('quickFacts.type', 'Tipo') })
  if (pr.yearBuilt) out.push({ key: 'yearBuilt', value: String(pr.yearBuilt), label: t('quickFacts.yearBuilt', 'Año de construcción') })
  return out
})

// Descripción: «Ver más» sólo si el texto no cabe en las líneas de partida.
const descEl = ref<HTMLElement | null>(null)
const descOpen = ref(false)
const descOverflows = ref(false)
function measureDescription() {
  const el = descEl.value
  if (!el) return
  const prev = el.classList.contains('desc-clamped')
  el.classList.add('desc-clamped')
  descOverflows.value = el.scrollHeight > el.clientHeight + 2
  if (!prev) el.classList.remove('desc-clamped')
}
// Los puntos destacados del bloque verde: los «Puntos clave» de la agencia o, sin ellos, los de datos reales.
const highlights = computed(() => fichaHighlights(p.value as any, t))

// «Lo que debes saber»: sólo lo que dicen los datos (antes, sin datos, salían
// frases de relleno como «Ubicación privilegiada»); sin nada, no hay sección.
// Sin repetir lo que ya enseña el recuadro verde de la descripción.
const pros = computed(() => {
  const shown = new Set(highlights.value.source === 'data' && showDescription.value ? highlights.value.items : [])
  return derivedPros(p.value as any, t).filter((x) => !shown.has(x))
})
const cons = computed(() => derivedCons(p.value as any, t))
const hasResumen = computed(() => !!data.value?.project.aiSummary || pros.value.length > 0 || cons.value.length > 0)

// Secciones sin datos (megaprompt «ficha», regla 8): con «Ocultar
// automáticamente si no hay datos» (de partida), una sección que no tiene
// nada real que enseñar no sale —ni su título, ni su tarjeta, ni su pestaña—.
// Lo sabe el servidor (`availability`: Score, historial de precios,
// similares, análisis con comparables) o el navegador al cargarla (entorno
// sin servicios, análisis sin comparables). Sin la regla, sólo se quitan las
// que no tendrían ni un componente que pintar.
const emptyAtRuntime = ref(new Set<string>())
function markEmpty(key: string) {
  if (!emptyAtRuntime.value.has(key)) emptyAtRuntime.value = new Set([...emptyAtRuntime.value, key])
}
// Contado con las mismas funciones que la vista del Constructor (utils/fichaVisibility.ts).
const dataContext = computed(() =>
  fichaDataContext(data.value as any, { t, typeLabel, formatMoney: formatPrice, showDescription: showDescription.value, energy: display.value.energy, emptyAtRuntime: emptyAtRuntime.value }),
)
const has = (key: string) => fichaSectionVisible(key, dataContext.value, display.value.hideEmpty)

const staging = computed(() => [
  { title: t('propertyDetails.staging.decorTitle', 'Decoración IA'), desc: t('propertyDetails.staging.decorDesc', 'Reimagina los espacios en tu estilo'), i: 1 },
  { title: t('propertyDetails.staging.homeStagingTitle', 'Home Staging IA'), desc: t('propertyDetails.staging.homeStagingDesc', 'Amuebla virtualmente cada estancia'), i: 2 },
])

// La barra de apartados (#111): los de la referencia, en el orden de la ficha;
// Fotos primero y Similares al final; nunca una pestaña a algo que no hay.
const sections = computed(() => {
  const plano = floorPlans.value.length ? { id: 'plano', label: t('propertyDetails.nav.floorPlan', 'Plano') } : conditionFacts.value.length ? { id: 'estado', label: t('propertyDetails.nav.condition', 'Estado') } : null
  const items: { id: string; key: string; label: string; when?: boolean }[] = [
    { id: 'score', key: 'score', label: t('propertyDetails.nav.score', 'Score'), when: has('score') },
    { id: hasQuickFacts.value && show('datos') ? 'datos' : 'principal', key: hasQuickFacts.value && show('datos') ? 'datos' : '', label: t('propertyDetails.nav.quickFacts', 'Datos clave') },
    { id: 'energia', key: 'energia', label: t('propertyDetails.nav.energy', 'Energía'), when: has('energia') },
    { id: plano?.id || 'plano', key: 'plano-estado', label: plano?.label || '', when: !!plano },
    { id: 'resumen', key: 'resumen', label: t('propertyDetails.nav.aiSummary', 'Resumen IA'), when: hasResumen.value },
    { id: 'analisis', key: 'analisis', label: t('propertyDetails.nav.analysis', 'Análisis'), when: has('analisis') },
    { id: 'precio', key: 'precio', label: t('propertyDetails.nav.price', 'Precio'), when: has('precio') },
    { id: 'servicios', key: 'servicios', label: t('propertyDetails.nav.services', 'Servicios'), when: has('servicios') },
    { id: 'ubicacion', key: 'ubicacion', label: t('propertyDetails.nav.location', 'Ubicación'), when: has('ubicacion') },
    { id: 'orientacion', key: 'orientacion', label: t('propertyDetails.nav.sun', 'Sol'), when: has('orientacion') },
    { id: 'hipoteca', key: 'hipoteca', label: t('propertyDetails.nav.mortgage', 'Hipoteca'), when: has('hipoteca') },
    { id: 'historia', key: 'historia', label: t('propertyDetails.nav.history', 'Historia'), when: has('historia') },
  ]
  const { order, hidden } = layout.value
  // La tarjeta principal (sin clave) va antes que cualquier sección.
  const rank = (s: { key: string }) => (s.key && !(s.key === 'datos' && datosInHeader.value) ? order[s.key] || 0 : 0)
  const middle = items.filter((s) => s.when !== false && !(s.key && hidden.has(s.key))).sort((a, b) => rank(a) - rank(b))
  return [
    { id: 'fotos', label: t('propertyDetails.nav.photos', 'Fotos') },
    ...middle.map(({ id, label }) => ({ id, label })),
    ...(has('similares') ? [{ id: 'similares', label: t('propertyDetails.nav.similar', 'Similares') }] : []),
  ]
})

// Scroll-spy: resalta la sección activa en la barra de apartados
const activeSection = ref('fotos')
let sectionObserver: IntersectionObserver | null = null

// Barra CTA fija en móvil: visible tras pasar la galería, salvo mientras la
// tarjeta de contacto real está a la vista.
const heroRef = ref<HTMLElement | null>(null)
const contactRef = ref<HTMLElement | null>(null)
const heroPassed = ref(false)
const contactInView = ref(false)
let heroObserver: IntersectionObserver | null = null
let contactObserver: IntersectionObserver | null = null
const showMobileBar = computed(() => heroPassed.value && !contactInView.value)

// Reserva de visita (#110): con comercial y agenda, la reserva real (con la
// hora de «Próxima visita disponible» ya elegida si se pulsó ahí); sin ella,
// o si su agenda no tiene ningún hueco en dos semanas, el formulario de
// «Atendido por» (la reserva no tendría horas que ofrecer).
const agendaState = ref<'loading' | 'slot' | 'none'>('loading')
const visitModal = reactive<{ open: boolean; channel: 'in_person' | 'video'; slot: string | null }>({ open: false, channel: 'in_person', slot: null })
function openVisit(channel: 'in_person' | 'video', slot: string | null = null) {
  // En el Constructor se enseña la ficha, no se reserva nada.
  if (props.mode !== 'production') return
  if (!agentSlug.value || agendaState.value === 'none') {
    document.getElementById('contacto')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
  visitModal.channel = channel
  visitModal.slot = slot
  visitModal.open = true
}
function requestVisit() {
  openVisit('in_person')
}

// «Atendido por» fijo en escritorio (megaprompt «ficha», 4.2-4.3): bajo la
// cabecera real de la web (se mide, no se supone) y, si la tarjeta no cabe
// en la pantalla, se desplaza por dentro con su cabecera a la vista. En el
// móvil va en el flujo de la página: lo fijo allí es la barra inferior.
const contactTone = computed(() => display.value.contactTone)
const headerHeight = ref(73)
const stickyTop = computed(() => headerHeight.value + 16)
const contactTall = ref(false)
function measureSticky() {
  const header = document.querySelector<HTMLElement>('[data-site-header]')
  const pos = header ? getComputedStyle(header).position : ''
  headerHeight.value = header && (pos === 'sticky' || pos === 'fixed') ? Math.round(header.getBoundingClientRect().height) : 0
  const card = contactRef.value?.firstElementChild as HTMLElement | null
  contactTall.value = !!card && card.offsetHeight > window.innerHeight - stickyTop.value - 16
}
let stickyResize: ResizeObserver | null = null

onMounted(() => {
  measureDescription()
  measureSticky()
  window.addEventListener('resize', measureSticky, { passive: true })
  if (typeof ResizeObserver !== 'undefined' && contactRef.value?.firstElementChild) {
    stickyResize = new ResizeObserver(() => measureSticky())
    stickyResize.observe(contactRef.value.firstElementChild)
  }
  sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) activeSection.value = e.target.id
      })
    },
    { rootMargin: '-140px 0px -70% 0px', threshold: 0 },
  )
  sections.value.forEach((s) => {
    const el = document.getElementById(s.id)
    if (el) sectionObserver!.observe(el)
  })

  if (heroRef.value) {
    heroObserver = new IntersectionObserver(([e]) => (heroPassed.value = !e.isIntersecting), { threshold: 0 })
    heroObserver.observe(heroRef.value)
  }
  if (contactRef.value) {
    contactObserver = new IntersectionObserver(([e]) => (contactInView.value = e.isIntersecting), { threshold: 0 })
    contactObserver.observe(contactRef.value)
  }
})
onUnmounted(() => {
  window.removeEventListener('resize', measureSticky)
  stickyResize?.disconnect()
  sectionObserver?.disconnect()
  heroObserver?.disconnect()
  contactObserver?.disconnect()
})
</script>

<style scoped>
:global(html) {
  scroll-behavior: smooth;
}
.ficha-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 12px;
}
.ficha-fact {
  display: flex;
  align-items: center;
  gap: 10px;
}
@media (min-width: 640px) {
  .ficha-facts {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
/* Columnas elegidas en el Constructor (≥ 640 px): una cuadrícula sin separadores en lugar de la fila de siempre. */
@media (min-width: 640px) {
  .ficha-facts[data-cols='2'] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ficha-facts[data-cols='3'] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (min-width: 1280px) {
  .ficha-facts[data-cols='2'],
  .ficha-facts[data-cols='3'],
  .ficha-facts[data-cols='4'] {
    display: grid;
    gap: 20px 24px;
  }
  .ficha-facts[data-cols='2'] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ficha-facts[data-cols='3'] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .ficha-facts[data-cols='4'] { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .ficha-facts[data-cols='2'] .ficha-fact,
  .ficha-facts[data-cols='3'] .ficha-fact,
  .ficha-facts[data-cols='4'] .ficha-fact {
    padding: 0;
    border-left: 0;
  }
}
/* Escritorio: una fila con separadores verticales, como la referencia. */
@media (min-width: 1280px) {
  .ficha-facts {
    display: flex;
    gap: 0;
  }
  .ficha-fact {
    flex: 1 1 0;
    min-width: 0;
    padding: 0 14px;
  }
  .ficha-fact:first-child {
    padding-left: 0;
  }
  .ficha-fact + .ficha-fact {
    border-left: 1px solid #efebe5;
  }
}
/* «Atendido por» fijo en escritorio: su hueco ocupa el resto de la columna,
   así la tarjeta acompaña la lectura sin tapar las tarjetas de debajo ni el
   pie; más alta que la pantalla, se desplaza por dentro (sin bloquear el
   scroll de la página: al llegar a su final, sigue la página). */
@media (min-width: 1024px) {
  .ficha-contact-rail {
    flex: 1 1 auto;
  }
  .ficha-contact-sticky {
    position: sticky;
    top: var(--ficha-sticky-top, 89px);
    max-height: calc(100vh - var(--ficha-sticky-top, 89px) - 16px);
    overflow-y: auto;
    border-radius: 16px;
    scrollbar-width: thin;
  }
}
.desc-clamped {
  /* Las líneas de partida son 4 (1,8 de interlineado); el Constructor puede cambiarlas (--desc-lines). */
  max-height: calc(var(--desc-lines, 4) * 1.8em);
  overflow: hidden;
  -webkit-mask-image: linear-gradient(180deg, #000 60%, transparent);
  mask-image: linear-gradient(180deg, #000 60%, transparent);
}
.peach-btn {
  display: inline-flex;
  height: 38px;
  align-items: center;
  gap: 8px;
  border-radius: 9999px;
  background: #fdf1e7;
  padding: 0 18px;
  font-size: 13px;
  font-weight: 600;
  color: #b4572a;
  transition: background 0.15s;
}
.peach-btn:hover {
  background: #fbe6d5;
}
.btn-visit {
  display: inline-flex;
  height: 44px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: #1f3a30;
  padding: 0 20px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  transition: background 0.15s;
}
.btn-visit:hover {
  background: #172d25;
}
.peach-btn:focus-visible,
.btn-visit:focus-visible {
  outline: 2px solid #1c1b19;
  outline-offset: 2px;
}
</style>
