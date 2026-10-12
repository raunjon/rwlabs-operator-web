import * as React from 'react'
import { cn } from '@/lib/utils'

// Shared look for text fields: Input and Textarea. Set aria-invalid to show the error state.
export const fieldClasses =
  'w-full min-w-0 rounded-sm border border-input bg-card px-3 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-invalid:border-destructive'

export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldClasses,
        'h-9 py-1 file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        className,
      )}
      {...props}
    />
  )
}
