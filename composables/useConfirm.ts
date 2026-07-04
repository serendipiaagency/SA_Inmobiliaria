export interface ConfirmRequest {
  id: number
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  danger: boolean
  resolve: (ok: boolean) => void
}

let seq = 1

/**
 * Promise-based replacement for window.confirm(), rendered by the single
 * <ConfirmHost/> mounted in app.vue as a proper modal instead of a native
 * browser dialog.
 */
export function useConfirm() {
  const request = useState<ConfirmRequest | null>('confirm-request', () => null)

  function confirm(
    message: string,
    opts: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {},
  ): Promise<boolean> {
    return new Promise((resolve) => {
      request.value = {
        id: seq++,
        title: opts.title || 'Confirmar acción',
        message,
        confirmLabel: opts.confirmLabel || 'Confirmar',
        cancelLabel: opts.cancelLabel || 'Cancelar',
        danger: !!opts.danger,
        resolve,
      }
    })
  }

  function settle(ok: boolean) {
    request.value?.resolve(ok)
    request.value = null
  }

  return { request, confirm, settle }
}
