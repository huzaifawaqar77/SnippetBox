import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useToastStore } from '../../stores/toast'
import { cn } from '../../lib/utils'

/** Subtle, self-dismissing notifications (section 38 of the product spec). */
export function Toaster(): React.JSX.Element {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[17.5rem] flex-col gap-2"
    >
      {toasts.map((toast) => {
        const Icon = toast.variant === 'success' ? CheckCircle2 : toast.variant === 'error' ? AlertTriangle : Info

        return (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-overlay px-3 py-2.5 shadow-lg animate-in-up',
              toast.variant === 'error' ? 'border-danger-border' : 'border-line'
            )}
          >
            <Icon
              className={cn(
                'mt-0.5 size-4 shrink-0',
                toast.variant === 'success' ? 'text-success' : toast.variant === 'error' ? 'text-danger' : 'text-primary'
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-fg">{toast.title}</p>
              {toast.description ? (
                <p className="mt-0.5 break-words text-2xs leading-relaxed text-muted">{toast.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(toast.id)}
              className="grid size-5 shrink-0 place-items-center rounded-[4px] text-subtle transition hover:bg-hover hover:text-fg"
            >
              <X className="size-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
