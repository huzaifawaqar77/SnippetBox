import { create } from 'zustand'
import type { ToastMessage } from '@shared/types'

interface ToastState {
  toasts: ToastMessage[]
  push: (toast: Omit<ToastMessage, 'id' | 'variant'> & { id?: string; variant?: ToastMessage['variant'] }) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  dismiss: (id: string) => void
  clear: () => void
}

const DEFAULT_DURATION = 3200
const ERROR_DURATION = 6500

const timers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleDismiss(id: string, duration: number, dismiss: (id: string) => void): void {
  const existing = timers.get(id)
  if (existing) clearTimeout(existing)
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id)
      dismiss(id)
    }, duration)
  )
}

/**
 * Toasts are deliberately non-blocking: they never take focus and always expire
 * on their own, so they cannot interrupt the "find and copy" flow.
 */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (toast) => {
    const id = toast.id ?? crypto.randomUUID()
    const message: ToastMessage = {
      id,
      title: toast.title,
      description: toast.description,
      variant: toast.variant ?? 'default'
    }
    set((state) => ({ toasts: [...state.toasts.filter((entry) => entry.id !== id), message].slice(-4) }))
    scheduleDismiss(id, message.variant === 'error' ? ERROR_DURATION : DEFAULT_DURATION, get().dismiss)
  },

  success: (title, description) => get().push({ title, description, variant: 'success' }),

  error: (title, description) => get().push({ title, description, variant: 'error' }),

  dismiss: (id) => {
    const timer = timers.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.delete(id)
    }
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
  },

  clear: () => {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    set({ toasts: [] })
  }
}))

export const toast = {
  success: (title: string, description?: string) => useToastStore.getState().success(title, description),
  error: (title: string, description?: string) => useToastStore.getState().error(title, description),
  info: (title: string, description?: string) => useToastStore.getState().push({ title, description })
}
