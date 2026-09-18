/**
 * Las acciones sobre un cliente, en un solo sitio.
 *
 * El listado y la ficha ofrecen las mismas: ver, editar, eliminar. Si cada
 * pantalla escribiera la suya, la confirmación de borrado acabaría diciendo
 * cosas distintas en cada una — y esa confirmación es justo donde se explica
 * qué se pierde y qué no.
 */

export interface ClientSummary {
  id: number
  name: string
}

export function useClientActions() {
  const { confirm } = useConfirm()
  const toast = useToast()

  /**
   * Borra un cliente, tras mirar **de verdad** con qué está relacionado.
   *
   * Auditado antes de implementarlo: ninguna tabla tiene clave foránea a
   * `clients`, así que borrar la fila no arrastra nada por cascada. Las
   * visitas, operaciones, contratos y facturas de esa persona **se quedan**,
   * y eso es lo correcto: son registros de la agencia, no del cliente. Una
   * operación cerrada no puede desaparecer porque alguien limpie su cartera,
   * y desde luego no se borra una propiedad del catálogo por borrar a quien
   * la visitó.
   *
   * Por eso la confirmación no es genérica: cuenta lo que hay y dice
   * explícitamente que se conserva. Y ofrece la alternativa que el propio
   * modelo ya tiene — marcar al cliente como inactivo — para quien lo que
   * quiere es archivar, no borrar.
   *
   * Para borrar los datos personales de alguien de **todas** las tablas está
   * el camino de RGPD (Sistema → RGPD), que anonimiza en vez de destruir
   * histórico. No se duplica aquí.
   *
   * Devuelve true si se llegó a borrar.
   */
  async function deleteClient(client: ClientSummary): Promise<boolean> {
    let detail: string
    try {
      const related = await $fetch<{ totals: Record<string, number> }>(`/api/admin/clients/${client.id}/related`)
      const t = related.totals || ({} as Record<string, number>)
      const kept = [
        [t.visits, 'visita', 'visitas'],
        [t.deals, 'operación', 'operaciones'],
        [t.contracts, 'contrato', 'contratos'],
        [t.invoices, 'factura', 'facturas'],
        [t.reservations, 'reserva', 'reservas'],
        [t.leads, 'lead', 'leads'],
      ]
        .filter(([n]) => Number(n) > 0)
        .map(([n, one, many]) => `${n} ${Number(n) === 1 ? one : many}`)

      detail = kept.length
        ? ` Se conservarán ${kept.join(', ')} y las propiedades relacionadas: son registros de la inmobiliaria y no se borran con el cliente.`
        : ' No tiene visitas, operaciones ni contratos asociados.'
    } catch {
      // Si no se puede consultar, se avisa de la incertidumbre en vez de
      // afirmar que no hay nada relacionado.
      detail = ' No se ha podido comprobar qué tiene relacionado; sus visitas, operaciones y contratos se conservarán en cualquier caso.'
    }

    const ok = await confirm(
      `¿Seguro que quieres eliminar a ${client.name}?${detail} Si lo que quieres es archivarlo, cámbialo a «Inactivo» en vez de borrarlo.`,
      { title: 'Eliminar cliente', confirmLabel: 'Eliminar cliente', danger: true },
    )
    if (!ok) return false

    try {
      await $fetch(`/api/admin/clients/${client.id}`, { method: 'DELETE' })
      toast.success('Cliente eliminado')
      return true
    } catch (e: any) {
      toast.error(e?.data?.statusMessage || e?.statusMessage || 'No se pudo eliminar el cliente')
      return false
    }
  }

  return { deleteClient }
}
