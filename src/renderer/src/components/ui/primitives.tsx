import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

/* --------------------------------------------------------------------------
   Buttons
-------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger'
type ButtonSize = 'sm' | 'md' | 'icon' | 'icon-sm'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-on-primary hover:bg-primary-hover shadow-sm active:translate-y-[0.5px] disabled:hover:bg-primary',
  secondary:
    'bg-raised text-fg border border-line hover:bg-hover hover:border-line-strong active:translate-y-[0.5px]',
  ghost: 'text-muted hover:bg-hover hover:text-fg',
  subtle: 'bg-sunken text-fg-secondary hover:bg-hover',
  danger: 'bg-danger text-white hover:brightness-110 active:translate-y-[0.5px]'
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-[6px]',
  md: 'h-8 px-3 text-sm gap-2 rounded-[7px]',
  icon: 'h-8 w-8 rounded-[7px] justify-center',
  'icon-sm': 'h-7 w-7 rounded-[6px] justify-center'
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', loading = false, icon, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center whitespace-nowrap font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {loading ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  )
})

export interface IconButtonProps extends Omit<ButtonProps, 'size' | 'icon'> {
  label: string
  size?: 'icon' | 'icon-sm'
  active?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className, variant = 'ghost', size = 'icon', active = false, children, ...props },
  ref
) {
  return (
    <Button
      ref={ref}
      aria-label={label}
      title={label}
      size={size}
      variant={variant}
      className={cn(active && 'bg-primary-soft text-primary hover:bg-primary-soft', className)}
      {...props}
    >
      {children}
    </Button>
  )
})

/* --------------------------------------------------------------------------
   Inputs
-------------------------------------------------------------------------- */

const FIELD_BASE =
  'w-full rounded-[7px] border border-line bg-surface px-2.5 text-sm text-fg placeholder:text-subtle ' +
  'transition-colors hover:border-line-strong focus:border-primary focus:outline-none ' +
  'focus:ring-2 focus:ring-primary/25 disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return <input ref={ref} className={cn(FIELD_BASE, 'h-8', className)} {...props} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref
) {
  return <textarea ref={ref} className={cn(FIELD_BASE, 'resize-none py-1.5 leading-relaxed', className)} {...props} />
})

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  action
}: {
  label: string
  hint?: string
  error?: string | null
  required?: boolean
  htmlFor?: string
  children: ReactNode
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-xs font-medium text-fg-secondary">
          {label}
          {required ? <span className="ml-0.5 text-danger">*</span> : null}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <p className="text-2xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-2xs text-subtle">{hint}</p>
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------------------------
   Misc atoms
-------------------------------------------------------------------------- */

export function Badge({
  children,
  className,
  tone = 'neutral',
  title
}: {
  children: ReactNode
  className?: string
  tone?: 'neutral' | 'primary' | 'danger' | 'success' | 'warning'
  title?: string
}): React.JSX.Element {
  const tones = {
    neutral: 'bg-sunken text-muted border-line',
    primary: 'bg-primary-soft text-primary border-primary-border',
    danger: 'bg-danger-soft text-danger border-danger-border',
    success: 'bg-success-soft text-success border-success/30',
    warning: 'bg-warning-soft text-warning border-warning/30'
  } as const

  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-[5px] border px-1.5 text-2xs font-medium',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-line bg-sunken px-1.5',
        'font-sans text-2xs font-medium text-muted',
        className
      )}
    >
      {children}
    </kbd>
  )
}

export function Separator({ className, vertical = false }: { className?: string; vertical?: boolean }): React.JSX.Element {
  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      className={cn('bg-line', vertical ? 'h-full w-px' : 'h-px w-full', className)}
    />
  )
}

export function Spinner({ className }: { className?: string }): React.JSX.Element {
  return <Loader2 aria-hidden className={cn('size-4 animate-spin text-subtle', className)} />
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
  'aria-label': ariaLabel
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  'aria-label'?: string
}): React.JSX.Element {
  return (
    <SwitchPrimitive.Root
      id={id}
      aria-label={ariaLabel}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-[1.15rem] w-[2.05rem] shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors',
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-active',
        'disabled:cursor-not-allowed disabled:opacity-50'
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-3.5 rounded-full bg-white shadow-sm transition-transform',
          'data-[state=checked]:translate-x-[0.95rem] data-[state=unchecked]:translate-x-[0.11rem]'
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export function SettingRow({
  label,
  description,
  children,
  htmlFor
}: {
  label: string
  description?: string
  children: ReactNode
  htmlFor?: string
}): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-fg">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  )
}

export function SectionHeading({ children, hint }: { children: ReactNode; hint?: string }): React.JSX.Element {
  return (
    <div className="mb-1">
      <h2 className="text-sm font-semibold text-fg">{children}</h2>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}
