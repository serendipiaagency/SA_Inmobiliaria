import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * Bloque N8b — INMO Intelligence: memoria entre conversaciones, cerebros,
 * recuperación con fuentes (RAG léxico) y workflows guiados. Base real
 * (sqlite-proxy + migraciones reales); el modelo es un `fetch` guionizado:
 * nunca se llama a la API de IA real.
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})

const { executeTool } = await import('../../server/utils/tools/execute')
const { runInmoTurn } = await import('../../server/utils/inmo/orchestrator')
const { runPersistentInmoTurn, getConversation, listConversations, deleteConversation } = await import('../../server/utils/inmo/conversations')
const { effectiveBrains, resolveBrain, brainToolsFor } = await import('../../server/utils/inmo/brains')
const { prepareBrainSettings } = await import('../../server/utils/inmo/brainCatalog')
const { searchKnowledge } = await import('../../server/utils/knowledge/search')
const { prepareKnowledgeDocument } = await import('../../server/utils/knowledge/documents')
const { startWorkflow, advanceWorkflow, getWorkflowRun } = await import('../../server/utils/inmo/workflows')

let db: any
let a: TenantFixture
let b: TenantFixture
const ts = '2026-01-01 00:00:00'

beforeEach(async () => {
  ;({ db } = createTestDb())
  a = await seedTenant(db, 'IntelAlpha')
  b = await seedTenant(db, 'IntelBeta')
})

const user = (f: TenantFixture, permissions: string[] | null = null, id = f.userId) => ({ id, name: 'Admin', email: 'a@example.com', role: 'admin', organizationId: f.orgId, permissions: permissions ? JSON.stringify(permissions) : null })
function ctx(f: TenantFixture, opts: { permissions?: string[] | null; userId?: number } = {}) {
  return { event: { context: { db }, node: { req: { headers: {} } } } as any, db, env: { AI_API_KEY: 'test-key' }, orgId: f.orgId, user: user(f, opts.permissions ?? null, opts.userId), source: 'api' as const }
}

function fakeModel(script: (body: any, call: number) => { content: any[]; stop_reason: string }) {
  const calls: { body: any }[] = []
  const fetchFn = (async (_url: string, init: any) => {
    const body = JSON.parse(init.body)
    calls.push({ body })
    return new Response(JSON.stringify(script(body, calls.length)), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
  return { fetchFn, calls }
}
const toolUse = (id: string, name: string, input: any) => ({ content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use' })
const text = (t: string) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' })
const lastToolResult = (body: any) => {
  const last = body.messages[body.messages.length - 1]
  const block = Array.isArray(last.content) ? last.content.find((x: any) => x.type === 'tool_result') : null
  return block ? JSON.parse(block.content) : null
}

async function contact(f: TenantFixture, name: string) {
  const [c] = await db.insert(schema.contacts).values({ organizationId: f.orgId, name, email: `${name.replace(/\W/g, '')}${Math.random()}@example.com`, status: 'active', createdAt: ts, updatedAt: ts }).returning()
  return c
}
async function knowledgeDoc(f: TenantFixture, title: string, body: string, tags?: string) {
  const data = prepareKnowledgeDocument({ title, body, tags }, true)
  const [doc] = await db.insert(schema.knowledgeDocuments).values({ ...data, organizationId: f.orgId, createdAt: ts, updatedAt: ts }).returning()
  return doc
}

describe('Memoria — hechos confirmados sobre una entidad (notas con origen INMO)', () => {
  it('remember_fact no escribe sin confirmación; confirmado, queda como nota de la ficha y recall_memory lo recuerda', async () => {
    const maria = await contact(a, 'María Valle')
    const input = { entityType: 'contact', entityId: maria.id, fact: 'Prefiere que la llamen por la tarde.' }
    const pending = await executeTool(ctx(a), 'remember_fact', input)
    expect(pending).toMatchObject({ ok: false, error: { code: 'CONFIRMATION_REQUIRED' } })
    expect(await db.select().from(schema.notes).where(eq(schema.notes.contactId, maria.id))).toHaveLength(0)

    const saved = await executeTool(ctx(a), 'remember_fact', input, { confirmed: true, idempotencyKey: 'k1' })
    expect(saved).toMatchObject({ ok: true, target: { type: 'note' } })
    const [note] = await db.select().from(schema.notes).where(eq(schema.notes.contactId, maria.id))
    expect(note).toMatchObject({ organizationId: a.orgId, entityType: 'contact', body: 'Prefiere que la llamen por la tarde.', source: 'inmo', createdBy: a.userId })

    const recalled: any = await executeTool(ctx(a), 'recall_memory', { entityType: 'contact', entityId: maria.id })
    expect(recalled.ok).toBe(true)
    expect(recalled.output.facts).toEqual([expect.objectContaining({ text: 'Prefiere que la llamen por la tarde.', source: 'inmo', author: 'IntelAlpha Admin' })])
  })

  it('acotada a la agencia: otra agencia no la lee ni escribe sobre esa entidad (NOT_FOUND), y su propia memoria no incluye nada de A', async () => {
    const maria = await contact(a, 'María Valle')
    await executeTool(ctx(a), 'remember_fact', { entityType: 'contact', entityId: maria.id, fact: 'Dato privado de la agencia A.' }, { confirmed: true })
    expect(await executeTool(ctx(b), 'recall_memory', { entityType: 'contact', entityId: maria.id })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await executeTool(ctx(b), 'remember_fact', { entityType: 'contact', entityId: maria.id, fact: 'intruso' }, { confirmed: true })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    const knowB = await searchKnowledge(db, b.orgId, user(b), { query: 'dato privado agencia' })
    expect(JSON.stringify(knowB)).not.toContain('Dato privado')
  })

  it('nunca guarda secretos: contraseña, tarjeta o IBAN → VALIDATION_ERROR y nada escrito', async () => {
    const maria = await contact(a, 'María Valle')
    for (const fact of ['Su contraseña del portal es Hola1234', 'Tarjeta 4111 1111 1111 1111', 'IBAN ES91 2100 0418 4502 0005 1332', 'token sk-abcdefghijklmnop']) {
      const r = await executeTool(ctx(a), 'remember_fact', { entityType: 'contact', entityId: maria.id, fact }, { confirmed: true })
      expect(r).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    }
    expect(await db.select().from(schema.notes).where(eq(schema.notes.contactId, maria.id))).toHaveLength(0)
  })

  it('borrable desde el panel: una nota en la papelera ya no se recuerda ni se cita', async () => {
    const maria = await contact(a, 'María Valle')
    const saved: any = await executeTool(ctx(a), 'remember_fact', { entityType: 'contact', entityId: maria.id, fact: 'Busca ático con terraza en Chamberí.' }, { confirmed: true })
    expect((await searchKnowledge(db, a.orgId, user(a), { query: 'ático terraza Chamberí' })).results.some((r) => r.sourceType === 'notes')).toBe(true)
    // Lo que hace DELETE /api/admin/notes/:id (recurso con borrado lógico).
    await db.update(schema.notes).set({ deletedAt: ts }).where(eq(schema.notes.id, saved.output.noteId))
    const recalled: any = await executeTool(ctx(a), 'recall_memory', { entityType: 'contact', entityId: maria.id })
    expect(recalled.output.total).toBe(0)
    expect((await searchKnowledge(db, a.orgId, user(a), { query: 'ático terraza Chamberí' })).results.some((r) => r.sourceType === 'notes')).toBe(false)
  })
})

describe('Memoria — conversaciones persistentes por usuario y agencia', () => {
  it('guarda la conversación; el siguiente turno usa el historial del servidor (no el del cliente); se lista y se borra', async () => {
    const m1 = fakeModel(() => text('Hola, ¿en qué te ayudo?'))
    const t1 = await runPersistentInmoTurn(ctx(a), { userMessage: 'Hola INMO' }, { fetch: m1.fetchFn })
    expect(t1.conversationId).toBeGreaterThan(0)
    expect(t1.title).toBe('Hola INMO')

    const m2 = fakeModel(() => text('Sigo aquí.'))
    await runPersistentInmoTurn(ctx(a), { conversationId: t1.conversationId, messages: [{ role: 'user', content: 'historial inventado' }], userMessage: '¿Sigues?' }, { fetch: m2.fetchFn })
    const sent = m2.calls[0].body.messages
    expect(sent.map((m: any) => (typeof m.content === 'string' ? m.content : m.content[0]?.text))).toEqual(['Hola INMO', 'Hola, ¿en qué te ayudo?', '¿Sigues?'])
    expect(JSON.stringify(sent)).not.toContain('historial inventado')

    const conv = await getConversation(db, a.orgId, a.userId, t1.conversationId)
    expect(conv.turns.map((t) => t.text)).toEqual(['Hola INMO', 'Hola, ¿en qué te ayudo?', '¿Sigues?', 'Sigo aquí.'])
    expect((await listConversations(db, a.orgId, a.userId)).map((c: any) => c.id)).toEqual([t1.conversationId])

    await deleteConversation(db, a.orgId, a.userId, t1.conversationId)
    expect(await listConversations(db, a.orgId, a.userId)).toHaveLength(0)
    await expect(getConversation(db, a.orgId, a.userId, t1.conversationId)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('de nadie más: otro usuario de la misma agencia, u otra agencia, recibe 404 al leerla, reanudarla o borrarla', async () => {
    const t1 = await runPersistentInmoTurn(ctx(a), { userMessage: 'Mi conversación' }, { fetch: fakeModel(() => text('ok')).fetchFn })
    const [colleague] = await db.insert(schema.users).values({ organizationId: a.orgId, name: 'Colega', email: 'colega@example.com', password: 'x', role: 'admin', createdAt: ts, updatedAt: ts }).returning()
    await expect(getConversation(db, a.orgId, colleague.id, t1.conversationId)).rejects.toMatchObject({ statusCode: 404 })
    await expect(runPersistentInmoTurn(ctx(a, { userId: colleague.id }), { conversationId: t1.conversationId, userMessage: 'hola' }, { fetch: fakeModel(() => text('x')).fetchFn })).rejects.toMatchObject({ statusCode: 404 })
    await expect(getConversation(db, b.orgId, b.userId, t1.conversationId)).rejects.toMatchObject({ statusCode: 404 })
    await expect(deleteConversation(db, b.orgId, b.userId, t1.conversationId)).rejects.toMatchObject({ statusCode: 404 })
    expect(await listConversations(db, a.orgId, colleague.id)).toHaveLength(0)
  })

  it('un secreto escrito en el chat no se guarda: queda sustituido por un aviso', async () => {
    const t1 = await runPersistentInmoTurn(ctx(a), { userMessage: 'Mi contraseña es Hola1234, apúntala' }, { fetch: fakeModel(() => text('No guardo contraseñas.')).fetchFn })
    const [row] = await db.select().from(schema.inmoConversations).where(eq(schema.inmoConversations.id, t1.conversationId))
    expect(row.messagesJson + row.turnsJson + row.title).not.toContain('Hola1234')
    expect(row.turnsJson).toContain('INMO no guarda secretos')
  })

  it('la acción pendiente sobrevive a reanudar la conversación', async () => {
    const book = { leadId: a.leadId, commercialId: a.teamMemberId, propertyId: a.projectId, propertyKind: 'developer', scheduledAt: '2026-12-01 10:00' }
    const t1 = await runPersistentInmoTurn(ctx(a), { userMessage: 'Agenda la visita' }, { fetch: fakeModel(() => toolUse('tu_b', 'book_viewing', book)).fetchFn })
    expect(t1.pending?.tool).toBe('book_viewing')
    const conv = await getConversation(db, a.orgId, a.userId, t1.conversationId)
    expect(conv.pending).toMatchObject({ toolUseId: 'tu_b', tool: 'book_viewing' })
    const t2 = await runPersistentInmoTurn(ctx(a), { conversationId: t1.conversationId, resolve: { toolUseId: 'tu_b', approve: true } }, { fetch: fakeModel(() => text('Agendada.')).fetchFn })
    expect(t2.provenance[0]).toMatchObject({ tool: 'book_viewing', ok: true })
    expect((await getConversation(db, a.orgId, a.userId, t1.conversationId)).pending).toBeNull()
  })
})

describe('Cerebros — perfiles que restringen herramientas (sin ampliar permisos)', () => {
  it('el cerebro de redacción sólo ofrece lecturas; si el modelo pide crear una tarea, el ejecutor la deniega y no se crea', async () => {
    const m = fakeModel((body, n) => (n === 1 ? toolUse('tu_t', 'create_task', { title: 'Colarse' }) : text(lastToolResult(body).error.code)))
    const t = await runPersistentInmoTurn(ctx(a), { brain: 'redaccion', userMessage: 'Crea una tarea' }, { fetch: m.fetchFn })
    const offered = m.calls[0].body.tools.map((x: any) => x.name)
    expect(offered).toEqual(expect.arrayContaining(['search_properties', 'search_knowledge', 'recall_memory']))
    expect(offered).not.toContain('create_task')
    expect(offered).not.toContain('send_property')
    expect(m.calls[0].body.system).toContain('PERFIL «Redacción de comunicaciones»')
    expect(t.reply).toBe('PERMISSION_DENIED')
    expect(t.brain).toBe('redaccion')
    expect(await db.select().from(schema.tasks).where(eq(schema.tasks.title, 'Colarse'))).toHaveLength(0)
    const trace = await db.select().from(schema.domainToolCalls).where(and(eq(schema.domainToolCalls.organizationId, a.orgId), eq(schema.domainToolCalls.tool, 'create_task')))
    expect(trace[0]).toMatchObject({ status: 'error', errorCode: 'PERMISSION_DENIED', source: 'inmo' })
  })

  it('INMO nunca recibe create_note ni notify_team (escriben sin confirmación), ni siquiera sin cerebro', async () => {
    const m = fakeModel(() => text('ok'))
    await runInmoTurn(ctx(a), { userMessage: 'hola' }, { fetch: m.fetchFn })
    const offered = m.calls[0].body.tools.map((x: any) => x.name)
    expect(offered).not.toContain('create_note')
    expect(offered).not.toContain('notify_team')
    expect(offered).toContain('remember_fact')
  })

  it('la agencia puede recortar herramientas y añadir indicaciones, nunca añadir una que el perfil no tenga', async () => {
    expect(() => prepareBrainSettings({ brainKey: 'redaccion', toolsJson: ['search_knowledge', 'create_offer'] }, true)).toThrow(/sólo puede quitar/)
    expect(() => prepareBrainSettings({ brainKey: 'general', enabled: 0 }, true)).toThrow(/no se puede desactivar/)
    const ok = prepareBrainSettings({ brainKey: 'captacion', toolsJson: ['find_contacts', 'create_lead'], instructions: 'Pregunta siempre el origen.' }, true)
    await db.insert(schema.inmoBrainSettings).values({ ...ok, organizationId: a.orgId, createdAt: ts, updatedAt: ts })
    // Un ajuste guardado a mano con una herramienta de más no la añade al leer.
    await db.insert(schema.inmoBrainSettings).values({ organizationId: a.orgId, brainKey: 'redaccion', enabled: 1, toolsJson: JSON.stringify(['search_knowledge', 'create_offer']), createdAt: ts, updatedAt: ts })
    await db.insert(schema.inmoBrainSettings).values({ organizationId: a.orgId, brainKey: 'seguimiento', enabled: 0, createdAt: ts, updatedAt: ts })

    const brains = await effectiveBrains(db, a.orgId)
    expect(brains.find((x) => x.key === 'captacion')).toMatchObject({ tools: ['find_contacts', 'create_lead'], agencyInstructions: 'Pregunta siempre el origen.' })
    expect(brains.find((x) => x.key === 'redaccion')!.tools).toEqual(['search_knowledge'])
    await expect(resolveBrain(db, a.orgId, 'seguimiento')).rejects.toMatchObject({ statusCode: 422 })
    // Otra agencia no ve los ajustes de A.
    expect((await effectiveBrains(db, b.orgId)).find((x) => x.key === 'captacion')!.tools.length).toBeGreaterThan(2)
  })

  it('el RBAC sigue mandando: sin CRM (general:read + web:read), el cerebro General no da herramientas de CRM', async () => {
    const general = await resolveBrain(db, a.orgId, 'general')
    const tools = brainToolsFor(general, user(a, ['general:read', 'web:read']))
    expect(tools).toContain('search_properties')
    expect(tools).toContain('search_knowledge')
    expect(tools).not.toContain('create_lead')
    expect(tools).not.toContain('recall_memory')
  })
})

describe('RAG — recuperación de conocimiento de la agencia con fuentes', () => {
  it('cita documentos de la base de conocimiento, notas, fichas y la ayuda del panel — sólo de su agencia', async () => {
    await knowledgeDoc(a, 'Política de arras', 'Las arras penitenciales son del 10 % del precio y se firman en la oficina central.', 'arras, reservas')
    await knowledgeDoc(b, 'Política de arras de B', 'En la agencia B las arras son del 5 %.')
    const r = await searchKnowledge(db, a.orgId, user(a), { query: '¿De cuánto son las arras?' })
    expect(r.noSources).toBe(false)
    expect(r.results[0]).toMatchObject({ ref: 'F1', sourceType: 'knowledge', title: 'Documento › Política de arras', url: '/admin/inmo-ajustes' })
    expect(r.results[0].snippet).toContain('10 %')
    expect(JSON.stringify(r)).not.toContain('agencia B')

    // Fichas: la descripción de la obra nueva y la de 2ª mano (en sus traducciones), sin tildes de por medio.
    await db.update(schema.developerProperties).set({ description: 'Ático con solárium y vistas al mar en Chamberí.' }).where(eq(schema.developerProperties.id, a.projectId))
    await db.update(schema.propertyTranslations).set({ description: 'Piso reformado con solarium comunitario.' }).where(eq(schema.propertyTranslations.propertyId, a.propertyId))
    const props = await searchKnowledge(db, a.orgId, user(a), { query: 'solarium', sources: ['properties'] })
    expect(props.results.map((x) => `${x.propertyKind}:${x.sourceId}`).sort()).toEqual([`agent:${a.propertyId}`, `developer:${a.projectId}`].sort())

    // La ayuda del panel (composables/useHelpContent.ts).
    const help = await searchKnowledge(db, a.orgId, user(a), { query: 'papelera de propiedades restaurar', sources: ['help'] })
    expect(help.results[0]).toMatchObject({ sourceType: 'help' })
    expect(help.results[0].title).toMatch(/^Ayuda › /)
  })

  it('sin fuente lo dice: noSources y ningún resultado inventado', async () => {
    const r = await searchKnowledge(db, a.orgId, user(a), { query: 'xilófono cuántico marciano' })
    expect(r).toMatchObject({ noSources: true, total: 0, results: [] })
  })

  it('cada fuente con su permiso: sin crm:read no se leen notas ni documentos (y lo dice), la ayuda sí', async () => {
    await knowledgeDoc(a, 'Horario de la oficina', 'La oficina abre de 9 a 14.')
    const r = await searchKnowledge(db, a.orgId, user(a, ['web:read']), { query: 'horario oficina' })
    expect(r.searched).toEqual(['help', 'properties'])
    expect(r.skipped.map((s) => s.source)).toEqual(['knowledge', 'notes'])
    expect(JSON.stringify(r.results)).not.toContain('abre de 9 a 14')
  })

  it('INMO devuelve las fuentes del turno con referencias únicas, y marca una referencia citada que no existe', async () => {
    await knowledgeDoc(a, 'Política de arras', 'Las arras son del 10 % del precio.')
    const m = fakeModel((body, n) => {
      if (n === 1) return toolUse('k1', 'search_knowledge', { query: 'arras' })
      const r = lastToolResult(body)
      return text(`Son del 10 % [${r.results[0].ref}]. También [F7].`)
    })
    const t = await runInmoTurn(ctx(a), { userMessage: '¿De cuánto son las arras?' }, { fetch: m.fetchFn })
    // El documento de la agencia primero; después, lo que la ayuda del panel dice de las arras. Referencias únicas.
    expect(t.citations[0]).toMatchObject({ ref: 'F1', sourceType: 'knowledge', title: 'Documento › Política de arras' })
    expect(t.citations.map((c) => c.ref)).toEqual(t.citations.map((_, i) => `F${i + 1}`))
    expect(t.reply).toContain('[F1]')
    expect(t.unknownRefs).toEqual(['F7'])
    expect(t.provenance[0]).toMatchObject({ tool: 'search_knowledge', ok: true, results: t.citations.length })
  })

  it('el documento se normaliza para buscar (search_text) y se valida', () => {
    expect(prepareKnowledgeDocument({ title: ' Guía ', body: 'Áticos en CHAMBERÍ', tags: 'a, ,b' }, true)).toMatchObject({ title: 'Guía', tags: 'a, b', searchText: 'guia a, b aticos en chamberi' })
    expect(() => prepareKnowledgeDocument({ title: 'x', body: '' }, true)).toThrow(/vacío/)
  })
})

describe('Workflows guiados de INMO (mismo motor de tools, con confirmación por paso)', () => {
  it('lead nuevo: propone, ejecuta al confirmar, bloquea con el motivo real cuando falta un dato y permite saltar o cancelar', async () => {
    const wctx = { ...ctx(a), source: 'inmo' as const }
    const run = await startWorkflow(wctx, 'lead_nuevo', a.leadId)
    expect(run.status).toBe('waiting')
    expect(run.proposal).toMatchObject({ step: 0, tool: 'update_lead', input: { leadId: a.leadId, stage: 'qualified' } })
    // Nada se ha ejecutado aún.
    expect((await db.select().from(schema.leads).where(eq(schema.leads.id, a.leadId)))[0].stage).toBe('new')

    const r1 = await advanceWorkflow(wctx, run.id, { action: 'execute', step: 0 })
    expect((await db.select().from(schema.leads).where(eq(schema.leads.id, a.leadId)))[0].stage).toBe('qualified')
    expect(r1.steps[0]).toMatchObject({ state: 'ok' })
    // El lead del fixture no tiene contacto: el paso de compatibles se bloquea con el motivo.
    expect(r1.proposal).toMatchObject({ tool: 'find_matches', blocked: expect.stringMatching(/contacto/) })
    await expect(advanceWorkflow(wctx, run.id, { action: 'execute', step: 1 })).rejects.toMatchObject({ statusCode: 422 })
    // Un clic repetido sobre un paso que ya no es el actual no ejecuta nada.
    await expect(advanceWorkflow(wctx, run.id, { action: 'execute', step: 0 })).rejects.toMatchObject({ statusCode: 409 })

    const r2 = await advanceWorkflow(wctx, run.id, { action: 'skip', step: 1 })
    expect(r2.proposal).toMatchObject({ tool: 'book_viewing', blocked: expect.any(String) })
    const r3 = await advanceWorkflow(wctx, run.id, { action: 'cancel', step: 2 })
    expect(r3.status).toBe('cancelled')
    expect(await db.select().from(schema.visits).where(eq(schema.visits.leadId, a.leadId))).toHaveLength(0)
  })

  it('visita realizada: tarea de seguimiento y nota de memoria, con los datos que pone la persona', async () => {
    const maria = await contact(a, 'María Valle')
    await db.update(schema.visits).set({ contactId: maria.id, leadId: a.leadId, status: 'completed' }).where(eq(schema.visits.id, a.visitId))
    const wctx = { ...ctx(a), source: 'inmo' as const }
    const run = await startWorkflow(wctx, 'visita_realizada', a.visitId)
    expect(run.proposal).toMatchObject({ tool: 'create_task', missing: ['dueAt'] })
    const r1 = await advanceWorkflow(wctx, run.id, { action: 'execute', step: 0, params: { dueAt: '2026-12-02 10:00' } })
    const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.leadId, a.leadId))
    expect(task).toMatchObject({ type: 'follow_up', dueAt: '2026-12-02 10:00:00', contactId: maria.id })
    expect(r1.proposal).toMatchObject({ tool: 'remember_fact', missing: ['fact'] })
    const r2 = await advanceWorkflow(wctx, run.id, { action: 'execute', step: 1, params: { fact: 'Le encantó la luz; el precio le parece alto.' } })
    expect(r2.status).toBe('ok')
    const [note] = await db.select().from(schema.notes).where(eq(schema.notes.contactId, maria.id))
    expect(note).toMatchObject({ source: 'inmo', body: 'Le encantó la luz; el precio le parece alto.' })
  })

  it('el workflow es de quien lo empezó y de su agencia; con una entidad ajena no empieza', async () => {
    const wctx = { ...ctx(a), source: 'inmo' as const }
    const run = await startWorkflow(wctx, 'lead_nuevo', a.leadId)
    await expect(getWorkflowRun({ ...ctx(b), source: 'inmo' as const }, run.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(advanceWorkflow({ ...ctx(b), source: 'inmo' as const }, run.id, { action: 'execute', step: 0 })).rejects.toMatchObject({ statusCode: 404 })
    await expect(startWorkflow({ ...ctx(b), source: 'inmo' as const }, 'lead_nuevo', a.leadId)).rejects.toMatchObject({ statusCode: 404 })
    // Sin permiso de escritura en CRM, el paso falla con el error tipado y queda registrado; no se cualifica nada.
    const ro = { ...ctx(a, { permissions: ['crm:read'] }), source: 'inmo' as const }
    const run2 = await startWorkflow(ro, 'lead_nuevo', a.leadId)
    const r = await advanceWorkflow(ro, run2.id, { action: 'execute', step: 0 })
    expect(r.steps[0].lastError).toMatchObject({ errorCode: 'PERMISSION_DENIED' })
    expect((await db.select().from(schema.leads).where(eq(schema.leads.id, a.leadId)))[0].stage).toBe('new')
  })
})
