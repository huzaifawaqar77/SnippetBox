import type { ReactNode } from 'react'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import * as SelectPrimitive from '@radix-ui/react-select'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button, IconButton } from './primitives'
import { useUiStore } from '../../stores/ui'

/* --------------------------------------------------------------------------
   Modal dialog
-------------------------------------------------------------------------- */

const MODAL_SIZES = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl'
} as const

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  bodyClassName
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: keyof typeof MODAL_SIZES
  bodyClassName?: string
}): React.JSX.Element {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 animate-in-fade" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[86vh] w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2',
            'flex-col overflow-hidden rounded-xl border border-line bg-overlay shadow-lg animate-in-scale',
            MODAL_SIZES[size]
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-sm font-semibold text-fg">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-xs text-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton label="Close">
                <X className="size-4" />
              </IconButton>
            </DialogPrimitive.Close>
          </header>

          <div className={cn('min-h-0 flex-1 overflow-y-auto px-4 py-4', bodyClassName)}>{children}</div>

          {footer ? (
            <footer className="flex items-center justify-end gap-2 border-t border-line bg-sunken/60 px-4 py-3">
              {footer}
            </footer>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/**
 * The single confirmation surface for destructive actions (section 80 of the
 * product spec). Rendered once, driven by promises from the UI store.
 */
export function ConfirmDialogHost(): React.JSX.Element {
  const request = useUiStore((state) => state.confirmRequest)
  const resolve = useUiStore((state) => state.resolveConfirm)

  return (
    <AlertDialogPrimitive.Root open={request !== null} onOpenChange={(open) => !open && resolve(false)}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/45 animate-in-fade" />
        <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[60] w-[calc(100vw-3rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-overlay p-4 shadow-lg animate-in-scale">
          <AlertDialogPrimitive.Title className="text-sm font-semibold text-fg">
            {request?.title}
          </AlertDialogPrimitive.Title>
          {request?.description ? (
            <AlertDialogPrimitive.Description className="mt-1.5 text-sm text-muted">
              {request.description}
            </AlertDialogPrimitive.Description>
          ) : null}
          {request?.details ? (
            <details className="mt-3 rounded-md border border-line bg-sunken px-3 py-2">
              <summary className="cursor-pointer text-xs text-muted">View details</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-2xs text-subtle">
                {request.details}
              </pre>
            </details>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="secondary">{request?.cancelLabel ?? 'Cancel'}</Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button
                variant={request?.destructive ? 'danger' : 'primary'}
                onClick={() => resolve(true)}
              >
                {request?.confirmLabel ?? 'Confirm'}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}

/* --------------------------------------------------------------------------
   Shared menu styling
-------------------------------------------------------------------------- */

const CONTENT_CLASS =
  'z-[70] min-w-[11.7rem] overflow-hidden rounded-lg border border-line bg-overlay p-1 shadow-lg animate-in-scale'

const ITEM_CLASS =
  'flex h-7 cursor-default select-none items-center gap-2 rounded-[6px] px-2 text-sm text-fg-secondary outline-none ' +
  'data-[highlighted]:bg-hover data-[highlighted]:text-fg data-[disabled]:pointer-events-none data-[disabled]:opacity-45 ' +
  '[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted'

const LABEL_CLASS = 'px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-subtle'
const SEPARATOR_CLASS = 'my-1 h-px bg-line'

/* --------------------------------------------------------------------------
   Dropdown menu
-------------------------------------------------------------------------- */

export const Menu = {
  Root: DropdownMenuPrimitive.Root,
  Trigger: DropdownMenuPrimitive.Trigger,
  Group: DropdownMenuPrimitive.Group,
  Sub: DropdownMenuPrimitive.Sub,

  Content: ({ className, ...props }: DropdownMenuPrimitive.DropdownMenuContentProps): React.JSX.Element => (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content sideOffset={6} collisionPadding={8} className={cn(CONTENT_CLASS, className)} {...props} />
    </DropdownMenuPrimitive.Portal>
  ),

  Item: ({ className, ...props }: DropdownMenuPrimitive.DropdownMenuItemProps): React.JSX.Element => (
    <DropdownMenuPrimitive.Item className={cn(ITEM_CLASS, className)} {...props} />
  ),

  CheckboxItem: ({ className, children, ...props }: DropdownMenuPrimitive.DropdownMenuCheckboxItemProps): React.JSX.Element => (
    <DropdownMenuPrimitive.CheckboxItem className={cn(ITEM_CLASS, 'pl-7', className)} {...props}>
      <DropdownMenuPrimitive.ItemIndicator className="absolute left-2">
        <Check className="size-3.5" />
      </DropdownMenuPrimitive.ItemIndicator>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  ),

  Label: ({ className, ...props }: DropdownMenuPrimitive.DropdownMenuLabelProps): React.JSX.Element => (
    <DropdownMenuPrimitive.Label className={cn(LABEL_CLASS, className)} {...props} />
  ),

  Separator: ({ className, ...props }: DropdownMenuPrimitive.DropdownMenuSeparatorProps): React.JSX.Element => (
    <DropdownMenuPrimitive.Separator className={cn(SEPARATOR_CLASS, className)} {...props} />
  ),

  SubTrigger: ({ className, children, ...props }: DropdownMenuPrimitive.DropdownMenuSubTriggerProps): React.JSX.Element => (
    <DropdownMenuPrimitive.SubTrigger className={cn(ITEM_CLASS, 'data-[state=open]:bg-hover', className)} {...props}>
      {children}
      <ChevronRight className="ml-auto size-3.5" />
    </DropdownMenuPrimitive.SubTrigger>
  ),

  SubContent: ({ className, ...props }: DropdownMenuPrimitive.DropdownMenuSubContentProps): React.JSX.Element => (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent className={cn(CONTENT_CLASS, className)} {...props} />
    </DropdownMenuPrimitive.Portal>
  )
}

/* --------------------------------------------------------------------------
   Context menu
-------------------------------------------------------------------------- */

export const ContextMenu = {
  Root: ContextMenuPrimitive.Root,
  Trigger: ContextMenuPrimitive.Trigger,
  Group: ContextMenuPrimitive.Group,
  Sub: ContextMenuPrimitive.Sub,

  Content: ({ className, ...props }: ContextMenuPrimitive.ContextMenuContentProps): React.JSX.Element => (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content className={cn(CONTENT_CLASS, className)} {...props} />
    </ContextMenuPrimitive.Portal>
  ),

  Item: ({ className, ...props }: ContextMenuPrimitive.ContextMenuItemProps): React.JSX.Element => (
    <ContextMenuPrimitive.Item className={cn(ITEM_CLASS, className)} {...props} />
  ),

  Label: ({ className, ...props }: ContextMenuPrimitive.ContextMenuLabelProps): React.JSX.Element => (
    <ContextMenuPrimitive.Label className={cn(LABEL_CLASS, className)} {...props} />
  ),

  Separator: ({ className, ...props }: ContextMenuPrimitive.ContextMenuSeparatorProps): React.JSX.Element => (
    <ContextMenuPrimitive.Separator className={cn(SEPARATOR_CLASS, className)} {...props} />
  ),

  SubTrigger: ({ className, children, ...props }: ContextMenuPrimitive.ContextMenuSubTriggerProps): React.JSX.Element => (
    <ContextMenuPrimitive.SubTrigger className={cn(ITEM_CLASS, 'data-[state=open]:bg-hover', className)} {...props}>
      {children}
      <ChevronRight className="ml-auto size-3.5" />
    </ContextMenuPrimitive.SubTrigger>
  ),

  SubContent: ({ className, ...props }: ContextMenuPrimitive.ContextMenuSubContentProps): React.JSX.Element => (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent className={cn(CONTENT_CLASS, className)} {...props} />
    </ContextMenuPrimitive.Portal>
  )
}

/* --------------------------------------------------------------------------
   Tooltip
-------------------------------------------------------------------------- */

export function TooltipProvider({ children }: { children: ReactNode }): React.JSX.Element {
  return <TooltipPrimitive.Provider delayDuration={500}>{children}</TooltipPrimitive.Provider>
}

export function Tip({
  label,
  children,
  side = 'bottom',
  shortcut
}: {
  label: string
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  shortcut?: string
}): React.JSX.Element {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-[80] flex items-center gap-2 rounded-md border border-line bg-overlay px-2 py-1 text-2xs text-fg shadow-md animate-in-fade"
        >
          {label}
          {shortcut ? <span className="text-subtle">{shortcut}</span> : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

/* --------------------------------------------------------------------------
   Select
-------------------------------------------------------------------------- */

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  ariaLabel,
  disabled
}: {
  value: string
  onValueChange: (value: string) => void
  options: Array<{ value: string; label: string; hint?: string }>
  placeholder?: string
  className?: string
  ariaLabel?: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          'flex h-8 w-full items-center justify-between gap-2 rounded-[7px] border border-line bg-surface px-2.5 text-left text-sm',
          'text-fg transition-colors hover:border-line-strong focus:border-primary focus:outline-none',
          'focus:ring-2 focus:ring-primary/25 disabled:opacity-50 data-[placeholder]:text-subtle',
          className
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="size-3.5 text-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-[80] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-line bg-overlay shadow-lg animate-in-scale"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className={cn(
                  'relative flex h-7 cursor-default select-none items-center rounded-[6px] pl-7 pr-2 text-sm text-fg-secondary outline-none',
                  'data-[highlighted]:bg-hover data-[highlighted]:text-fg'
                )}
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2">
                  <Check className="size-3.5 text-primary" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                {option.hint ? <span className="ml-auto pl-3 text-2xs text-subtle">{option.hint}</span> : null}
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
