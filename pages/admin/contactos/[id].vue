<template>
  <div class="max-w-4xl">
    <NuxtLink to="/admin/contactos" class="mb-4 inline-block text-sm text-stone-500 hover:text-ink">← Contactos</NuxtLink>

    <div v-if="!data?.contact" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">
      Contacto no encontrado.
    </div>

    <template v-else>
      <!-- Cabecera CRM 360 (FASE 9): todo lo que hay que saber de la persona
           de un vistazo, y «Editar» para cambiarlo. -->
      <div class="mb-6 rounded-2xl border border-line bg-white p-4 sm:p-5" data-testid="contact-header">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h1 class="text-2xl font-semibold tracking-tight" data-testid="contact-name">{{ data.contact.name }}</h1>
            <div class="mt-2 flex flex-wrap gap-1.5" data-testid="contact-roles">
              <span v-for="r in data.contact.roles" :key="r" class="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">{{ CONTACT_ROLE_LABELS[r as ContactRole] || r }}</span>
              <span v-if="!data.contact.roles?.length" class="text-[11px] text-stone-400">Sin roles</span>
              <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="data.contact.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'">{{ CONTACT_STATUS_LABELS[data.contact.status] || data.contact.status }}</span>
            </div>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            <a v-if="data.contact.phone" :href="`tel:${data.contact.phone}`" class="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium hover:bg-stone-50">Llamar</a>
            <a v-if="whatsappNumber" :href="`https://wa.me/${whatsappNumber}`" target="_blank" rel="noopener" class="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium hover:bg-stone-50">WhatsApp</a>
            <a v-if="data.contact.email" :href="`mailto:${data.contact.email}`" class="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium hover:bg-stone-50">Email</a>
            <button v-if="canEdit" type="button" class="rounded-lg bg-ink px-3 py-1.5 text-[12px] font-medium text-white" data-testid="contact-edit" @click="editing = true">Editar</button>
          </div>
        </div>
        <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-4" data-testid="contact-header-fields">
          <div><dt class="text-[11px] text-stone-400">Teléfono</dt><dd class="truncate">{{ data.contact.phone || '—' }}</dd></div>
          <div><dt class="text-[11px] text-stone-400">Email</dt><dd class="truncate">{{ data.contact.email || '—' }}</dd></div>
          <div><dt class="text-[11px] text-stone-400">WhatsApp</dt><dd class="truncate">{{ data.contact.whatsapp || data.contact.phone || '—' }}</dd></div>
          <div><dt class="text-[11px] text-stone-400">Idioma</dt><dd>{{ data.contact.language ? LANGUAGE_LABELS[data.contact.language] || data.contact.language : '—' }}</dd></div>
          <div><dt class="text-[11px] text-stone-400">País</dt><dd data-testid="contact-country">{{ data.contact.country || '—' }}</dd></div>
          <div><dt class="text-[11px] text-stone-400">Comercial</dt><dd class="truncate">{{ data.contact.commercialName || 'Sin asignar' }}</dd></div>
          <div><dt class="text-[11px] text-stone-400">Oficina</dt><dd class="truncate">{{ data.contact.officeName || '—' }}</dd></div>
          <div><dt class="text-[11px] text-stone-400">Origen</dt><dd>{{ data.contact.source ? CONTACT_SOURCE_LABELS[data.contact.source] || data.contact.source : '—' }}</dd></div>
          <div><dt class="text-[11px] text-stone-400">Score</dt><dd>{{ data.contact.score ?? '—' }}</dd></div>
          <div><dt class="text-[11px] text-stone-400">Último contacto</dt><dd>{{ data.contact.lastContactAt ? dt.date(data.contact.lastContactAt) : '—' }}</dd></div>
          <div class="col-span-2">
            <dt class="text-[11px] text-stone-400">Próxima acción</dt>
            <dd data-testid="contact-next-action">
              {{ data.contact.nextActionType ? NEXT_ACTION_LABELS[data.contact.nextActionType] || data.contact.nextActionType : '—' }}
              <span v-if="data.contact.nextActionAt" class="text-stone-500">· {{ formatDateTime(data.contact.nextActionAt) }}</span>
            </dd>
          </div>
        </dl>
      </div>
      <ContactEditModal v-if="editing" :contact="data.contact" @close="editing = false" @saved="onSaved" />

      <div class="thin-scroll -mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap">
        <button
          v-for="t in tabs"
          :key="t.key"
          type="button"
          :data-testid="`contact-tab-${t.key}`"
          class="shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium transition"
          :class="tab === t.key ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600 hover:bg-stone-50'"
          @click="tab = t.key"
        >
          {{ t.label }}<span v-if="t.count" class="ml-1.5 opacity-70">{{ t.count }}</span>
        </button>
      </div>

      <!-- NECESIDADES -->
      <section v-show="tab === 'necesidades'">
        <div class="mb-4 flex items-center justify-between">
          <p class="text-sm text-stone-500">
            Una persona puede buscar varias cosas a la vez: vivienda habitual, inversión, local… cada una con sus propios criterios.
          </p>
          <button type="button" class="dash-btn-primary shrink-0" @click="showNew = !showNew">
            {{ showNew ? 'Cancelar' : 'Nueva necesidad' }}
          </button>
        </div>

        <AdminPanel v-if="showNew" title="Nueva necesidad" class="mb-5">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="cfg-label">Título</span>
              <input v-model="form.title" class="cfg-input" placeholder="Vivienda habitual" >
            </label>
            <label class="block">
              <span class="cfg-label">Operación</span>
              <select v-model="form.operation" class="cfg-input">
                <option value="sale">Compra</option>
                <option value="rent">Alquiler</option>
              </select>
            </label>
          </div>

          <p class="cfg-label mt-4">Tipo de inmueble</p>
          <div class="flex flex-wrap gap-2">
            <label v-for="t in PROPERTY_TYPES" :key="t" class="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs">
              <input v-model="form.propertyTypes" type="checkbox" :value="t" > {{ t }}
            </label>
          </div>

          <div class="mt-4 grid gap-4 sm:grid-cols-4">
            <label class="block">
              <span class="cfg-label">Precio mín. (€)</span>
              <input v-model.number="form.priceMin" type="number" min="0" class="cfg-input" >
            </label>
            <label class="block">
              <span class="cfg-label">Precio máx. (€)</span>
              <input v-model.number="form.priceMax" type="number" min="0" class="cfg-input" >
            </label>
            <label class="block">
              <span class="cfg-label">Dormitorios mín.</span>
              <input v-model.number="form.bedroomsMin" type="number" min="0" class="cfg-input" >
            </label>
            <label class="block">
              <span class="cfg-label">Superficie mín. (m²)</span>
              <input v-model.number="form.areaMin" type="number" min="0" class="cfg-input" >
            </label>
          </div>

          <label class="mt-4 block">
            <span class="cfg-label">Zonas deseadas</span>
            <input v-model="zonesText" class="cfg-input" placeholder="Chamberí, Salamanca" >
            <span class="mt-1 block text-[11px] text-stone-400">Separadas por comas. Se guardan como zonas estructuradas, no como texto suelto.</span>
          </label>

          <p class="cfg-label mt-4">Características</p>
          <p class="mb-2 text-[11px] text-stone-400">
            Lo que no marques queda sin declarar — que no pidas garaje no significa que lo rechaces.
          </p>
          <div class="space-y-2">
            <div v-for="f in FEATURES" :key="f.key" class="flex flex-wrap items-center gap-3">
              <label class="flex w-32 items-center gap-1.5 text-sm">
                <input v-model="form.features[f.key]" type="checkbox" > {{ f.label }}
              </label>
              <select v-if="form.features[f.key]" v-model="form.importances[f.key]" class="cfg-input max-w-[190px]">
                <option value="required">Imprescindible</option>
                <option value="preferred">Preferible</option>
                <option value="indifferent">Indiferente</option>
              </select>
            </div>
          </div>

          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="cfg-label">Urgencia</span>
              <select v-model="form.urgency" class="cfg-input">
                <option :value="null">Sin especificar</option>
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </label>
            <label class="block">
              <span class="cfg-label">Hipoteca</span>
              <select v-model="form.mortgageStatus" class="cfg-input">
                <option :value="null">Sin especificar</option>
                <option value="not_needed">No la necesita</option>
                <option value="required">La necesita</option>
                <option value="requested">Solicitada</option>
                <option value="preapproved">Preaprobada</option>
                <option value="approved">Aprobada</option>
              </select>
            </label>
          </div>

          <div class="mt-4 flex items-center gap-3">
            <button type="button" class="dash-btn-primary" :disabled="saving" @click="createRequirement">
              {{ saving ? 'Guardando…' : 'Guardar necesidad' }}
            </button>
            <span v-if="formError" class="text-sm font-medium text-red-600">{{ formError }}</span>
          </div>
        </AdminPanel>

        <div v-if="!data.requirements.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">
          Sin necesidades registradas.
        </div>
        <div v-else class="space-y-3">
          <AdminPanel v-for="r in data.requirements" :key="r.id">
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ r.title || 'Necesidad' }}</p>
                <p class="mt-1 text-sm text-stone-600">{{ r.summary }}</p>
              </div>
              <select
                class="shrink-0 rounded-full border-0 px-2 py-0.5 text-[11px] font-medium"
                :class="statusClass(r.status)"
                :value="r.status"
                :data-testid="`requirement-status-${r.id}`"
                @change="setRequirementStatus(r, ($event.target as HTMLSelectElement).value)"
              >
                <option value="active">Activa</option>
                <option value="paused">En pausa</option>
                <option value="fulfilled">Cubierta</option>
                <option value="archived">Archivada</option>
              </select>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-xs">
              <span :class="r.budgetValidated ? 'text-emerald-700' : 'text-stone-400'">
                {{ r.budgetValidated ? '✓ Presupuesto validado' : 'Presupuesto sin validar' }}
              </span>
              <button type="button" class="font-medium text-ink hover:underline" @click="toggleBudget(r)">
                {{ r.budgetValidated ? 'Retirar validación' : 'Validar presupuesto' }}
              </button>
              <button type="button" class="font-medium text-ink hover:underline" :data-testid="`match-search-${r.id}`" @click="searchProperties(r)">
                {{ matches[r.id] ? 'Ocultar propiedades' : 'Buscar propiedades' }}
              </button>
            </div>

            <!-- Necesidad → inmuebles compatibles. El score y su explicación
                 vienen del motor; esta pantalla sólo los enseña. -->
            <div v-if="matches[r.id]" class="mt-3 border-t border-line pt-3" :data-testid="`match-results-${r.id}`">
              <p v-if="matchLoading[r.id]" class="text-xs text-stone-400">Buscando…</p>
              <p v-else-if="!matches[r.id].results.length" class="text-xs text-stone-500">
                Ningún inmueble disponible encaja con esta necesidad ahora mismo.
              </p>
              <ul v-else class="space-y-3">
                <li v-for="m in matches[r.id].results" :key="m.property.id" class="rounded-lg border border-line p-3">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="truncate text-sm font-medium">{{ m.property.name || m.property.location || `Inmueble #${m.property.id}` }}</p>
                      <p class="text-xs text-stone-400">
                        {{ m.propertyKind === 'developer' ? 'Propiedades (web)' : 'Propiedades 2ª mano' }} ·
                        {{ m.property.propertyType || 'Sin tipo' }} · {{ m.property.price != null ? money(m.property.price) : 'Sin precio' }}
                      </p>
                    </div>
                    <div class="flex shrink-0 gap-2 text-xs">
                      <button
                        type="button"
                        class="rounded-lg border border-line px-2 py-1 font-medium hover:bg-stone-50"
                        :class="m.persisted?.status === 'selected' ? 'border-emerald-300 text-emerald-700' : ''"
                        @click="decide(r, m, 'selected')"
                      >
                        {{ m.persisted?.status === 'selected' ? 'Seleccionado' : 'Seleccionar' }}
                      </button>
                      <button
                        type="button"
                        class="rounded-lg border border-line px-2 py-1 font-medium hover:bg-stone-50"
                        :class="m.persisted?.status === 'discarded' ? 'border-rose-300 text-rose-700' : ''"
                        @click="decide(r, m, 'discarded')"
                      >
                        {{ m.persisted?.status === 'discarded' ? 'Descartado' : 'Descartar' }}
                      </button>
                    </div>
                  </div>
                  <AdminMatchBreakdown :result="m.result" class="mt-2" />
                  <p v-if="m.persisted?.discardedReason" class="mt-1 text-[11px] text-stone-400">
                    Motivo: {{ m.persisted.discardedReason }}
                  </p>
                </li>
              </ul>
            </div>
          </AdminPanel>
        </div>
      </section>

      <!-- RESUMEN -->
      <section v-show="tab === 'resumen'" data-testid="contact-resumen">
        <div class="grid gap-3 sm:grid-cols-3">
          <div v-for="k in summaryCards" :key="k.label" class="rounded-xl border border-line bg-white p-3">
            <p class="text-[11px] text-stone-400">{{ k.label }}</p>
            <p class="mt-1 text-xl font-semibold tabular-nums">{{ k.value }}</p>
          </div>
        </div>
        <AdminPanel title="Próximas citas" class="mt-4">
          <p v-if="!upcomingVisits.length" class="text-sm text-stone-500">No tiene citas próximas.</p>
          <ul v-else class="divide-y divide-line text-sm">
            <li v-for="v in upcomingVisits" :key="v.id" class="flex justify-between gap-3 py-2"><span>{{ v.propertyName || 'Cita' }}</span><span class="text-stone-500">{{ formatDateTime(v.scheduledAt) }}</span></li>
          </ul>
        </AdminPanel>
        <AdminPanel v-if="data.contact.notes" title="Notas de la ficha" class="mt-4">
          <p class="whitespace-pre-wrap text-sm">{{ data.contact.notes }}</p>
        </AdminPanel>
      </section>

      <!-- PROPIEDADES: en las que figura como propietario, inquilino… (PropertyContact) -->
      <section v-show="tab === 'propiedades'" data-testid="contact-propiedades">
        <div class="mb-3 flex items-center justify-between gap-3">
          <p class="text-sm text-stone-500">Propiedades en las que figura esta persona y con qué papel.</p>
          <button v-if="canEdit" type="button" class="dash-btn-primary shrink-0" data-testid="contact-link-property" @click="pickingProperty = true">Vincular a una propiedad</button>
        </div>
        <p v-if="!data.properties?.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">No figura en ninguna propiedad.</p>
        <AdminPanel v-else :pad="false">
          <ul class="divide-y divide-line text-sm">
            <li v-for="p in data.properties" :key="p.linkId" class="flex flex-wrap items-center justify-between gap-2 px-4 py-3" data-testid="contact-property-row">
              <NuxtLink :to="`/admin/${p.propertyKind === 'developer' ? 'developer-properties' : 'properties'}/${p.property.id}`" class="min-w-0 font-medium hover:underline">
                {{ p.property.title || p.property.reference || `Propiedad #${p.property.id}` }}
                <span v-if="p.property.deletedAt" class="ml-1 rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-600" data-testid="contact-property-trashed">En la papelera</span>
                <span class="block text-[11px] font-normal text-stone-400">{{ p.propertyKind === 'developer' ? 'Web' : '2ª mano' }} · {{ propertyTypeLabel(p.property.propertyType) }} · {{ p.property.city || '—' }}</span>
              </NuxtLink>
              <span class="flex items-center gap-2 text-[12px]">
                <span class="rounded-full bg-stone-100 px-2 py-0.5 font-medium">{{ PROPERTY_CONTACT_ROLE_LABELS[p.role as PropertyContactRole] || p.role }}</span>
                <span v-if="p.ownershipPct != null" class="tabular-nums text-stone-500">{{ p.ownershipPct }} %</span>
                <span v-if="p.isPrimary" class="text-amber-700">Principal</span>
              </span>
            </li>
          </ul>
        </AdminPanel>
        <AdminCommsPropertyPickerModal v-if="pickingProperty" title="Vincular a una propiedad" @close="pickingProperty = false" @pick="openLinkProperty" />
        <AdminCommsModal v-if="linkTarget" title="Papel en la propiedad" :sub="linkTarget.name" @close="linkTarget = null">
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="cfg-label">Papel</span>
              <select v-model="linkForm.role" class="cfg-input" data-testid="contact-link-role">
                <option v-for="r in PROPERTY_CONTACT_ROLES" :key="r" :value="r">{{ PROPERTY_CONTACT_ROLE_LABELS[r] }}</option>
              </select>
            </label>
            <label v-if="linkForm.role === 'owner' || linkForm.role === 'co_owner'" class="block">
              <span class="cfg-label">% de propiedad</span>
              <input v-model.number="linkForm.ownershipPct" type="number" min="0" max="100" step="0.01" class="cfg-input" data-testid="contact-link-pct" >
            </label>
          </div>
          <template #footer>
            <button type="button" class="text-[13px] text-stone-500 hover:underline" @click="linkTarget = null">Cancelar</button>
            <button type="button" class="dash-btn-primary" data-testid="contact-link-save" @click="saveLinkProperty">Vincular</button>
          </template>
        </AdminCommsModal>
      </section>

      <!-- VISITAS / CITAS -->
      <section v-show="tab === 'visitas'" data-testid="contact-visitas">
        <p v-if="!data.visits?.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">Sin citas con esta persona.</p>
        <AdminPanel v-else :pad="false">
          <ul class="divide-y divide-line text-sm">
            <li v-for="v in data.visits" :key="v.id" class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div class="min-w-0">
                <p class="font-medium">{{ v.propertyName || 'Cita' }}</p>
                <p class="text-xs text-stone-400">{{ formatDateTime(v.scheduledAt) }} · {{ v.agentName || 'Sin comercial' }}</p>
              </div>
              <span class="flex items-center gap-2">
                <span v-if="v.interestLevel" class="text-[11px] text-stone-500">Interés {{ v.interestLevel }}/5</span>
                <AdminStatusPill :status="v.status" />
              </span>
            </li>
          </ul>
        </AdminPanel>
      </section>

      <!-- OFERTAS (como comprador o como vendedor) -->
      <section v-show="tab === 'ofertas'" data-testid="contact-ofertas">
        <p v-if="!offers.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">Sin ofertas.</p>
        <AdminPanel v-else :pad="false">
          <ul class="divide-y divide-line text-sm">
            <li v-for="o in offers" :key="o.id" class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div class="min-w-0">
                <p class="font-medium">{{ o.propertyName || `Propiedad #${o.propertyId}` }}</p>
                <p class="text-xs text-stone-400">{{ o.side === 'seller' ? 'Como vendedor' : 'Como comprador' }} · {{ dt.date(o.createdAt) }}</p>
              </div>
              <span class="flex items-center gap-2">
                <span class="tabular-nums">{{ o.currentAmount != null ? money(o.currentAmount) : o.amount != null ? money(o.amount) : '—' }}</span>
                <AdminStatusPill :status="o.status" />
              </span>
            </li>
          </ul>
        </AdminPanel>
      </section>

      <!-- TAREAS -->
      <section v-show="tab === 'tareas'" data-testid="contact-tareas">
        <form v-if="canEdit" class="mb-3 flex flex-wrap gap-2" @submit.prevent="addTask">
          <input v-model="taskTitle" class="cfg-input min-w-0 flex-1" placeholder="Nueva tarea para esta persona…" aria-label="Nueva tarea" data-testid="contact-task-title" >
          <input v-model="taskDue" type="date" class="cfg-input !w-40" aria-label="Fecha límite" >
          <button type="submit" class="dash-btn-primary" :disabled="!taskTitle.trim()" data-testid="contact-task-add">Añadir</button>
        </form>
        <p v-if="!tasks.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">Sin tareas.</p>
        <AdminPanel v-else :pad="false">
          <ul class="divide-y divide-line text-sm">
            <li v-for="t in tasks" :key="t.id" class="flex flex-wrap items-center justify-between gap-2 px-4 py-3" data-testid="contact-task-row">
              <div class="min-w-0">
                <p class="font-medium" :class="t.status === 'completed' ? 'text-stone-400 line-through' : ''">{{ t.title }}</p>
                <p class="text-xs text-stone-400">{{ t.dueAt ? `Vence ${dt.date(t.dueAt)}` : 'Sin fecha' }}</p>
              </div>
              <AdminStatusPill :status="t.status" />
            </li>
          </ul>
        </AdminPanel>
      </section>

      <!-- DOCUMENTOS: los de sus propiedades que puede ver (propietario) o le han concedido -->
      <section v-show="tab === 'documentos'" data-testid="contact-documentos">
        <p v-if="!data.documents?.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">
          Sin documentos. Los documentos se suben en la ficha de cada propiedad (paso «Documentos») y aquí aparecen los de las propiedades de esta persona que puede ver.
        </p>
        <AdminPanel v-else :pad="false">
          <ul class="divide-y divide-line text-sm">
            <li v-for="d in data.documents" :key="d.id" class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span class="min-w-0 font-medium">{{ d.title }}</span>
              <span class="text-[11px] text-stone-500">{{ d.docTypeLabel }} · {{ d.visibilityLabel }}</span>
            </li>
          </ul>
        </AdminPanel>
      </section>

      <!-- NOTAS -->
      <section v-show="tab === 'notas'" data-testid="contact-notas">
        <NotesPanel entity-type="contact" :entity-id="Number(route.params.id)" :can-edit="canEdit" @count="notesCount = $event" />
      </section>

      <!-- ACTIVIDAD -->
      <section v-show="tab === 'actividad'" data-testid="contact-actividad">
        <p v-if="!activity.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">Sin actividad registrada.</p>
        <ol v-else class="relative space-y-3 border-l border-line pl-4">
          <li v-for="a in activity" :key="a.id" class="text-sm">
            <span class="absolute -left-1 mt-1.5 h-2 w-2 rounded-full bg-stone-300" />
            <p class="font-medium">{{ renderActivity(a).title }}</p>
            <p v-if="renderActivity(a).detail" class="text-stone-600">{{ renderActivity(a).detail }}</p>
            <p class="text-[11px] text-stone-400">{{ formatDateTime(a.createdAt) }}</p>
          </li>
        </ol>
      </section>

      <!-- LEADS -->
      <section v-show="tab === 'leads'">
        <p v-if="!data.leads.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">
          Esta persona no tiene ningún lead.
        </p>
        <AdminPanel v-else :pad="false">
          <ul class="divide-y divide-line text-sm">
            <li v-for="l in data.leads" :key="l.id" class="flex items-center justify-between px-4 py-3">
              <div>
                <p class="font-medium">{{ l.propertyName || 'Consulta general' }}</p>
                <p class="text-xs text-stone-400">{{ l.source }} · {{ dt.date(l.createdAt) }}</p>
              </div>
              <AdminStatusPill v-if="l.status" :status="l.status" />
            </li>
          </ul>
        </AdminPanel>
      </section>

      <!-- COMUNICACIONES (FASE 29 §140) — de todos sus leads y clientes, por canal -->
      <section v-if="tab === 'comunicaciones'" data-testid="contact-comunicaciones">
        <AdminCommsRelatedCommunications :conversations="data.communications?.conversations" :calls="data.communications?.calls" :emails="data.communications?.emails" />
      </section>
      <section v-else-if="tab === 'emails'" data-testid="contact-emails">
        <AdminCommsRelatedCommunications :emails="data.communications?.emails" />
      </section>
      <section v-else-if="tab === 'whatsapp'" data-testid="contact-whatsapp">
        <AdminCommsRelatedCommunications :conversations="data.communications?.conversations" />
      </section>
      <section v-else-if="tab === 'llamadas'" data-testid="contact-llamadas">
        <AdminCommsRelatedCommunications :calls="data.communications?.calls" />
      </section>

      <!-- FICHA -->
      <section v-show="tab === 'ficha'">
        <AdminPanel title="Datos del contacto">
          <dl class="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt class="text-stone-400">Nombre</dt><dd>{{ data.contact.name }}</dd></div>
            <div><dt class="text-stone-400">Tipo</dt><dd>{{ data.contact.kind === 'company' ? 'Empresa' : 'Persona' }}</dd></div>
            <div><dt class="text-stone-400">Email</dt><dd>{{ data.contact.email || '—' }}</dd></div>
            <div><dt class="text-stone-400">Teléfono</dt><dd>{{ data.contact.phone || '—' }}</dd></div>
            <div><dt class="text-stone-400">Alta</dt><dd>{{ dt.date(data.contact.createdAt) }}</dd></div>
            <div v-if="data.clients.length"><dt class="text-stone-400">Ficha de cliente</dt><dd>{{ data.clients.map((c: any) => c.type).join(', ') }}</dd></div>
          </dl>
        </AdminPanel>

        <!-- Deduplicación (FASE 14): sólo detecta y ofrece fusionar — nunca automático. -->
        <AdminPanel title="Posibles duplicados" class="mt-4">
          <button v-if="!dupChecked" type="button" class="dash-btn-primary" :disabled="dupLoading" @click="checkDuplicates">
            {{ dupLoading ? 'Buscando…' : 'Buscar duplicados' }}
          </button>
          <template v-else>
            <p v-if="!duplicates.length" class="text-sm text-stone-500">No se ha encontrado ningún posible duplicado dentro de tu organización.</p>
            <ul v-else class="space-y-2">
              <li v-for="c in duplicates" :key="c.contactId" class="flex items-center justify-between gap-3 rounded-lg border border-line p-3 text-sm">
                <div class="min-w-0">
                  <p class="font-medium">{{ c.name }}</p>
                  <p class="text-xs text-stone-400">{{ c.email || c.phone || '—' }} · coincide por {{ c.matchedOn }} ({{ c.level === 'exact' ? 'exacto' : 'posible' }})</p>
                </div>
                <button type="button" class="shrink-0 font-medium text-ink hover:underline" @click="openMergePreview(c.contactId)">Revisar y fusionar</button>
              </li>
            </ul>
          </template>

          <!-- Preview de fusión: nunca se fusiona sin ver antes qué se pierde/gana. -->
          <div v-if="mergePreview" class="mt-4 rounded-xl border border-line bg-stone-50 p-4">
            <p class="text-sm font-medium">Fusionar «{{ mergePreview.duplicate.name }}» en «{{ mergePreview.master.name }}»</p>
            <p class="mt-1 text-xs text-stone-500">
              Se moverán {{ mergePreview.relations.buyerRequirements }} necesidad(es), {{ mergePreview.relations.leads }} lead(s) y
              {{ mergePreview.relations.clients }} ficha(s) de cliente. «{{ mergePreview.duplicate.name }}» quedará archivado, nunca borrado.
            </p>
            <div v-if="mergePreview.conflicts.length" class="mt-3 space-y-2">
              <p class="text-xs font-medium text-stone-600">Estos campos no coinciden — elige cuál se queda:</p>
              <div v-for="conflict in mergePreview.conflicts" :key="conflict.field" class="text-xs">
                <p class="mb-1 capitalize text-stone-500">{{ conflict.field }}</p>
                <label class="mr-4 inline-flex items-center gap-1.5">
                  <input v-model="mergeFields[conflict.field]" type="radio" :value="conflict.masterValue" > {{ conflict.masterValue }} (actual)
                </label>
                <label class="inline-flex items-center gap-1.5">
                  <input v-model="mergeFields[conflict.field]" type="radio" :value="conflict.duplicateValue" > {{ conflict.duplicateValue }} (duplicado)
                </label>
              </div>
            </div>
            <div class="mt-3 flex items-center gap-2">
              <button type="button" class="dash-btn-primary" :disabled="merging" @click="confirmMerge">{{ merging ? 'Fusionando…' : 'Confirmar fusión' }}</button>
              <button type="button" class="text-xs font-medium text-stone-500 hover:underline" @click="mergePreview = null">Cancelar</button>
            </div>
          </div>
        </AdminPanel>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  CONTACT_ROLE_LABELS,
  CONTACT_SOURCE_LABELS,
  CONTACT_STATUS_LABELS,
  LANGUAGE_LABELS,
  NEXT_ACTION_LABELS,
  PROPERTY_CONTACT_ROLES,
  PROPERTY_CONTACT_ROLE_LABELS,
  type ContactRole,
  type PropertyContactRole,
} from '~/utils/crmCatalog'
import { propertyTypeLabel } from '~/utils/propertySheet'
import { formatDateTime } from '~/composables/useClientConfig'
import { renderActivity } from '~/composables/useActivityRenderer'
import NotesPanel from '~/components/admin/notes/NotesPanel.vue'
import ContactEditModal from '~/components/admin/contacts/ContactEditModal.vue'

definePageMeta({ layout: 'admin', middleware: 'admin' })
const route = useRoute()
const dt = useDash()
const toast = useToast()
const { canWrite } = useAdminPermissions()
const canEdit = computed(() => canWrite('crm'))
const contactId = Number(route.params.id)

const PROPERTY_TYPES = ['Apartment', 'Villa', 'Townhouse', 'Penthouse', 'Studio']
const FEATURES = [
  { key: 'terrace', label: 'Terraza' },
  { key: 'elevator', label: 'Ascensor' },
  { key: 'garage', label: 'Garaje' },
  { key: 'pool', label: 'Piscina' },
  { key: 'garden', label: 'Jardín' },
]

const { data, refresh } = await useFetch<any>(`/api/admin/saas/contacts/${route.params.id}`)
useHead({ title: () => `${data.value?.contact?.name || 'Contacto'} — M&M Real Estate` })

// Pestañas del CRM 360 (FASE 9). «Comunicaciones» junta los tres canales;
// Emails, WhatsApp y Llamadas los separan.
const TAB_KEYS = ['resumen', 'necesidades', 'propiedades', 'leads', 'visitas', 'ofertas', 'comunicaciones', 'emails', 'whatsapp', 'llamadas', 'tareas', 'documentos', 'notas', 'actividad', 'ficha'] as const
type ContactTab = (typeof TAB_KEYS)[number]
const tab = ref<ContactTab>((TAB_KEYS as readonly string[]).includes(String(route.query.tab)) ? (route.query.tab as ContactTab) : 'resumen')
const notesCount = ref(0)
const tabs = computed(() => {
  const comms = data.value?.communications
  return [
    { key: 'resumen' as const, label: 'Resumen', count: 0 },
    { key: 'necesidades' as const, label: 'Necesidades', count: data.value?.requirements?.length || 0 },
    { key: 'propiedades' as const, label: 'Propiedades', count: data.value?.properties?.length || 0 },
    { key: 'leads' as const, label: 'Leads', count: data.value?.leads?.length || 0 },
    { key: 'visitas' as const, label: 'Visitas', count: data.value?.visits?.length || 0 },
    { key: 'ofertas' as const, label: 'Ofertas', count: offers.value.length },
    { key: 'comunicaciones' as const, label: 'Comunicaciones', count: (comms?.conversations?.length || 0) + (comms?.calls?.length || 0) + (comms?.emails?.length || 0) },
    { key: 'emails' as const, label: 'Emails', count: comms?.emails?.length || 0 },
    { key: 'whatsapp' as const, label: 'WhatsApp', count: comms?.conversations?.length || 0 },
    { key: 'llamadas' as const, label: 'Llamadas', count: comms?.calls?.length || 0 },
    { key: 'tareas' as const, label: 'Tareas', count: tasks.value.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length },
    { key: 'documentos' as const, label: 'Documentos', count: data.value?.documents?.length || 0 },
    { key: 'notas' as const, label: 'Notas', count: notesCount.value },
    { key: 'actividad' as const, label: 'Actividad', count: 0 },
    { key: 'ficha' as const, label: 'Ficha y duplicados', count: 0 },
  ]
})

// --- Cabecera y edición ------------------------------------------------------
const editing = ref(false)
const whatsappNumber = computed(() => String(data.value?.contact?.whatsapp || data.value?.contact?.phone || '').replace(/[^\d]/g, ''))
async function onSaved() {
  editing.value = false
  await refresh()
}

// --- Ofertas, tareas y actividad (listados propios, por contacto) -------------
const offers = ref<any[]>([])
const tasks = ref<any[]>([])
const activity = ref<any[]>([])
async function loadRelated() {
  const [asBuyer, asSeller, taskRes, act] = await Promise.all([
    $fetch<{ rows: any[] }>('/api/admin/saas/offers', { query: { buyerContactId: contactId } }).catch(() => ({ rows: [] })),
    $fetch<{ rows: any[] }>('/api/admin/saas/offers', { query: { sellerContactId: contactId } }).catch(() => ({ rows: [] })),
    $fetch<{ rows: any[] }>('/api/admin/saas/tasks', { query: { contactId } }).catch(() => ({ rows: [] })),
    $fetch<any>('/api/admin/saas/activity', { query: { contactId } }).catch(() => ({ rows: [] })),
  ])
  offers.value = [...asBuyer.rows.map((o: any) => ({ ...o, side: 'buyer' })), ...asSeller.rows.map((o: any) => ({ ...o, side: 'seller' }))]
  tasks.value = taskRes.rows
  activity.value = Array.isArray(act) ? act : act?.rows || act?.items || []
}
onMounted(loadRelated)

const summaryCards = computed(() => [
  { label: 'Necesidades activas', value: (data.value?.requirements || []).filter((r: any) => r.status === 'active').length },
  { label: 'Leads', value: data.value?.leads?.length || 0 },
  { label: 'Propiedades', value: data.value?.properties?.length || 0 },
  { label: 'Citas', value: data.value?.visits?.length || 0 },
  { label: 'Ofertas', value: offers.value.length },
  { label: 'Tareas abiertas', value: tasks.value.filter((t) => t.status === 'open' || t.status === 'in_progress').length },
])
const upcomingVisits = computed(() => {
  const nowIso = new Date().toISOString().slice(0, 16).replace('T', ' ')
  return (data.value?.visits || []).filter((v: any) => v.scheduledAt >= nowIso && v.status !== 'cancelled').slice(0, 5)
})

const taskTitle = ref('')
const taskDue = ref('')
async function addTask() {
  try {
    await $fetch('/api/admin/saas/tasks', { method: 'POST', body: { title: taskTitle.value.trim(), type: 'follow_up', contactId, dueAt: taskDue.value ? `${taskDue.value} 09:00:00` : null } })
    taskTitle.value = ''
    taskDue.value = ''
    await loadRelated()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo crear la tarea')
  }
}

// --- Vincular a una propiedad (PropertyContact) -------------------------------
const pickingProperty = ref(false)
const linkTarget = ref<any>(null)
const linkForm = reactive<{ role: PropertyContactRole; ownershipPct: number | null }>({ role: 'owner', ownershipPct: null })
function openLinkProperty(p: any) {
  pickingProperty.value = false
  linkTarget.value = p
  linkForm.role = 'owner'
  linkForm.ownershipPct = null
}
async function saveLinkProperty() {
  try {
    await $fetch('/api/admin/property-contacts', {
      method: 'POST',
      body: { propertyKind: linkTarget.value.kind, propertyId: linkTarget.value.id, contactId, role: linkForm.role, ownershipPct: linkForm.role === 'owner' || linkForm.role === 'co_owner' ? linkForm.ownershipPct : null },
    })
    linkTarget.value = null
    await refresh()
    toast.success('Vinculado a la propiedad')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo vincular')
  }
}

const showNew = ref(false)
const saving = ref(false)
const formError = ref('')
const zonesText = ref('')
const form = reactive<any>({
  title: '',
  operation: 'sale',
  propertyTypes: [] as string[],
  priceMin: null,
  priceMax: null,
  bedroomsMin: null,
  areaMin: null,
  urgency: null,
  mortgageStatus: null,
  features: {} as Record<string, boolean>,
  importances: {} as Record<string, string>,
})

async function createRequirement() {
  formError.value = ''
  saving.value = true
  try {
    const desiredZones = zonesText.value
      .split(',')
      .map((z) => z.trim())
      .filter(Boolean)
      .map((label) => ({ label }))

    await $fetch('/api/admin/saas/buyer-requirements', {
      method: 'POST',
      body: { ...form, contactId: Number(route.params.id), desiredZones },
    })
    showNew.value = false
    zonesText.value = ''
    Object.assign(form, { title: '', propertyTypes: [], priceMin: null, priceMax: null, bedroomsMin: null, areaMin: null, urgency: null, mortgageStatus: null, features: {}, importances: {} })
    await refresh()
    toast.success('Necesidad guardada')
  } catch (err: any) {
    formError.value = err?.data?.statusMessage || 'No se pudo guardar'
  } finally {
    saving.value = false
  }
}

async function toggleBudget(r: any) {
  try {
    await $fetch(`/api/admin/saas/buyer-requirements/${r.id}/validate-budget`, {
      method: 'POST',
      body: { validated: !r.budgetValidated },
    })
    await refresh()
  } catch {
    toast.error('No se pudo actualizar')
  }
}

/** El estado de la necesidad (activa/pausada/cubierta/archivada) — no confundir con el estado comercial de un match concreto. */
async function setRequirementStatus(r: any, status: string) {
  const previous = r.status
  r.status = status
  try {
    await $fetch(`/api/admin/saas/buyer-requirements/${r.id}`, { method: 'PATCH', body: { status } })
  } catch (err: any) {
    r.status = previous
    toast.error(err?.data?.statusMessage || 'No se pudo actualizar el estado')
  }
}

// --- Matching (FASE 11) ----------------------------------------------------
// Consultar compatibilidades no guarda nada: el match se persiste sólo cuando
// alguien decide algo sobre él (seleccionar / descartar).
const matches = reactive<Record<number, any>>({})
const matchLoading = reactive<Record<number, boolean>>({})

function money(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

async function searchProperties(r: any) {
  if (matches[r.id]) {
    matches[r.id] = null
    return
  }
  matches[r.id] = { results: [] }
  matchLoading[r.id] = true
  try {
    matches[r.id] = await $fetch<any>(`/api/admin/saas/matching/requirement/${r.id}`)
  } catch {
    matches[r.id] = null
    toast.error('No se pudo buscar propiedades')
  } finally {
    matchLoading[r.id] = false
  }
}

async function decide(r: any, m: any, status: 'selected' | 'discarded') {
  // Descartar pide motivo: un match descartado sin explicación vuelve a
  // aparecer mañana sin que nadie recuerde por qué se cayó.
  let discardedReason: string | undefined
  if (status === 'discarded') {
    discardedReason = window.prompt('Motivo del descarte (opcional)') || undefined
  }
  try {
    const saved = await $fetch<any>('/api/admin/saas/matching/matches', {
      method: 'POST',
      body: { buyerRequirementId: r.id, propertyId: m.property.id, propertyKind: m.propertyKind, status, discardedReason },
    })
    m.persisted = { id: saved.id, status: saved.status, discardedReason: saved.discardedReason }
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo guardar la decisión')
  }
}

function statusClass(s: string) {
  return { active: 'bg-emerald-100 text-emerald-700', paused: 'bg-amber-100 text-amber-700', fulfilled: 'bg-sky-100 text-sky-700', archived: 'bg-stone-200 text-stone-500' }[s] || 'bg-stone-100 text-stone-600'
}

// --- Deduplicación de Contact (FASE 14) -------------------------------------
const dupChecked = ref(false)
const dupLoading = ref(false)
const duplicates = ref<any[]>([])

async function checkDuplicates() {
  dupLoading.value = true
  try {
    duplicates.value = (
      await $fetch<any>('/api/admin/saas/contacts/check-duplicates', {
        method: 'POST',
        body: { name: data.value.contact.name, email: data.value.contact.email, phone: data.value.contact.phone, excludeContactId: Number(route.params.id) },
      })
    ).duplicates
    dupChecked.value = true
  } catch {
    toast.error('No se pudo buscar duplicados')
  } finally {
    dupLoading.value = false
  }
}

const mergePreview = ref<any>(null)
const mergeFields = reactive<Record<string, string>>({})
const merging = ref(false)

async function openMergePreview(duplicateId: number) {
  try {
    mergePreview.value = await $fetch<any>('/api/admin/saas/contacts/merge-preview', {
      query: { masterId: Number(route.params.id), duplicateId },
    })
    Object.keys(mergeFields).forEach((k) => { mergeFields[k] = undefined as any })
    for (const c of mergePreview.value.conflicts) mergeFields[c.field] = c.masterValue
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo cargar la comparación')
  }
}

async function confirmMerge() {
  if (!mergePreview.value) return
  merging.value = true
  try {
    await $fetch('/api/admin/saas/contacts/merge', {
      method: 'POST',
      body: { masterId: Number(route.params.id), duplicateId: mergePreview.value.duplicate.id, fields: { ...mergeFields } },
    })
    mergePreview.value = null
    dupChecked.value = false
    duplicates.value = []
    await refresh()
    toast.success('Contactos fusionados')
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo fusionar')
  } finally {
    merging.value = false
  }
}
</script>

<style scoped>
.cfg-label {
  @apply mb-1.5 block text-[12px] font-medium text-stone-600;
}
.cfg-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white transition hover:bg-black disabled:opacity-50;
}
</style>
