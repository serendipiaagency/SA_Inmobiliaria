import { clearVisitorId } from '../../utils/visitor'

/**
 * DELETE /api/public/visitor — borra la cookie `sa_visitor` de este navegador
 * cuando el visitante rechaza o retira las cookies «Analíticas» del aviso de
 * cookies. No toca nada más: no hay datos que leer ni que devolver.
 */
export default defineEventHandler((event) => {
  return { ok: true, cleared: clearVisitorId(event) }
})
