export interface Toast {
  id: number
  type: 'success' | 'error' | 'info'
  message: string
}

let seq = 1

/**
 * Global toast queue. State lives in useState so any component can push a
 * toast and the single <ToastHost/> mounted in app.vue renders it.
 */
export function useToast() {
  const toasts = useState<Toast[]>('toasts', () => [])

  function push(type: Toast['type'], message: string, ms = 3200) {
    const id = seq++
    toasts.value = [...toasts.value, { id, type, message }]
    setTimeout(() => dismiss(id), ms)
    return id
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return {
    toasts,
    dismiss,
    success: (message: string, ms?: number) => push('success', message, ms),
    error: (message: string, ms?: number) => push('error', message, ms),
    info: (message: string, ms?: number) => push('info', message, ms),
  }
}
