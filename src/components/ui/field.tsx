import { Slot } from '@radix-ui/react-slot'
import type { ReactElement, ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// A labelled form control with an optional hint and error. The single child is the control: Field gives it the
// id the label points at, aria-invalid while there is an error, and aria-describedby naming the error (what's
// wrong) and then the hint (what's expected), so screen readers read both with the field.
export function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string
  label: ReactNode
  hint?: string
  error?: string
  className?: string
  children: ReactElement
}) {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Slot id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy}>
        {children}
      </Slot>
      {hint && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
